// draft-reply — AI reply drafts for the landlord's Messages inbox.
//
// A tenant asks something ("can I break my lease early?") and the manager
// taps "Draft reply": this function drafts the landlord's response grounded
// in the ACTUAL lease and payment ledger — the same grounding machinery as
// ask-lease, pointed the other direction. The draft only ever fills the
// composer; the client never auto-sends, and the manager edits before sending.
//
// Auth / response / rate-limit conventions mirror parse-receipt (manager
// tool): bearer → getUser → role manager|admin; expected user-facing outcomes
// as HTTP 200 { ok: false, code }; per-user daily cap via the rate_limit_check
// RPC. Ownership check mirrors the conversations model (migration
// 20260523000016): 'direct' rows carry manager_id; 'group' rows carry
// lease_id → unit → property.manager_id.
//
// Lease content reuses ask-lease's exact mechanism — most recent documents
// row of type='lease' downloaded from the 'lease-documents' bucket as a
// base64 PDF block, falling back to generateLeaseText for platform-generated
// leases. When neither exists we still draft (from the thread + ledger) but
// the model is told there is no lease text and must never cite sections.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { generateLeaseText } from '../_shared/leaseTemplates.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
// Same model as ask-lease — it has to reason over lease clauses accurately.
const MODEL = 'claude-sonnet-4-6'

const MAX_DRAFT_TOKENS = 500
const THREAD_MESSAGES = 10
const LEDGER_ROWS = 12
const MAX_MSG_CHARS = 500
// ~40 drafts per manager per day — plenty for real inbox use, caps abuse spend.
const DAILY_LIMIT = 40
// Anthropic PDF input cap is 32 MB; same guard as ask-lease.
const MAX_PDF_BYTES = 32 * 1024 * 1024

interface DraftInput {
  conversation_id?: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

async function readBytes(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer()
  return new Uint8Array(ab)
}

// Base64 encode without blowing the call stack on multi-MB PDFs (same as ask-lease).
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

const SYSTEM_PROMPT = `
You draft a reply that a landlord will send to their tenant in a property-management app's message thread. The landlord always reviews and edits before sending — write the message ready to send, in the landlord's first-person voice.

GROUNDING RULES:
- Use ONLY the lease document/text, the lease facts, the payment ledger, and the conversation provided. Never rely on outside knowledge of laws, "typical" leases, or standard practice.
- Cite a lease section ("per Section 8 of the lease") ONLY when the provided lease text actually contains that section and it supports your statement. If no lease document was provided, or the lease does not address the topic, never invent clause numbers — say something like "let me double-check the lease and confirm" or point the tenant to their lease copy instead.
- Rent amounts, due dates, deposits, and payment history must come from the lease facts or ledger EXACTLY as given. Never compute, estimate, or guess a figure that is not shown.
- If the tenant is asking for a decision only the landlord can make (breaking the lease early, waiving a fee, approving a pet or sublet), draft a helpful holding reply: state what the lease says about it (if it says anything), and that you'll review and follow up — never commit to a decision on the landlord's behalf.
- If the latest tenant message needs information you don't have (a repair status, a date the landlord knows), leave a clearly-marked placeholder like [add date] rather than inventing one.

STYLE:
- This is a chat message, not a letter: no subject line, no "Dear …" header, no signature block. Plain, courteous, professional, calm. No markdown.
- 2-6 sentences unless the topic genuinely needs more.
- Never reference or ask about protected characteristics (children, religion, national origin, disability, marital status, etc.), and never threaten legal action.
- No legal advice — describe what the lease says, not what a court would do.

Reply with ONLY the message text — no preamble, no quotes around it.
`.trim()

// ── Lease shapes we read from the DB (same as ask-lease) ────────────────
interface LeaseRow {
  id: string
  tenant_id: string
  start_date: string
  end_date: string
  rent_amount: number
  security_deposit: number | null
  pet_deposit: number | null
  utility_notes: string | null
  status: string
  month_to_month: boolean | null
  signed_at: string | null
  sent_for_signature_at: string | null
  payment_due_day: number | null
  unit: {
    unit_number: string | null
    property: {
      name: string | null
      address: string
      city: string
      state: string
      zip: string
      manager_id: string
    } | null
  } | null
}

const LEASE_SELECT = `
  id, tenant_id, start_date, end_date, rent_amount, security_deposit,
  pet_deposit, utility_notes, status, month_to_month, signed_at,
  sent_for_signature_at, payment_due_day,
  unit:units(unit_number, property:properties(name, address, city, state, zip, manager_id))
`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    // ── Auth: bearer token → user → manager/admin role ───────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()
    if (!profile) return json(req, { ok: false, message: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'manager' && profile.role !== 'admin') {
      return json(req, { ok: false, message: 'This endpoint is for managers' }, { status: 403 })
    }

    // ── Input validation ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as DraftInput
    const conversationId = (body.conversation_id ?? '').trim()
    if (!conversationId) return json(req, { ok: false, message: 'conversation_id required' }, { status: 400 })

    // Per-user daily cap via the shared sliding-window rate limiter (same
    // rate_limit_check RPC ask-lease / parse-receipt use, keyed by user).
    const allowed = await checkRateLimit({ key: `draft-reply:${user.id}`, windowSeconds: 86400, maxCount: DAILY_LIMIT })
    if (!allowed) {
      return json(req, { ok: false, code: 'rate_limited', message: 'Too many drafts today — you can still write replies yourself.' })
    }

    // ── Load the conversation + verify the caller owns it ────────────────
    const { data: conv } = await admin
      .from('conversations')
      .select('id, type, manager_id, tenant_id, lease_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv) return json(req, { ok: false, message: 'Conversation not found' }, { status: 404 })

    // Resolve the grounding lease. 'group' conversations carry the lease
    // directly; 'direct' ones carry (manager, tenant) — find that tenant's
    // most relevant lease on one of this manager's properties.
    let lease: LeaseRow | null = null

    if (conv.type === 'group') {
      if (!conv.lease_id) return json(req, { ok: false, message: 'Conversation not found' }, { status: 404 })
      const { data } = await admin.from('leases').select(LEASE_SELECT).eq('id', conv.lease_id).maybeSingle()
      lease = (data as unknown as LeaseRow) ?? null
      if (!lease || lease.unit?.property?.manager_id !== user.id) {
        return json(req, { ok: false, message: 'Not your conversation' }, { status: 403 })
      }
    } else {
      if (conv.manager_id !== user.id) {
        return json(req, { ok: false, message: 'Not your conversation' }, { status: 403 })
      }
      // Leases where the tenant is primary, plus co-tenant rows.
      const [primaryRes, ltRes] = await Promise.all([
        admin.from('leases').select(LEASE_SELECT).eq('tenant_id', conv.tenant_id),
        admin.from('lease_tenants').select('lease_id').eq('tenant_id', conv.tenant_id),
      ])
      const ltIds = ((ltRes.data ?? []) as Array<{ lease_id: string }>).map((r) => r.lease_id)
      let coRows: LeaseRow[] = []
      if (ltIds.length > 0) {
        const { data } = await admin.from('leases').select(LEASE_SELECT).in('id', ltIds)
        coRows = (data as unknown as LeaseRow[]) ?? []
      }
      const seen = new Set<string>()
      const candidates = ([...((primaryRes.data as unknown as LeaseRow[]) ?? []), ...coRows])
        .filter((l) => l.unit?.property?.manager_id === user.id)
        .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)))
      // Prefer the active lease; otherwise the most recent one.
      candidates.sort((a, b) => {
        if ((a.status === 'active') !== (b.status === 'active')) return a.status === 'active' ? -1 : 1
        return (b.start_date ?? '').localeCompare(a.start_date ?? '')
      })
      lease = candidates[0] ?? null
    }

    // ── Gather grounding: thread, ledger, lease text ─────────────────────
    const { data: msgRows } = await admin
      .from('messages')
      .select('sender_id, body, image_url, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(THREAD_MESSAGES)
    const recent = (msgRows ?? []).reverse() as Array<{ sender_id: string; body: string | null; image_url: string | null; created_at: string }>

    const lastFromTenant = [...recent].reverse().find((m) => m.sender_id !== user.id)
    if (!lastFromTenant || !(lastFromTenant.body ?? '').trim()) {
      return json(req, { ok: false, code: 'no_message', message: 'Nothing to reply to yet — wait for the tenant to send a message.' })
    }

    // Names for transcript labels (participants are RLS-scoped rows; we're
    // on the admin client, so scope by conversation explicitly).
    const { data: partRows } = await admin
      .from('conversation_participants')
      .select('user_id, profile:profiles(full_name, email)')
      .eq('conversation_id', conversationId)
    const nameById = new Map<string, string>()
    for (const p of (partRows ?? []) as Array<{ user_id: string; profile: { full_name: string | null; email: string | null } | null }>) {
      nameById.set(p.user_id, p.profile?.full_name ?? p.profile?.email ?? 'Tenant')
    }

    const transcript = recent.map((m) => {
      const who = m.sender_id === user.id ? 'Landlord (you)' : `Tenant — ${nameById.get(m.sender_id) ?? 'Tenant'}`
      const text = (m.body ?? '').slice(0, MAX_MSG_CHARS) || (m.image_url ? '[sent an image]' : '')
      return `[${m.created_at.slice(0, 10)}] ${who}: ${text}`
    }).join('\n')

    // Ledger + lease facts — only when we resolved a lease.
    let facts = 'No lease on file for this tenant.'
    let ledger = 'No payment ledger available.'
    if (lease) {
      const property = lease.unit?.property ?? null
      facts = [
        property ? `Property: ${property.address}${lease.unit?.unit_number ? `, Unit ${lease.unit.unit_number}` : ''}, ${property.city}, ${property.state} ${property.zip}` : null,
        `Monthly rent: $${Number(lease.rent_amount)}${lease.payment_due_day ? `, due on day ${lease.payment_due_day} of the month` : ''}`,
        `Lease term: ${lease.start_date} to ${lease.end_date}${lease.month_to_month ? ' (currently month-to-month)' : ''}`,
        `Lease status: ${lease.status}`,
        lease.security_deposit != null ? `Security deposit: $${Number(lease.security_deposit)}` : null,
        lease.pet_deposit != null ? `Pet deposit: $${Number(lease.pet_deposit)}` : null,
      ].filter(Boolean).join('\n')

      const { data: payRows } = await admin
        .from('payments')
        .select('type, amount, status, due_date, paid_at')
        .eq('lease_id', lease.id)
        .order('due_date', { ascending: false, nullsFirst: false })
        .limit(LEDGER_ROWS)
      const pays = (payRows ?? []) as Array<{ type: string; amount: number; status: string | null; due_date: string | null; paid_at: string | null }>
      if (pays.length > 0) {
        ledger = pays.map((p) =>
          `${p.due_date ?? '(no due date)'} · ${p.type} · $${Number(p.amount)} · ${p.status ?? 'pending'}${p.paid_at ? ` (paid ${p.paid_at.slice(0, 10)})` : ''}`,
        ).join('\n')
      }
    }

    // Lease content — ask-lease's exact two-source mechanism.
    let pdfBase64: string | null = null
    let leaseText: string | null = null
    let leaseSource: 'pdf' | 'template' | 'none' = 'none'

    if (lease) {
      const { data: docs } = await admin
        .from('documents')
        .select('storage_url')
        .eq('lease_id', lease.id)
        .eq('type', 'lease')
        .order('created_at', { ascending: false })
        .limit(1)
      const docPath = ((docs ?? [])[0] as { storage_url?: string } | undefined)?.storage_url ?? ''

      if (docPath && !docPath.startsWith('app://')) {
        const { data: blob, error: dlErr } = await admin.storage.from('lease-documents').download(docPath)
        if (!dlErr && blob) {
          const bytes = await readBytes(blob)
          if (bytes.length > 0 && bytes.length <= MAX_PDF_BYTES) {
            pdfBase64 = toBase64(bytes)
            leaseSource = 'pdf'
          }
        }
      }

      const property = lease.unit?.property ?? null
      if (leaseSource === 'none' && (lease.signed_at || lease.sent_for_signature_at) && property && lease.unit) {
        // Platform-generated lease: reproduce the document text exactly the
        // way LeasePdf.tsx / ask-lease do.
        const { data: managerProfile } = await admin
          .from('profiles')
          .select('full_name, company_name, phone, email')
          .eq('id', property.manager_id)
          .maybeSingle()
        const manager = managerProfile as { full_name?: string | null; company_name?: string | null; phone?: string | null; email?: string | null } | null

        const { data: ltRows } = await admin
          .from('lease_tenants')
          .select('is_primary, sort_order, profile:profiles!lease_tenants_tenant_id_fkey(full_name, email)')
          .eq('lease_id', lease.id)
          .order('is_primary', { ascending: false })
          .order('sort_order', { ascending: true })
        let tenants = ((ltRows ?? []) as unknown as Array<{ profile?: { full_name?: string | null; email?: string | null } | null }>)
          .map((r) => r.profile)
          .filter((p): p is { full_name?: string | null; email?: string | null } => !!p)
          .map((p) => ({ name: p.full_name ?? p.email ?? 'Tenant', email: p.email ?? '' }))
        if (tenants.length === 0) {
          const { data: primary } = await admin
            .from('profiles').select('full_name, email').eq('id', lease.tenant_id).maybeSingle()
          const p = primary as { full_name?: string | null; email?: string | null } | null
          tenants = [{ name: p?.full_name ?? p?.email ?? 'Tenant', email: p?.email ?? '' }]
        }

        leaseText = generateLeaseText({
          landlord_name: manager?.full_name ?? 'Landlord',
          landlord_entity: manager?.company_name ?? manager?.full_name ?? 'Landlord',
          landlord_phone: manager?.phone ?? null,
          landlord_email: manager?.email ?? null,
          tenant_name: tenants[0]?.name ?? '',
          tenant_email: tenants[0]?.email ?? '',
          tenants,
          property_address: property.address,
          unit_label: lease.unit.unit_number ?? '',
          city: property.city,
          state: property.state,
          zip: property.zip,
          start_date: lease.start_date,
          end_date: lease.end_date,
          rent_amount: Number(lease.rent_amount),
          security_deposit: Number(lease.security_deposit ?? 0),
          pet_deposit: lease.pet_deposit ?? null,
          payment_due_day: Math.min(28, Math.max(1, Number(lease.payment_due_day ?? 1))),
          utility_notes: lease.utility_notes,
          pets_allowed: !!(lease.pet_deposit && Number(lease.pet_deposit) > 0),
        })
        leaseSource = 'template'
      }
    }

    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      return json(req, { ok: false, code: 'unavailable', message: 'AI not configured' })
    }

    // ── Ask Claude ───────────────────────────────────────────────────────
    type ContentBlock =
      | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
      | { type: 'text'; text: string }
    const content: ContentBlock[] = []
    if (pdfBase64) {
      content.push({
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdfBase64 },
      })
    }
    content.push({
      type: 'text',
      text:
        (leaseSource === 'pdf'
          ? "The tenant's signed lease document is attached above.\n\n"
          : leaseText
            ? `THE TENANT'S LEASE DOCUMENT:\n\n${leaseText}\n\n`
            : 'NO LEASE DOCUMENT IS AVAILABLE for this tenant — never cite lease sections or specific lease terms beyond the lease facts below.\n\n') +
        `Lease facts from the landlord's records:\n${facts}\n\n` +
        `Payment ledger, most recent first (type · amount · status):\n${ledger}\n\n` +
        `The message thread, oldest first:\n${transcript}\n\n` +
        `Draft the landlord's reply to the tenant's latest message.`,
    })

    const { result: resp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_DRAFT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }))

    const textBlock = (resp.content ?? []).find((b) => b.type === 'text')
    const draft = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''

    await logApiCall({
      function_name: 'draft-reply',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      user_id: user.id,
      reference_id: conversationId,
      // Never log message or draft text — only shape metadata.
      metadata: { conv_type: conv.type, lease_source: leaseSource, thread_messages: recent.length, draft_length: draft.length },
    })

    if (!draft) {
      return json(req, { ok: false, message: 'Could not draft a reply just now — try again.' }, { status: 502 })
    }

    return json(req, { ok: true, draft, lease_source: leaseSource })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'draft-reply', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: 'Could not draft a reply just now.' }, { status: 500 })
  }
})

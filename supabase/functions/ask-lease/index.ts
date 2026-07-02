// ask-lease — "Ask about your lease"
//
// Tenant-facing Q&A grounded in the tenant's OWN lease. The tenant asks a
// question ("can I have a dog?", "when can my landlord enter?") and gets an
// answer sourced strictly from their lease document, with the relevant clause
// quoted where possible. Cuts landlord message volume for questions the lease
// already answers.
//
// Auth: bearer token (verify_jwt default ON) → resolve user via the admin
// client, require role='tenant', and require the caller to actually be on the
// lease (leases.tenant_id OR a lease_tenants row). Mirrors the auth shape of
// save-tenant-payment-method; mirrors the Anthropic + logging shape of
// explain-lease / extract-lease-fields.
//
// Lease content — two sources, mirroring how the app itself renders leases:
//   1. Uploaded/externally-signed lease → most recent documents row of
//      type='lease'; the PDF is downloaded from the 'lease-documents' bucket
//      server-side and attached as a base64 document block (same pattern as
//      extract-lease-fields).
//   2. Platform-generated lease (signed_at or sent_for_signature_at set, no
//      uploaded PDF) → the lease text is reproduced deterministically with
//      generateLeaseText from the same DB fields LeasePdf.tsx uses.
//   3. Neither (e.g. bare imported lease with no document) → we decline with
//      a clear "answers aren't available" response rather than hallucinate.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { generateLeaseText } from '../_shared/leaseTemplates.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
// Same model as explain-lease — strong enough to reason about clauses, far
// cheaper than Opus for a high-frequency tenant tool.
const MODEL = 'claude-sonnet-4-6'

const MAX_QUESTION_LEN = 500
const MAX_ANSWER_TOKENS = 700
// ~25 questions per tenant per day — enough for real use, caps abuse spend.
const DAILY_LIMIT = 25
// Anthropic PDF input cap is 32 MB; same guard as extract-lease-fields.
const MAX_PDF_BYTES = 32 * 1024 * 1024

// Returned alongside every answer; the client renders it muted under the
// response. Kept server-side so the copy is consistent everywhere.
const DISCLAIMER =
  'This is general information based on your lease document, not legal advice. ' +
  'For legal questions, contact a licensed attorney or local tenant resources.'

interface AskInput {
  lease_id?: string
  question?: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// Pull a Uint8Array out of a Blob in a Deno-friendly way.
async function readBytes(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer()
  return new Uint8Array(ab)
}

// Base64 encode without blowing the call stack on multi-MB PDFs. Chunks
// the bytes into 0x8000 windows before String.fromCharCode.
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

const SYSTEM_PROMPT = `
You answer a tenant's questions about their own residential lease.

Rules:
- Answer ONLY from the lease document provided and the "Lease facts" context (property address, rent, dates). Never rely on outside knowledge of laws, typical leases, or what landlords usually do.
- When the lease addresses the question, quote the relevant clause (a short excerpt) and name the section it appears in, then explain it in plain English.
- If the lease does not address the question, say clearly: "Your lease doesn't address this" and suggest the tenant ask their landlord directly. Do not guess or fill gaps.
- If the question is not about this lease or tenancy (coding help, news, other topics), politely decline in one sentence and invite a lease question instead.
- Never give legal advice, never predict how a court would rule, and never tell the tenant whether a clause is enforceable or legal. If asked, explain what the lease says and suggest local tenant resources or an attorney for the legal question.
- Be concise: a short paragraph or two, plain English, calm and neutral. No markdown headings.
- Do NOT add your own disclaimer — the app appends one to every answer.
`.trim()

// ── Lease shapes we read from the DB ────────────────────────────────────
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    // ── Auth: bearer token → user → tenant role ─────────────────────────
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
    if (profile.role !== 'tenant') {
      return json(req, { ok: false, message: 'This endpoint is for tenants' }, { status: 403 })
    }

    // ── Input validation / abuse guard ──────────────────────────────────
    const body = await req.json().catch(() => ({})) as AskInput
    const leaseId = (body.lease_id ?? '').trim()
    const question = (body.question ?? '').trim()
    if (!leaseId) return json(req, { ok: false, message: 'lease_id required' }, { status: 400 })
    if (!question) {
      return json(req, { ok: false, code: 'bad_question', message: 'Type a question about your lease first.' })
    }
    if (question.length > MAX_QUESTION_LEN) {
      return json(req, { ok: false, code: 'bad_question', message: `Keep questions under ${MAX_QUESTION_LEN} characters.` })
    }

    // Per-user daily cap via the shared sliding-window rate limiter (same
    // rate_limit_check RPC explain-lease uses, keyed by user instead of IP).
    const allowed = await checkRateLimit({ key: `ask-lease:${user.id}`, windowSeconds: 86400, maxCount: DAILY_LIMIT })
    if (!allowed) {
      return json(req, {
        ok: false,
        code: 'rate_limited',
        message: "You've asked a lot of questions today — try again tomorrow, or message your landlord directly.",
      })
    }

    // ── Load the lease + verify the caller is a tenant ON this lease ────
    const { data: leaseData, error: leaseErr } = await admin
      .from('leases')
      .select(`
        id, tenant_id, start_date, end_date, rent_amount, security_deposit,
        pet_deposit, utility_notes, status, month_to_month, signed_at,
        sent_for_signature_at, payment_due_day,
        unit:units(unit_number, property:properties(name, address, city, state, zip, manager_id))
      `)
      .eq('id', leaseId)
      .maybeSingle()
    if (leaseErr || !leaseData) return json(req, { ok: false, message: 'Lease not found' }, { status: 404 })
    const lease = leaseData as unknown as LeaseRow

    let onLease = lease.tenant_id === user.id
    if (!onLease) {
      // Co-tenants live in the lease_tenants junction table.
      const { data: lt } = await admin
        .from('lease_tenants')
        .select('tenant_id')
        .eq('lease_id', leaseId)
        .eq('tenant_id', user.id)
        .maybeSingle()
      onLease = !!lt
    }
    if (!onLease) return json(req, { ok: false, message: 'Not your lease' }, { status: 403 })

    const property = lease.unit?.property ?? null

    // Basic facts block — grounding context for both content paths.
    const facts = [
      property ? `Property: ${property.address}${lease.unit?.unit_number ? `, Unit ${lease.unit.unit_number}` : ''}, ${property.city}, ${property.state} ${property.zip}` : null,
      `Monthly rent: $${Number(lease.rent_amount)}${lease.payment_due_day ? `, due on day ${lease.payment_due_day} of the month` : ''}`,
      `Lease term: ${lease.start_date} to ${lease.end_date}${lease.month_to_month ? ' (currently month-to-month)' : ''}`,
      lease.security_deposit != null ? `Security deposit: $${Number(lease.security_deposit)}` : null,
      lease.pet_deposit != null ? `Pet deposit: $${Number(lease.pet_deposit)}` : null,
    ].filter(Boolean).join('\n')

    // ── Resolve the lease content ────────────────────────────────────────
    // Preferred: the actual uploaded/signed PDF (documents row, type='lease').
    // Fallback: the platform-generated lease text, reproduced from the same
    // fields LeasePdf.tsx renders. Otherwise: decline.
    let pdfBase64: string | null = null
    let leaseText: string | null = null
    let source: 'pdf' | 'template' | null = null

    const { data: docs } = await admin
      .from('documents')
      .select('storage_url')
      .eq('lease_id', leaseId)
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
          source = 'pdf'
        }
      }
    }

    if (!source && (lease.signed_at || lease.sent_for_signature_at) && property && lease.unit) {
      // Platform-generated lease: reproduce the document text exactly the way
      // LeasePdf.tsx does — manager profile + co-tenant list + lease fields.
      const { data: managerProfile } = await admin
        .from('profiles')
        .select('full_name, company_name, phone, email')
        .eq('id', property.manager_id)
        .maybeSingle()
      const manager = managerProfile as { full_name?: string | null; company_name?: string | null; phone?: string | null; email?: string | null } | null

      const { data: ltRows } = await admin
        .from('lease_tenants')
        .select('is_primary, sort_order, profile:profiles!lease_tenants_tenant_id_fkey(full_name, email)')
        .eq('lease_id', leaseId)
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
      source = 'template'
    }

    if (!source) {
      // No readable document and no platform-generated text — refuse to
      // answer from thin air. (Typical case: imported lease with no PDF.)
      return json(req, {
        ok: false,
        code: 'unavailable',
        message: "Answers aren't available for this lease — we don't have a readable copy of the document. Ask your landlord directly, or ask them to upload the signed lease.",
      })
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
        (leaseText ? `THE TENANT'S LEASE DOCUMENT:\n\n${leaseText}\n\n` : 'The tenant\'s lease document is attached above.\n\n') +
        `Lease facts from the tenant's account:\n${facts}\n\n` +
        `The tenant's question:\n${question}`,
    })

    const { result: resp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_ANSWER_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }))

    const textBlock = (resp.content ?? []).find((b) => b.type === 'text')
    const answer = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''

    await logApiCall({
      function_name: 'ask-lease',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      user_id: user.id,
      reference_id: leaseId,
      // Never log the question or answer text — only shape metadata.
      metadata: { source, question_length: question.length },
    })

    if (!answer) {
      return json(req, { ok: false, message: 'Could not answer that just now — try again.' }, { status: 502 })
    }

    return json(req, { ok: true, answer, disclaimer: DISCLAIMER })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'ask-lease', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: 'Something went wrong answering your question.' }, { status: 500 })
  }
})

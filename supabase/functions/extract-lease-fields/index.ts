// Extract structured fields from a signed lease PDF using Claude.
//
// Used by the AttachLeases "Create lease from PDF" form and the ReviewLease
// page to pre-fill tenants, term dates, rent, and deposit without forcing
// the manager to retype what's already in the document.
//
// Input shapes:
//   { storage_path: 'lease-documents/...path.pdf' }
//     — for freshly-uploaded PDFs that don't yet have a lease record
//   { lease_id: '<uuid>' }
//     — pulls the most recent type='lease' document and extracts from that
//
// Caller must be the manager who owns the lease/property. The PDF is
// downloaded server-side using the service role; never trusted from the
// client. Returns null for any field we can't confidently extract — the
// manager always reviews + edits before saving.
//
// Model: Haiku 4.5. Structured extraction from a typed lease is well
// within its capability and the price/latency is much friendlier than Opus
// for what is otherwise a sub-second-feel UX.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const MODEL = 'claude-haiku-4-5-20251001'

interface ExtractInput {
  storage_path?: string
  lease_id?: string
}

interface ExtractedTenant {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

interface Extracted {
  tenants: ExtractedTenant[]
  lease_start: string | null      // YYYY-MM-DD
  lease_end: string | null
  monthly_rent: number | null
  security_deposit: number | null
  pet_deposit: number | null
  property_address: string | null  // street address only
  unit_number: string | null
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// Pull a Uint8Array out of an `ArrayBuffer | Blob` in a Deno-friendly way.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    const payload = await req.json() as ExtractInput
    if (!payload.storage_path && !payload.lease_id) {
      return json(req, { ok: false, message: 'storage_path or lease_id required' }, { status: 400 })
    }

    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json(req, { ok: false, message: 'Not authenticated' }, { status: 401 })
    }
    const managerId = userData.user.id

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ── Resolve the PDF storage path + verify access ────────────────────
    let path = payload.storage_path ?? ''
    if (payload.lease_id) {
      // Look up the lease's manager — confirm caller owns it.
      const { data: lease } = await admin
        .from('leases')
        .select('id, units!inner(properties!inner(manager_id))')
        .eq('id', payload.lease_id)
        .single()
      type LeaseRow = { units: { properties: { manager_id: string } } }
      if (!lease || (lease as unknown as LeaseRow).units.properties.manager_id !== managerId) {
        return json(req, { ok: false, message: 'Not your lease' }, { status: 403 })
      }
      // Most-recent lease-type document on this lease.
      const { data: docs } = await admin
        .from('documents')
        .select('storage_url')
        .eq('lease_id', payload.lease_id)
        .eq('type', 'lease')
        .order('created_at', { ascending: false })
        .limit(1)
      const doc = (docs ?? [])[0] as { storage_url: string } | undefined
      if (!doc?.storage_url) {
        return json(req, { ok: false, message: 'No lease PDF attached to this lease yet' }, { status: 404 })
      }
      path = doc.storage_url
    } else {
      // Caller passed a raw storage_path — confirm it lives in their folder
      // so they can't probe other managers' uploads.
      if (!path.startsWith(`${managerId}/`)) {
        return json(req, { ok: false, message: 'Path is not under your manager folder' }, { status: 403 })
      }
    }

    // ── Download the PDF ────────────────────────────────────────────────
    const { data: blob, error: dlErr } = await admin.storage.from('lease-documents').download(path)
    if (dlErr || !blob) {
      return json(req, { ok: false, message: `Could not read PDF: ${dlErr?.message ?? 'unknown'}` }, { status: 500 })
    }
    const pdfBytes = await readBytes(blob)
    if (pdfBytes.length === 0) {
      return json(req, { ok: false, message: 'PDF is empty' }, { status: 400 })
    }
    // Anthropic PDF input cap: 32 MB.
    if (pdfBytes.length > 32 * 1024 * 1024) {
      return json(req, { ok: false, message: 'PDF exceeds 32MB extraction limit — split or compress.' }, { status: 413 })
    }
    const pdfBase64 = toBase64(pdfBytes)

    // ── Ask Claude for structured fields ────────────────────────────────
    const { result: resp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system:
        'You read residential lease agreements and extract a small set of structured fields. ' +
        'Return ONLY a single JSON object with the exact schema requested — no prose, no markdown fence. ' +
        'Use null when a field is not present or unclear. Use YYYY-MM-DD for dates. Use numbers (not strings) for money. ' +
        'Money values exclude currency symbols.',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdfBase64 },
          },
          {
            type: 'text',
            text:
              'Extract these fields from the attached residential lease and return JSON with exactly these keys:\n' +
              '\n' +
              '{\n' +
              '  "tenants": [{"first_name": string|null, "last_name": string|null, "email": string|null, "phone": string|null}],\n' +
              '  "lease_start": "YYYY-MM-DD"|null,\n' +
              '  "lease_end":   "YYYY-MM-DD"|null,\n' +
              '  "monthly_rent": number|null,\n' +
              '  "security_deposit": number|null,\n' +
              '  "pet_deposit": number|null,\n' +
              '  "property_address": string|null,\n' +
              '  "unit_number": string|null\n' +
              '}\n' +
              '\n' +
              'Rules:\n' +
              '- tenants: include every named lessee/tenant on the lease — co-tenants, roommates, all of them. ' +
              'If only a full name is given, split into first_name (everything before the last space) and last_name (the last token). ' +
              'If an email or phone number is shown on the lease for a tenant, include it; otherwise null.\n' +
              '- lease_start/lease_end: pull from the Term section. If the lease says "12-month term commencing January 1, 2026" and no explicit end date is shown, compute the end as 2026-12-31 (one day before the same calendar day a year later).\n' +
              '- monthly_rent: monthly rent amount in USD. Do not include the security deposit, pet rent, or late fees in this number.\n' +
              '- security_deposit: just the security/damage deposit. Do not include first month\'s rent or pet deposit.\n' +
              '- pet_deposit: null if pets are not mentioned or no pet deposit is specified.\n' +
              '- property_address: STREET ADDRESS ONLY (no city, state, ZIP, no unit suffix).\n' +
              '- unit_number: extract separately (e.g. "303", "Apt B", "Unit 2"). null for single-family homes.\n' +
              '\n' +
              'Return the JSON object only. Nothing else.',
          },
        ],
      }],
    }))

    // Parse response.
    const textBlock = (resp.content ?? []).find((b) => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    let extracted: Extracted | null = null
    try {
      // Strip any stray markdown fence Claude might add despite instructions.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      extracted = JSON.parse(cleaned) as Extracted
    } catch (e) {
      await logApiCall({
        function_name: 'extract-lease-fields', vendor: 'anthropic',
        latency_ms, status_code: 500,
        error_message: `JSON parse failed: ${e instanceof Error ? e.message : 'unknown'}`,
        metadata: { raw_preview: raw.slice(0, 200) },
      })
      return json(req, { ok: false, message: 'Could not read the lease — Claude returned malformed JSON' }, { status: 502 })
    }

    // Best-effort post-validation. Don't fail the request on weirdness —
    // the manager reviews everything before saving.
    if (!Array.isArray(extracted.tenants)) extracted.tenants = []
    extracted.tenants = extracted.tenants.map((t) => ({
      first_name: typeof t?.first_name === 'string' ? t.first_name : null,
      last_name:  typeof t?.last_name  === 'string' ? t.last_name  : null,
      email:      typeof t?.email      === 'string' ? t.email.toLowerCase() : null,
      phone:      typeof t?.phone      === 'string' ? t.phone : null,
    }))

    await logApiCall({
      function_name: 'extract-lease-fields', vendor: 'anthropic',
      latency_ms,
      reference_id: payload.lease_id ?? null,
      cost_usd: anthropicCost({
        model: MODEL,
        input_tokens: resp.usage?.input_tokens ?? 0,
        output_tokens: resp.usage?.output_tokens ?? 0,
      }),
      metadata: {
        tenant_count: extracted.tenants.length,
        had_term: !!(extracted.lease_start && extracted.lease_end),
        had_rent: typeof extracted.monthly_rent === 'number',
      },
    })

    return json(req, { ok: true, extracted })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'extract-lease-fields', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: msg }, { status: 500 })
  }
})

// explain-lease — "Renter Check"
//
// Public, no-login tenant tool: a renter uploads ANY lease PDF and gets a
// plain-English breakdown of obligations, red flags, and (Ohio-first) tenant
// rights. The inverse of the landlord document generator — it ingests an
// arbitrary lease and explains it.
//
// Anonymous: there is no JWT (config: verify_jwt = false). We authorize by IP
// rate-limit instead, and guard spend with a size cap. The PDF is sent to
// Claude as a document block; we do not persist it (privacy — see the spec).
//
// Reuses the established Anthropic + logging + rate-limit patterns from
// extract-lease-fields / start-screening.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)
// Sonnet — strong enough to reason about clauses/rights, far cheaper than Opus
// for a free top-of-funnel tool.
const MODEL = 'claude-sonnet-4-6'

// ~15 MB PDF. base64 inflates ~4/3, so cap the encoded string accordingly.
const MAX_B64_LEN = 20_000_000

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// Statutory facts the model can cite. Facts, not advice — stated so renters can
// verify against the Ohio Revised Code themselves.
const OHIO_REFERENCE = `
Ohio (ORC Chapter 5321 / 1923) reference facts:
- Security deposit: no statutory cap. If a deposit over $50 (or one month's rent, whichever is greater) is held more than 6 months, the excess must earn 5%/yr interest (ORC 5321.16). Landlord must return the deposit with an itemized list of deductions within 30 days of move-out once given a forwarding address.
- Late fees: no statutory cap, but must be reasonable and stated in the lease.
- Entry: landlord must give reasonable notice (generally 24 hours) before non-emergency entry (ORC 5321.04(A)(8)).
- Habitability: landlord must keep the unit fit and in good repair (ORC 5321.04). A lease cannot force the tenant to waive these duties.
- Month-to-month termination: 30 days' written notice by either party (ORC 5321.17).
- Self-help eviction is illegal: landlord may NOT lock out a tenant or shut off utilities to force them out (ORC 5321.15). Eviction must go through the court (ORC Chapter 1923); nonpayment requires a 3-day notice to leave first (ORC 1923.04).
- Retaliation against a tenant for asserting their rights is prohibited (ORC 5321.02).
- Tenant may use "rent escrow" with the municipal/county court if the landlord fails to make required repairs (ORC 5321.07).
`.trim()

const SCHEMA_INSTRUCTION = `
Analyze the attached residential lease from the TENANT's perspective. Return ONLY a single JSON object (no prose, no markdown fence) with exactly this shape:

{
  "summary": string,                       // 2-3 plain-English sentences: what this lease commits the tenant to
  "state_detected": string|null,           // 2-letter state code from the lease, or null
  "parties": { "landlord_name": string|null, "landlord_email": string|null, "property_address": string|null, "unit": string|null, "tenant_names": string[] },
  "money": { "monthly_rent": number|null, "deposit": number|null, "other_fees": [{ "label": string, "amount": number|null }], "total_upfront": number|null },
  "key_dates": { "start": string|null, "end": string|null, "rent_due_day": number|null, "notice_to_vacate_days": number|null },
  "obligations": [{ "title": string, "plain_english": string, "where_in_lease": string|null }],
  "red_flags": [{ "severity": "high"|"medium"|"low", "issue": string, "why_it_matters": string, "state_context": string|null, "statute_cite": string|null }],
  "your_rights": [{ "right": string, "plain_english": string, "statute_cite": string|null }],
  "questions_to_ask": string[]
}

Rules:
- Dates as YYYY-MM-DD. Money as numbers without currency symbols. Use null when unknown.
- Red flags: surface clauses that are unusual, one-sided, or that try to waive statutory tenant protections. Examples to watch for: deposit terms that ignore the interest rule, waiver of habitability/repair duties, joint-and-several liability (each roommate liable for ALL rent), automatic-renewal traps, entry without notice, tenant made responsible for major repairs, illegal self-help/lockout language, broad indemnification.
- If state_detected is "OH", ground red_flags and your_rights in the Ohio reference facts and include the relevant statute_cite. If the state is NOT Ohio or is unclear, still explain plainly but set statute_cite to null and keep state_context general — do not invent citations.
- your_rights: the protections the tenant keeps regardless of what the lease says (for OH, draw from the reference facts).
- questions_to_ask: concrete things the tenant should clarify BEFORE signing.
- This is general information, not legal advice. Do not tell the tenant whether to sign.
`.trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    const ip = clientIp(req)
    // Free tool — guard spend. ~15 analyses per IP per hour.
    const allowed = await checkRateLimit({ key: `explain-lease:${ip}`, windowSeconds: 3600, maxCount: 15 })
    if (!allowed) {
      return json(req, { ok: false, message: "You've checked a lot of leases — try again in a little while." }, { status: 429 })
    }

    const body = await req.json().catch(() => ({})) as { pdf_base64?: string; ref?: string }
    const pdfBase64 = body.pdf_base64 ?? ''
    if (!pdfBase64) return json(req, { ok: false, message: 'No lease PDF received.' }, { status: 400 })
    if (pdfBase64.length > MAX_B64_LEN) {
      return json(req, { ok: false, message: 'That PDF is a bit large — try one under ~15MB.' }, { status: 413 })
    }

    const { result: resp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: 3500,
      system:
        'You are a tenant-advocate assistant that reads residential leases and explains them in plain English. ' +
        'You are precise, calm, and never alarmist. You output ONLY valid JSON in the schema given. ' +
        'You provide general information, never legal advice, and you never tell someone whether to sign.\n\n' +
        OHIO_REFERENCE,
      messages: [{
        role: 'user',
        content: [
          { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdfBase64 } },
          { type: 'text', text: SCHEMA_INSTRUCTION },
        ],
      }],
    }))

    const textBlock = (resp.content ?? []).find((b) => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let analysis: unknown
    try {
      analysis = JSON.parse(cleaned)
    } catch {
      return json(req, { ok: false, message: "We couldn't read that lease clearly. Make sure it's a text-based PDF and try again." }, { status: 422 })
    }

    await logApiCall({
      function_name: 'explain-lease',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      metadata: { ref: body.ref ?? null, state: (analysis as { state_detected?: string })?.state_detected ?? null },
    })

    // Persist for the funnel (lead capture / landlord match / invite). The PDF
    // is never stored — only the extracted analysis. Best-effort: a DB hiccup
    // must not fail the renter's result.
    const a = analysis as {
      state_detected?: string | null
      summary?: string
      parties?: { landlord_name?: string | null; landlord_email?: string | null; property_address?: string | null }
      red_flags?: Array<{ severity?: string }>
    }
    const landlordEmail = a.parties?.landlord_email ?? null
    const redFlags = a.red_flags ?? []
    let analysisId: string | null = null
    let accessToken: string | null = null
    let landlordOnPlatform = false
    try {
      let matchedManagerId: string | null = null
      if (landlordEmail) {
        const { data: mgr } = await admin
          .from('profiles').select('id').eq('role', 'manager').ilike('email', landlordEmail).maybeSingle()
        if (mgr) { matchedManagerId = mgr.id as string; landlordOnPlatform = true }
      }
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
      const { data: row } = await admin.from('lease_analyses').insert({
        access_token: token,
        state_detected: a.state_detected ?? null,
        referral_source: body.ref ?? null,
        landlord_name: a.parties?.landlord_name ?? null,
        landlord_email: landlordEmail,
        property_address: a.parties?.property_address ?? null,
        summary: a.summary ?? null,
        red_flag_count: redFlags.length,
        high_flag_count: redFlags.filter((f) => f.severity === 'high').length,
        analysis: a,
        matched_manager_id: matchedManagerId,
      }).select('id').single()
      if (row) { analysisId = row.id as string; accessToken = token }
    } catch { /* funnel is best-effort */ }

    return json(req, { ok: true, analysis, analysis_id: analysisId, access_token: accessToken, landlord_on_platform: landlordOnPlatform })
  } catch (err) {
    return json(req, { ok: false, message: err instanceof Error ? err.message : 'Something went wrong analyzing the lease.' }, { status: 500 })
  }
})

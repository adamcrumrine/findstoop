// fair-housing-lint — Fair Housing check for landlord-written copy.
//
// Everyone generates listing copy with AI; this is the reverse — the landlord
// writes something (a listing, a message to a tenant) and we lint it against
// Fair Housing Act advertising guidance BEFORE it goes out, quoting the exact
// phrase, explaining which protected class it touches, and offering a neutral
// rewrite. Advisory only: the client never blocks sending — we advise, never
// censor, and the model is instructed to flag-and-explain, never accuse.
//
// Auth / response / rate-limit conventions mirror parse-receipt (manager
// tool): bearer → getUser → role manager|admin; expected user-facing outcomes
// as HTTP 200 { ok: false, code }; per-user daily cap via the rate_limit_check
// RPC; logApiCall with anthropicCost + timed. Never log the landlord's text —
// only shape metadata.
//
// The substance of the system prompt reuses the Fair Housing education
// article (apps/web/src/pages/marketing/education/FairHousingGuide.tsx):
// seven federal protected classes, common state/local additions, and the
// advertising examples HUD acts on. The client links that article from the
// results ("Learn more").

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
// Sonnet, not Haiku — false positives here accuse the landlord of
// discrimination and false negatives defeat the point; texts are short so
// the cost stays small. Same model as ask-lease.
const MODEL = 'claude-sonnet-4-6'

const MAX_TEXT_LEN = 4000
const MAX_OUTPUT_TOKENS = 1200
const MAX_FINDINGS = 8
// Checks are iterative (check → fix → re-check), so the cap is generous.
const DAILY_LIMIT = 60

interface LintInput {
  text?: string
  context?: string
}

interface LintFinding {
  quote: string
  issue: string
  category: string
  suggestion: string
  severity: 'warning' | 'caution'
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// The compliance knowledge lives server-side so every surface lints the same
// way. Substance mirrors the Fair Housing education article.
const SYSTEM_PROMPT = `
You review text a rental landlord wrote — a unit listing or a message to a tenant/applicant — for Fair Housing Act (FHA) advertising and communication risks, BEFORE it is published or sent. You are helping the landlord comply; you are not policing them. Most issues are accidental phrasing by well-meaning people. Never accuse — flag, explain plainly, and suggest a neutral rewrite.

Reply with ONLY a JSON object (no prose, no markdown fence):
{"findings": [{"quote": string, "issue": string, "category": string, "suggestion": string, "severity": "warning" | "caution"}]}

Rules for each finding:
- "quote": the EXACT phrase copied verbatim from the text (shortest span that captures the problem). Never paraphrase — the app highlights this substring.
- "issue": 1-2 plain-English sentences on why the phrase is risky under Fair Housing rules. Neutral, factual, never accusatory ("this could read as…", "HUD guidance treats… "). Never say the landlord discriminated or broke the law.
- "category": short human-readable label — one of: "Familial status", "Disability", "Race / national origin", "Religion", "Sex", "Age", "Source of income", "Steering", "Other".
- "suggestion": a neutral drop-in replacement for the quoted phrase that keeps the landlord's legitimate intent (describe the property, not the person). Empty string "" if the phrase should simply be deleted.
- "severity": "warning" when the phrase conflicts with federal FHA advertising guidance (protected-class exclusions or preferences); "caution" for borderline, context-dependent, or state/local-law-dependent phrasing (steering by implication, source-of-income limits, "safe neighborhood" style wording).

FAIR HOUSING KNOWLEDGE TO APPLY:
Seven federal protected classes: race, color, national origin, religion, sex (including gender identity and sexual orientation), familial status (children under 18, pregnancy), disability. Common state/local additions: source of income (Section 8 vouchers and other lawful income), age, marital status, military/veteran status, citizenship status.

Advertising rule of thumb: describe the PROPERTY and the LEASE TERMS, never the person you imagine living there.

Typical problems to catch:
- Familial status: "no kids", "no children", "adults only", "adult building", "not suitable for children", "mature tenants".
- Steering by imagined tenant: "perfect for young professionals", "ideal for a single person", "great bachelor pad", "perfect for empty nesters" — familial status and/or age steering even when phrased as a compliment.
- Religion: "ideal for a Christian family", "close to great churches", "walking distance to St. Mary's" (implicit steering — caution when it is a plain location fact, warning when framed as who should live there).
- Disability: "no wheelchairs", "not for people with disabilities", "no emotional support animals", "no service animals", blanket refusals of accommodation requests. (ESAs and service animals are not pets — "no pets" alone is fine, but refusing assistance animals is not.)
- Race / national origin: any reference to the ethnicity or origin of desired tenants or of the neighborhood's residents; "English speakers only".
- Sex: "female tenants only", "looking for a male roommate" (note: shared-living roommate situations have exemptions — use caution, not warning, when the text is clearly about a shared home).
- Source of income: "no Section 8", "no vouchers", "no government assistance" — caution, with a note that many states and cities prohibit this.
- "Safe neighborhood", "exclusive neighborhood", "good families", "our kind of community" — borderline steering language; caution with a property-focused rewrite.
- In MESSAGES: also flag questions a landlord may not ask — about children or pregnancy, religion, where someone is "originally from", first language, medical conditions or disabilities, marital status — and replies that treat an applicant differently on those grounds.

DO NOT FLAG legitimate, neutral statements:
- Occupancy limits stated neutrally ("maximum occupancy 4").
- "No smoking", pet policies and pet fees ("no pets", "1 cat OK") — pets are not a protected class.
- Neutral screening criteria applied to everyone: income requirements ("income 3x rent"), credit/background checks where lawful, prior-landlord references.
- Factual property descriptions: bedrooms, price, amenities, "quiet street" (describing the street, not the tenants), school district named as a location fact.
- Accessibility FEATURES ("wheelchair accessible", "step-free entry") — these are encouraged.

Be conservative: when a phrase is genuinely fine, do not manufacture a finding. An empty findings array is the correct answer for clean text. Order findings by severity (warnings first), max ${MAX_FINDINGS}.
`.trim()

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
    const body = await req.json().catch(() => ({})) as LintInput
    const text = (body.text ?? '').trim()
    const context: 'listing' | 'message' = body.context === 'message' ? 'message' : 'listing'

    if (!text) {
      return json(req, { ok: false, code: 'bad_input', message: 'Write something to check first.' })
    }
    if (text.length > MAX_TEXT_LEN) {
      return json(req, { ok: false, code: 'too_long', message: `Keep it under ${MAX_TEXT_LEN} characters — check long copy in sections.` })
    }

    // Per-user daily cap via the shared sliding-window rate limiter (same
    // rate_limit_check RPC ask-lease / parse-receipt use, keyed by user).
    const allowed = await checkRateLimit({ key: `fair-housing-lint:${user.id}`, windowSeconds: 86400, maxCount: DAILY_LIMIT })
    if (!allowed) {
      return json(req, { ok: false, code: 'rate_limited', message: 'Too many checks today — try again tomorrow. You can still send or publish as usual.' })
    }

    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      return json(req, { ok: false, code: 'unavailable', message: 'AI not configured' })
    }

    // ── Ask Claude — JSON forced the same way self-triage does ───────────
    const { result: resp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content:
          (context === 'listing'
            ? 'A landlord drafted this LISTING / marketing copy for a rental unit:\n\n'
            : 'A landlord drafted this MESSAGE to a tenant or applicant:\n\n') +
          text +
          '\n\nReview it for Fair Housing risks. Return the JSON object only.',
      }],
    }))

    type TextBlock = { type: 'text'; text: string }
    const textBlock = resp.content.find((b): b is TextBlock => b.type === 'text')
    const raw = textBlock?.text ?? '{}'
    const m = raw.match(/\{[\s\S]*\}/)
    // deno-lint-ignore no-explicit-any
    let parsed: any = {}
    try { parsed = JSON.parse(m ? m[0] : raw.replace(/```json|```/g, '').trim()) } catch { /* leave defaults */ }

    // ── Validate hard — never trust model output shape ───────────────────
    const findings: LintFinding[] = Array.isArray(parsed.findings)
      ? parsed.findings
          // deno-lint-ignore no-explicit-any
          .filter((f: any) => f && typeof f.quote === 'string' && f.quote.trim() && typeof f.issue === 'string' && f.issue.trim())
          .slice(0, MAX_FINDINGS)
          // deno-lint-ignore no-explicit-any
          .map((f: any): LintFinding => ({
            quote: f.quote.trim().slice(0, 200),
            issue: f.issue.trim().slice(0, 400),
            category: typeof f.category === 'string' && f.category.trim() ? f.category.trim().slice(0, 40) : 'Other',
            suggestion: typeof f.suggestion === 'string' ? f.suggestion.trim().slice(0, 300) : '',
            severity: f.severity === 'warning' ? 'warning' : 'caution',
          }))
      : []
    // Warnings first — the model is told to, but don't rely on it.
    findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1))

    await logApiCall({
      function_name: 'fair-housing-lint',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      user_id: user.id,
      // Never log the landlord's text — only shape metadata.
      metadata: {
        context,
        text_length: text.length,
        findings: findings.length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
      },
    })

    return json(req, { ok: true, clear: findings.length === 0, findings })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'fair-housing-lint', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: 'Could not run the check just now.' }, { status: 500 })
  }
})

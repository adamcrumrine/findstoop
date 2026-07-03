// portfolio-physical — the AI narrative for the Annual Portfolio Physical.
//
// The web app computes every metric itself (apps/web/src/lib/portfolioPhysical.ts:
// rent drift vs saved estimates, 12-month expense ratio, lease-end clustering,
// deposit exposure, compliance gaps, collection health) and sends the finished
// metrics JSON here. This function's ONLY job is one Claude call that turns
// those numbers into a short executive narrative plus prioritized
// recommendations. The model narrates and ranks; it never contributes a
// figure — every number it may mention already exists in the metrics payload,
// and the report UI renders the computed sections regardless of what the
// model says.
//
// Auth / response / rate-limit conventions mirror draft-reply (manager tool):
// bearer → getUser → role manager|admin; expected user-facing outcomes as
// HTTP 200 { ok: false, code }; per-user daily cap via the rate_limit_check RPC.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const MODEL = 'claude-sonnet-4-6'

const MAX_OUTPUT_TOKENS = 1200
// A physical is a once-a-year report; 10/day is generous headroom for
// re-runs while capping abuse spend.
const DAILY_LIMIT = 10
// Metrics are pre-aggregated client-side; anything bigger than this isn't
// our payload shape.
const MAX_METRICS_BYTES = 60_000
const MAX_RECOMMENDATIONS = 8

interface PhysicalInput {
  metrics?: unknown
  scope?: string
}

interface Recommendation {
  priority: number
  title: string
  detail: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

const SYSTEM_PROMPT = `
You write the executive summary of an annual "portfolio physical" — a health report for a small landlord's rental portfolio. You receive a metrics JSON computed by the application from the landlord's real records.

GROUNDING RULES — these are absolute:
- Use ONLY the numbers in the metrics JSON. Never estimate, extrapolate, compute new figures, or bring in outside benchmarks ("typical expense ratios are…"). If a signal is null or missing, you may note that it's missing (e.g. "no rent estimate on file"), never fill it in.
- Do not do arithmetic beyond restating a number that is already present. If a comparison isn't directly supported by two numbers in the JSON, don't make it.
- No legal or tax advice. You may point at a compliance warning the metrics already contain, phrased as "worth reviewing", never as a legal conclusion.

WHAT TO WRITE:
1. "summary": 3-6 sentences a busy landlord reads in 30 seconds. Lead with the overall health (collections, expense ratio), then the one or two things that most deserve attention this year. Plain, direct, friendly — like a sharp part-time CFO, not a consultant deck. No markdown, no bullet characters.
2. "recommendations": 2-${MAX_RECOMMENDATIONS} items, ordered by financial impact and urgency (deposit deadlines and compliance warnings are urgent; below-market rent and lease-end clustering are planning items). Each has a short imperative "title" (a few words) and a "detail" of 1-3 sentences saying why — citing the metric that motivates it — and what to do in the app or in practice. Only recommend things the metrics actually support. If everything is healthy, say so and keep the list short.

Reply with ONLY a JSON object: {"summary": "<string>", "recommendations": [{"title": "<string>", "detail": "<string>"}, ...]}
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
    const body = await req.json().catch(() => ({})) as PhysicalInput
    const scope = body.scope === 'property' ? 'property' : 'portfolio'
    if (!body.metrics || typeof body.metrics !== 'object' || Array.isArray(body.metrics)) {
      return json(req, { ok: false, message: 'metrics object required' }, { status: 400 })
    }
    const metricsJson = JSON.stringify(body.metrics)
    if (metricsJson.length > MAX_METRICS_BYTES) {
      return json(req, { ok: false, code: 'too_large', message: 'Metrics payload is too large.' })
    }

    // Per-user daily cap via the shared sliding-window rate limiter.
    const allowed = await checkRateLimit({
      key: `portfolio-physical:${user.id}`, windowSeconds: 86400, maxCount: DAILY_LIMIT,
    })
    if (!allowed) {
      return json(req, {
        ok: false, code: 'rate_limited',
        message: 'You’ve generated several physicals today — the numbers on the report are still yours to use.',
      })
    }

    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      return json(req, { ok: false, code: 'unavailable', message: 'AI not configured' })
    }

    // ── Ask Claude ───────────────────────────────────────────────────────
    const { result: resp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content:
          `Scope: ${scope === 'property' ? 'a single property' : 'the whole portfolio'}.\n\n` +
          `Computed metrics (12-month window):\n${metricsJson}\n\n` +
          `Write the summary and recommendations JSON.`,
      }],
    }))

    type TextBlock = { type: 'text'; text: string }
    const text = resp.content.find((b): b is TextBlock => b.type === 'text')?.text ?? ''

    // ── Hard output validation — reject anything off-shape ───────────────
    let summary = ''
    let recommendations: Recommendation[] = []
    try {
      const m = text.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(m ? m[0] : text) as { summary?: unknown; recommendations?: unknown }
      if (typeof parsed.summary === 'string') summary = parsed.summary.trim().slice(0, 2000)
      if (Array.isArray(parsed.recommendations)) {
        recommendations = parsed.recommendations
          .filter((r): r is { title?: unknown; detail?: unknown } => !!r && typeof r === 'object')
          .map((r) => ({
            title: typeof r.title === 'string' ? r.title.trim().slice(0, 120) : '',
            detail: typeof r.detail === 'string' ? r.detail.trim().slice(0, 600) : '',
          }))
          .filter((r) => r.title.length > 0 && r.detail.length > 0)
          .slice(0, MAX_RECOMMENDATIONS)
          .map((r, i) => ({ priority: i + 1, ...r }))
      }
    } catch { /* fall through to the bad_output branch */ }

    await logApiCall({
      function_name: 'portfolio-physical',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      user_id: user.id,
      // Never log the metrics or narrative — only shape metadata.
      metadata: {
        model: MODEL, scope, metrics_bytes: metricsJson.length,
        summary_length: summary.length, recommendations: recommendations.length,
      },
    })

    if (!summary) {
      return json(req, {
        ok: false, code: 'bad_output',
        message: 'Could not produce a narrative just now — the computed report below is still complete.',
      })
    }

    return json(req, { ok: true, summary, recommendations })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'portfolio-physical', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: 'Could not produce a narrative just now.' }, { status: 500 })
  }
})

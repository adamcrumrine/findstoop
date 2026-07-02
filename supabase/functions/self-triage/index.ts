// self-triage — tenant-facing "try this first" suggestions.
//
// Called BEFORE a maintenance request is created: the tenant's issue
// description goes in, and Claude suggests up to three zero-risk self-checks
// ("breaker tripped? reset it like this"). Every deflected callout saves the
// landlord a truck roll; the tenant can always proceed to submit — the client
// treats any failure here as "no suggestions" and submits directly.
//
// This is deliberately a SIBLING of triage-maintenance, not a mode on it:
// triage-maintenance operates post-insert on an existing maintenance_requests
// row (requestId in, tenant-or-manager auth against the row, writes ai_*
// columns back). Self-triage is pre-insert (no row exists yet), tenant-only,
// rate-limited, and writes nothing — sharing a function would fork every code
// path. Mirrors the auth / response / rate-limit conventions of ask-lease:
// bearer → getUser → role='tenant'; expected user-facing outcomes as HTTP 200
// { ok: false, code }; per-user daily cap via the rate_limit_check RPC.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
// Same model as triage-maintenance — cheap, fast, high-volume pre-submit call.
const MODEL = 'claude-haiku-4-5-20251001'

const MAX_TITLE_LEN = 120
const MAX_DESCRIPTION_LEN = 600
const MAX_OUTPUT_TOKENS = 500
// ~20 checks per tenant per day — real use is 1-2; caps abuse spend.
const DAILY_LIMIT = 20

interface SelfTriageInput {
  title?: string
  description?: string
}

interface SelfFix {
  step: string
  detail: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// The safety rules live server-side so a compromised client can't loosen them.
// ONLY zero-risk actions may ever be suggested; anything ambiguous gets no
// self-fixes. Active hazards get an act-now safety_warning + submit anyway.
const SYSTEM_PROMPT = `
You help a rental tenant with SAFE self-checks before they file a maintenance request with their landlord. You are not a repair guide.

Reply with ONLY a JSON object (no prose, no markdown) with these keys:
- likely_cause: one plain-English sentence guessing the most likely cause.
- self_fixes: an array of 0 to 3 objects, each {"step": short imperative title, "detail": 1-2 sentences of plain instructions}. Order by likelihood of fixing it.
- safety_warning: a string, or null when there is no safety concern.
- should_submit_anyway: boolean — true when the issue likely needs the landlord even if the quick checks help (recurring problems, anything involving repairs, unclear causes). Only false when the self-fixes would fully and durably resolve it.

STRICT SAFETY RULES for self_fixes:
- ONLY suggest zero-risk actions a renter can do with at most a plunger or screwdriver: resetting a tripped circuit breaker, pressing the reset button on a GFCI outlet, replacing batteries (thermostat, smoke detector, remote), checking a device is plugged in, tightening a loose handle or knob, plunging a clogged toilet or drain, checking thermostat mode/settings (heat vs cool, schedule, battery), or closing the fixture's shut-off valve to stop an active water leak.
- NEVER suggest anything involving: gas lines or gas appliances, electrical wiring or outlets beyond pressing a breaker/GFCI reset, opening or disassembling any appliance, water heaters, ladders, roofs or working at height, structural elements, mold remediation, or chemicals. Do not suggest buying tools or parts.
- If the issue is ambiguous, could be one of the forbidden categories, or you are not certain a step is completely safe: return an empty self_fixes array (and a safety_warning if there is any hazard).
- ACTIVE HAZARDS override everything. Gas smell, carbon-monoxide alarm, sparking / burning smell / smoke, or major flooding: return NO self_fixes except that safety_warning must tell them the immediate protective action (leave the building and call the gas company / call 911 / shut off the water at the valve) and to submit the request immediately. should_submit_anyway must be true.
- Never diagnose with certainty, never promise a fix, never advise delaying a needed repair.
`.trim()

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

    // ── Input validation ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as SelfTriageInput
    const title = (body.title ?? '').trim().slice(0, MAX_TITLE_LEN)
    const description = (body.description ?? '').trim().slice(0, MAX_DESCRIPTION_LEN)
    if (!title && !description) {
      return json(req, { ok: false, code: 'bad_input', message: 'Describe the issue first.' })
    }

    // Per-user daily cap via the shared sliding-window rate limiter (same
    // rate_limit_check RPC ask-lease uses, keyed by user).
    const allowed = await checkRateLimit({ key: `self-triage:${user.id}`, windowSeconds: 86400, maxCount: DAILY_LIMIT })
    if (!allowed) {
      return json(req, { ok: false, code: 'rate_limited', message: 'Too many checks today — you can still submit your request.' })
    }

    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      return json(req, { ok: false, code: 'unavailable', message: 'AI not configured' })
    }

    // ── Ask Claude — JSON forced the same way triage-maintenance does ────
    const { result: msg, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content:
          `A tenant is about to file this maintenance request:\n` +
          `Title: ${title || '(none)'}\n` +
          `Description: ${description || '(none)'}`,
      }],
    }))

    // deno-lint-ignore no-explicit-any
    const textBlock = (msg.content as any[]).find((c) => c.type === 'text')
    const text: string = textBlock?.text ?? '{}'
    const m = text.match(/\{[\s\S]*\}/)
    // deno-lint-ignore no-explicit-any
    let parsed: any = {}
    try { parsed = JSON.parse(m ? m[0] : text) } catch { /* leave defaults */ }

    // Validate hard — never trust model output shape. Cap 3 fixes, slice strings.
    const likely_cause = typeof parsed.likely_cause === 'string' ? parsed.likely_cause.slice(0, 300) : null
    const self_fixes: SelfFix[] = Array.isArray(parsed.self_fixes)
      ? parsed.self_fixes
          // deno-lint-ignore no-explicit-any
          .filter((f: any) => f && typeof f.step === 'string' && typeof f.detail === 'string')
          .slice(0, 3)
          // deno-lint-ignore no-explicit-any
          .map((f: any) => ({ step: f.step.slice(0, 120), detail: f.detail.slice(0, 400) }))
      : []
    const safety_warning = typeof parsed.safety_warning === 'string' && parsed.safety_warning.trim()
      ? parsed.safety_warning.slice(0, 400)
      : null
    // Default to true — when in doubt the tenant should submit.
    const should_submit_anyway = typeof parsed.should_submit_anyway === 'boolean' ? parsed.should_submit_anyway : true

    await logApiCall({
      function_name: 'self-triage',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL, msg.usage?.input_tokens ?? 0, msg.usage?.output_tokens ?? 0),
      user_id: user.id,
      // Never log the issue text — only shape metadata.
      metadata: { fixes: self_fixes.length, has_warning: !!safety_warning, description_length: description.length },
    })

    if (!likely_cause) {
      // Model returned nothing usable — the client submits directly.
      return json(req, { ok: false, code: 'no_suggestions', message: 'No suggestions this time.' })
    }

    return json(req, { ok: true, triage: { likely_cause, self_fixes, safety_warning, should_submit_anyway } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'self-triage', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: 'Could not check for quick fixes.' }, { status: 500 })
  }
})

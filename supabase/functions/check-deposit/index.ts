// check-deposit — "Is this deposit deduction fair?"
//
// Public, no-login tenant tool: a renter uploads (or pastes) the landlord's
// security-deposit disposition letter and gets each deduction analyzed against
// Ohio law (ORC 5321.16) — fair / questionable / unfair, with the statute and
// the amount they may be owed back. Pairs with the deposit-demand letter.
//
// Same shape as explain-lease: anonymous, IP rate-limited, Claude with an
// Ohio-grounded system prompt. General information, not legal advice.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const MODEL = 'claude-sonnet-4-6'
const MAX_B64_LEN = 20_000_000   // ~15 MB PDF
const MAX_TEXT_LEN = 30_000

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

const OHIO_DEPOSIT_REFERENCE = `
Ohio security-deposit law (ORC 5321.16) — the facts to judge deductions against:
- The landlord must return the deposit, minus an ITEMIZED list of deductions, within 30 days of the end of the tenancy once the tenant gives a forwarding address. A vague, un-itemized deduction is improper.
- Only TWO things may be deducted: (1) unpaid rent, and (2) the cost to repair ACTUAL DAMAGE the tenant caused beyond ordinary wear and tear.
- ORDINARY WEAR AND TEAR may NOT be charged. Examples of normal wear (NOT chargeable): faded or scuffed paint, small nail/tack holes, lightly worn or matted carpet, minor scuffs on floors, worn grout, loose hinges, normal appliance aging. Routine cleaning and ordinary touch-up painting are generally the landlord's cost.
- Chargeable ACTUAL DAMAGE (fair, if real and itemized at reasonable cost): large holes in walls, broken fixtures/appliances, pet stains/odor, burns, heavy filth requiring more than routine cleaning, missing items, unpaid rent or utilities the tenant owed.
- "Carpet replacement," "repainting the whole unit," or flat fees charged regardless of condition are usually questionable — landlords generally can't make the tenant pay to refresh the unit for the next renter.
- If a deposit over $50 (or one month's rent, whichever is greater) was held more than 6 months, the excess earns 5%/yr interest.
- If a landlord WRONGFULLY withholds, the tenant may recover TWICE the amount wrongfully withheld plus reasonable attorney's fees.
`.trim()

const SCHEMA_INSTRUCTION = `
You are given a landlord's security-deposit disposition (the letter/itemization the landlord sent explaining what they kept). Analyze it from the TENANT's side. Return ONLY a single JSON object (no prose, no markdown fence) with exactly this shape:

{
  "summary": string,                          // 2-3 plain-English sentences
  "state_detected": string|null,              // 2-letter state if shown, else null
  "deposit_amount": number|null,              // original deposit
  "total_deducted": number|null,
  "amount_returned": number|null,
  "within_30_days": boolean|null,             // true/false if the timing is shown, else null
  "itemized": boolean,                         // were deductions actually itemized?
  "deductions": [{
     "label": string, "amount": number|null,
     "verdict": "fair"|"questionable"|"unfair",
     "why": string, "statute_cite": string|null
  }],
  "likely_owed_back": number|null,            // sum of the questionable + unfair amounts
  "your_rights": [{ "right": string, "plain_english": string, "statute_cite": string|null }],
  "questions_to_ask": string[]
}

Rules:
- Money as numbers without symbols. Use null when unknown.
- Judge EACH deduction: ordinary wear and tear → "unfair"; a flat fee / whole-unit repaint / routine carpet replacement charged regardless of damage → usually "questionable"; genuine itemized damage or unpaid rent → "fair".
- If the state is Ohio (or unclear, assume the Ohio framework was requested), ground verdicts in the Ohio facts and cite ORC 5321.16. If clearly another state, keep verdicts general and set statute_cite to null.
- likely_owed_back = the total dollars from deductions you marked questionable or unfair.
- This is general information, not legal advice. Do not tell the tenant to sue.
`.trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    const ip = clientIp(req)
    const allowed = await checkRateLimit({ key: `check-deposit:${ip}`, windowSeconds: 3600, maxCount: 15 })
    if (!allowed) return json(req, { ok: false, message: "You've checked a lot — try again in a little while." }, { status: 429 })

    const body = await req.json().catch(() => ({})) as { pdf_base64?: string; text?: string; ref?: string }
    const pdf = body.pdf_base64 ?? ''
    const text = (body.text ?? '').trim()
    if (!pdf && !text) return json(req, { ok: false, message: 'Paste the deductions or upload the landlord’s letter.' }, { status: 400 })
    if (pdf.length > MAX_B64_LEN) return json(req, { ok: false, message: 'That PDF is large — try one under ~15MB.' }, { status: 413 })
    if (text.length > MAX_TEXT_LEN) return json(req, { ok: false, message: 'That’s a lot of text — trim it down a bit.' }, { status: 413 })

    const content: Anthropic.MessageParam['content'] = pdf
      ? [
          { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdf } },
          { type: 'text', text: SCHEMA_INSTRUCTION },
        ]
      : [{ type: 'text', text: `${SCHEMA_INSTRUCTION}\n\nThe landlord's deposit disposition / itemization:\n"""\n${text}\n"""` }]

    const { result: resp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system:
        'You are a tenant-advocate assistant that reviews security-deposit deductions and explains, plainly and calmly, which are fair and which are not. You output ONLY valid JSON in the schema given. You provide general information, never legal advice.\n\n' +
        OHIO_DEPOSIT_REFERENCE,
      messages: [{ role: 'user', content }],
    }))

    const textBlock = (resp.content ?? []).find((b) => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let analysis: unknown
    try {
      analysis = JSON.parse(cleaned)
    } catch {
      return json(req, { ok: false, message: "We couldn't read that clearly — try pasting the itemized deductions as text." }, { status: 422 })
    }

    await logApiCall({
      function_name: 'check-deposit',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      metadata: { ref: body.ref ?? null, mode: pdf ? 'pdf' : 'text' },
    })

    return json(req, { ok: true, analysis })
  } catch (err) {
    return json(req, { ok: false, message: err instanceof Error ? err.message : 'Something went wrong analyzing the deductions.' }, { status: 500 })
  }
})

// Rentability score — the AI summary the manager sees with each application.
//
// Combines:
//   • The applicant's self-reported data (income, current rent, employer,
//     reason for leaving, pets, household size)
//   • DL extraction + DL cross-check flags
//   • Income document extraction + cross-check flags
//   • The unit's rent (for income-to-rent ratio)
//
// Outputs:
//   • rentability_score (0–100)
//   • rentability_summary (2–3 sentences the manager can read in 5 seconds)
//   • rentability_flags (structured booleans the UI can render as chips)
//
// IMPORTANT: this is NOT an FCRA consumer report. It's a private internal
// signal scoped to a single leasing decision. The scoring prompt deliberately
// avoids any protected-class signals (race, religion, national origin, sex,
// familial status, disability, source of income protections) and focuses
// only on the four legitimate signals: income-to-rent ratio, document
// authenticity, identity consistency, and self-reported history.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const MODEL_SCORE = 'claude-opus-4-7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

interface ScoreOutput {
  score: number
  summary: string
  flags: {
    income_to_rent_ratio?: number
    income_verified?: boolean
    identity_verified?: boolean
    documents_consistent?: boolean
    eviction_self_reported?: boolean
    [k: string]: unknown
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { orderId } = await req.json() as { orderId?: string }
    if (!orderId) return json({ error: 'orderId required' }, { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: order, error: orderErr } = await admin
      .from('screening_orders')
      .select(`
        id, application_id, dl_extracted, dl_match_score, dl_flags, income_extracted, income_flags,
        addon_credit_self_disclosed, credit_self_bureau, credit_self_report_date,
        credit_self_extracted, credit_self_authenticity_score, credit_self_authenticity_flags
      `)
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return json({ error: 'Order not found' }, { status: 404 })

    await admin.from('screening_orders').update({ state: 'scoring' }).eq('id', orderId)

    const { data: app } = await admin
      .from('applications')
      .select('first_name, last_name, employer, job_title, monthly_income, employment_start_date, current_rent, current_landlord_name, reason_for_leaving, household_size, has_pets, pets_description, eviction_history, background_summary, unit_id')
      .eq('id', order.application_id)
      .single()
    if (!app) return json({ error: 'Application not found' }, { status: 404 })

    const { data: unit } = await admin
      .from('units')
      .select('rent_amount, bedrooms, bathrooms')
      .eq('id', app.unit_id)
      .single()

    const rent = Number(unit?.rent_amount ?? 0)
    const ocrAnnual = (order.income_extracted as { annual_income_estimate?: number } | null)?.annual_income_estimate ?? 0
    const ocrMonthly = ocrAnnual > 0 ? ocrAnnual / 12 : 0
    const reportedMonthly = Number(app.monthly_income ?? 0)
    const monthlyIncome = ocrMonthly > 0 ? ocrMonthly : reportedMonthly
    const ratio = rent > 0 ? monthlyIncome / rent : 0

    const incomeFlags = (order.income_flags as Record<string, boolean | string | number> | null) ?? {}
    const dlFlags = (order.dl_flags as Record<string, boolean | string> | null) ?? {}

    const incomeVerified = !!incomeFlags.employer_match_app
      && !!incomeFlags.name_match_app
      && !!incomeFlags.paystubs_consecutive
      && !!incomeFlags.ytd_math_consistent
      && !!incomeFlags.paystubs_fresh_60d
      && !incomeFlags.tamper_suspected

    const identityVerified = !!dlFlags.name_match_app
      && !!dlFlags.dob_match_app
      && !dlFlags.expired
      && !dlFlags.tamper_suspected
      && (order.dl_match_score ?? 0) >= 0.6

    const documentsConsistent = !!incomeFlags.name_match_dl
    const evictionFlagged = !!app.eviction_history && app.eviction_history.toLowerCase() !== 'no' && app.eviction_history.toLowerCase() !== 'none'

    // Credit self-disclosure context — only included if the applicant
    // uploaded a report AND the authenticity check has run. We give the
    // model the bureau + report date + structured facts + the
    // authenticity score / flags from credit-report-ocr's Sonnet pass, so
    // it can weight the credit signal appropriately (a 750 score with an
    // authenticity score of 30 should be discounted heavily).
    const creditExtracted = order.credit_self_extracted as Record<string, unknown> | null
    const creditAuth = order.credit_self_authenticity_flags as { flags?: unknown[]; summary?: string } | null
    const creditContext = order.addon_credit_self_disclosed && creditExtracted ? {
      bureau:                order.credit_self_bureau,
      report_date:           order.credit_self_report_date,
      score:                 (creditExtracted as { score?: number | null }).score ?? null,
      score_model:           (creditExtracted as { score_model?: string | null }).score_model ?? null,
      open_account_count:    (creditExtracted as { open_account_count?: number | null }).open_account_count ?? null,
      derogatory_count:      (creditExtracted as { derogatory_count?: number | null }).derogatory_count ?? null,
      collection_count:      (creditExtracted as { collection_count?: number | null }).collection_count ?? null,
      bankruptcy_count:      (creditExtracted as { bankruptcy_count?: number | null }).bankruptcy_count ?? null,
      total_balance:         (creditExtracted as { total_balance?: number | null }).total_balance ?? null,
      authenticity_score:    order.credit_self_authenticity_score,
      authenticity_summary:  creditAuth?.summary ?? null,
      authenticity_flags:    creditAuth?.flags ?? [],
    } : null

    const scoringContext = {
      unit: { monthly_rent: rent, bedrooms: unit?.bedrooms, bathrooms: unit?.bathrooms },
      applicant: {
        employer: app.employer,
        job_title: app.job_title,
        self_reported_monthly_income: reportedMonthly,
        employment_start_date: app.employment_start_date,
        current_rent: app.current_rent,
        current_landlord: app.current_landlord_name,
        reason_for_leaving: app.reason_for_leaving,
        household_size: app.household_size,
        has_pets: app.has_pets,
        pets_description: app.pets_description,
        self_reported_evictions: app.eviction_history,
        self_reported_background: app.background_summary,
      },
      verification: {
        document_verified_monthly_income: ocrMonthly,
        income_to_rent_ratio: ratio,
        identity_verified: identityVerified,
        income_documents_verified: incomeVerified,
        applicant_name_consistent_across_docs: documentsConsistent,
        income_flags: incomeFlags,
        dl_flags: dlFlags,
        selfie_match_score: order.dl_match_score,
      },
      credit_self_disclosed: creditContext,
    }

    const sysPrompt = `You produce a private internal "rentability" assessment for a property manager evaluating a rental application. This is NOT an FCRA consumer report — it is a privately-shared signal scoped to this one leasing decision.

You MUST NOT consider, mention, or be influenced by any protected class — race, color, religion, national origin, sex, gender identity, sexual orientation, marital status, familial status, disability, age, military/veteran status, or source-of-income protections (housing vouchers, alimony, child support, public assistance). You analyze only:
  1. income-to-rent ratio (target: 3x rent or higher; 2.5–3x adequate; under 2.5x marginal)
  2. employment/income document authenticity and consistency
  3. identity verification — does the DL match the application, did selfie pass
  4. self-reported history — current landlord, reason for leaving, evictions, background
  5. applicant-provided credit context (only when the credit_self_disclosed block is non-null):
       • bureau, report date, score (often null on AnnualCreditReport.gov pulls)
       • derogatory/collection/bankruptcy counts and total reported balance
       • authenticity_score 0-100 from our cross-doc check — this is a TRUST signal
         on the PDF itself, NOT creditworthiness. Discount the credit facts in
         proportion to (100 - authenticity_score). Below 50 = ignore the numbers.
  Where credit_self_disclosed is null, do not penalize the applicant for the absence.

Return ONLY a single JSON object: {"score": <int 0-100>, "summary": "<2-3 sentences>", "flags": {"income_to_rent_ratio": <number>, "income_verified": <bool>, "identity_verified": <bool>, "documents_consistent": <bool>, "eviction_self_reported": <bool>, "credit_self_present": <bool>, "credit_self_trusted": <bool>, "rationale_bullets": [<string>, ...]}}

Score ranges:
  90–100: strong income (3x+), all docs verified, clean self-reported history, credit (if provided) trusted and clean
  70–89:  adequate income (2.5–3x), docs verified, minor concerns
  50–69:  marginal income (2–2.5x) OR documents partially verified
  30–49:  weak income (under 2x) OR significant verification gaps
  0–29:   failed verification (tamper detected, identity mismatch, credit authenticity < 50, etc.)`

    const { result: scoreResp, latency_ms: scoreLatency } = await timed(() => anthropic.messages.create({
      model: MODEL_SCORE,
      max_tokens: 1000,
      system: sysPrompt,
      messages: [{
        role: 'user',
        content: `Applicant data:\n${JSON.stringify(scoringContext, null, 2)}\n\nProduce the rentability JSON.`,
      }],
    }))
    await logApiCall({
      function_name: 'rentability-score', vendor: 'anthropic',
      latency_ms: scoreLatency, reference_id: orderId,
      cost_cents: anthropicCost(MODEL_SCORE, scoreResp.usage?.input_tokens ?? 0, scoreResp.usage?.output_tokens ?? 0),
      metadata: { model: MODEL_SCORE, input_tokens: scoreResp.usage?.input_tokens, output_tokens: scoreResp.usage?.output_tokens },
    })
    type TextBlock = { type: 'text'; text: string }
    const out = scoreResp.content.find((b): b is TextBlock => b.type === 'text')?.text ?? '{}'
    let parsed: ScoreOutput = { score: 0, summary: '', flags: {} }
    try {
      parsed = JSON.parse(out.replace(/```json|```/g, '').trim())
    } catch {
      parsed = { score: 0, summary: 'Could not produce rentability score (model output was not valid JSON).', flags: {} }
    }

    // Stamp pre-computed flags onto the output for the UI.
    const creditTrusted = creditContext != null && (creditContext.authenticity_score ?? 0) >= 70
    parsed.flags = {
      ...parsed.flags,
      income_to_rent_ratio: Number(ratio.toFixed(2)),
      income_verified: incomeVerified,
      identity_verified: identityVerified,
      documents_consistent: documentsConsistent,
      eviction_self_reported: evictionFlagged,
      credit_self_present: creditContext != null,
      credit_self_trusted: creditTrusted,
    }

    await admin.from('screening_orders').update({
      rentability_score: parsed.score,
      rentability_summary: parsed.summary,
      rentability_flags: parsed.flags,
      state: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', orderId)

    // Mirror the now-complete screening into the anonymized analytics layer.
    // Idempotent — merges with any earlier partial extraction.
    try {
      await admin.rpc('extract_application_analytics', { p_application_id: order.application_id })
    } catch {
      // Analytics extraction failures must never block scoring.
    }

    return json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'rentability-score', status_code: 500, error_message: msg })
    return json({ error: msg }, { status: 500 })
  }
})

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

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })

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
      .select('id, application_id, dl_extracted, dl_match_score, dl_flags, income_extracted, income_flags')
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
    }

    const sysPrompt = `You produce a private internal "rentability" assessment for a property manager evaluating a rental application. This is NOT an FCRA consumer report — it is a privately-shared signal scoped to this one leasing decision.

You MUST NOT consider, mention, or be influenced by any protected class — race, color, religion, national origin, sex, gender identity, sexual orientation, marital status, familial status, disability, age, military/veteran status, or source-of-income protections (housing vouchers, alimony, child support, public assistance). You analyze only:
  1. income-to-rent ratio (target: 3x rent or higher; 2.5–3x adequate; under 2.5x marginal)
  2. employment/income document authenticity and consistency
  3. identity verification — does the DL match the application, did selfie pass
  4. self-reported history — current landlord, reason for leaving, evictions, background

Return ONLY a single JSON object: {"score": <int 0-100>, "summary": "<2-3 sentences>", "flags": {"income_to_rent_ratio": <number>, "income_verified": <bool>, "identity_verified": <bool>, "documents_consistent": <bool>, "eviction_self_reported": <bool>, "rationale_bullets": [<string>, ...]}}

Score ranges:
  90–100: strong income (3x+), all docs verified, clean self-reported history
  70–89:  adequate income (2.5–3x), docs verified, minor concerns
  50–69:  marginal income (2–2.5x) OR documents partially verified
  30–49:  weak income (under 2x) OR significant verification gaps
  0–29:   failed verification (tamper detected, identity mismatch, etc.)`

    const scoreResp = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1000,
      system: sysPrompt,
      messages: [{
        role: 'user',
        content: `Applicant data:\n${JSON.stringify(scoringContext, null, 2)}\n\nProduce the rentability JSON.`,
      }],
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
    parsed.flags = {
      ...parsed.flags,
      income_to_rent_ratio: Number(ratio.toFixed(2)),
      income_verified: incomeVerified,
      identity_verified: identityVerified,
      documents_consistent: documentsConsistent,
      eviction_self_reported: evictionFlagged,
    }

    await admin.from('screening_orders').update({
      rentability_score: parsed.score,
      rentability_summary: parsed.summary,
      rentability_flags: parsed.flags,
      state: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', orderId)

    return json(parsed)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})

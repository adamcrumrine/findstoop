// Applicant kicks off a screening order — pre-qual or full report.
//
// Returns a Stripe PaymentIntent client secret. After the applicant confirms
// payment, the stripe-webhook handler marks the order paid and unlocks the
// document-upload step. Pricing: Tenability™ $15, Tenability™ Pro $35, by the
// property's state — capped or unavailable where state law limits application
// fees (_shared/screeningPricing.ts).
//
// One row per (application, tier) — UNIQUE constraint handles the retry case
// (applicant abandoned mid-payment and starts again).

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, stripeFee, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'
import { tokensMatch } from '../_shared/screeningAuth.ts'
import { screeningPricesFor } from '../_shared/screeningPricing.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

// À la carte screening pricing — manager picks per property which checks
// to require; applicant pays the sum in one Stripe charge. Margins below
// are pre-Stripe (Stripe fee is deducted at the charge level, not the
// component level).
// Tenability™ and Pro prices come from the property's state
// (_shared/screeningPricing.ts): $15 / $35, capped or unavailable where state
// law limits application fees. Pro = the base + the credit_self line.
// COGS per line, for the margin column: base ~$0.13, credit-self ~$0.30.
const BASE_COGS_CENTS = 13
const CREDIT_SELF_COGS_CENTS = 30

const ADDON_PRICING = {
  selfie_match:           { amount_cents:  200, margin_cents:  170 },  // +$2  / +$1.70 (-$0.30 extra Claude call)
  credit_check:           { amount_cents: 1500, margin_cents:  800 },  // +$15 / +$8 (-$7 Array)        — Coming Soon
  criminal_check:         { amount_cents: 2500, margin_cents: 1500 },  // +$25 / +$15 (-$10 Vergent.ai) — Coming Soon
  eviction_check:         { amount_cents: 1000, margin_cents:  300 },  // +$10 / +$3 (-$7 LexisNexis)   — Coming Soon
} as const

type AddonKey = keyof typeof ADDON_PRICING | 'credit_self_disclosed'

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)

  // Rate limit: 10 requests / minute / IP. Stops budget-burning abuse.
  const ip = clientIp(req)
  const allowed = await checkRateLimit({
    key: `start-screening:${ip}`,
    windowSeconds: 60,
    maxCount: 10,
  })
  if (!allowed) {
    return json(req, { error: 'Too many requests — slow down and try again in a minute.' }, { status: 429 })
  }

  try {
    const { applicationId, statusToken, addons } = await req.json() as {
      applicationId?: string
      statusToken?: string
      addons?: Partial<Record<AddonKey, boolean>>
    }
    if (!applicationId) {
      return json(req, { error: 'applicationId required' }, { status: 400 })
    }
    if (!statusToken) {
      return json(req, { error: 'statusToken required' }, { status: 401 })
    }
    // v1: pre-qual + selfie ID match are live (both run on our own Claude
    // vision pipeline). Credit / criminal / eviction remain "Coming Soon"
    // until vendor onboarding completes.
    if (addons?.credit_check || addons?.criminal_check || addons?.eviction_check) {
      return json(req, { error: 'Credit, criminal, and eviction screening are coming soon — not yet available' }, { status: 400 })
    }
    // Selfie ID match is BUNDLED for free with the applicant-provided credit
    // tier — the AI authenticity check is materially stronger when it can
    // cross-reference the applicant's selfie against the DL photo, so we
    // include the $2 selfie at no extra cost. Force the flag on when the
    // credit-self tier is selected; zero out the $2 charge below.
    const wantsCreditSelf   = !!addons?.credit_self_disclosed
    const wantsSelfie       = !!addons?.selfie_match || wantsCreditSelf
    const selfieBundled     = wantsCreditSelf  // selfie included free with credit-self
    const wantsCriminal     = false
    const wantsCredit       = false
    const wantsEviction     = false

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: app, error: appErr } = await admin
      .from('applications')
      .select('id, email, first_name, last_name, applicant_profile_id, unit_id, status_token, ai_screening_consent_at')
      .eq('id', applicationId)
      .single()
    if (appErr || !app) return json(req, { error: 'Application not found' }, { status: 404 })

    // SECURITY: the flow is anonymous, so possession of the application's
    // status_token (returned to the browser that submitted the application)
    // is the ownership proof. Without this check, anyone holding a leaked
    // applicationId could retrieve the screening order's access_token — the
    // capability that unlocks all of the applicant's screening PII.
    if (!tokensMatch(statusToken, app.status_token)) {
      return json(req, { error: 'Forbidden' }, { status: 403 })
    }

    // Tapping Continue on the pre-qual intro is the applicant's AI-screening
    // consent (and FCRA §1681b(a)(3)(F) authorization where applicable).
    // Recorded here — server-side — because the anonymous client has no RLS
    // path to update the applications row itself.
    if (!app.ai_screening_consent_at) {
      await admin
        .from('applications')
        .update({ ai_screening_consent_at: new Date().toISOString() })
        .eq('id', applicationId)
        .is('ai_screening_consent_at', null)
    }

    // Price by the property's state — some states cap or ban application fees.
    const { data: unitRow } = await admin
      .from('units')
      .select('properties(state)')
      .eq('id', app.unit_id)
      .maybeSingle()
    const propertyState = (unitRow as { properties?: { state?: string | null } | null } | null)?.properties?.state ?? null
    const prices = screeningPricesFor(propertyState)
    if (!prices.available) {
      return json(req, { error: `Screening isn't offered for this property. ${prices.reason}` }, { status: 400 })
    }

    const zero = { amount_cents: 0, margin_cents: 0 }
    const base = { amount_cents: prices.standard * 100, margin_cents: prices.standard * 100 - BASE_COGS_CENTS }
    const proExtraCents = (prices.pro - prices.standard) * 100
    // When selfie is bundled with credit-self, charge $0 for the selfie line —
    // but its margin reduction (extra Claude call) is absorbed into the
    // credit-self margin.
    const selfie     = wantsSelfie && !selfieBundled ? ADDON_PRICING.selfie_match : zero
    const creditSelf = wantsCreditSelf
      ? { amount_cents: proExtraCents, margin_cents: proExtraCents - CREDIT_SELF_COGS_CENTS }
      : zero
    const credit     = wantsCredit     ? ADDON_PRICING.credit_check          : zero
    const criminal   = wantsCriminal   ? ADDON_PRICING.criminal_check        : zero
    const eviction   = wantsEviction   ? ADDON_PRICING.eviction_check        : zero

    const amount_cents = base.amount_cents + selfie.amount_cents + creditSelf.amount_cents + credit.amount_cents + criminal.amount_cents + eviction.amount_cents
    const margin_cents = base.margin_cents + selfie.margin_cents + creditSelf.margin_cents + credit.margin_cents + criminal.margin_cents + eviction.margin_cents
    const fee_cents = amount_cents - margin_cents

    // Tier value stays in the schema for now but always 'prequal' in à la
    // carte mode — the add-on flags carry the actual configuration.
    const tier = 'prequal' as const

    // Reuse an existing awaiting-payment order rather than creating a duplicate.
    const { data: existing } = await admin
      .from('screening_orders')
      .select('id, stripe_payment_intent_id, state, payment_status, access_token')
      .eq('application_id', applicationId)
      .eq('tier', tier)
      .maybeSingle()

    let orderId = existing?.id
    let accessToken: string | null = existing?.access_token ?? null
    let pi: Stripe.PaymentIntent | null = null

    const addonLabels: string[] = []
    if (wantsCredit)     addonLabels.push('credit')
    if (wantsCreditSelf) addonLabels.push('self-credit')
    if (wantsCriminal)   addonLabels.push('criminal')
    if (wantsEviction)   addonLabels.push('eviction')
    if (wantsSelfie)     addonLabels.push('selfie')
    const description = `FindStoop screening — ${app.first_name} ${app.last_name}` +
      (addonLabels.length ? ` (pre-qual + ${addonLabels.join(' + ')})` : ' (pre-qual)')

    if (existing?.stripe_payment_intent_id && existing.payment_status === 'pending') {
      pi = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id)
    } else {
      const { result: created, latency_ms: piLatency } = await timed(() => stripe.paymentIntents.create({
        amount: amount_cents,
        currency: 'usd',
        payment_method_types: ['card'],
        description,
        receipt_email: app.email ?? undefined,
        metadata: {
          applicationId,
          tier,
          platform: 'findstoop',
          purpose: 'screening',
          addons: addonLabels.join(','),
        },
      }))
      pi = created
      // Record the Stripe fee as the platform cost on this charge so the
      // admin System page can true-up our net margin per applicant.
      await logApiCall({
        function_name: 'start-screening', vendor: 'stripe',
        latency_ms: piLatency, reference_id: pi.id,
        cost_cents: stripeFee(amount_cents),
        metadata: { amount_cents, intent: 'payment_intent.create' },
      })

      const addonFields = {
        addon_selfie_match:          wantsSelfie,
        addon_credit_self_disclosed: wantsCreditSelf,
        addon_credit_check:          wantsCredit,
        addon_criminal_check:        wantsCriminal,
        addon_eviction_check:        wantsEviction,
      }

      if (existing) {
        await admin.from('screening_orders').update({
          stripe_payment_intent_id: pi.id,
          amount_cents,
          fee_cents,
          margin_cents,
          ...addonFields,
        }).eq('id', existing.id)
      } else {
        const { data: inserted, error: insErr } = await admin.from('screening_orders').insert({
          application_id: applicationId,
          applicant_id: app.applicant_profile_id,
          tier,
          state: 'awaiting_payment',
          payment_status: 'pending',
          stripe_payment_intent_id: pi.id,
          amount_cents,
          fee_cents,
          margin_cents,
          ...addonFields,
        }).select('id, access_token').single()
        if (insErr) throw new Error(insErr.message)
        orderId = inserted.id
        accessToken = inserted.access_token
      }
    }

    return json(req, {
      orderId,
      accessToken,
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      amount_cents,
      addons: {
        selfie_match:          wantsSelfie,
        credit_self_disclosed: wantsCreditSelf,
        credit_check:          wantsCredit,
        criminal_check:        wantsCriminal,
        eviction_check:        wantsEviction,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'start-screening', status_code: 500, error_message: msg })
    return json(req, { error: msg }, { status: 400 })
  }
})

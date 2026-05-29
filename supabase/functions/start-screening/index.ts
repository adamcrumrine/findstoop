// Applicant kicks off a screening order — pre-qual or full report.
//
// Returns a Stripe PaymentIntent client secret. After the applicant confirms
// payment, the stripe-webhook handler marks the order paid and unlocks the
// document-upload step. Pricing for Central Ohio:
//   • prequal: $15 ($10 margin after ~$5 of doc storage + AI inference costs)
//   • full:    $45 upgrade, +$60 cumulative — paid only after the manager
//              requests it AND the applicant authorizes the FCRA pull
//
// One row per (application, tier) — UNIQUE constraint handles the retry case
// (applicant abandoned mid-payment and starts again).

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, stripeFee, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

// À la carte screening pricing — manager picks per property which checks
// to require; applicant pays the sum in one Stripe charge. Margins below
// are pre-Stripe (Stripe fee is deducted at the charge level, not the
// component level).
const BASE_PRICING = {
  prequal: { amount_cents: 500, margin_cents: 487 },  // $5  / ~$4.87 margin (-$0.13 COGS)
} as const

const ADDON_PRICING = {
  selfie_match:           { amount_cents:  200, margin_cents:  170 },  // +$2  / +$1.70 (-$0.30 extra Claude call)
  credit_self_disclosed:  { amount_cents: 2000, margin_cents: 1970 },  // +$20 / +$19.70 (-$0.07 Haiku+Sonnet, -$0.23 Stripe portion)
  credit_check:           { amount_cents: 1500, margin_cents:  800 },  // +$15 / +$8 (-$7 Array)        — Coming Soon
  criminal_check:         { amount_cents: 2500, margin_cents: 1500 },  // +$25 / +$15 (-$10 Vergent.ai) — Coming Soon
  eviction_check:         { amount_cents: 1000, margin_cents:  300 },  // +$10 / +$3 (-$7 LexisNexis)   — Coming Soon
} as const

type AddonKey = keyof typeof ADDON_PRICING

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
    const { applicationId, addons } = await req.json() as {
      applicationId?: string
      addons?: Partial<Record<AddonKey, boolean>>
    }
    if (!applicationId) {
      return json(req, { error: 'applicationId required' }, { status: 400 })
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
      .select('id, email, first_name, last_name, applicant_profile_id, unit_id')
      .eq('id', applicationId)
      .single()
    if (appErr || !app) return json(req, { error: 'Application not found' }, { status: 404 })

    const zero = { amount_cents: 0, margin_cents: 0 }
    const base = BASE_PRICING.prequal
    // When selfie is bundled with credit-self, charge $0 for the selfie line —
    // but its margin reduction (extra Claude call) is absorbed into the
    // credit-self margin since the credit-self tier nets ~$19.70 anyway.
    const selfie     = wantsSelfie && !selfieBundled ? ADDON_PRICING.selfie_match          : zero
    const creditSelf = wantsCreditSelf               ? ADDON_PRICING.credit_self_disclosed : zero
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

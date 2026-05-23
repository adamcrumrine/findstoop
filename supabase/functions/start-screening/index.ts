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
  selfie_match:   { amount_cents:  200, margin_cents:  170 },  // +$2  / +$1.70 (-$0.30 extra Claude call)
  credit_check:   { amount_cents: 1500, margin_cents:  800 },  // +$15 / +$8 (-$7 Array)
  criminal_check: { amount_cents: 2500, margin_cents: 1500 },  // +$25 / +$15 (-$10 Vergent.ai)
  eviction_check: { amount_cents: 1000, margin_cents:  300 },  // +$10 / +$3 (-$7 LexisNexis)
} as const

type AddonKey = keyof typeof ADDON_PRICING

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { applicationId, addons } = await req.json() as {
      applicationId?: string
      addons?: Partial<Record<AddonKey, boolean>>
    }
    if (!applicationId) {
      return json({ error: 'applicationId required' }, { status: 400 })
    }
    // v1: pre-qual + selfie ID match are live (both run on our own Claude
    // vision pipeline). Credit / criminal / eviction remain "Coming Soon"
    // until vendor onboarding completes.
    if (addons?.credit_check || addons?.criminal_check || addons?.eviction_check) {
      return json({ error: 'Credit, criminal, and eviction screening are coming soon — not yet available' }, { status: 400 })
    }
    const wantsSelfie   = !!addons?.selfie_match
    const wantsCriminal = false
    const wantsCredit   = false
    const wantsEviction = false

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: app, error: appErr } = await admin
      .from('applications')
      .select('id, email, first_name, last_name, applicant_profile_id, unit_id')
      .eq('id', applicationId)
      .single()
    if (appErr || !app) return json({ error: 'Application not found' }, { status: 404 })

    const zero = { amount_cents: 0, margin_cents: 0 }
    const base = BASE_PRICING.prequal
    const selfie   = wantsSelfie   ? ADDON_PRICING.selfie_match   : zero
    const credit   = wantsCredit   ? ADDON_PRICING.credit_check   : zero
    const criminal = wantsCriminal ? ADDON_PRICING.criminal_check : zero
    const eviction = wantsEviction ? ADDON_PRICING.eviction_check : zero

    const amount_cents = base.amount_cents + selfie.amount_cents + credit.amount_cents + criminal.amount_cents + eviction.amount_cents
    const margin_cents = base.margin_cents + selfie.margin_cents + credit.margin_cents + criminal.margin_cents + eviction.margin_cents
    const fee_cents = amount_cents - margin_cents

    // Tier value stays in the schema for now but always 'prequal' in à la
    // carte mode — the add-on flags carry the actual configuration.
    const tier = 'prequal' as const

    // Reuse an existing awaiting-payment order rather than creating a duplicate.
    const { data: existing } = await admin
      .from('screening_orders')
      .select('id, stripe_payment_intent_id, state, payment_status')
      .eq('application_id', applicationId)
      .eq('tier', tier)
      .maybeSingle()

    let orderId = existing?.id
    let pi: Stripe.PaymentIntent | null = null

    const addonLabels: string[] = []
    if (wantsCredit)   addonLabels.push('credit')
    if (wantsCriminal) addonLabels.push('criminal')
    if (wantsEviction) addonLabels.push('eviction')
    if (wantsSelfie)   addonLabels.push('selfie')
    const description = `FindStoop screening — ${app.first_name} ${app.last_name}` +
      (addonLabels.length ? ` (pre-qual + ${addonLabels.join(' + ')})` : ' (pre-qual)')

    if (existing?.stripe_payment_intent_id && existing.payment_status === 'pending') {
      pi = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id)
    } else {
      pi = await stripe.paymentIntents.create({
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
      })

      const addonFields = {
        addon_selfie_match:   wantsSelfie,
        addon_credit_check:   wantsCredit,
        addon_criminal_check: wantsCriminal,
        addon_eviction_check: wantsEviction,
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
        }).select('id').single()
        if (insErr) throw new Error(insErr.message)
        orderId = inserted.id
      }
    }

    return json({
      orderId,
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      amount_cents,
      addons: {
        selfie_match:   wantsSelfie,
        credit_check:   wantsCredit,
        criminal_check: wantsCriminal,
        eviction_check: wantsEviction,
      },
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 })
  }
})

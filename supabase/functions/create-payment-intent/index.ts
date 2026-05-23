// Creates a PaymentIntent for a tenant rent payment.
//
// Pricing rules (single-tier $9/unit/mo model):
//   • ACH (us_bank_account): tenant pays rent only. Stripe ACH fee is paid by
//     the landlord (when Connect is set up) or absorbed by the platform
//     (until Connect is set up).
//   • Card: 3.5% surcharge added to the rent amount, passed through to the
//     tenant. Covers Stripe's 2.9% + $0.30 with a 0.6% spread for overhead.
//
// Stripe Connect: if the landlord has an active Connect Express account
// (charges_enabled=true), the PaymentIntent uses transfer_data[destination]
// so funds flow direct to their bank. Otherwise the platform is the
// merchant of record for the rent payment.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

const CARD_SURCHARGE_PCT = 3.5

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { amount, leaseId, tenantId, paymentMethod } = await req.json() as {
      amount: number
      leaseId: string
      tenantId: string
      paymentMethod: 'card' | 'us_bank_account'
    }

    if (!amount || !leaseId || !tenantId || !paymentMethod) {
      return json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Look up the landlord's tier + Connect status from the lease.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: ctxRows } = await admin.rpc('lease_payout_context', { lease_uuid: leaseId })
    const ctx = Array.isArray(ctxRows) ? ctxRows[0] : ctxRows
    const connectAccountId: string | null = ctx?.connect_account_id ?? null
    const connectReady: boolean = !!ctx?.charges_enabled

    // Calculate the actual charge based on method
    const rentCents = Math.round(amount * 100)
    let surchargeCents = 0
    let totalCents = rentCents
    if (paymentMethod === 'card') {
      surchargeCents = Math.round(amount * CARD_SURCHARGE_PCT)
      totalCents = rentCents + surchargeCents
    }

    // Build PaymentIntent params. If the landlord has Connect set up, use
    // destination charges so rent goes direct to their bank (and Stripe
    // fees are borne by the landlord, not the platform).
    interface PIParams {
      amount: number
      currency: string
      payment_method_types: string[]
      description: string
      metadata: Record<string, string>
      transfer_data?: { destination: string }
      on_behalf_of?: string
    }
    const params: PIParams = {
      amount: totalCents,
      currency: 'usd',
      payment_method_types: [paymentMethod],
      description: paymentMethod === 'card'
        ? `Rent + 3.5% card processing fee`
        : `Rent payment via ACH`,
      metadata: {
        leaseId,
        tenantId,
        rentAmount: String(amount),
        surchargeAmount: String((surchargeCents / 100).toFixed(2)),
        paymentMethod,
        platform: 'findstoop',
        connectMode: connectReady && connectAccountId ? 'destination' : 'platform',
      },
    }
    if (connectReady && connectAccountId) {
      params.transfer_data = { destination: connectAccountId }
      params.on_behalf_of = connectAccountId
    }

    const paymentIntent = await stripe.paymentIntents.create(params)

    return json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      breakdown: {
        rentCents,
        surchargeCents,
        totalCents,
        rent: amount,
        surcharge: surchargeCents / 100,
        total: totalCents / 100,
        paymentMethod,
        surchargePct: paymentMethod === 'card' ? CARD_SURCHARGE_PCT : 0,
      },
      destinationMode: connectReady && connectAccountId ? 'connect' : 'platform',
    })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    )
  }
})

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
    // SECURITY: the caller must be authenticated, and the charge amount is
    // derived SERVER-SIDE from the pending payments row — never trusted from
    // the request body. (Previously `amount`/`leaseId`/`tenantId` were taken
    // from the client, so a tenant could pay $1 and have full rent recorded.)
    const { paymentId, paymentMethod } = await req.json() as {
      paymentId: string
      paymentMethod: 'card' | 'us_bank_account'
    }

    if (!paymentId || !paymentMethod) {
      return json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (paymentMethod !== 'card' && paymentMethod !== 'us_bank_account') {
      return json({ error: 'Invalid payment method' }, { status: 400 })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, { status: 401 })

    // Load the pending payment row and verify the caller owns it. The amount
    // and lease are taken from THIS row, not the request.
    const { data: payment, error: payErr } = await admin
      .from('payments')
      .select('id, lease_id, tenant_id, amount, status, type')
      .eq('id', paymentId)
      .single()
    if (payErr || !payment) return json({ error: 'Payment not found' }, { status: 404 })
    if (payment.tenant_id !== user.id) return json({ error: 'Forbidden' }, { status: 403 })
    if (payment.status === 'completed') return json({ error: 'Payment already completed' }, { status: 409 })

    const amount = Number(payment.amount)
    const leaseId = payment.lease_id
    const tenantId = payment.tenant_id
    const chargeLabel = payment.type === 'rent'
      ? 'Rent'
      : String(payment.type ?? 'Charge').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    if (!(amount > 0)) return json({ error: 'Invalid payment amount' }, { status: 400 })

    // Look up the landlord's tier + Connect status from the lease.
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
    // destination charges so rent goes direct to their bank. The 3.5% card
    // surcharge is retained by the platform via application_fee_amount —
    // without it the full amount (rent + surcharge) transfers to the landlord
    // and FindStoop absorbs the card fee, violating the surcharge policy.
    interface PIParams {
      amount: number
      currency: string
      payment_method_types: string[]
      description: string
      metadata: Record<string, string>
      transfer_data?: { destination: string }
      on_behalf_of?: string
      application_fee_amount?: number
    }
    const params: PIParams = {
      amount: totalCents,
      currency: 'usd',
      payment_method_types: [paymentMethod],
      // A lease can bill more than rent (recurring pet rent, one-off fees), so
      // name the actual charge — "Rent + fee" on a $5 pet charge reads as an
      // error on the tenant's statement.
      description: paymentMethod === 'card'
        ? `${chargeLabel} + 3.5% card processing fee`
        : `${chargeLabel} via ACH`,
      metadata: {
        // findstoop_payment_id lets the webhook flip THIS existing pending row
        // to completed (it matches on this first). The client no longer inserts
        // a payment row, which also removes the old duplicate-row bug.
        findstoop_payment_id: paymentId,
        findstoop_tenant_id: tenantId,
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
      // Landlord receives exactly the rent; the surcharge stays on the
      // platform balance (where the Stripe processing fee is debited from).
      if (surchargeCents > 0) params.application_fee_amount = surchargeCents
    }

    // Idempotency key keyed on the payment row + method: a double-clicked
    // "Pay" (or a retry) returns the SAME PaymentIntent instead of creating a
    // second charge for the same rent row.
    const paymentIntent = await stripe.paymentIntents.create(params, {
      idempotencyKey: `rent:${paymentId}:${paymentMethod}`,
    })

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

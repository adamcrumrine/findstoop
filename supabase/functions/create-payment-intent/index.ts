// Creates a PaymentIntent for a tenant rent payment.
//
// Pricing rules (single-tier $9/unit/mo model):
//   • Every Stripe processing cost is passed to the payer. The subscription is
//     the platform's margin; processing is a pass-through, and neither Stoop
//     nor the landlord absorbs a card or ACH fee.
//   • ACH (us_bank_account): 0.8% capped at $5 — Stripe's own rate and cap, no
//     spread. This is the rail we want tenants on, so it's priced at cost.
//   • Card: 3.5%, covering Stripe's 2.9% + $0.30 with a spread for the fixed
//     component and disputes.
//
// Rates are duplicated from packages/shared/src/lib/paymentFees.ts because
// Deno can't import the workspace package. paymentFees.test.ts pins the
// numbers on both sides so drift fails a test instead of mispricing a charge.
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
const ACH_SURCHARGE_PCT = 0.8
const ACH_SURCHARGE_CAP_CENTS = 500

/** Processing fee charged to the payer, in cents. Mirrors payerFeeCents(). */
function payerFeeCents(rail: string, baseCents: number): number {
  if (!(baseCents > 0)) return 0
  return rail === 'us_bank_account'
    // The cap is per TRANSACTION — this is why paying several charges together
    // is worth real money to a tenant, and why the pay screen says so.
    ? Math.min(Math.round(baseCents * (ACH_SURCHARGE_PCT / 100)), ACH_SURCHARGE_CAP_CENTS)
    : Math.round(baseCents * (CARD_SURCHARGE_PCT / 100))
}

/**
 * Build a bank-statement descriptor the tenant will actually recognise.
 *
 * Without one, Stripe falls back to the PLATFORM account's name — so rent
 * showed up as a company the tenant has no relationship with. That is the
 * usual trigger for ACH returns ($4) and card disputes ($15), and it is
 * alarming to see a stranger pulling rent from your account.
 *
 * Stripe rules: max 22 chars, at least one letter, and < > \ " ' are
 * forbidden. Uppercased because that's how banks render it anyway.
 */
function statementDescriptor(companyName?: string | null, managerName?: string | null): string {
  const raw = (companyName || managerName || 'Stoop Rent').trim()
  const cleaned = raw
    .replace(/[<>\\"']/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .slice(0, 22)
    .trim()
  // Must contain a letter; fall back rather than send something Stripe rejects.
  return /[A-Z]/.test(cleaned) ? cleaned : 'STOOP RENT'
}

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
    const descriptor = statementDescriptor(ctx?.company_name, ctx?.manager_name)

    // Calculate the actual charge based on method
    const rentCents = Math.round(amount * 100)
    const surchargeCents = payerFeeCents(paymentMethod, rentCents)
    const totalCents = rentCents + surchargeCents

    // Build PaymentIntent params. If the landlord has Connect set up, use
    // destination charges so rent goes direct to their bank. The processing
    // fee is retained by the platform via application_fee_amount — without it
    // the full amount (rent + fee) transfers to the landlord and the platform
    // absorbs Stripe's cut, which is exactly what the pass-through exists to
    // prevent. The landlord receives the rent figure and nothing else moves.
    interface PIParams {
      amount: number
      currency: string
      payment_method_types: string[]
      description: string
      metadata: Record<string, string>
      transfer_data?: { destination: string }
      on_behalf_of?: string
      application_fee_amount?: number
      statement_descriptor?: string
      statement_descriptor_suffix?: string
    }
    const params: PIParams = {
      amount: totalCents,
      currency: 'usd',
      payment_method_types: [paymentMethod],
      // A lease can bill more than rent (recurring pet rent, one-off fees), so
      // name the actual charge — "Rent + fee" on a $5 pet charge reads as an
      // error on the tenant's statement.
      description: paymentMethod === 'card'
        ? `${chargeLabel} + ${CARD_SURCHARGE_PCT}% card processing fee`
        : `${chargeLabel} + bank transfer processing fee`,
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
    // ACH takes a full descriptor; cards take a suffix appended to the
    // account-level prefix (which is set in the Stripe dashboard, so a
    // platform-branded prefix still shows on cards until Connect's
    // on_behalf_of makes the landlord the settlement merchant).
    if (paymentMethod === 'us_bank_account') {
      params.statement_descriptor = descriptor
    } else {
      params.statement_descriptor_suffix = descriptor.slice(0, 22)
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

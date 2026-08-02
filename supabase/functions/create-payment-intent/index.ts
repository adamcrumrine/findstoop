// Creates a PaymentIntent for a tenant rent payment.
//
// Pricing rules (single-tier $9/unit/mo model):
//   • Every Stripe processing cost is passed to the payer. The subscription is
//     the platform's margin; processing is a pass-through, and neither Stoop
//     nor the landlord absorbs a card or ACH fee.
//   • ACH (us_bank_account): 0.8% capped at $5 — Stripe's own rate and cap, no
//     spread. This is the rail we want tenants on, so it's priced at cost.
//   • Card: 3%, held at Visa's surcharge ceiling. Clears Stripe's 2.9% but
//     not the fixed 30c, so charges under $300 run at a small loss.
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

const CARD_SURCHARGE_PCT = 3.0
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
    // paymentIds (plural) settles several charges due the same period in ONE
    // transaction. Stripe's ACH fee is capped PER TRANSACTION, so a tenant
    // paying rent + pet fee + a utility bill-back separately can pay three
    // fees where one would do. `paymentId` stays supported for older clients.
    const body = await req.json() as {
      paymentId?: string
      paymentIds?: string[]
      paymentMethod: 'card' | 'us_bank_account'
    }
    const { paymentMethod } = body
    const requestedIds = Array.from(new Set(
      (body.paymentIds?.length ? body.paymentIds : [body.paymentId]).filter(Boolean) as string[],
    ))

    if (requestedIds.length === 0 || !paymentMethod) {
      return json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Bounded so a malformed client can't ask us to load the whole table.
    if (requestedIds.length > 20) {
      return json({ error: 'Too many charges in one payment' }, { status: 400 })
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

    // Load the pending rows and verify the caller owns every one. Amounts and
    // lease come from THESE rows, never from the request.
    const { data: rows, error: payErr } = await admin
      .from('payments')
      .select('id, lease_id, tenant_id, amount, status, type, due_date')
      .in('id', requestedIds)
    if (payErr) return json({ error: 'Payment lookup failed' }, { status: 500 })
    if (!rows || rows.length !== requestedIds.length) {
      return json({ error: 'Payment not found' }, { status: 404 })
    }
    // Every check the single-charge path made, applied to each row — one
    // foreign or already-paid id must sink the whole request rather than being
    // quietly dropped from a total the tenant already saw.
    for (const r of rows) {
      if (r.tenant_id !== user.id) return json({ error: 'Forbidden' }, { status: 403 })
      if (r.status === 'completed') return json({ error: 'Payment already completed' }, { status: 409 })
      if (!(Number(r.amount) > 0)) return json({ error: 'Invalid payment amount' }, { status: 400 })
    }
    // Grouping across leases would make the destination account ambiguous —
    // two landlords can't share one transfer.
    const leaseId = rows[0].lease_id
    if (rows.some((r) => r.lease_id !== leaseId)) {
      return json({ error: 'Charges from different leases must be paid separately' }, { status: 400 })
    }

    // Stable order so the description and the metadata id list agree.
    rows.sort((a, b) => String(a.due_date ?? '').localeCompare(String(b.due_date ?? '')) || a.id.localeCompare(b.id))
    const paymentIds = rows.map((r) => r.id)
    const primaryId = paymentIds[0]
    const tenantId = rows[0].tenant_id
    const amount = rows.reduce((sum, r) => sum + Number(r.amount), 0)

    const labelFor = (t: string | null) => t === 'rent'
      ? 'Rent'
      : String(t ?? 'Charge').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    const chargeLabel = rows.length === 1
      ? labelFor(rows[0].type)
      // "Rent + Pet fee + Utilities" — a tenant reading their statement should
      // recognise what the single line covers.
      : rows.map((r) => labelFor(r.type)).join(' + ')

    // Look up the landlord's tier + Connect status from the lease.
    const { data: ctxRows } = await admin.rpc('lease_payout_context', { lease_uuid: leaseId })
    const ctx = Array.isArray(ctxRows) ? ctxRows[0] : ctxRows
    const connectAccountId: string | null = ctx?.connect_account_id ?? null
    const connectReady: boolean = !!ctx?.charges_enabled
    const descriptor = statementDescriptor(ctx?.company_name, ctx?.manager_name)

    // Whether the landlord has chosen to absorb this tenant's processing fee.
    // Per-tenant, not per-lease: roommates on a shared house sign at different
    // times under different terms, and a landlord grandfathering one of them
    // shouldn't have to grandfather the whole unit.
    const { data: ltRow } = await admin
      .from('lease_tenants')
      .select('landlord_absorbs_fees')
      .eq('lease_id', leaseId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    // Legacy leases predate lease_tenants and have no row — pass through, the
    // long-standing default. Absorbing is always an explicit opt-in.
    const landlordAbsorbs = ltRow?.landlord_absorbs_fees === true

    // Calculate the actual charge based on method.
    //
    // Absorbing does not make the fee vanish — Stripe takes it either way. It
    // moves who it comes from: the tenant is charged rent alone, and the fee
    // is still held back as the application fee, so it lands on the landlord's
    // side of the transfer instead of on the tenant's card.
    const rentCents = Math.round(amount * 100)
    const feeCents = payerFeeCents(paymentMethod, rentCents)
    const surchargeCents = landlordAbsorbs ? 0 : feeCents
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
      description: landlordAbsorbs
        ? chargeLabel
        : paymentMethod === 'card'
          ? `${chargeLabel} + ${CARD_SURCHARGE_PCT}% card processing fee`
          : `${chargeLabel} + bank transfer processing fee`,
      metadata: {
        // findstoop_payment_id lets the webhook flip THIS existing pending row
        // to completed (it matches on this first). The client no longer inserts
        // a payment row, which also removes the old duplicate-row bug.
        // The webhook flips this row first and reads findstoop_payment_ids for
        // the rest. Keeping the singular key means a PaymentIntent created by
        // an older deploy still resolves after this ships.
        findstoop_payment_id: primaryId,
        findstoop_payment_ids: paymentIds.join(','),
        findstoop_tenant_id: tenantId,
        leaseId,
        tenantId,
        rentAmount: String(amount),
        surchargeAmount: String((surchargeCents / 100).toFixed(2)),
        // The fee still exists when it's absorbed — recording it separately so
        // the landlord can see what absorbing actually cost them.
        processingFeeAmount: String((feeCents / 100).toFixed(2)),
        feePaidBy: landlordAbsorbs ? 'landlord' : 'tenant',
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
      // feeCents, not surchargeCents. When the landlord absorbs, the tenant
      // was charged rent alone, so holding back the full fee here is exactly
      // what makes the landlord bear it: they receive rent minus the fee.
      // Using surchargeCents would zero the application fee and quietly move
      // the cost back onto the platform.
      if (feeCents > 0) params.application_fee_amount = feeCents
    }

    // Idempotency key keyed on the payment row + method: a double-clicked
    // "Pay" (or a retry) returns the SAME PaymentIntent instead of creating a
    // second charge for the same rent row.
    const paymentIntent = await stripe.paymentIntents.create(params, {
      // Keyed on the whole set: paying rent alone and then rent+pet together
      // are different requests and must not collide, while a double-clicked
      // "Pay" on the same selection still returns the same PaymentIntent.
      idempotencyKey: `rent:${paymentIds.join('_')}:${paymentMethod}`,
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

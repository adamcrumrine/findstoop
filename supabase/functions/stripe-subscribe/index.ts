// Starts (or manages) a landlord's $9/unit subscription.
// - Verifies caller via Supabase JWT.
// - Lazily creates a Stripe Customer the first time.
// - If the manager has an active subscription → returns a billing-portal URL.
// - Otherwise → creates a subscription with payment_behavior=default_incomplete
//   and returns the latest invoice's PaymentIntent client_secret so the
//   client can render its own (FindStoop-branded) PaymentElement.
//
// Payment method is chosen by the manager BEFORE checkout (body.payWith):
//   • 'ach'  → us_bank_account only, no surcharge.
//   • 'card' → card only (incl. Apple Pay & Google Pay), plus the card
//     surcharge: a pending invoice item is created before the subscription so
//     the FIRST invoice carries it, and the stripe-webhook invoice.created
//     handler adds it to every renewal invoice while the default PM is a card.
// Legacy clients that omit payWith get the old both-rails behavior with no
// first-invoice surcharge (renewals are still surcharged by the webhook).

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

// Must match stripe-webhook / create-payment-intent (and
// packages/shared/src/lib/paymentFees.ts). Both rails pass through.
const CARD_SURCHARGE_PCT = 3.0
const ACH_SURCHARGE_PCT = 0.8
const ACH_SURCHARGE_CAP_CENTS = 500
// Single-tier pricing: $9/unit/mo, $90/unit/yr. No free units, no tiers.
const PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_PREMIUM_MONTHLY') ?? ''
const PRICE_YEARLY  = Deno.env.get('STRIPE_PRICE_PREMIUM_YEARLY')  ?? ''
const FREE_UNITS    = parseInt(Deno.env.get('FINDSTOOP_FREE_UNITS') ?? '0', 10)
const APP_URL       = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

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
    // ── Body: optional plan + payment-rail choice ───────────────────────
    let plan: 'monthly' | 'annual' = 'monthly'
    let payWith: 'card' | 'ach' | null = null
    try {
      const body = await req.json().catch(() => ({}))
      if (body?.plan === 'annual') plan = 'annual'
      if (body?.payWith === 'card' || body?.payWith === 'ach') payWith = body.payWith
    } catch { /* no body — fine */ }
    const chosenPriceId = plan === 'annual' ? PRICE_YEARLY : PRICE_MONTHLY
    if (!chosenPriceId) return json({ error: `No price configured for plan=${plan}` }, { status: 500 })

    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (profileErr || !profile) return json({ error: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'manager' && profile.role !== 'admin') {
      return json({ error: 'Only landlords can subscribe' }, { status: 403 })
    }

    // Complimentary account — never touches Stripe.
    if (profile.subscription_complimentary === true) {
      return json({
        status: 'complimentary',
        message: 'Your account is on a complimentary plan — no billing required.',
      })
    }

    // ── Count paid units (active leases - free quota) ───────────────────
    const { data: paidUnitsRpc } = await admin.rpc('count_manager_paid_units', {
      manager_uuid: user.id,
      free_units: FREE_UNITS,
    })
    const paidUnits = Number(paidUnitsRpc ?? 0)

    // ── Ensure Stripe Customer ──────────────────────────────────────────
    let customerId: string | null = profile.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? user.email ?? undefined,
        name: profile.full_name ?? undefined,
        metadata: { findstoop_manager_id: user.id, platform: 'findstoop' },
      })
      customerId = customer.id
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    // ── Already have a subscription on file ─────────────────────────────
    // Three possibilities:
    //   • 'incomplete'         — the user started signup but never finished
    //                            confirming the PaymentIntent. Resume the
    //                            same PI so they don't end up with an
    //                            orphaned subscription per attempt.
    //   • 'incomplete_expired' — Stripe gave up after 23h. Stale row; drop
    //                            the stripe_subscription_id and fall through
    //                            to create a fresh subscription below.
    //   • anything else        — they have a real subscription, open manage.
    if (profile.stripe_subscription_id) {
      let existing: Stripe.Subscription | null = null
      try {
        existing = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
          expand: ['latest_invoice.payment_intent'],
        })
      } catch { /* maybe deleted on Stripe; fall through to recreate */ }

      if (existing && existing.status === 'incomplete') {
        const latestInvoice = existing.latest_invoice as Stripe.Invoice | null
        const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null
        // A resumed attempt must match the requested rail — an abandoned card
        // attempt carries the surcharge invoice item (and card-only PI), so it
        // can't be reused for an ACH retry and vice versa. Legacy clients
        // (payWith omitted) resume whatever exists.
        const existingTypes = existing.payment_settings?.payment_method_types ?? []
        const railMatches =
          payWith === null ||
          (payWith === 'card'
            ? existingTypes.length === 1 && existingTypes[0] === 'card'
            : existingTypes.length === 1 && existingTypes[0] === 'us_bank_account')
        // If the PaymentIntent can still be confirmed, hand its client_secret
        // back. Stripe rejects further confirms once it's succeeded/canceled.
        const usableStatuses = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'])
        if (railMatches && paymentIntent?.client_secret && usableStatuses.has(paymentIntent.status)) {
          const item = existing.items.data[0]
          const qty = item?.quantity ?? Math.max(1, paidUnits)
          const subtotalCents = (item?.price?.unit_amount ?? 0) * qty
          const totalCents = paymentIntent.amount
          return json({
            status: 'setup',
            clientSecret: paymentIntent.client_secret,
            subscriptionId: existing.id,
            paidUnits,
            quantity: qty,
            plan,
            appUrl: APP_URL,
            resumed: true,
            breakdown: {
              subtotalCents,
              surchargeCents: Math.max(0, totalCents - subtotalCents),
              totalCents,
            },
          })
        }
        // Wrong rail for this attempt, or the PI is in a dead state — cancel
        // the abandoned subscription (voids its invoice + PI) and clear the
        // local row so a fresh one is created below.
        try { await stripe.subscriptions.cancel(existing.id) } catch { /* noop */ }
        await admin.from('profiles').update({
          stripe_subscription_id: null,
          stripe_subscription_item_id: null,
          subscription_status: null,
        }).eq('id', user.id)
      } else if (existing && existing.status === 'incomplete_expired') {
        // Stale local row pointing at a Stripe-cancelled sub; clear it and
        // let the create path below run normally.
        await admin.from('profiles').update({
          stripe_subscription_id: null,
          stripe_subscription_item_id: null,
          subscription_status: null,
        }).eq('id', user.id)
      } else if (existing) {
        return json({
          status: 'manage',
          paidUnits,
          subscriptionStatus: existing.status,
        })
      }
    }

    // ── Create incomplete subscription; client confirms with Elements ───
    // Managers can subscribe proactively before their first lease activates.
    // Minimum quantity is 1 — once they activate additional units,
    // syncSubscriptionQuantity bumps it up.
    const quantity = Math.max(1, paidUnits)

    // Sweep any surcharge invoice item left over from an abandoned card
    // attempt — a stale pending item would otherwise piggyback onto this
    // subscription's first invoice (or double up with a fresh one).
    try {
      const pendingItems = await stripe.invoiceItems.list({ customer: customerId, pending: true, limit: 100 })
      for (const it of pendingItems.data) {
        if (it.metadata?.findstoop_surcharge === 'true') {
          try { await stripe.invoiceItems.del(it.id) } catch { /* noop */ }
        }
      }
    } catch { /* listing failed — worst case Stripe rejects nothing; continue */ }

    // Card rail: the surcharge goes on as a pending invoice item so the
    // FIRST invoice carries it (subscription creation pulls pending items in).
    // Renewal invoices are surcharged by the stripe-webhook invoice.created
    // handler, which re-checks the default PM each cycle.
    const price = await stripe.prices.retrieve(chosenPriceId)
    const subtotalCents = (price.unit_amount ?? 0) * quantity
    // Both rails are passed through — ACH was previously exempt, leaving the
    // platform to absorb Stripe's 0.8% on every bank-paid subscription.
    // 'legacy' (no rail declared) can't be priced without knowing which card
    // the customer will use, so it stays uncharged rather than guessing high.
    const isCard = payWith === 'card'
    const surchargeCents =
      isCard ? Math.round(subtotalCents * (CARD_SURCHARGE_PCT / 100))
      : payWith === 'ach' ? Math.min(Math.round(subtotalCents * (ACH_SURCHARGE_PCT / 100)), ACH_SURCHARGE_CAP_CENTS)
      : 0
    if (surchargeCents > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        currency: 'usd',
        amount: surchargeCents,
        description: isCard
          ? `${CARD_SURCHARGE_PCT}% card processing fee`
          : `${ACH_SURCHARGE_PCT}% bank transfer processing fee`,
        metadata: { findstoop_surcharge: 'true', platform: 'findstoop' },
      })
    }

    const paymentMethodTypes: ('card' | 'us_bank_account')[] =
      payWith === 'card' ? ['card'] :
      payWith === 'ach'  ? ['us_bank_account'] :
      ['card', 'us_bank_account'] // legacy client — old behavior
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: chosenPriceId, quantity }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: paymentMethodTypes,
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { findstoop_manager_id: user.id, platform: 'findstoop' },
    })

    // Mirror the subscription IDs locally right away so the webhook + UI
    // know there's an in-flight subscription. Status will be 'incomplete'
    // until the PaymentIntent is confirmed; the webhook flips it to 'active'.
    const subscriptionItemId = subscription.items.data[0]?.id ?? null
    await admin.from('profiles').update({
      stripe_subscription_id: subscription.id,
      stripe_subscription_item_id: subscriptionItemId,
      subscription_status: subscription.status,
      subscription_quantity: quantity,
    }).eq('id', user.id)

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null
    const clientSecret = paymentIntent?.client_secret ?? null
    if (!clientSecret) {
      return json({ error: 'Stripe did not return a client_secret for the new subscription' }, { status: 500 })
    }

    // Report the PI's actual amount as the total — it's what the manager will
    // be charged (subtotal + surcharge item pulled onto the first invoice).
    const totalCents = paymentIntent?.amount ?? subtotalCents + surchargeCents
    return json({
      status: 'setup',
      clientSecret,
      subscriptionId: subscription.id,
      paidUnits,
      quantity,
      plan,
      appUrl: APP_URL,
      breakdown: {
        subtotalCents,
        surchargeCents: Math.max(0, totalCents - subtotalCents),
        totalCents,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

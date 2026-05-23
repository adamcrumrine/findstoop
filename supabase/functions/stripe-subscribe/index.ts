// Starts (or manages) a landlord's $9/unit subscription.
// - Verifies caller via Supabase JWT.
// - Lazily creates a Stripe Customer the first time.
// - If the manager has an active subscription → returns a billing-portal URL.
// - Otherwise → creates a subscription with payment_behavior=default_incomplete
//   and returns the latest invoice's PaymentIntent client_secret so the
//   client can render its own (FindStoop-branded) PaymentElement.
//
// Payment methods enabled: card (incl. Apple Pay & Google Pay) + us_bank_account (ACH).

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})
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
    // ── Body: optional plan choice (defaults to monthly) ────────────────
    let plan: 'monthly' | 'annual' = 'monthly'
    try {
      const body = await req.json().catch(() => ({}))
      if (body?.plan === 'annual') plan = 'annual'
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
        // If the PaymentIntent can still be confirmed, hand its client_secret
        // back. Stripe rejects further confirms once it's succeeded/canceled.
        const usableStatuses = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'])
        if (paymentIntent?.client_secret && usableStatuses.has(paymentIntent.status)) {
          const item = existing.items.data[0]
          return json({
            status: 'setup',
            clientSecret: paymentIntent.client_secret,
            subscriptionId: existing.id,
            paidUnits,
            quantity: item?.quantity ?? Math.max(1, paidUnits),
            plan,
            appUrl: APP_URL,
            resumed: true,
          })
        }
        // PI is in a dead state but sub is still incomplete — clean up so we
        // can issue a fresh one below.
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
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: chosenPriceId, quantity }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card', 'us_bank_account'],
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

    return json({
      status: 'setup',
      clientSecret,
      subscriptionId: subscription.id,
      paidUnits,
      quantity,
      plan,
      appUrl: APP_URL,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

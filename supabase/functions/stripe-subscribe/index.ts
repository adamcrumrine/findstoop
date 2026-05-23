// Starts (or manages) a landlord's $3/unit subscription.
// - Verifies caller via Supabase JWT.
// - Lazily creates a Stripe Customer the first time.
// - If the manager has an active subscription → returns a billing-portal URL.
// - Otherwise → returns a Stripe Checkout URL (subscription mode) to collect a
//   payment method and start billing the current paid-unit count.
//
// Payment methods enabled: card (incl. Apple Pay & Google Pay) + us_bank_account (ACH).

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})
const PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_GROWTH_MONTHLY') ?? ''
const PRICE_YEARLY  = Deno.env.get('STRIPE_PRICE_GROWTH_YEARLY')  ?? ''
const FREE_UNITS    = parseInt(Deno.env.get('FINDSTOOP_FREE_UNITS') ?? '2', 10)
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

    // ── Already subscribed → send to billing portal ─────────────────────
    if (profile.stripe_subscription_id) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_URL}/manager/billing`,
      })
      return json({
        status: 'manage',
        portalUrl: portal.url,
        paidUnits,
        subscriptionStatus: profile.subscription_status ?? null,
      })
    }

    // ── Still in free tier → no payment method needed yet ───────────────
    if (paidUnits <= 0) {
      return json({
        status: 'no_payment_needed',
        paidUnits: 0,
        message: `Your first ${FREE_UNITS} active units are free. You'll be prompted to add a payment method when you exceed that.`,
      })
    }

    // ── Create Checkout Session for new subscription ────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      line_items: [{ price: chosenPriceId, quantity: paidUnits }],
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${APP_URL}/manager/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/manager/billing?canceled=1`,
      metadata: { findstoop_manager_id: user.id, platform: 'findstoop' },
      subscription_data: {
        metadata: { findstoop_manager_id: user.id, platform: 'findstoop' },
      },
    })

    return json({ status: 'checkout', checkoutUrl: session.url, paidUnits })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

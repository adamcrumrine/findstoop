// Returns a SetupIntent client_secret so the tenant can attach (or replace)
// their saved payment method from the Settings page without going through a
// rent charge. The actual save happens client-side via stripe.confirmSetup;
// the webhook attaches it as the customer's default and mirrors the PM id
// onto profiles.stripe_default_payment_method_id.
//
// Tenants only — managers manage their own payment methods via stripe-manage.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name, role, stripe_customer_id')
      .eq('id', user.id)
      .single()
    if (!profile) return json({ error: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'tenant') {
      return json({ error: 'This endpoint is for tenants' }, { status: 403 })
    }

    // Ensure a Stripe Customer exists on the tenant profile.
    let customerId = profile.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? user.email ?? undefined,
        name: profile.full_name ?? undefined,
        metadata: { findstoop_tenant_id: user.id, platform: 'findstoop' },
      })
      customerId = customer.id
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      usage: 'off_session',
      metadata: { findstoop_tenant_id: user.id, platform: 'findstoop' },
    })

    return json({ clientSecret: setupIntent.client_secret, setupIntentId: setupIntent.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

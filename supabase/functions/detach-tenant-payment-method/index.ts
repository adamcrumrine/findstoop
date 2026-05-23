// Detaches the tenant's saved Stripe payment method, clears the local
// pointers (stripe_default_payment_method_id + payment_method_setup_at),
// and force-disables autopay since it can't run without a method on file.
//
// Idempotent: if there's nothing to detach we still clear the local row and
// return ok=true, so the UI can use this as a generic "Remove method" action.

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
      .select('id, role, stripe_customer_id, stripe_default_payment_method_id')
      .eq('id', user.id)
      .single()
    if (!profile) return json({ error: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'tenant') {
      return json({ error: 'This endpoint is for tenants' }, { status: 403 })
    }

    // Detach the method from Stripe (best-effort — already-detached is fine).
    if (profile.stripe_default_payment_method_id) {
      try {
        await stripe.paymentMethods.detach(profile.stripe_default_payment_method_id)
      } catch { /* already detached or invalid — ignore */ }
    }
    // Clear default on the Stripe customer too so nothing reuses it.
    if (profile.stripe_customer_id) {
      try {
        await stripe.customers.update(profile.stripe_customer_id, {
          invoice_settings: { default_payment_method: '' },
        })
      } catch { /* non-fatal */ }
    }

    // Mirror locally + force autopay off (no method = no autopay).
    await admin.from('profiles').update({
      stripe_default_payment_method_id: null,
      payment_method_setup_at: null,
      autopay_enabled: false,
      stripe_default_pm_type: null,
      stripe_default_pm_brand: null,
      stripe_default_pm_last4: null,
      stripe_default_pm_bank_name: null,
    }).eq('id', user.id)

    return json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

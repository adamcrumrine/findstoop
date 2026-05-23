// Recomputes a landlord's paid-unit count and reconciles it against the
// Stripe subscription quantity. Idempotent — safe to call any time.
//
// Returns one of:
//   { status: 'no_payment_needed', paidUnits: 0 }              // still in free tier
//   { status: 'subscribe_required', paidUnits: N }             // owes money, no subscription yet
//   { status: 'updated', paidUnits: N, previousQuantity: M }   // synced upward/downward
//   { status: 'will_cancel', paidUnits: 0 }                    // dropped to free tier; sub cancels at period end
//   { status: 'unchanged', paidUnits: N }                      // quantity already matches

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})
const FREE_UNITS = parseInt(Deno.env.get('FINDSTOOP_FREE_UNITS') ?? '0', 10)

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
      .select('*')
      .eq('id', user.id)
      .single()
    if (!profile) return json({ error: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'manager' && profile.role !== 'admin') {
      return json({ error: 'Only landlords have a subscription' }, { status: 403 })
    }

    const { data: paidUnitsRpc } = await admin.rpc('count_manager_paid_units', {
      manager_uuid: user.id,
      free_units: FREE_UNITS,
    })
    const newQty = Number(paidUnitsRpc ?? 0)
    const previousQty = profile.subscription_quantity ?? 0

    // No subscription yet — tell the client whether one is required.
    if (!profile.stripe_subscription_item_id) {
      return json({
        status: newQty > 0 ? 'subscribe_required' : 'no_payment_needed',
        paidUnits: newQty,
      })
    }

    // Dropped back to or below free tier — cancel at period end.
    if (newQty === 0) {
      await stripe.subscriptions.update(profile.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
      return json({ status: 'will_cancel', paidUnits: 0, previousQuantity: previousQty })
    }

    // Already in sync.
    if (newQty === previousQty) {
      return json({ status: 'unchanged', paidUnits: newQty })
    }

    // Update Stripe with prorated billing.
    await stripe.subscriptionItems.update(profile.stripe_subscription_item_id, {
      quantity: newQty,
      proration_behavior: 'create_prorations',
    })

    // Eager local mirror; webhook also writes this, but UI feels snappier.
    await admin.from('profiles').update({ subscription_quantity: newQty }).eq('id', user.id)

    return json({ status: 'updated', paidUnits: newQty, previousQuantity: previousQty })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

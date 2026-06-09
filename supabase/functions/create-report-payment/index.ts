// Creates a one-time PaymentIntent for a Basic ($4.99) Rental Analysis Report,
// returning a client_secret the front-end confirms with Stripe Elements (same
// flow as the subscription PaymentElement). On success the client calls
// rent-estimate with the paymentIntentId, which verifies the charge server-side
// before generating.
//
// Complimentary accounts (hawk.pig.llc, reports_complimentary, admins) never
// touch Stripe — this returns { free: true } and the client skips payment.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' })
const REPORT_PRICE_CENTS = parseInt(Deno.env.get('REPORT_PRICE_CENTS') ?? '549', 10)
const COMP_DOMAINS = ['hawk.pig.llc']

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

  if (!(await checkRateLimit({ key: `report-payment:${user.id}`, windowSeconds: 60, maxCount: 20 }))) {
    return json(req, { ok: false, message: 'Rate limit — try again in a minute' }, { status: 429 })
  }

  const { data: profile } = await admin.from('profiles')
    .select('stripe_customer_id, email, full_name, reports_complimentary, role')
    .eq('id', user.id).single()

  // Complimentary → no charge.
  const emailDomain = (user.email ?? '').split('@')[1]?.toLowerCase() ?? ''
  const comped = COMP_DOMAINS.includes(emailDomain) || profile?.reports_complimentary === true || profile?.role === 'admin'
  if (comped) return json(req, { ok: true, free: true })

  try {
    // Ensure a Stripe customer (reuse the subscription one if present).
    let customerId: string | null = profile?.stripe_customer_id ?? null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { findstoop_manager_id: user.id, platform: 'findstoop' },
      })
      customerId = customer.id
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const pi = await stripe.paymentIntents.create({
      amount: REPORT_PRICE_CENTS,
      currency: 'usd',
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      description: 'FindStoop Rental Analysis Report',
      metadata: { kind: 'rental_analysis', findstoop_manager_id: user.id, tier: 'basic' },
    })

    return json(req, { ok: true, free: false, clientSecret: pi.client_secret, paymentIntentId: pi.id })
  } catch (err) {
    return json(req, { ok: false, message: err instanceof Error ? err.message : 'Stripe error' }, { status: 400 })
  }
})

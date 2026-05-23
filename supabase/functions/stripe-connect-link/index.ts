// Landlord onboarding for Stripe Connect (Express).
//
// On first call, creates a Connect Express account for the landlord and
// stores the id on their profile. Then generates a fresh AccountLink onboarding
// URL each time the function is called — the link expires after a short
// window so we mint a new one for every "Connect your bank" click.
//
// When the landlord completes KYC, Stripe redirects them back to APP_URL
// + a status route. The `account.updated` webhook flips
// stripe_connect_charges_enabled / payouts_enabled.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

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
      .select('id, email, full_name, role, stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('id', user.id)
      .single()
    if (!profile) return json({ error: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'manager' && profile.role !== 'admin') {
      return json({ error: 'Only landlords can connect a Stripe account' }, { status: 403 })
    }

    // Ensure a Connect Express account exists for this landlord.
    let accountId: string | null = profile.stripe_connect_account_id
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: profile.email ?? user.email ?? undefined,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        metadata: {
          findstoop_manager_id: user.id,
          platform: 'findstoop',
        },
      })
      accountId = account.id
      await admin
        .from('profiles')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', user.id)
    }

    // Fresh onboarding link.
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/manager/settings?connect=refresh`,
      return_url: `${APP_URL}/manager/settings?connect=done`,
      type: 'account_onboarding',
    })

    return json({
      onboardingUrl: accountLink.url,
      accountId,
      chargesEnabled: profile.stripe_connect_charges_enabled === true,
    })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 },
    )
  }
})

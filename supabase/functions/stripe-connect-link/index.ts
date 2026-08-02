// Landlord onboarding for Stripe Connect (Express).
//
// On first call, creates a Connect Express account for the landlord and
// stores the id on their profile. Then generates a fresh AccountLink onboarding
// URL each time the function is called — the link expires after a short
// window so we mint a new one for every "Connect your bank" click.
//
// When the landlord completes KYC, Stripe redirects them back to APP_URL
// + a status route.
//
// The flags on the profile are the ONLY thing create-payment-intent consults
// when deciding whether to route a charge to the landlord's account, so they
// have to be right. The `account.updated` webhook was the sole way they got
// set — and it never fired, because connected-account events are only
// delivered to a webhook endpoint registered with connect=true, which ours
// isn't. Hawk's account went fully live at Stripe (charges, payouts, verified
// bank) while the database still read false, so every rent payment kept
// settling into the platform balance.
//
// So this function now syncs from Stripe on every call, and callers can ask
// for a sync without minting a link (`statusOnly`). The webhook stays as the
// fast path; this is the one that can't silently not happen.

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
      .select('id, email, full_name, company_name, role, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_onboarded_at')
      .eq('id', user.id)
      .single()
    if (!profile) return json({ error: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'manager' && profile.role !== 'admin') {
      return json({ error: 'Only landlords can connect a Stripe account' }, { status: 403 })
    }

    // `statusOnly` callers just want the current state refreshed — they must
    // never create an account as a side effect, or merely opening Settings
    // would mint an Express account for a landlord who never asked for one.
    let statusOnly = false
    try {
      const body = await req.json()
      statusOnly = body?.statusOnly === true
    } catch { /* no body — treat as a normal link request */ }

    // Ensure a Connect Express account exists for this landlord.
    let accountId: string | null = profile.stripe_connect_account_id
    if (!accountId && statusOnly) {
      return json({ connected: false, chargesEnabled: false, payoutsEnabled: false })
    }
    if (!accountId) {
      // Landlords holding property in an LLC are common, and this was
      // hardcoded to 'individual' — which starts KYC down the wrong path and
      // asks for an SSN where an EIN belongs. Infer from whether they've told
      // us a company name; Stripe still lets them correct it in onboarding.
      const isCompany = !!(profile.company_name && profile.company_name.trim())
      const account = await stripe.accounts.create({
        type: 'express',
        email: profile.email ?? user.email ?? undefined,
        business_type: isCompany ? 'company' : 'individual',
        ...(isCompany
          ? { company: { name: profile.company_name!.trim() } }
          : {}),
        business_profile: {
          // Shows on the tenant's statement once this account is the
          // settlement merchant, and pre-fills the onboarding form.
          name: (profile.company_name || profile.full_name || undefined) ?? undefined,
          product_description: 'Residential rent collection',
        },
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

    // Pull live state from Stripe and write it through. Stripe is the source of
    // truth here; the columns are a cache that had gone stale by three hours
    // and a fully-verified bank account.
    let chargesEnabled = profile.stripe_connect_charges_enabled === true
    let payoutsEnabled = false
    try {
      const acct = await stripe.accounts.retrieve(accountId)
      chargesEnabled = acct.charges_enabled === true
      payoutsEnabled = acct.payouts_enabled === true
      // Flags track Stripe in both directions — an account can be disabled
      // later, not just enabled. onboarded_at is stamped the first time both
      // go true and preserved after that; it's the "Connected {date}" line.
      const onboardedAt = profile.stripe_connect_onboarded_at
        ?? ((chargesEnabled && payoutsEnabled) ? new Date().toISOString() : null)
      await admin
        .from('profiles')
        .update({
          stripe_connect_charges_enabled: chargesEnabled,
          stripe_connect_payouts_enabled: payoutsEnabled,
          stripe_connect_onboarded_at: onboardedAt,
        })
        .eq('id', user.id)
    } catch (syncErr) {
      // A sync failure must not block onboarding — the landlord still needs
      // their link. Log and carry on with whatever the profile last knew.
      console.error('connect status sync failed', syncErr)
    }

    if (statusOnly) {
      return json({ connected: true, accountId, chargesEnabled, payoutsEnabled })
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

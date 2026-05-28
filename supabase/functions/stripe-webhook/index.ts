// Stripe webhook receiver.
// Processes subscription lifecycle events for landlord billing,
// updates the corresponding profile row, and logs every event for audit.
//
// IMPORTANT: this function must be deployed with `--no-verify-jwt` so
// Stripe (not a Supabase-authed user) can call it.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall } from '../_shared/logging.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

interface UpdateFields {
  stripe_subscription_id?: string | null
  stripe_subscription_item_id?: string | null
  subscription_status?: string | null
  subscription_quantity?: number
  subscription_current_period_end?: string | null
  subscription_interval?: string | null
}

async function applySubscriptionToProfile(sub: Stripe.Subscription) {
  const item = sub.items.data[0]
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const fields: UpdateFields = {
    stripe_subscription_id: sub.id,
    stripe_subscription_item_id: item?.id ?? null,
    subscription_status: sub.status,
    subscription_quantity: item?.quantity ?? 0,
    subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    subscription_interval: item?.price?.recurring?.interval ?? null,
  }
  await admin.from('profiles').update(fields).eq('stripe_customer_id', customerId)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature'
    return new Response(`Webhook error: ${msg}`, { status: 400 })
  }

  // ── Idempotency: bail if we've already processed this event ──────────
  const obj = event.data.object as Record<string, unknown>
  const customerId =
    typeof obj.customer === 'string' ? obj.customer :
    obj.customer && typeof obj.customer === 'object' && 'id' in (obj.customer as object) ?
      (obj.customer as { id: string }).id : null

  // Look up manager_id for the audit row, best-effort.
  let managerId: string | null = null
  if (customerId) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    managerId = data?.id ?? null
  }

  const { error: insertErr } = await admin.from('billing_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    stripe_customer_id: customerId,
    manager_id: managerId,
    payload: event,
  })
  if (insertErr && (insertErr as { code?: string }).code === '23505') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 })
  }

  // ── Handle event ─────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          await applySubscriptionToProfile(sub)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.resumed':
      case 'customer.subscription.paused': {
        await applySubscriptionToProfile(event.data.object as Stripe.Subscription)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const cust = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        await admin.from('profiles').update({
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          stripe_subscription_item_id: null,
          subscription_quantity: 0,
          subscription_current_period_end: null,
        }).eq('stripe_customer_id', cust)
        break
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        const cust = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        if (cust) {
          await admin.from('profiles').update({ subscription_status: 'past_due' }).eq('stripe_customer_id', cust)
        }
        break
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice
        const cust = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        if (cust) {
          // Refresh status from the source-of-truth subscription record.
          const subRef = inv.subscription
          const subId = typeof subRef === 'string' ? subRef : subRef?.id
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId)
            await applySubscriptionToProfile(sub)
          }
        }
        break
      }
      case 'account.updated': {
        // Landlord's Connect Express account status changed (typically
        // during/after KYC). Sync charges/payouts flags + onboarded_at.
        const account = event.data.object as Stripe.Account
        const charges = account.charges_enabled === true
        const payouts = account.payouts_enabled === true
        const onboardedAt = (charges && payouts) ? new Date().toISOString() : null

        // Find which landlord this account belongs to (by account id) and update.
        const { data: row } = await admin
          .from('profiles')
          .select('id, stripe_connect_onboarded_at')
          .eq('stripe_connect_account_id', account.id)
          .maybeSingle()
        if (row) {
          // Only set onboarded_at the first time both flags flip true; preserve it once set.
          const finalOnboardedAt = row.stripe_connect_onboarded_at ?? onboardedAt
          await admin.from('profiles').update({
            stripe_connect_charges_enabled: charges,
            stripe_connect_payouts_enabled: payouts,
            stripe_connect_onboarded_at: finalOnboardedAt,
          }).eq('stripe_connect_account_id', account.id)
        }
        break
      }
      // ── Tenant rent payments (autopay + manual) ─────────────────────────
      // Matches by metadata.findstoop_payment_id when the cron created the
      // row, otherwise by stripe_payment_id when the client inserted it.
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        // Branch: tenant screening payment → flip the screening_order to
        // 'collecting' so the applicant can start uploading documents.
        if (pi.metadata?.purpose === 'screening') {
          await admin.from('screening_orders').update({
            payment_status: 'paid',
            state: 'collecting',
            paid_at: new Date().toISOString(),
          }).eq('stripe_payment_intent_id', pi.id)
          break
        }
        const update = { status: 'completed', paid_at: new Date().toISOString(), stripe_payment_id: pi.id }
        if (pi.metadata?.findstoop_payment_id) {
          // Defense in depth: reconcile the charged amount against the row's
          // rent before marking it paid, so an under-charged PaymentIntent can
          // never flip a full rent row to "completed". amount_received includes
          // the card surcharge, so it must be AT LEAST the rent in cents.
          const { data: row } = await admin
            .from('payments').select('amount').eq('id', pi.metadata.findstoop_payment_id).single()
          const expectedRentCents = row ? Math.round(Number(row.amount) * 100) : null
          if (expectedRentCents !== null && (pi.amount_received ?? 0) < expectedRentCents) {
            await logApiCall({
              function_name: 'stripe-webhook', vendor: 'stripe', status_code: 409,
              reference_id: pi.id,
              error_message: `amount mismatch: received ${pi.amount_received} < expected rent ${expectedRentCents}`,
              metadata: { payment_id: pi.metadata.findstoop_payment_id, event_type: event.type },
            })
            // Do NOT mark completed — leave the row for manual review.
            break
          }
          await admin.from('payments').update(update).eq('id', pi.metadata.findstoop_payment_id)
        } else {
          await admin.from('payments').update(update).eq('stripe_payment_id', pi.id)
        }
        const tenantId = pi.metadata?.findstoop_tenant_id || pi.metadata?.tenantId
        if (tenantId) {
          await admin.from('profiles')
            .update({ payment_method_setup_at: new Date().toISOString() })
            .eq('id', tenantId)
            .is('payment_method_setup_at', null)
        }
        break
      }
      case 'payment_intent.processing': {
        const pi = event.data.object as Stripe.PaymentIntent
        const update = { status: 'processing', stripe_payment_id: pi.id }
        if (pi.metadata?.findstoop_payment_id) {
          await admin.from('payments').update(update).eq('id', pi.metadata.findstoop_payment_id)
        } else {
          await admin.from('payments').update(update).eq('stripe_payment_id', pi.id)
        }
        break
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        if (pi.metadata?.purpose === 'screening') {
          await admin.from('screening_orders').update({
            payment_status: 'failed',
          }).eq('stripe_payment_intent_id', pi.id)
          break
        }
        const update = { status: 'failed', stripe_payment_id: pi.id }
        if (pi.metadata?.findstoop_payment_id) {
          await admin.from('payments').update(update).eq('id', pi.metadata.findstoop_payment_id)
        } else {
          await admin.from('payments').update(update).eq('stripe_payment_id', pi.id)
        }
        break
      }
      // ── Tenant saved-payment-method (SetupIntent) ───────────────────────
      case 'setup_intent.succeeded': {
        const si = event.data.object as Stripe.SetupIntent
        const tenantId = si.metadata?.findstoop_tenant_id
        const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
        if (tenantId && pmId) {
          // Set as the customer's default PM so off-session autopay can use it.
          try {
            const cust = typeof si.customer === 'string' ? si.customer : si.customer?.id
            if (cust) {
              await stripe.customers.update(cust, {
                invoice_settings: { default_payment_method: pmId },
              })
            }
          } catch { /* non-fatal */ }

          // Fetch the PM to mirror its display fields onto the profile.
          let pmType: string | null = null
          let pmBrand: string | null = null
          let pmLast4: string | null = null
          let pmBankName: string | null = null
          try {
            const pm = await stripe.paymentMethods.retrieve(pmId)
            pmType = pm.type ?? null
            pmBrand = pm.card?.brand ?? null
            pmLast4 = pm.card?.last4 ?? pm.us_bank_account?.last4 ?? null
            pmBankName = pm.us_bank_account?.bank_name ?? null
          } catch { /* non-fatal — UI falls back to a generic label */ }

          await admin.from('profiles').update({
            stripe_default_payment_method_id: pmId,
            payment_method_setup_at: new Date().toISOString(),
            stripe_default_pm_type: pmType,
            stripe_default_pm_brand: pmBrand,
            stripe_default_pm_last4: pmLast4,
            stripe_default_pm_bank_name: pmBankName,
          }).eq('id', tenantId)
        }
        break
      }
      default:
        // No-op for events we don't care about. The audit row is enough.
        break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    // Persist the failure so a broken money-path event is visible in
    // api_call_log — otherwise it only ever surfaces as a silent Stripe retry.
    await logApiCall({
      function_name: 'stripe-webhook',
      vendor: 'stripe',
      status_code: 500,
      reference_id: event.id,
      user_id: managerId,
      error_message: msg.slice(0, 500),
      metadata: { event_type: event.type },
    })
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

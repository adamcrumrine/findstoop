// Stripe webhook receiver.
// Processes subscription lifecycle events for landlord billing,
// updates the corresponding profile row, and logs every event for audit.
//
// IMPORTANT: this function must be deployed with `--no-verify-jwt` so
// Stripe (not a Supabase-authed user) can call it.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { logApiCall } from '../_shared/logging.ts'
import { emailFrom, emailHeaderHtml, emailFooterHtml, companyDisplayName, escapeHtml } from '../_shared/emailBranding.ts'
import { sendPushToProfile } from '../_shared/webPush.ts'
import { sendSmsIfEnabled } from '../_shared/sms.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const APP_URL = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '')
const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

// Must match create-payment-intent / stripe-subscribe (and
// packages/shared/src/lib/billing.ts): card charges carry a 3.5% surcharge.
const CARD_SURCHARGE_PCT = 3.5

// A rent/late-fee charge failed AFTER initiation — most commonly an ACH that
// bounced days later (insufficient funds, closed account). The cron's
// autopay-failure alert only covers charge-time declines; this covers the
// settlement-time path so the tenant isn't silently in arrears. Email + push
// + SMS, all fail-soft; event-level idempotency (billing_events) already
// prevents duplicate alerts on Stripe redelivery.
async function notifyTenantPaymentFailed(paymentRowId: string | null, stripePaymentId: string) {
  const query = admin
    .from('payments')
    .select(`
      id, amount, type, tenant_id,
      tenant:profiles!payments_tenant_id_fkey(email, full_name),
      lease:leases!payments_lease_id_fkey(
        unit:units(unit_number, property:properties(name, manager:profiles(company_name, company_logo_url, brand_color)))
      )
    `)
  const { data } = paymentRowId
    ? await query.eq('id', paymentRowId).maybeSingle()
    : await query.eq('stripe_payment_id', stripePaymentId).maybeSingle()
  if (!data) return
  // deno-lint-ignore no-explicit-any
  const row = data as any
  const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant
  const lease = Array.isArray(row.lease) ? row.lease[0] : row.lease
  const unit = lease && (Array.isArray(lease.unit) ? lease.unit[0] : lease.unit)
  const property = unit && (Array.isArray(unit.property) ? unit.property[0] : unit.property)
  const manager = property && (Array.isArray(property.manager) ? property.manager[0] : property.manager)
  if (!tenant?.email || row.type === 'credit') return

  const firstName = (tenant.full_name?.split(' ')[0]) ?? 'there'
  const amountStr = `$${Number(row.amount).toLocaleString()}`
  const propertyName = property?.name ?? 'your rental'
  const company = companyDisplayName(manager?.company_name ?? null)

  try {
    await resend.emails.send({
      from: emailFrom(manager?.company_name ?? null, RESEND_FROM),
      to: tenant.email,
      subject: `Action needed: your ${amountStr} payment at ${propertyName} didn't clear`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
          ${emailHeaderHtml(company, manager?.company_logo_url ?? null, manager?.brand_color ?? null)}
          <p>Hi ${escapeHtml(firstName)},</p>
          <p>Your ${amountStr} payment at <strong>${escapeHtml(propertyName)}</strong>${unit?.unit_number ? ` · Unit ${escapeHtml(String(unit.unit_number))}` : ''} started processing but <strong>didn't clear</strong> — this usually means the bank transfer bounced (insufficient funds or a closed account).</p>
          <p>The payment is now marked unpaid. Please make a new payment so you don't fall behind, and consider updating your payment method.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${APP_URL}/tenant/pay-rent" style="display:inline-block;background:#00A896;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600">Pay again now</a>
          </p>
          <p style="color:#8E8E93;font-size:13px">If you believe this is an error, contact your property manager.</p>
          ${company ? emailFooterHtml(company) : ''}
        </div>
      `,
    })
  } catch { /* fail-soft — push/SMS below may still land */ }

  try {
    await sendPushToProfile(admin, row.tenant_id, {
      title: 'Your payment didn’t clear',
      body: `${amountStr} at ${propertyName} bounced during processing. Please pay again.`,
      url: '/tenant/pay-rent',
      tag: `payment-failed-${row.id}`,
    })
  } catch { /* fail-soft */ }

  try {
    await sendSmsIfEnabled(admin, row.tenant_id, `Action needed: your ${amountStr} payment at ${propertyName} didn't clear. Pay again: ${APP_URL}/tenant/pay-rent`)
  } catch { /* fail-soft */ }
}

// The manager's OWN subscription invoice failed to charge. Without an alert
// the landlord silently goes past_due and can lose access at period end —
// tenants get email+push+SMS on payment failure, so managers should too.
// Fires once per Stripe dunning attempt (each retry is a distinct event).
async function notifyManagerSubscriptionPaymentFailed(managerId: string, inv: Stripe.Invoice) {
  const { data: mgr } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', managerId)
    .maybeSingle()
  if (!mgr?.email) return

  const firstName = (mgr.full_name?.split(' ')[0]) ?? 'there'
  const amountStr = `$${((inv.amount_due ?? 0) / 100).toLocaleString()}`

  try {
    await resend.emails.send({
      from: RESEND_FROM,
      to: mgr.email,
      subject: `Action needed: your FindStoop subscription payment (${amountStr}) failed`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
          <p>Hi ${escapeHtml(firstName)},</p>
          <p>Your FindStoop subscription payment of <strong>${amountStr}</strong> didn't go through. Stripe will retry automatically, but if the payment keeps failing your subscription will lapse and tenant payments, lease PDFs, and the tenant portal will pause for your properties.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${APP_URL}/manager/billing" style="display:inline-block;background:#00A896;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600">Update payment method</a>
          </p>
          <p style="color:#8E8E93;font-size:13px">If you recently updated your card or bank account, no action may be needed — we'll email you again only if the retry fails.</p>
        </div>
      `,
    })
  } catch { /* fail-soft — push below may still land */ }

  try {
    await sendPushToProfile(admin, mgr.id, {
      title: 'Subscription payment failed',
      body: `${amountStr} couldn't be charged. Update your payment method to keep FindStoop active.`,
      url: '/manager/billing',
      tag: `sub-payment-failed-${inv.id}`,
    })
  } catch { /* fail-soft */ }
}

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

  // Insert-first acts as a concurrency-safe claim (UNIQUE stripe_event_id);
  // the catch block below RELEASES the claim on handler failure so Stripe's
  // retry reprocesses instead of hitting the duplicate branch.
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
          if (managerId) await notifyManagerSubscriptionPaymentFailed(managerId, inv)
        }
        break
      }
      case 'invoice.created': {
        // Card-surcharge policy for manager subscriptions: renewal invoices
        // get a 3.5% line item when the subscription will charge a card.
        // Stripe creates subscription-cycle invoices as drafts and waits
        // ~1 hour before finalizing, which is the window to add the item.
        // (The FIRST invoice is handled at subscription-create time in
        // stripe-subscribe — it's finalized immediately, so it can't be
        // amended here.)
        const inv = event.data.object as Stripe.Invoice
        if (inv.status !== 'draft' || !inv.subscription) break
        if (inv.billing_reason === 'subscription_create') break
        const subtotal = inv.subtotal ?? 0
        if (subtotal <= 0 || !customerId) break
        // Redelivery guard on top of billing_events: never add a second
        // surcharge line to the same invoice.
        const alreadySurcharged = inv.lines.data.some((l) => l.metadata?.findstoop_surcharge === 'true')
        if (alreadySurcharged) break

        // The PM that will be charged: subscription default first (set via
        // save_default_payment_method=on_subscription), customer default second.
        const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id
        const sub = await stripe.subscriptions.retrieve(subId)
        let pmId = typeof sub.default_payment_method === 'string'
          ? sub.default_payment_method
          : sub.default_payment_method?.id ?? null
        if (!pmId) {
          const cust = await stripe.customers.retrieve(customerId)
          if (!('deleted' in cust && cust.deleted)) {
            const c = cust as Stripe.Customer
            pmId = typeof c.invoice_settings?.default_payment_method === 'string'
              ? c.invoice_settings.default_payment_method
              : c.invoice_settings?.default_payment_method?.id ?? null
          }
        }
        if (!pmId) break
        const pm = await stripe.paymentMethods.retrieve(pmId)
        if (pm.type !== 'card') break

        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: inv.id,
          currency: inv.currency ?? 'usd',
          amount: Math.round(subtotal * (CARD_SURCHARGE_PCT / 100)),
          description: `${CARD_SURCHARGE_PCT}% card processing fee`,
          metadata: { findstoop_surcharge: 'true', platform: 'findstoop' },
        })
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
      // ── Disputes & refunds ──────────────────────────────────────────────
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const piId = typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null
        if (!piId) break
        // Flip the rent row so the manager's ledger stops counting disputed
        // money as collected, then tell the landlord — they must respond to
        // the dispute in Stripe within the evidence deadline.
        const { data: row } = await admin
          .from('payments')
          .select(`
            id, amount,
            lease:leases!payments_lease_id_fkey(
              unit:units(unit_number, property:properties(name, manager:profiles(id, email, full_name)))
            )
          `)
          .eq('stripe_payment_id', piId)
          .maybeSingle()
        if (row) {
          await admin.from('payments').update({ status: 'disputed' }).eq('id', row.id)
          // deno-lint-ignore no-explicit-any
          const r = row as any
          const lease = Array.isArray(r.lease) ? r.lease[0] : r.lease
          const unit = lease && (Array.isArray(lease.unit) ? lease.unit[0] : lease.unit)
          const property = unit && (Array.isArray(unit.property) ? unit.property[0] : unit.property)
          const manager = property && (Array.isArray(property.manager) ? property.manager[0] : property.manager)
          if (manager?.email) {
            const amountStr = `$${Number(r.amount).toLocaleString()}`
            try {
              await resend.emails.send({
                from: RESEND_FROM,
                to: manager.email,
                subject: `A tenant disputed a ${amountStr} payment at ${property?.name ?? 'your property'}`,
                html: `
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
                    <p>Hi ${escapeHtml((manager.full_name?.split(' ')[0]) ?? 'there')},</p>
                    <p>A tenant disputed a <strong>${amountStr}</strong> rent payment at <strong>${escapeHtml(property?.name ?? 'your property')}</strong>${unit?.unit_number ? ` · Unit ${escapeHtml(String(unit.unit_number))}` : ''}. The funds are withheld while the card network reviews it, and the payment now shows as <strong>Disputed</strong> in FindStoop.</p>
                    <p>We've logged the dispute and will follow up — if you have context (signed lease, payment history, communications), reply to this email so it can be included in the evidence.</p>
                  </div>
                `,
              })
            } catch { /* fail-soft */ }
          }
        }
        // Always leave an ops trail — disputes carry deadlines.
        await logApiCall({
          function_name: 'stripe-webhook', vendor: 'stripe', status_code: 200,
          reference_id: piId,
          error_message: `charge.dispute.created: ${dispute.reason ?? 'unknown reason'} (${dispute.status})`,
          metadata: { event_type: event.type, dispute_id: dispute.id, amount: dispute.amount, payment_row: row?.id ?? null },
        })
        break
      }
      case 'charge.refunded': {
        const ch = event.data.object as Stripe.Charge
        const piId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id ?? null
        if (!piId) break
        if (ch.refunded) {
          // Fully refunded — reflect it on whichever record the charge backs.
          await admin.from('payments').update({ status: 'refunded' }).eq('stripe_payment_id', piId)
          await admin.from('screening_orders').update({ payment_status: 'refunded' }).eq('stripe_payment_intent_id', piId)
        } else {
          // Partial refund: leave status alone but keep an ops trail.
          await logApiCall({
            function_name: 'stripe-webhook', vendor: 'stripe', status_code: 200,
            reference_id: piId,
            error_message: `partial refund: ${ch.amount_refunded}/${ch.amount} cents`,
            metadata: { event_type: event.type, charge_id: ch.id },
          })
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
        // Resolve the row first (metadata id preferred, legacy stripe_payment_id
        // match otherwise) so the amount reconciliation below covers BOTH paths.
        const { data: row } = pi.metadata?.findstoop_payment_id
          ? await admin.from('payments').select('id, amount').eq('id', pi.metadata.findstoop_payment_id).maybeSingle()
          : await admin.from('payments').select('id, amount').eq('stripe_payment_id', pi.id).maybeSingle()
        if (row) {
          // Defense in depth: reconcile the charged amount against the row's
          // rent before marking it paid, so an under-charged PaymentIntent can
          // never flip a full rent row to "completed". amount_received includes
          // the card surcharge, so it must be AT LEAST the rent in cents.
          const expectedRentCents = Math.round(Number(row.amount) * 100)
          if ((pi.amount_received ?? 0) < expectedRentCents) {
            await logApiCall({
              function_name: 'stripe-webhook', vendor: 'stripe', status_code: 409,
              reference_id: pi.id,
              error_message: `amount mismatch: received ${pi.amount_received} < expected rent ${expectedRentCents}`,
              metadata: { payment_id: row.id, event_type: event.type },
            })
            // Do NOT mark completed — leave the row for manual review.
            break
          }
          await admin.from('payments').update(update).eq('id', row.id)
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
        // Tell the tenant — an ACH that bounces days after "payment received"
        // is otherwise invisible until the landlord chases them.
        await notifyTenantPaymentFailed(pi.metadata?.findstoop_payment_id ?? null, pi.id)
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
    // Release the idempotency claim FIRST: the billing_events row was inserted
    // before processing, so without this delete Stripe's retry would hit the
    // duplicate branch above and return 200 — permanently dropping the event
    // after any transient handler failure.
    try {
      await admin.from('billing_events').delete().eq('stripe_event_id', event.id)
    } catch { /* if this fails the event is lost to retries — the log below is the trail */ }
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

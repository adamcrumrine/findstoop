// FindStoop in-app billing management — replaces the Stripe-branded customer
// portal redirect with a FindStoop-branded modal experience.
//
// Actions (POST body { action: ... }):
//   • 'load'        — returns subscription summary, payment method, recent invoices,
//                     and a SetupIntent client_secret for updating the payment method.
//   • 'cancel'      — schedules the subscription to cancel at period end.
//   • 'resume'      — reverses a pending cancellation.
//
// Auth: Supabase JWT. Only the customer/owner can manage their own billing.

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
    const body = await req.json().catch(() => ({})) as { action?: string }
    const action = body.action ?? 'load'

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
      return json({ error: 'Only landlords have billing' }, { status: 403 })
    }
    // Complimentary account — no Stripe data to fetch.
    if (profile.subscription_complimentary === true) {
      return json({ status: 'complimentary', message: 'Your account is on a complimentary plan — no billing required.' })
    }
    if (!profile.stripe_customer_id || !profile.stripe_subscription_id) {
      return json({ error: 'No active subscription to manage' }, { status: 404 })
    }

    const customerId = profile.stripe_customer_id as string
    const subscriptionId = profile.stripe_subscription_id as string

    if (action === 'cancel') {
      const sub = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      })
      return json({
        status: 'canceled_at_period_end',
        cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
      })
    }

    if (action === 'resume') {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      })
      return json({ status: 'resumed' })
    }

    if (action === 'invoice') {
      const invoiceId = (body as { invoiceId?: string }).invoiceId
      if (!invoiceId) return json({ error: 'invoiceId required' }, { status: 400 })
      const invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ['lines.data.price', 'charge.payment_method_details'],
      })
      if (invoice.customer !== customerId) {
        return json({ error: 'Not your invoice' }, { status: 403 })
      }
      const charge = invoice.charge as Stripe.Charge | null
      return json({
        status: 'ok',
        invoice: {
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          currency: invoice.currency,
          created: new Date(invoice.created * 1000).toISOString(),
          dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
          periodStart: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
          periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
          subtotal: invoice.subtotal,
          tax: invoice.tax ?? 0,
          total: invoice.total,
          amountPaid: invoice.amount_paid,
          amountDue: invoice.amount_due,
          customerEmail: invoice.customer_email ?? profile.email ?? null,
          customerName: invoice.customer_name ?? profile.full_name ?? null,
          customerAddress: invoice.customer_address ?? null,
          lines: invoice.lines.data.map((line) => ({
            id: line.id,
            description: line.description,
            quantity: line.quantity ?? 1,
            unitAmount: line.price?.unit_amount ?? 0,
            amount: line.amount,
            periodStart: line.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
            periodEnd: line.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
          })),
          paymentMethod: charge?.payment_method_details ? {
            type: charge.payment_method_details.type,
            cardBrand: charge.payment_method_details.card?.brand ?? null,
            cardLast4: charge.payment_method_details.card?.last4 ?? null,
            bankLast4: charge.payment_method_details.us_bank_account?.last4 ?? null,
            bankName: charge.payment_method_details.us_bank_account?.bank_name ?? null,
          } : null,
        },
      })
    }

    // ── 'load' (default) ─────────────────────────────────────────────────
    const [subscription, pmList, invoices, setupIntent] = await Promise.all([
      stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method', 'latest_invoice'],
      }),
      stripe.paymentMethods.list({ customer: customerId, limit: 5 }),
      stripe.invoices.list({ customer: customerId, limit: 6 }),
      // SetupIntent powers the "update payment method" PaymentElement.
      stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card', 'us_bank_account'],
        usage: 'off_session',
      }),
    ])

    const item = subscription.items.data[0]
    const price = item?.price
    const defaultPm = (subscription.default_payment_method as Stripe.PaymentMethod | null) ?? pmList.data[0] ?? null

    return json({
      status: 'ok',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        quantity: item?.quantity ?? 0,
        unitAmount: price?.unit_amount ?? 0,
        currency: price?.currency ?? 'usd',
        interval: price?.recurring?.interval ?? 'month',
      },
      paymentMethod: defaultPm ? {
        id: defaultPm.id,
        type: defaultPm.type,
        cardBrand: defaultPm.card?.brand ?? null,
        cardLast4: defaultPm.card?.last4 ?? null,
        bankLast4: defaultPm.us_bank_account?.last4 ?? null,
        bankName: defaultPm.us_bank_account?.bank_name ?? null,
      } : null,
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountPaid: inv.amount_paid,
        amountDue: inv.amount_due,
        currency: inv.currency,
        created: new Date(inv.created * 1000).toISOString(),
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
      })),
      setupClientSecret: setupIntent.client_secret,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

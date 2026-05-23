// Daily lifecycle cron. Hit by pg_cron via pg_net with the shared CRON_SECRET.
// Currently handles rent reminders; onboarding / re-engagement / win-back will
// layer in here as separate trigger blocks.
//
// Pattern modeled on prospekteer's lifecycle-daily route: a fireTrigger()
// helper handles pause + dedup + render + Resend + audit log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'

const APP_URL          = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const CRON_SECRET      = Deno.env.get('CRON_SECRET') ?? ''
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM      = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

const resend = new Resend(RESEND_API_KEY)

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

// ── Templates ─────────────────────────────────────────────────────────────
// Each trigger_key has a subject + html builder. Keep copy short, scannable,
// and direct — rent reminders, not marketing.

interface RentReminderVars {
  first_name: string
  amount: number
  due_date: string
  property_name: string
  unit_number: string
  pay_url: string
}

interface LateFeeVars {
  first_name: string
  fee_amount: number
  rent_amount: number
  due_date: string
  days_overdue: number
  property_name: string
  unit_number: string
  pay_url: string
}

interface OnboardingVars {
  first_name: string
  login_url: string
  help_url: string
  pricing_url: string
  property_count: number
}

type TemplateVars = RentReminderVars | LateFeeVars | OnboardingVars

function brandHeader() {
  return `
    <div style="text-align:center;padding:24px 0;border-bottom:1px solid #eee;margin-bottom:24px">
      <span style="font-size:24px;font-weight:700;color:#00A896;letter-spacing:-0.02em">FindStoop</span>
    </div>
  `
}

function brandFooter() {
  return `
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;color:#8E8E93;font-size:12px;line-height:1.5">
      <p>You're receiving this because you're an active renter on FindStoop.</p>
      <p>Manage notification preferences in your <a href="${APP_URL}/tenant/dashboard" style="color:#00A896">tenant dashboard</a>.</p>
    </div>
  `
}

function wrapHtml(body: string) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
      ${brandHeader()}
      ${body}
      ${brandFooter()}
    </div>
  `
}

function payButton(href: string, label: string) {
  return `
    <p style="text-align:center;margin:28px 0">
      <a href="${href}" style="display:inline-block;background:#00A896;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600">${label}</a>
    </p>
  `
}

// deno-lint-ignore no-explicit-any
const TEMPLATES: Record<string, { subject: (v: any) => string; html: (v: any) => string }> = {
  rent_reminder_3d: {
    subject: (v: RentReminderVars) => `Reminder: rent is due in 3 days at ${v.property_name}`,
    html: (v: RentReminderVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>A friendly heads-up that your rent is due in <strong>3 days</strong>:</p>
      <ul style="background:#f6fafa;border:1px solid #e6f0ee;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Amount:</strong> $${Number(v.amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Due:</strong> ${v.due_date}</li>
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      ${payButton(v.pay_url, 'Pay rent online')}
      <p style="color:#8E8E93;font-size:13px">ACH is free. Card payments incur a small processing fee. Paying online creates an instant receipt for your records.</p>
    `),
  },
  rent_reminder_1d: {
    subject: (v: RentReminderVars) => `Heads up: rent is due tomorrow at ${v.property_name}`,
    html: (v: RentReminderVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Your rent is due <strong>tomorrow</strong>:</p>
      <ul style="background:#f6fafa;border:1px solid #e6f0ee;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Amount:</strong> $${Number(v.amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Due:</strong> ${v.due_date}</li>
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      ${payButton(v.pay_url, 'Pay rent now')}
      <p style="color:#8E8E93;font-size:13px">If you've already paid by check, you can ignore this email.</p>
    `),
  },
  rent_reminder_0d: {
    subject: (v: RentReminderVars) => `Rent is due today at ${v.property_name}`,
    html: (v: RentReminderVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Today's the day — your rent payment is due:</p>
      <ul style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Amount:</strong> $${Number(v.amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Due:</strong> ${v.due_date} (today)</li>
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      ${payButton(v.pay_url, 'Pay rent now')}
      <p style="color:#8E8E93;font-size:13px">Paying today avoids any late fees per your lease agreement.</p>
    `),
  },
  late_fee_assessed: {
    subject: (v: LateFeeVars) => `Late fee added: $${v.fee_amount} on your ${v.property_name} rent`,
    html: (v: LateFeeVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Your rent for ${v.property_name} (Unit ${v.unit_number}) is now <strong>${v.days_overdue} days overdue</strong>. As outlined in your lease, a late fee has been added to your balance:</p>
      <ul style="background:#fff1f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Rent still owed:</strong> $${Number(v.rent_amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Late fee added:</strong> $${Number(v.fee_amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Original due date:</strong> ${v.due_date}</li>
      </ul>
      ${payButton(v.pay_url, 'Settle balance now')}
      <p style="color:#8E8E93;font-size:13px">Paying online resolves both the rent and the late fee in one transaction. If you've already paid by check that hasn't cleared yet, reply to this email and we'll help reconcile it.</p>
    `),
  },
  onboarding_welcome: {
    subject: (v: OnboardingVars) => `Welcome to FindStoop, ${v.first_name}`,
    html: (v: OnboardingVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Welcome — and thanks for trying FindStoop. We built this for landlords who are tired of stitching together a spreadsheet, a shared drive, and a Venmo group chat.</p>
      <p>Three things that take about 5 minutes total and unlock most of the value:</p>
      <ol style="padding-left:20px;line-height:1.8">
        <li><strong>Add your first property</strong> — pin an address, a unit, the rent.</li>
        <li><strong>Invite your tenants by email</strong> — they keep their lease history when they accept.</li>
        <li><strong>Turn on rent collection</strong> — your tenants pay by ACH (free) or card; deposits hit your bank in 1–3 days.</li>
      </ol>
      ${payButton(v.login_url, 'Open your dashboard')}
      <p style="color:#8E8E93;font-size:13px">Your first two units are free, forever. Past that, units 3 through 50 are $3 each per month.</p>
    `),
  },
  onboarding_getting_started: {
    subject: () => `Quick tour of FindStoop`,
    html: (v: OnboardingVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>A quick map of what's where, in case you haven't explored yet:</p>
      <ul style="padding-left:20px;line-height:1.8">
        <li><strong>Properties</strong> — your buildings and units.</li>
        <li><strong>Tenants</strong> — invite renters; they get their own portal.</li>
        <li><strong>Leases</strong> — state-specific templates with e-sign on both sides.</li>
        <li><strong>Payments</strong> — automatic reminders, late fees you configure, deposits to your bank.</li>
        <li><strong>Maintenance</strong> — tenants submit photos and priority; you triage in a list.</li>
        <li><strong>Reports</strong> — income and expense per property, export-ready for your accountant.</li>
      </ul>
      ${payButton(v.login_url, 'Continue setup')}
      <p style="color:#8E8E93;font-size:13px">Stuck on something? Reply to this email — you'll get a human, not a queue.</p>
    `),
  },
  onboarding_first_property: {
    subject: () => `Step one: add your first property`,
    html: (v: OnboardingVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>I noticed you haven't added a property yet. It's the fastest way to see what the rest of FindStoop actually does for you.</p>
      <p>You'll need: an address, a unit number, a monthly rent amount. Takes about 90 seconds.</p>
      ${payButton(`${v.login_url.replace('/login','')}/manager/properties`, 'Add a property')}
      <p style="color:#8E8E93;font-size:13px">Already manage 10+ units elsewhere? Email us at support — we'll do a CSV import for free.</p>
    `),
  },
  onboarding_tips: {
    subject: () => `Three small wins from week one`,
    html: (v: OnboardingVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>You've been on FindStoop for about a week. Three small wins most landlords don't discover on their own:</p>
      <ol style="padding-left:20px;line-height:1.8">
        <li><strong>Enable late-fee automation</strong> in Settings → Billing rules. We assess it on your timeline so you don't have to chase anyone.</li>
        <li><strong>Set up a lease template</strong> for your state — once written, it auto-fills for every new lease.</li>
        <li><strong>Add maintenance photos</strong> from your phone when you do walkthroughs; the unit's history builds itself over time.</li>
      </ol>
      ${payButton(v.login_url, 'Open dashboard')}
      <p style="color:#8E8E93;font-size:13px">Want a 15-minute walkthrough with someone on our team? Reply to this email and we'll set it up.</p>
    `),
  },
}

// ── fireTrigger — pause check, dedup, render, send, log ──────────────────

interface FireTriggerParams {
  triggerKey: string
  userId: string
  recipientEmail: string
  dedupToken: string
  templateVars: TemplateVars
}

async function fireTrigger(p: FireTriggerParams): Promise<'sent' | 'paused' | 'duplicate' | 'no_template' | 'send_failed'> {
  // Pause check
  const { data: cfg } = await admin
    .from('lifecycle_trigger_config')
    .select('paused')
    .eq('trigger_key', p.triggerKey)
    .maybeSingle()
  if (cfg?.paused) return 'paused'

  const template = TEMPLATES[p.triggerKey]
  if (!template) return 'no_template'

  const subject = template.subject(p.templateVars)
  const html    = template.html(p.templateVars)

  let resendId: string | null = null
  let status: 'sent' | 'failed' = 'sent'
  let errorDetails: string | null = null

  try {
    const { data, error } = await resend.emails.send({
      from: `FindStoop <${RESEND_FROM}>`,
      to: p.recipientEmail,
      subject,
      html,
    })
    if (error) throw new Error(error.message)
    resendId = data?.id ?? null
  } catch (err) {
    status = 'failed'
    errorDetails = err instanceof Error ? err.message : String(err)
  }

  // Insert; unique (trigger_key, dedup_token) constraint gives idempotency.
  const { error: insertErr } = await admin.from('lifecycle_events').insert({
    trigger_key: p.triggerKey,
    user_id: p.userId,
    recipient_email: p.recipientEmail,
    dedup_token: p.dedupToken,
    template_vars: p.templateVars,
    status,
    resend_message_id: resendId,
    metadata: errorDetails ? { error: errorDetails } : null,
  })
  if (insertErr) {
    if ((insertErr as { code?: string }).code === '23505') return 'duplicate'
    return 'send_failed'
  }
  return status === 'sent' ? 'sent' : 'send_failed'
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Cron auth
  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  interface Outcome { triggerKey: string; sent: number; duplicate: number; paused: number; failed: number; skipped: number }
  const totals: Outcome[] = []

  // ── Rent reminders: 3d / 1d / due today ────────────────────────────────
  for (const daysBefore of [3, 1, 0] as const) {
    const triggerKey = `rent_reminder_${daysBefore}d`
    const { data: rows, error } = await admin.rpc('pending_rent_payments_for_reminder', { days_before: daysBefore })
    if (error) {
      totals.push({ triggerKey, sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 })
      continue
    }
    const outcome: Outcome = { triggerKey, sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 }

    for (const row of rows ?? []) {
      if (!row.tenant_email || row.email_enabled === false) {
        outcome.skipped++
        continue
      }
      const firstName = (row.tenant_name?.split(' ')[0]) ?? 'there'
      const result = await fireTrigger({
        triggerKey,
        userId: row.tenant_id,
        recipientEmail: row.tenant_email,
        dedupToken: `payment:${row.payment_id}:${daysBefore}d`,
        templateVars: {
          first_name: firstName,
          amount: Number(row.amount),
          due_date: new Date(row.due_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
          property_name: row.property_name ?? '',
          unit_number: row.unit_number ?? '',
          pay_url: `${APP_URL}/tenant/pay-rent`,
        },
      })
      if (result === 'sent') outcome.sent++
      else if (result === 'duplicate') outcome.duplicate++
      else if (result === 'paused') outcome.paused++
      else outcome.failed++
    }
    totals.push(outcome)
  }

  // ── Late-fee assessment ────────────────────────────────────────────────
  // For each overdue rent past the landlord's grace window, insert a
  // late_fee payment row (linked back via triggered_by_payment_id) and
  // notify the tenant. RPC already filters out anything we've already done.
  {
    const triggerKey = 'late_fee_assessed'
    const outcome: Outcome = { triggerKey, sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 }
    const { data: overdue } = await admin.rpc('overdue_payments_for_late_fee')
    for (const row of overdue ?? []) {
      const feeAmount = row.late_fee_type === 'percent'
        ? Math.round((Number(row.rent_amount) * Number(row.late_fee_percent) / 100) * 100) / 100
        : Number(row.late_fee_amount)

      const { data: feeRow, error: feeErr } = await admin.from('payments').insert({
        lease_id: row.lease_id,
        tenant_id: row.tenant_id,
        amount: feeAmount,
        type: 'late_fee',
        status: 'pending',
        triggered_by_payment_id: row.payment_id,
      }).select('id').single()

      if (feeErr || !feeRow) { outcome.failed++; continue }

      if (!row.tenant_email || row.email_enabled === false) {
        outcome.skipped++
        continue
      }
      const daysOverdue = Math.floor((Date.now() - new Date(row.due_date).getTime()) / 86400000)
      const result = await fireTrigger({
        triggerKey,
        userId: row.tenant_id,
        recipientEmail: row.tenant_email,
        dedupToken: `late_fee:payment:${row.payment_id}`,
        templateVars: {
          first_name: (row.tenant_name?.split(' ')[0]) ?? 'there',
          fee_amount: feeAmount,
          rent_amount: Number(row.rent_amount),
          due_date: new Date(row.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
          days_overdue: daysOverdue,
          property_name: row.property_name ?? '',
          unit_number: row.unit_number ?? '',
          pay_url: `${APP_URL}/tenant/pay-rent`,
        },
      })
      if (result === 'sent') outcome.sent++
      else if (result === 'duplicate') outcome.duplicate++
      else if (result === 'paused') outcome.paused++
      else outcome.failed++
    }
    totals.push(outcome)
  }

  // ── Landlord onboarding sequence ───────────────────────────────────────
  // Fire one email per landlord at days 0/1, 1/2, 3/4 (skips if they've
  // already added a property), and 7/8.
  {
    const onboardingResults: Outcome[] = [
      { triggerKey: 'onboarding_welcome', sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 },
      { triggerKey: 'onboarding_getting_started', sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 },
      { triggerKey: 'onboarding_first_property', sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 },
      { triggerKey: 'onboarding_tips', sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 },
    ]

    const { data: managers } = await admin
      .from('profiles')
      .select('id, email, full_name, created_at, notification_email_enabled')
      .in('role', ['manager', 'admin'])

    for (const m of managers ?? []) {
      if (!m.email || m.notification_email_enabled === false) continue
      const daysSince = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000)
      const firstName = (m.full_name?.split(' ')[0]) ?? 'there'

      const baseVars: OnboardingVars = {
        first_name: firstName,
        login_url: `${APP_URL}/login`,
        help_url: `${APP_URL}/education`,
        pricing_url: `${APP_URL}/pricing`,
        property_count: 0,
      }

      async function tryFire(triggerKey: string, idx: number, vars: OnboardingVars) {
        const r = await fireTrigger({
          triggerKey,
          userId: m.id,
          recipientEmail: m.email,
          dedupToken: `manager:${m.id}`,
          templateVars: vars,
        })
        const target = onboardingResults[idx]
        if (r === 'sent') target.sent++
        else if (r === 'duplicate') target.duplicate++
        else if (r === 'paused') target.paused++
        else target.failed++
      }

      if (daysSince >= 0 && daysSince <= 1) await tryFire('onboarding_welcome', 0, baseVars)
      if (daysSince >= 1 && daysSince <= 2) await tryFire('onboarding_getting_started', 1, baseVars)
      if (daysSince >= 3 && daysSince <= 4) {
        const { count } = await admin
          .from('properties')
          .select('id', { count: 'exact', head: true })
          .eq('manager_id', m.id)
        if ((count ?? 0) === 0) await tryFire('onboarding_first_property', 2, { ...baseVars, property_count: 0 })
      }
      if (daysSince >= 7 && daysSince <= 8) await tryFire('onboarding_tips', 3, baseVars)
    }

    totals.push(...onboardingResults)
  }

  return new Response(JSON.stringify({ ok: true, totals, ran_at: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

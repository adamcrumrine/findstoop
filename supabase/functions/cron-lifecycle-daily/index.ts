// Daily lifecycle cron. Hit by pg_cron via pg_net with the shared CRON_SECRET.
// Currently handles rent reminders; onboarding / re-engagement / win-back will
// layer in here as separate trigger blocks.
//
// Pattern modeled on prospekteer's lifecycle-daily route: a fireTrigger()
// helper handles pause + dedup + render + Resend + audit log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { emailFrom, emailFooterHtml, emailHeaderHtml, brandAccent, companyDisplayName, DEFAULT_ACCENT } from '../_shared/emailBranding.ts'
import { sendPushToProfile, type PushMessage } from '../_shared/webPush.ts'
import { sendSmsIfEnabled } from '../_shared/sms.ts'
import { tasksDueThisMonth, occurrenceKey } from '../_shared/seasonalTasks.ts'

const APP_URL          = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const CRON_SECRET      = Deno.env.get('CRON_SECRET') ?? ''
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM      = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

const resend = new Resend(RESEND_API_KEY)
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' })

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

interface PaymentFailedVars {
  first_name: string
  amount: number
  property_name: string
  unit_number: string
  pay_url: string
}

interface LeaseRenewalVars {
  first_name: string
  tenant_name: string
  property_name: string
  unit_number: string
  end_date: string
  days_left: number
  url: string
}

interface AnnualPhysicalVars {
  first_name: string
  year_label: string
  url: string
}

interface SeasonalDigestVars {
  first_name: string
  month_label: string
  total_tasks: number
  properties: Array<{ name: string; tasks: Array<{ title: string; who: string }> }>
  url: string
}

type TemplateVars = RentReminderVars | LateFeeVars | OnboardingVars | PaymentFailedVars | LeaseRenewalVars | SeasonalDigestVars | AnnualPhysicalVars

// Landlord branding for tenant-facing sends (see _shared/emailBranding.ts).
// null / undefined ⇒ stock FindStoop presentation, exactly as before.
interface LeaseBrand {
  company_name: string | null
  company_logo_url: string | null
  brand_color: string | null
}

function brandFooter() {
  return `
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;color:#8E8E93;font-size:12px;line-height:1.5">
      <p>You're receiving this because you're an active renter on FindStoop.</p>
      <p>Manage notification preferences in your <a href="${APP_URL}/tenant/dashboard" style="color:#00A896">tenant dashboard</a>.</p>
    </div>
  `
}

// Manager-targeted emails (onboarding, lease-renewal alerts) should not carry
// the renter footer / tenant-dashboard link.
function brandFooterManager() {
  return `
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;color:#8E8E93;font-size:12px;line-height:1.5">
      <p>You're receiving this because you manage properties on FindStoop.</p>
      <p>Manage notification preferences in your <a href="${APP_URL}/manager/settings" style="color:#00A896">account settings</a>.</p>
    </div>
  `
}

function wrapHtml(body: string, footer: string = brandFooter(), brand?: LeaseBrand | null) {
  const company = companyDisplayName(brand?.company_name)
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
      ${emailHeaderHtml(company, brand?.company_logo_url, brand?.brand_color)}
      ${body}
      ${footer}
      ${company ? emailFooterHtml(company) : ''}
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

// Tenant-facing templates take an optional LeaseBrand (landlord white-label);
// manager-facing templates (lease_renewal_manager, onboarding_*) ignore it
// and stay platform-branded.
// deno-lint-ignore no-explicit-any
const TEMPLATES: Record<string, { subject: (v: any) => string; html: (v: any, brand?: LeaseBrand | null) => string }> = {
  // Sent when an auto-pay charge fails (e.g. card declined, requires 3DS).
  // Treated as a critical transactional alert — NOT suppressed by the email
  // preference flag, since a failed rent payment needs the tenant's action.
  autopay_failed: {
    subject: (v: PaymentFailedVars) => `Action needed: your auto-pay didn't go through at ${v.property_name}`,
    html: (v: PaymentFailedVars, brand?: LeaseBrand | null) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>We tried to process your scheduled rent payment, but it <strong>didn't go through</strong>:</p>
      <ul style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Amount:</strong> $${Number(v.amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      <p style="margin-top:16px">This usually means your card was declined, expired, or needs verification. Please update your payment method and make a one-time payment so you don't fall behind.</p>
      ${payButton(v.pay_url, 'Update payment & pay')}
      <p style="color:#8E8E93;font-size:13px">If you've already resolved this, you can ignore this email.</p>
    `, brandFooter(), brand),
  },
  // Lease-renewal nudge to the MANAGER (manager footer, links to the lease list).
  lease_renewal_manager: {
    subject: (v: LeaseRenewalVars) => `Lease ending in ${v.days_left} days — ${v.tenant_name} at ${v.property_name}`,
    html: (v: LeaseRenewalVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p><strong>${v.tenant_name}</strong>'s lease ends in <strong>${v.days_left} days</strong>:</p>
      <ul style="background:#f6fafa;border:1px solid #e6f0ee;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
        <li style="margin:4px 0"><strong>Lease ends:</strong> ${v.end_date}</li>
      </ul>
      <p style="margin-top:16px">The renewal advisor on your Leases page has a market-aware suggested offer for this lease (from your saved rental analysis), a flight-risk read on the tenant, and a one-click renewal offer letter — so you're not scrambling at the last minute.</p>
      ${payButton(v.url, 'Open the renewal advisor')}
    `, brandFooterManager()),
  },
  // Lease-renewal heads-up to the TENANT.
  lease_renewal_tenant: {
    subject: (v: LeaseRenewalVars) => `Your lease at ${v.property_name} ends ${v.end_date}`,
    html: (v: LeaseRenewalVars, brand?: LeaseBrand | null) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>A friendly heads-up that your lease ends in <strong>${v.days_left} days</strong> (${v.end_date}):</p>
      <ul style="background:#f6fafa;border:1px solid #e6f0ee;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Home:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      <p style="margin-top:16px">If you'd like to renew, reach out to your property manager — they may be in touch soon with options.</p>
      ${payButton(v.url, 'Open your dashboard')}
    `, brandFooter(), brand),
  },
  rent_reminder_3d: {
    subject: (v: RentReminderVars) => `Reminder: rent is due in 3 days at ${v.property_name}`,
    html: (v: RentReminderVars, brand?: LeaseBrand | null) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>A friendly heads-up that your rent is due in <strong>3 days</strong>:</p>
      <ul style="background:#f6fafa;border:1px solid #e6f0ee;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Amount:</strong> $${Number(v.amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Due:</strong> ${v.due_date}</li>
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      ${payButton(v.pay_url, 'Pay rent online')}
      <p style="color:#8E8E93;font-size:13px">ACH is free. Card payments incur a small processing fee. Paying online creates an instant receipt for your records.</p>
    `, brandFooter(), brand),
  },
  rent_reminder_1d: {
    subject: (v: RentReminderVars) => `Heads up: rent is due tomorrow at ${v.property_name}`,
    html: (v: RentReminderVars, brand?: LeaseBrand | null) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Your rent is due <strong>tomorrow</strong>:</p>
      <ul style="background:#f6fafa;border:1px solid #e6f0ee;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Amount:</strong> $${Number(v.amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Due:</strong> ${v.due_date}</li>
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      ${payButton(v.pay_url, 'Pay rent now')}
      <p style="color:#8E8E93;font-size:13px">If you've already paid by check, you can ignore this email.</p>
    `, brandFooter(), brand),
  },
  rent_reminder_0d: {
    subject: (v: RentReminderVars) => `Rent is due today at ${v.property_name}`,
    html: (v: RentReminderVars, brand?: LeaseBrand | null) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Today's the day — your rent payment is due:</p>
      <ul style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Amount:</strong> $${Number(v.amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Due:</strong> ${v.due_date} (today)</li>
        <li style="margin:4px 0"><strong>Unit:</strong> ${v.property_name} · Unit ${v.unit_number}</li>
      </ul>
      ${payButton(v.pay_url, 'Pay rent now')}
      <p style="color:#8E8E93;font-size:13px">Paying today avoids any late fees per your lease agreement.</p>
    `, brandFooter(), brand),
  },
  late_fee_assessed: {
    subject: (v: LateFeeVars) => `Late fee added: $${v.fee_amount} on your ${v.property_name} rent`,
    html: (v: LateFeeVars, brand?: LeaseBrand | null) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Your rent for ${v.property_name} (Unit ${v.unit_number}) is now <strong>${v.days_overdue} days overdue</strong>. As outlined in your lease, a late fee has been added to your balance:</p>
      <ul style="background:#fff1f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;list-style:none;margin:0">
        <li style="margin:4px 0"><strong>Rent still owed:</strong> $${Number(v.rent_amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Late fee added:</strong> $${Number(v.fee_amount).toLocaleString()}</li>
        <li style="margin:4px 0"><strong>Original due date:</strong> ${v.due_date}</li>
      </ul>
      ${payButton(v.pay_url, 'Settle balance now')}
      <p style="color:#8E8E93;font-size:13px">Paying online resolves both the rent and the late fee in one transaction. If you've already paid by check that hasn't cleared yet, reply to this email and we'll help reconcile it.</p>
    `, brandFooter(), brand),
  },
  // January nudge: last year's numbers are complete — the part-time-CFO
  // report is at its most useful exactly once a year, unprompted.
  annual_physical_ready: {
    subject: (v: { first_name: string; year_label: string; url: string }) =>
      `Your ${v.year_label} portfolio physical is ready`,
    html: (v: { first_name: string; year_label: string; url: string }) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>A full year of your portfolio's numbers is in the books. Your <strong>annual portfolio physical</strong> pulls it together: rent vs market, expense ratio with category breakdown, lease-end clustering, deposit exposure, compliance gaps, and collection health — with year-over-year comparisons once you have two years of history.</p>
      <p>It's computed entirely from data already in your account — nothing to prepare. Print it, save it as a PDF for your records, or hand it to your accountant.</p>
      ${payButton(v.url, 'Open your annual report')}
      <p style="color:#8E8E93;font-size:13px">You'll find it any time under Download Center → Annual portfolio physical.</p>
    `, brandFooterManager()),
  },
  // Monthly seasonal-maintenance digest to the MANAGER — the "autopilot" half
  // of the seasonal schedule that previously only showed in the UI.
  seasonal_maintenance_digest: {
    subject: (v: SeasonalDigestVars) =>
      `${v.total_tasks} seasonal maintenance task${v.total_tasks === 1 ? '' : 's'} due in ${v.month_label}`,
    html: (v: SeasonalDigestVars) => wrapHtml(`
      <p>Hi ${v.first_name},</p>
      <p>Here's what protects your ${v.properties.length === 1 ? 'property' : 'properties'} this month — each takes minutes now and prevents the expensive version later:</p>
      ${v.properties.map((prop) => `
        <div style="background:#f6fafa;border:1px solid #e6f0ee;border-radius:10px;padding:14px 18px;margin:10px 0">
          <p style="margin:0 0 6px;font-weight:600">${prop.name}</p>
          <ul style="margin:0;padding-left:18px;line-height:1.7">
            ${prop.tasks.map((t) => `<li>${t.title}${t.who === 'tenant' ? ' <span style="color:#00A896;font-size:12px">(tenant-doable — one-tap ask in the app)</span>' : t.who === 'pro' ? ' <span style="color:#8E8E93;font-size:12px">(book a pro)</span>' : ''}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
      ${payButton(v.url, 'Open seasonal maintenance')}
      <p style="color:#8E8E93;font-size:13px">Tasks you've already marked done, dismissed, or delegated this season aren't listed. Manage the schedule from each property's Overview tab.</p>
    `, brandFooterManager()),
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
  // When set, the owning landlord is BCC'd so they have a copy of what their
  // tenant received. Resolved per-lease (cached) at the call site.
  bccEmail?: string
  // Landlord white-label branding for tenant-facing sends. Resolved per-lease
  // (cached) at the call site; omitted for manager-facing emails.
  brand?: LeaseBrand | null
  // Best-effort companion channels, fired only when the email actually sent
  // (so they inherit the email's dedup). Both fail-soft.
  push?: PushMessage
  // SMS body (short, plain text). Gated per-profile by
  // notification_sms_enabled + phone inside sendSmsIfEnabled.
  smsBody?: string
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

  // Dedup BEFORE sending. The unique-constraint insert below stays as the
  // authoritative race guard, but it fires after the email has gone out —
  // any trigger whose candidates re-qualify on later runs (day-window
  // onboarding, the monthly digests) would re-send without this check.
  const { data: already } = await admin
    .from('lifecycle_events')
    .select('id')
    .eq('trigger_key', p.triggerKey)
    .eq('dedup_token', p.dedupToken)
    .limit(1)
    .maybeSingle()
  if (already) return 'duplicate'

  const subject = template.subject(p.templateVars)
  let html      = template.html(p.templateVars, p.brand)

  // Landlord accent color: every template uses the FindStoop teal only as an
  // accent (header wordmark, buttons, links), so a straight swap re-skins the
  // email without touching the copy or layout.
  const accent = brandAccent(p.brand?.brand_color)
  if (p.brand && companyDisplayName(p.brand.company_name) && accent !== DEFAULT_ACCENT) {
    html = html.split(DEFAULT_ACCENT).join(accent)
  }

  let resendId: string | null = null
  let status: 'sent' | 'failed' = 'sent'
  let errorDetails: string | null = null

  try {
    const { data, error } = await resend.emails.send({
      from: emailFrom(p.brand?.company_name, RESEND_FROM),
      to: p.recipientEmail,
      bcc: p.bccEmail || undefined,
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

  // Companion channels ride the email's dedup: they only fire on a fresh,
  // successful send. Both are best-effort — failures never affect the result.
  if (status === 'sent') {
    if (p.push) {
      try { await sendPushToProfile(admin, p.userId, p.push) } catch { /* fail-soft */ }
    }
    if (p.smsBody) {
      try { await sendSmsIfEnabled(admin, p.userId, p.smsBody) } catch { /* fail-soft */ }
    }
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

  // Resolve the owning landlord's email for a lease (cached per run) so tenant
  // notifications BCC the manager who owns the property.
  const mgrEmailCache = new Map<string, string | null>()
  async function bccForLease(leaseId: string | null | undefined): Promise<string | undefined> {
    if (!leaseId) return undefined
    if (!mgrEmailCache.has(leaseId)) {
      const { data } = await admin.rpc('manager_email_for_lease', { p_lease_id: leaseId })
      mgrEmailCache.set(leaseId, typeof data === 'string' ? data : null)
    }
    return mgrEmailCache.get(leaseId) || undefined
  }

  // Resolve the owning landlord's white-label branding for a lease (cached per
  // run). Any lookup failure just means the stock FindStoop presentation.
  const brandCache = new Map<string, LeaseBrand | null>()
  async function brandForLease(leaseId: string | null | undefined): Promise<LeaseBrand | null> {
    if (!leaseId) return null
    if (!brandCache.has(leaseId)) {
      let brand: LeaseBrand | null = null
      try {
        const { data } = await admin
          .from('leases')
          .select('unit:units(property:properties(manager:profiles(company_name, company_logo_url, brand_color)))')
          .eq('id', leaseId)
          .maybeSingle()
        // deno-lint-ignore no-explicit-any
        const unit = data && (Array.isArray((data as any).unit) ? (data as any).unit[0] : (data as any).unit)
        const property = unit && (Array.isArray(unit.property) ? unit.property[0] : unit.property)
        const manager = property && (Array.isArray(property.manager) ? property.manager[0] : property.manager)
        if (manager) {
          brand = {
            company_name: manager.company_name ?? null,
            company_logo_url: manager.company_logo_url ?? null,
            brand_color: manager.brand_color ?? null,
          }
        }
      } catch { /* tolerate — email still sends unbranded */ }
      brandCache.set(leaseId, brand)
    }
    return brandCache.get(leaseId) ?? null
  }

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
      const amountStr = `$${Number(row.amount).toLocaleString()}`
      const dueLabel = daysBefore === 0 ? 'today' : daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`
      const result = await fireTrigger({
        triggerKey,
        userId: row.tenant_id,
        recipientEmail: row.tenant_email,
        bccEmail: await bccForLease(row.lease_id),
        brand: await brandForLease(row.lease_id),
        dedupToken: `payment:${row.payment_id}:${daysBefore}d`,
        push: {
          title: `Rent due ${dueLabel}`,
          body: `${amountStr} at ${row.property_name ?? 'your rental'} — pay online in one tap.`,
          url: '/tenant/pay-rent',
          tag: `rent-due-${row.payment_id}`,
        },
        // SMS only on the day itself — reminders shouldn't burn SMS spend.
        smsBody: daysBefore === 0
          ? `Rent reminder: ${amountStr} is due today at ${row.property_name ?? 'your rental'}. Pay online: ${APP_URL}/tenant/pay-rent`
          : undefined,
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

  // ── Lease-renewal nudges: 60d / 30d before lease end ───────────────────
  // Active leases (not already month-to-month / auto-renewing) ending in the
  // window. Nudges BOTH the manager (renew / adjust / notice) and the tenant.
  // Deduped per (trigger_key, lease + days_before).
  const tally = (o: Outcome, r: 'sent' | 'paused' | 'duplicate' | 'no_template' | 'send_failed') => {
    if (r === 'sent') o.sent++
    else if (r === 'duplicate') o.duplicate++
    else if (r === 'paused') o.paused++
    else o.failed++
  }
  // 90d opens the window for the MANAGER only (matches the renewal advisor's
  // outermost window — time to think, run the numbers, draft the offer);
  // tenants join at 60/30 so the heads-up doesn't arrive absurdly early.
  for (const daysBefore of [90, 60, 30] as const) {
    const { data: rows, error } = await admin.rpc('leases_expiring_for_renewal', { days_before: daysBefore })
    const mgr: Outcome = { triggerKey: `lease_renewal_manager_${daysBefore}d`, sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 }
    const ten: Outcome = { triggerKey: `lease_renewal_tenant_${daysBefore}d`, sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 }
    if (!error) {
      for (const row of rows ?? []) {
        const endStr = new Date(row.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        if (row.manager_email && row.manager_email_enabled !== false) {
          tally(mgr, await fireTrigger({
            triggerKey: 'lease_renewal_manager',
            userId: row.manager_id,
            recipientEmail: row.manager_email,
            dedupToken: `lease:${row.lease_id}:${daysBefore}d`,
            push: {
              title: `Lease ending in ${daysBefore} days`,
              body: `${row.tenant_name ?? 'Your tenant'} at ${row.property_name ?? 'your property'} — review renewal options.`,
              url: '/manager/leases',
              tag: `renewal-${row.lease_id}`,
            },
            templateVars: {
              first_name: (row.manager_name?.split(' ')[0]) ?? 'there',
              tenant_name: row.tenant_name ?? 'Your tenant',
              property_name: row.property_name ?? '',
              unit_number: row.unit_number ?? '',
              end_date: endStr, days_left: daysBefore,
              url: `${APP_URL}/manager/leases`,
            },
          }))
        } else mgr.skipped++
        if (daysBefore <= 60 && row.tenant_email && row.tenant_email_enabled !== false) {
          tally(ten, await fireTrigger({
            triggerKey: 'lease_renewal_tenant',
            userId: row.tenant_id,
            recipientEmail: row.tenant_email,
            bccEmail: row.manager_email || undefined,
            brand: await brandForLease(row.lease_id),
            dedupToken: `lease:${row.lease_id}:${daysBefore}d`,
            push: {
              title: `Your lease ends in ${daysBefore} days`,
              body: `Thinking about staying at ${row.property_name ?? 'your home'}? Message your landlord about renewal.`,
              url: '/tenant/messages',
              tag: `renewal-${row.lease_id}`,
            },
            templateVars: {
              first_name: (row.tenant_name?.split(' ')[0]) ?? 'there',
              tenant_name: row.tenant_name ?? '',
              property_name: row.property_name ?? '',
              unit_number: row.unit_number ?? '',
              end_date: endStr, days_left: daysBefore,
              url: `${APP_URL}/tenant/dashboard`,
            },
          }))
        } else ten.skipped++
      }
    }
    totals.push(mgr, ten)
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
        bccEmail: await bccForLease(row.lease_id),
        brand: await brandForLease(row.lease_id),
        dedupToken: `late_fee:payment:${row.payment_id}`,
        push: {
          title: 'Late fee added',
          body: `A $${feeAmount.toLocaleString()} late fee was added to your rent at ${row.property_name ?? 'your rental'}. Settle online to stop it growing.`,
          url: '/tenant/pay-rent',
          tag: `late-fee-${row.payment_id}`,
        },
        smsBody: `A $${feeAmount.toLocaleString()} late fee was added to your overdue rent at ${row.property_name ?? 'your rental'}. Pay online: ${APP_URL}/tenant/pay-rent`,
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

  // ── Autopay: off-session charge for any pending payment whose
  //    scheduled_for (or due_date) is today, for tenants with autopay on
  //    and a saved default payment method.
  let autopayAttempted = 0
  let autopayInitiated = 0
  let autopaySkipped   = 0
  let autopayFailed    = 0
  try {
    const today = new Date().toISOString().split('T')[0]
    // Find candidate payments. We pull the tenant profile inline so we can
    // see autopay_enabled + the saved PM + Stripe customer in one go.
    const { data: candidates } = await admin
      .from('payments')
      .select(`
        id, amount, tenant_id, lease_id, scheduled_for, due_date, type, initiated_at,
        tenant:profiles!payments_tenant_id_fkey(
          autopay_enabled, payment_complimentary, stripe_customer_id, stripe_default_payment_method_id,
          email, full_name
        ),
        lease:leases!payments_lease_id_fkey(
          unit:units(unit_number, property:properties(name))
        )
      `)
      .eq('status', 'pending')
      .eq('type', 'rent')
      .is('initiated_at', null)
      .or(`scheduled_for.eq.${today},and(scheduled_for.is.null,due_date.eq.${today})`)
    autopayAttempted = candidates?.length ?? 0

    for (const row of candidates ?? []) {
      const tenant = Array.isArray((row as any).tenant) ? (row as any).tenant[0] : (row as any).tenant
      if (!tenant?.autopay_enabled) { autopaySkipped++; continue }

      // Complimentary tenant — mark completed without Stripe (matches the
      // manual PayRent comp bypass).
      if (tenant.payment_complimentary) {
        await admin.from('payments').update({
          status: 'completed',
          paid_at: new Date().toISOString(),
          initiated_at: new Date().toISOString(),
          stripe_payment_id: 'comp-autopay',
        }).eq('id', row.id)
        autopayInitiated++
        continue
      }

      if (!tenant.stripe_customer_id || !tenant.stripe_default_payment_method_id) {
        autopaySkipped++
        continue
      }

      try {
        const intent = await stripe.paymentIntents.create({
          amount: Math.round(Number(row.amount) * 100),
          currency: 'usd',
          customer: tenant.stripe_customer_id,
          payment_method: tenant.stripe_default_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            findstoop_payment_id: row.id,
            findstoop_lease_id: row.lease_id,
            findstoop_tenant_id: row.tenant_id,
            findstoop_autopay: 'true',
          },
        }, {
          // Keyed on the payment row id: if the cron re-runs or is redelivered
          // before initiated_at commits, the same rent row can't be charged twice.
          idempotencyKey: `autopay:${row.id}`,
        })
        // ACH starts as 'processing'; card as 'succeeded'.
        const next =
          intent.status === 'succeeded' ? 'completed' :
          intent.status === 'processing' ? 'processing' : 'pending'
        await admin.from('payments').update({
          status: next,
          initiated_at: new Date().toISOString(),
          paid_at: intent.status === 'succeeded' ? new Date().toISOString() : null,
          stripe_payment_id: intent.id,
        }).eq('id', row.id)
        autopayInitiated++
      } catch (err) {
        // Most common: requires_action (3DS) — autopay can't proceed
        // off-session. Mark failed so the tenant gets a "Requires payment
        // setup" pill and a notification.
        await admin.from('payments').update({
          status: 'failed',
          initiated_at: new Date().toISOString(),
        }).eq('id', row.id)
        autopayFailed++
        // eslint-disable-next-line no-console
        console.warn('autopay charge failed', row.id, err instanceof Error ? err.message : err)

        // Tell the tenant — a silent autopay failure means missed rent. This
        // is a critical transactional alert, so it ignores the email-pref flag.
        if (tenant?.email) {
          const lease = Array.isArray((row as any).lease) ? (row as any).lease[0] : (row as any).lease
          const unit = lease && (Array.isArray(lease.unit) ? lease.unit[0] : lease.unit)
          const property = unit && (Array.isArray(unit.property) ? unit.property[0] : unit.property)
          await fireTrigger({
            triggerKey: 'autopay_failed',
            userId: row.tenant_id,
            recipientEmail: tenant.email,
            bccEmail: await bccForLease(row.lease_id),
            brand: await brandForLease(row.lease_id),
            // Date-stamped so a retry on a later day can re-alert if it fails again.
            dedupToken: `autopay_failed:${row.id}:${new Date().toISOString().split('T')[0]}`,
            push: {
              title: 'Your rent auto-pay didn’t go through',
              body: `$${Number(row.amount).toLocaleString()} couldn’t be charged. Update your payment method and retry.`,
              url: '/tenant/pay-rent',
              tag: `autopay-failed-${row.id}`,
            },
            smsBody: `Action needed: your $${Number(row.amount).toLocaleString()} rent auto-pay didn't go through. Update your payment method: ${APP_URL}/tenant/pay-rent`,
            templateVars: {
              first_name: (tenant.full_name?.split(' ')[0]) ?? 'there',
              amount: Number(row.amount),
              property_name: property?.name ?? 'your rental',
              unit_number: unit?.unit_number ?? '',
              pay_url: `${APP_URL}/tenant/pay-rent`,
            },
          })
        }
      }
    }
  } catch { /* tolerate single-day failures */ }

  // ── Seasonal maintenance digest: one email per manager per month ────────
  // Daily-safe: the fireTrigger dedup pre-check keys on manager+month, so
  // only the first run of each month actually sends. Tasks the manager
  // already handled (done/dismissed/delegated in seasonal_task_events)
  // drop out; managers with nothing due get no email at all.
  {
    const outcome: Outcome = { triggerKey: 'seasonal_maintenance_digest', sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 }
    try {
      const now = new Date()
      const month = now.getUTCMonth() + 1
      const year = now.getUTCFullYear()
      const occ = occurrenceKey(year, month)
      const monthLabel = now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })

      const { data: props } = await admin
        .from('properties')
        .select('id, name, state, manager_id, manager:profiles(email, full_name, notification_email_enabled)')
        .limit(2000)

      // Everything already handled this occurrence, one set lookup per task.
      const propertyIds = (props ?? []).map((p) => p.id)
      const handled = new Set<string>()
      if (propertyIds.length > 0) {
        const { data: events } = await admin
          .from('seasonal_task_events')
          .select('property_id, task_id')
          .eq('occurrence', occ)
          .in('property_id', propertyIds)
        for (const e of events ?? []) handled.add(`${e.property_id}:${e.task_id}`)
      }

      // Group per manager.
      interface MgrDigest { email: string; firstName: string; emailEnabled: boolean; properties: SeasonalDigestVars['properties'] }
      const byManager = new Map<string, MgrDigest>()
      for (const p of props ?? []) {
        // deno-lint-ignore no-explicit-any
        const manager = Array.isArray((p as any).manager) ? (p as any).manager[0] : (p as any).manager
        if (!manager?.email) continue
        const due = tasksDueThisMonth(p.state, month).filter((t) => !handled.has(`${p.id}:${t.id}`))
        if (due.length === 0) continue
        let entry = byManager.get(p.manager_id)
        if (!entry) {
          entry = {
            email: manager.email,
            firstName: (manager.full_name?.split(' ')[0]) ?? 'there',
            emailEnabled: manager.notification_email_enabled !== false,
            properties: [],
          }
          byManager.set(p.manager_id, entry)
        }
        entry.properties.push({ name: p.name ?? 'Property', tasks: due.map((t) => ({ title: t.title, who: t.who })) })
      }

      for (const [managerId, digest] of byManager) {
        if (!digest.emailEnabled) { outcome.skipped++; continue }
        const totalTasks = digest.properties.reduce((n, prop) => n + prop.tasks.length, 0)
        const result = await fireTrigger({
          triggerKey: 'seasonal_maintenance_digest',
          userId: managerId,
          recipientEmail: digest.email,
          dedupToken: `manager:${managerId}:${occ}`,
          push: {
            title: `${totalTasks} seasonal task${totalTasks === 1 ? '' : 's'} due in ${monthLabel}`,
            body: 'Small preventive jobs now beat expensive repairs later — see what protects your properties this month.',
            url: '/manager/properties',
            tag: `seasonal-${occ}`,
          },
          templateVars: {
            first_name: digest.firstName,
            month_label: monthLabel,
            total_tasks: totalTasks,
            properties: digest.properties,
            url: `${APP_URL}/manager/properties`,
          },
        })
        if (result === 'sent') outcome.sent++
        else if (result === 'duplicate') outcome.duplicate++
        else if (result === 'paused') outcome.paused++
        else outcome.failed++
      }
    } catch { /* tolerate — next month's run will try again */ }
    totals.push(outcome)
  }

  // ── Annual portfolio physical nudge: each January, one per manager ──────
  // Dedup keys on the year, so daily runs through January send exactly once.
  {
    const outcome: Outcome = { triggerKey: 'annual_physical_ready', sent: 0, duplicate: 0, paused: 0, failed: 0, skipped: 0 }
    try {
      const now = new Date()
      if (now.getUTCMonth() === 0) { // January
        const yearLabel = String(now.getUTCFullYear() - 1)
        const { data: owners } = await admin
          .from('properties')
          .select('manager_id, manager:profiles(email, full_name, notification_email_enabled)')
          .limit(2000)
        const seen = new Set<string>()
        for (const p of owners ?? []) {
          if (seen.has(p.manager_id)) continue
          seen.add(p.manager_id)
          // deno-lint-ignore no-explicit-any
          const manager = Array.isArray((p as any).manager) ? (p as any).manager[0] : (p as any).manager
          if (!manager?.email || manager.notification_email_enabled === false) { outcome.skipped++; continue }
          const result = await fireTrigger({
            triggerKey: 'annual_physical_ready',
            userId: p.manager_id,
            recipientEmail: manager.email,
            dedupToken: `manager:${p.manager_id}:${yearLabel}`,
            push: {
              title: `Your ${yearLabel} portfolio physical is ready`,
              body: 'A year of numbers, summarized like a part-time CFO would — rent drift, expenses, deposits, collections.',
              url: '/manager/portfolio-physical',
              tag: `annual-physical-${yearLabel}`,
            },
            templateVars: {
              first_name: (manager.full_name?.split(' ')[0]) ?? 'there',
              year_label: yearLabel,
              url: `${APP_URL}/manager/portfolio-physical`,
            },
          })
          if (result === 'sent') outcome.sent++
          else if (result === 'duplicate') outcome.duplicate++
          else if (result === 'paused') outcome.paused++
          else outcome.failed++
        }
      }
    } catch { /* tolerate — every January day retries */ }
    totals.push(outcome)
  }

  // ── Chat image purge: drop attachments older than 12 months ─────────────
  // Messages themselves stay; we just NULL out image_url/image_path and stamp
  // image_purged_at so the UI shows "Image expired (older than 12 months)".
  let imagesPurged: number | null = null
  try {
    const { data } = await admin.rpc('purge_expired_chat_images')
    imagesPurged = typeof data === 'number' ? data : Number(data ?? 0)
  } catch { /* swallow — cron tolerates one-off failures */ }

  // ── Month-to-month lifecycle ────────────────────────────────────────────
  // Two sweeps, both keyed on leases.auto_renew_month_to_month = true:
  //   A. Activation: leases whose end_date has just passed but haven't been
  //      flipped to M2M yet → set month_to_month=true.
  //   B. Payment topup: for every active+M2M lease (whether just-flipped or
  //      already rolling), make sure the next 2 monthly rent payments are
  //      queued in `payments`. Idempotent — ON CONFLICT (lease_id, due_date)
  //      keeps duplicates from being created.
  const todayIso = new Date().toISOString().slice(0, 10)
  let m2mActivated = 0
  let m2mPaymentsQueued = 0
  try {
    // Sweep A — flip to M2M
    const { data: toFlip } = await admin
      .from('leases')
      .select('id')
      .eq('status', 'active')
      .eq('auto_renew_month_to_month', true)
      .eq('month_to_month', false)
      .lt('end_date', todayIso)
    for (const row of (toFlip ?? []) as Array<{ id: string }>) {
      const { error: flipErr } = await admin
        .from('leases')
        .update({ month_to_month: true })
        .eq('id', row.id)
      if (!flipErr) m2mActivated++
    }

    // Sweep B — top up next 2 months of rent payments for any active M2M
    // lease with auto_renew on. Limit to a sensible batch so a single cron
    // run can't go runaway if the user has thousands of these.
    const { data: m2mLeases } = await admin
      .from('leases')
      .select('id, tenant_id, rent_amount, payment_due_day, end_date')
      .eq('status', 'active')
      .eq('auto_renew_month_to_month', true)
      .eq('month_to_month', true)
      .limit(500)

    for (const lease of (m2mLeases ?? []) as Array<{
      id: string; tenant_id: string; rent_amount: number;
      payment_due_day: number | null; end_date: string
    }>) {
      // Find the most-recent due_date on this lease so we know where to
      // continue from. If somehow none exists, start at the original end_date.
      const { data: latest } = await admin
        .from('payments')
        .select('due_date')
        .eq('lease_id', lease.id)
        .eq('type', 'rent')
        .order('due_date', { ascending: false })
        .limit(1)
      const lastDueIso = (latest?.[0]?.due_date as string | undefined) ?? lease.end_date
      const dueDay = Math.min(28, Math.max(1, lease.payment_due_day ?? 1))

      // Queue up the next two months from lastDue, but cap at 60 days ahead
      // of today so we don't pre-generate years of payments on a long-lived
      // M2M tenancy.
      const horizon = new Date(); horizon.setUTCDate(horizon.getUTCDate() + 60)
      let cursor = new Date(lastDueIso + 'T00:00:00Z')
      for (let i = 0; i < 2; i++) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
        cursor.setUTCDate(dueDay)
        if (cursor > horizon) break
        const dueIso = cursor.toISOString().slice(0, 10)
        const { error: insErr } = await admin.from('payments').insert({
          lease_id: lease.id,
          tenant_id: lease.tenant_id,
          amount: lease.rent_amount,
          type: 'rent',
          status: 'pending',
          due_date: dueIso,
        })
        // Unique constraint (lease_id, due_date) WHERE type='rent' silently
        // rejects duplicates — only count true new inserts.
        if (!insErr) m2mPaymentsQueued++
      }
    }
  } catch { /* swallow — cron tolerates one-off failures */ }

  return new Response(JSON.stringify({
    ok: true,
    totals,
    imagesPurged,
    autopay: { attempted: autopayAttempted, initiated: autopayInitiated, skipped: autopaySkipped, failed: autopayFailed },
    monthToMonth: { activated: m2mActivated, payments_queued: m2mPaymentsQueued },
    ran_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

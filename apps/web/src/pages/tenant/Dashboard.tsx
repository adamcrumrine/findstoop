import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import { formatUsd, formatUsdCents, formatLocalDate } from '@findstoop/shared/lib/format'
import { supabase } from '../../lib/supabase'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import type { Lease } from '@findstoop/shared/types/lease'
import { MessageSquare, ChevronRight, Home as HomeIcon, CreditCard, Wrench, CheckCircle2, Circle, GraduationCap, CalendarClock, Landmark, FileSignature } from 'lucide-react'
import toast from 'react-hot-toast'
import { withdrawalDate, isAch } from '@findstoop/shared/lib/paymentSchedule'
import EmptyIllustration from '../../components/shared/EmptyIllustration'
import { useTenantBadges } from '@findstoop/shared/hooks/useTenantBadges'
import { renewalWindow, depositMirror, type DepositMirrorInfo } from '../../lib/tenantMilestones'
import { deadlineUrgency } from '../../lib/depositReturn'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ''}`} />
}

// Tenant-friendly status mapping. The DB has 'pending' | 'completed' | 'failed';
// the tenant view should show: Paid (green), Upcoming (brand), Scheduled (brand
// — autopay placeholder), Requires payment setup (red), Past due (red).
// If the tenant has NEVER attached a payment method, "Requires payment setup"
// trumps everything but Paid.
function tenantStatus(p: Payment, paymentMethodSetup: boolean, autopayOn: boolean): { label: string; cls: string } {
  if (p.status === 'completed')  return { label: 'Paid', cls: 'text-blue-700 bg-blue-50 border-blue-200' }
  if (p.status === 'processing') return { label: 'Processing', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (!paymentMethodSetup)       return { label: 'Requires payment setup', cls: 'text-red-700 bg-red-50 border-red-200' }
  if (p.status === 'failed')     return { label: 'Requires payment setup', cls: 'text-red-700 bg-red-50 border-red-200' }
  const anchor = (p as Payment & { scheduled_for?: string | null }).scheduled_for ?? p.due_date
  if (anchor) {
    const today = new Date(); today.setHours(0,0,0,0)
    const due = new Date(anchor); due.setHours(0,0,0,0)
    if (due.getTime() < today.getTime()) {
      return { label: 'Past due', cls: 'text-red-700 bg-red-50 border-red-200' }
    }
  }
  // Autopay is going to pull this automatically — call it "Scheduled" with
  // the brand green pill. Without autopay it's the tenant's responsibility,
  // so use a neutral gray "Upcoming" pill so they notice action is needed.
  if (autopayOn) return { label: 'Scheduled', cls: 'text-brand-700 bg-brand-50 border-brand-200' }
  return { label: 'Upcoming', cls: 'text-gray-600 bg-gray-100 border-gray-200' }
}

function PaymentRow({ payment, paymentMethodSetup, autopayOn }: { payment: Payment; paymentMethodSetup: boolean; autopayOn: boolean }) {
  const status = tenantStatus(payment, paymentMethodSetup, autopayOn)
  const date = payment.paid_at ?? payment.due_date ?? payment.created_at
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace(/_/g, ' ')}</p>
        <p className="text-xs text-gray-500">{formatLocalDate(date)}</p>
        {payment.memo && <p className="text-xs text-gray-500 mt-0.5 italic truncate">{payment.memo}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-gray-800">{formatUsdCents(Number(payment.amount))}</p>
        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mt-0.5 ${status.cls}`}>
          {status.label}
        </span>
      </div>
    </div>
  )
}

function MaintenanceRow({ request }: { request: MaintenanceRequest }) {
  const priorityColor =
    request.priority === 'emergency' ? 'bg-red-100 text-red-700' :
    request.priority === 'high'      ? 'bg-orange-100 text-orange-700' :
    request.priority === 'medium'    ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'
  const statusColor =
    request.status === 'resolved' || request.status === 'closed' ? 'bg-green-100 text-green-700' :
    request.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-600'
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0 gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{request.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{new Date(request.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
          {request.status.replace('_', ' ')}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor}`}>
          {request.priority}
        </span>
      </div>
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${className ?? ''}`}>
      {children}
    </div>
  )
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</h2>
    </div>
  )
}

// Onboarding checklist — guides a new tenant through the steps to be fully set
// up. Computed entirely from the lease + payment flags already loaded, so no
// extra queries. Hides itself once every REQUIRED step is done (auto-pay is an
// optional nudge that never keeps the card alive on its own).
function SetupChecklist({ lease, paymentMethodSetup, autopayEnabled }: {
  lease: Lease; paymentMethodSetup: boolean; autopayEnabled: boolean
}) {
  const navigate = useNavigate()
  interface Step { key: string; label: string; done: boolean; to: string; required: boolean; show: boolean }
  const steps: Step[] = [
    { key: 'sign',     label: 'Sign your lease',             done: !!lease.signed_at, to: `/tenant/sign-lease/${lease.id}`, required: true,  show: true },
    { key: 'payment',  label: 'Add a payment method',        done: paymentMethodSetup, to: '/tenant/pay-rent',              required: true,  show: true },
    { key: 'docs',     label: 'Review documents & disclosures', done: false,           to: '/tenant/documents',             required: false, show: true },
    { key: 'autopay',  label: 'Turn on auto-pay (optional)', done: autopayEnabled,    to: '/tenant/pay-rent',               required: false, show: paymentMethodSetup },
  ]
  const shown = steps.filter((s) => s.show)
  const required = shown.filter((s) => s.required)
  const requiredDone = required.filter((s) => s.done).length
  if (requiredDone === required.length) return null // fully set up

  const next = shown.find((s) => !s.done)
  const pct = Math.round((requiredDone / required.length) * 100)

  return (
    <div className="bg-white rounded-2xl border border-brand-200 shadow-[0_0_0_4px_rgba(0,168,150,0.06)] overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">Get set up</h2>
          <span className="text-xs font-semibold text-brand-700">{requiredDone} of {required.length}</span>
        </div>
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="px-2 pb-2">
        {shown.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => !s.done && navigate(s.to)}
              disabled={s.done}
              className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left ${s.done ? 'cursor-default' : 'hover:bg-gray-50'}`}
            >
              {s.done
                ? <CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" strokeWidth={2} />
                : <Circle className="w-5 h-5 text-gray-300 shrink-0" strokeWidth={2} />}
              <span className={`flex-1 text-sm ${s.done ? 'text-mute line-through' : 'text-ink font-medium'}`}>{s.label}</span>
              {!s.done && <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />}
            </button>
          </li>
        ))}
      </ul>
      {next && (
        <div className="px-4 pb-4">
          <button
            onClick={() => navigate(next.to)}
            className="w-full py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            {next.label.replace(' (optional)', '')}
          </button>
        </div>
      )}
    </div>
  )
}

// Deposit-return mirror data source: the tenant's most recently ENDED lease.
// Only consulted when there's no active lease — if the tenant renewed, the
// deposit rolls to the new tenancy and a "return" card would be wrong.
function useDepositMirror(tenantId: string | undefined, hasActiveLease: boolean, dashboardLoading: boolean): DepositMirrorInfo | null {
  const [mirror, setMirror] = useState<DepositMirrorInfo | null>(null)
  useEffect(() => {
    if (!tenantId || hasActiveLease || dashboardLoading) { setMirror(null); return }
    let cancelled = false
    const todayIso = new Date().toISOString().slice(0, 10)
    supabase
      .from('leases')
      .select('end_date, security_deposit, pet_deposit, unit:units(properties(state))')
      .eq('tenant_id', tenantId)
      .lte('end_date', todayIso)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const row = data as unknown as {
          end_date: string | null
          security_deposit: number | null
          pet_deposit: number | null
          unit: { properties: { state: string | null } | null } | null
        }
        setMirror(depositMirror(row, row.unit?.properties?.state, todayIso))
      })
    return () => { cancelled = true }
  }, [tenantId, hasActiveLease, dashboardLoading])
  return mirror
}

export default function TenantDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { lease, nextPayment, upcomingPayments, recentPayments, recentMaintenance, unreadMessages, paymentMethodSetup, autopayEnabled, loading, error } =
    useTenantDashboard(profile?.id)
  const badges = useTenantBadges(profile?.id)
  const [autopayLocal, setAutopayLocal] = useState<boolean | null>(null)
  const [cancellingAutopay, setCancellingAutopay] = useState(false)
  const autopayOn = autopayLocal ?? autopayEnabled
  const [savedRail, setSavedRail] = useState<'card' | 'us_bank_account' | null>(null)
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('profiles')
      .select('stripe_default_pm_type, payment_complimentary')
      .eq('id', profile.id).maybeSingle()
      .then(({ data }) => {
        const row = data as { stripe_default_pm_type?: string | null; payment_complimentary?: boolean } | null
        const t = row?.stripe_default_pm_type ?? null
        setSavedRail(t === 'card' || t === 'us_bank_account' ? t : null)
      })
  }, [profile?.id])

  const cancelAutopay = async () => {
    if (!profile?.id || cancellingAutopay) return
    setCancellingAutopay(true)
    setAutopayLocal(false)
    const { error: e } = await supabase.from('profiles').update({ autopay_enabled: false }).eq('id', profile.id)
    setCancellingAutopay(false)
    if (e) {
      setAutopayLocal(true)
      toast.error(e.message)
    } else {
      toast.success('Auto-pay turned off')
    }
  }

  const enableAutopay = async () => {
    if (!profile?.id || cancellingAutopay) return
    if (!paymentMethodSetup) {
      navigate('/tenant/pay-rent')
      return
    }
    setCancellingAutopay(true)
    setAutopayLocal(true)
    const { error: e } = await supabase.from('profiles').update({ autopay_enabled: true }).eq('id', profile.id)
    setCancellingAutopay(false)
    if (e) {
      setAutopayLocal(false)
      toast.error(e.message)
    } else {
      const payOnIso = nextPayment ? ((nextPayment as Payment & { scheduled_for?: string | null }).scheduled_for ?? nextPayment.due_date) : null
      if (payOnIso) {
        const payOn = new Date(payOnIso + 'T00:00:00').toLocaleDateString()
        const ach = isAch(savedRail)
        const withdraw = ach ? withdrawalDate(payOnIso, savedRail).toLocaleDateString() : null
        toast.success(`Auto-pay on — funds to landlord by ${payOn}${withdraw ? `. Withdrawal: ${withdraw}.` : '.'} Use the date picker on Pay Rent to shift ±7 days.`)
      } else {
        toast.success('Auto-pay turned on')
      }
    }
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  // Failed-payment recovery: show a prominent banner when the most recent
  // payment activity is a failure (autopay decline, or an ACH that bounced
  // days later and was flipped to 'failed' by the Stripe webhook). Catches
  // every failure source since it keys off status, not how it failed.
  const lastAttempt = recentPayments[0]
  const failedPayment =
    nextPayment?.status === 'failed' ? nextPayment :
    lastAttempt?.status === 'failed' ? lastAttempt : null

  const daysUntilDue = nextPayment?.due_date
    ? Math.ceil((new Date(nextPayment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  // Urgency tint precedence:
  //   • No payment method → red (trumps everything)
  //   • > 7 days past due → red
  //   • 0–7 days past due → burnt orange
  //   • Otherwise:
  //       autopay ON  → filled Stoop brand green
  //       autopay OFF → soft / white card with brand-green ring (ghost state)
  const daysOverdue = daysUntilDue !== null && daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0
  const rentUrgency =
    !paymentMethodSetup ? 'red' :
    daysOverdue > 7     ? 'red' :
    daysOverdue > 0     ? 'orange' :
    autopayOn           ? 'brand' : 'ghost'

  const urgencyStyles = {
    brand:  {
      card:   'bg-brand-600',
      text:   'text-brand-50',
      amount: 'text-white',
      btn:    'bg-white text-brand-700 hover:bg-brand-50',
      label:  'text-white/80',
      pillBg: 'bg-white/15',
    },
    ghost:  {
      card:   'bg-white border-2 border-brand-300 shadow-[0_0_0_4px_rgba(0,168,150,0.12)]',
      text:   'text-mute',
      amount: 'text-ink',
      btn:    'bg-brand-600 text-white hover:bg-brand-700',
      label:  'text-mute',
      pillBg: 'bg-brand-50',
    },
    orange: {
      card:   'bg-orange-500',
      text:   'text-orange-50',
      amount: 'text-white',
      btn:    'bg-white text-orange-700 hover:bg-orange-50',
      label:  'text-orange-50/80',
      pillBg: 'bg-white/15',
    },
    red:    {
      card:   'bg-red-600',
      text:   'text-red-100',
      amount: 'text-white',
      btn:    'bg-white text-red-700 hover:bg-red-50',
      label:  'text-red-100/80',
      pillBg: 'bg-white/15',
    },
  } as const
  const s = urgencyStyles[rentUrgency]
  const onGhost = rentUrgency === 'ghost'

  // Lease milestones — renewal window on the active lease; deposit-return
  // mirror on the most recent ended lease (only when nothing is active).
  const todayIso = new Date().toISOString().slice(0, 10)
  const renewal = !loading && lease ? renewalWindow(lease, todayIso) : null
  const deposit = useDepositMirror(profile?.id, !!lease, loading)

  // "All set" — nothing on the home screen needs the tenant's attention.
  // Mirrors the individual cards' own visibility rules.
  const setupDone = !!lease?.signed_at && paymentMethodSetup
  const allSet =
    !loading && !!lease && !failedPayment && setupDone &&
    unreadMessages === 0 && !badges.documents && daysOverdue === 0

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-medium">Failed to load dashboard</p>
        <p className="text-red-500 text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Greeting */}
      <div className="pt-1">
        <h1 className="text-2xl font-bold text-gray-900">Hi, {firstName}!</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {allSet
            ? 'You’re all set — nothing needs your attention right now.'
            : 'Welcome to your home portal.'}
        </p>
      </div>

      {/* Failed-payment recovery banner — highest priority after greeting. */}
      {!loading && failedPayment && (
        <button
          onClick={() => navigate('/tenant/pay-rent')}
          className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-red-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-red-700 shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-900">A recent payment didn't go through</p>
              <p className="text-xs text-red-700">
                {formatUsdCents(Number(failedPayment.amount))} couldn't be processed. Update your payment method and try again.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-red-600 shrink-0" strokeWidth={2} />
        </button>
      )}

      {/* New document waiting — signature requests and disclosures shouldn't
          hide behind a nav dot. Clears via documents_seen_at when visited. */}
      {!loading && badges.documents && (
        <button
          onClick={() => navigate('/tenant/documents')}
          className="w-full bg-brand-50 border border-brand-200 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-brand-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <FileSignature className="w-5 h-5 text-brand-700 shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-900">A new document is ready</p>
              <p className="text-xs text-brand-700">Your landlord added something to Documents — it may need your signature.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-brand-600 shrink-0" strokeWidth={2} />
        </button>
      )}

      {/* Deposit-return mirror — after move-out, where the deposit stands and
          when the itemized statement is legally due. Facts with citations. */}
      {deposit && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 inline-flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                Your {formatUsd(deposit.depositHeld)} deposit
              </p>
              {deposit.deadline ? (
                deposit.daysToDeadline !== null && deadlineUrgency(deposit.daysToDeadline) === 'overdue' ? (
                  <p className="text-xs text-red-700 mt-0.5 font-medium">
                    The itemized statement was due {formatLocalDate(deposit.deadline)} — it hasn’t arrived in Documents.
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 mt-0.5">
                    Itemized statement due by <span className="font-medium">{formatLocalDate(deposit.deadline)}</span>
                    {deposit.daysToDeadline !== null && ` — ${deposit.daysToDeadline} day${deposit.daysToDeadline === 1 ? '' : 's'} away`}.
                  </p>
                )
              ) : (
                <p className="text-xs text-gray-600 mt-0.5">
                  Moved out {formatLocalDate(deposit.moveOutDate)} — your deposit statement will arrive in Documents.
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-1.5">{deposit.ruleNote} This is general information, not legal advice.</p>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding checklist — sign lease, disclosures, payment, insurance, autopay.
          Hides itself once all required steps are done. */}
      {!loading && lease && (
        <SetupChecklist lease={lease} paymentMethodSetup={paymentMethodSetup} autopayEnabled={autopayEnabled} />
      )}

      {/* Renter resources — only when the landlord enabled student-housing mode. */}
      {!loading && lease?.unit?.properties?.student_housing && (
        <button
          onClick={() => navigate('/tenant/resources')}
          className="w-full bg-brand-50 border border-brand-200 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-brand-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <GraduationCap className="w-5 h-5 text-brand-700 shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-900">Renter resources</p>
              <p className="text-xs text-brand-700">Understand your lease, know your rights, and protect your deposit.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-brand-600 shrink-0" strokeWidth={2} />
        </button>
      )}

      {/* Rent CTA card */}
      {loading ? (
        <Skeleton className="h-44" />
      ) : (
        <div className={`relative rounded-2xl p-5 ${s.card}`}>
          {/* Auto-pay toggle in the top-right of the card (only when a
              payment method is on file — toggling without one makes no sense). */}
          {paymentMethodSetup && nextPayment && (
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${s.text}`}>Auto-pay</span>
              <button
                type="button"
                onClick={() => (autopayOn ? cancelAutopay() : enableAutopay())}
                disabled={cancellingAutopay}
                aria-pressed={autopayOn}
                className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${
                  autopayOn
                    ? (onGhost ? 'bg-brand-500' : 'bg-white/90')
                    : (onGhost ? 'bg-gray-300' : 'bg-white/30')
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow transition-transform ${
                    autopayOn
                      ? (onGhost ? 'bg-white translate-x-5' : 'bg-brand-600 translate-x-5')
                      : (onGhost ? 'bg-white' : 'bg-gray-400')
                  }`}
                />
              </button>
            </div>
          )}

          <p className={`text-sm font-medium ${s.text}`}>
            {!paymentMethodSetup
              ? 'Payment method required'
              : nextPayment
                ? daysUntilDue !== null && daysUntilDue < 0
                  ? 'Payment overdue'
                  : `Due ${nextPayment.due_date ? formatLocalDate(nextPayment.due_date) : 'soon'}`
                : 'No payment due'}
          </p>
          <p className={`text-4xl font-bold mt-1 ${s.amount}`}>
            {nextPayment ? formatUsdCents(Number(nextPayment.amount)) : '—'}
          </p>
          <p className={`text-sm mt-1 ${s.text}`}>
            {!paymentMethodSetup
              ? 'Add a card or bank account to get started'
              : daysUntilDue !== null
                ? daysUntilDue < 0
                  ? `${Math.abs(daysUntilDue)} days overdue`
                  : daysUntilDue === 0
                  ? 'Due today'
                  : `${daysUntilDue} days remaining`
                : 'All payments up to date'}
          </p>
          {paymentMethodSetup && autopayOn && nextPayment && (() => {
            const payOnIso = (nextPayment as Payment & { scheduled_for?: string | null }).scheduled_for ?? nextPayment.due_date
            if (!payOnIso) return null
            const overdue = daysUntilDue !== null && daysUntilDue < 0
            // Overdue path — the "Funds to your landlord by [past date]"
            // / "Withdrawn from your bank on [past date]" copy doesn't
            // make sense once the dates are in the past. Show an
            // overdue-aware message instead and prompt them to retry
            // on the Pay Rent screen.
            if (overdue) {
              return (
                <div className={`text-xs mt-3 ${s.text} ${s.pillBg} rounded-md px-2 py-1 inline-flex flex-col items-start`}>
                  <span>Auto-pay was scheduled for {formatLocalDate(payOnIso)}</span>
                  <span className="opacity-80">Update your payment method or retry from Pay Rent.</span>
                </div>
              )
            }
            const payOn = formatLocalDate(payOnIso)
            const ach = isAch(savedRail)
            const withdraw = ach ? withdrawalDate(payOnIso, savedRail).toLocaleDateString() : null
            return (
              <div className={`text-xs mt-3 ${s.text} ${s.pillBg} rounded-md px-2 py-1 inline-flex flex-col items-start`}>
                <span>Funds to your landlord by {payOn}</span>
                {ach && withdraw && (
                  <span className="opacity-80">Withdrawn from your bank on {withdraw}</span>
                )}
              </div>
            )
          })()}
          <button
            onClick={() => navigate('/tenant/pay-rent')}
            className={`mt-4 w-full py-3 rounded-xl font-semibold text-sm transition-colors ${s.btn}`}
          >
            {!paymentMethodSetup ? 'Setup payment' :
              autopayOn && nextPayment ? 'Make a one-time payment' :
              (nextPayment ? 'Pay Now' : 'View Payments')}
          </button>
        </div>
      )}

      {/* Renewal window — the tenant-side mirror of the manager's renewal
          advisor: same 90-day window, so both parties see the milestone at
          the same time. Urgency steps up in the final month. */}
      {renewal && (
        <button
          onClick={() => navigate('/tenant/messages')}
          className={`w-full rounded-2xl px-4 py-3 flex items-center justify-between transition-colors text-left border ${
            renewal.phase === 'imminent'
              ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
              : 'bg-brand-50 border-brand-200 hover:bg-brand-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <CalendarClock
              className={`w-5 h-5 shrink-0 ${renewal.phase === 'imminent' ? 'text-amber-700' : 'text-brand-700'}`}
              strokeWidth={1.75}
            />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${renewal.phase === 'imminent' ? 'text-amber-900' : 'text-brand-900'}`}>
                Your lease ends {formatLocalDate(renewal.endDate)}
                {renewal.daysLeft > 0 && ` — ${renewal.daysLeft} day${renewal.daysLeft === 1 ? '' : 's'} left`}
              </p>
              <p className={`text-xs ${renewal.phase === 'imminent' ? 'text-amber-700' : 'text-brand-700'}`}>
                Thinking about staying? Message your landlord to talk renewal options.
              </p>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 shrink-0 ${renewal.phase === 'imminent' ? 'text-amber-600' : 'text-brand-600'}`} strokeWidth={2} />
        </button>
      )}

      {/* Lease + property summary */}
      <Card>
        <CardHeader title="Your home" />
        <div className="px-4 py-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : lease ? (
            <>
              {(lease.unit?.properties?.name || lease.unit?.properties?.address) && (
                <div className="flex items-start gap-3 pb-3 mb-3 border-b border-gray-100">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 inline-flex items-center justify-center shrink-0">
                    <HomeIcon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {lease.unit?.properties?.name ?? 'Property'}
                      {lease.unit?.unit_number && <span className="text-gray-500 font-normal"> · Unit {lease.unit.unit_number}</span>}
                    </p>
                    {lease.unit?.properties?.address && (
                      <p className="text-xs text-gray-500 truncate">
                        {lease.unit.properties.address}
                        {lease.unit.properties.city && `, ${lease.unit.properties.city}`}
                        {lease.unit.properties.state && `, ${lease.unit.properties.state}`}
                        {lease.unit.properties.zip && ` ${lease.unit.properties.zip}`}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Start</p>
                  <p className="font-medium text-gray-800 mt-0.5">{formatLocalDate(lease.start_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">End</p>
                  <p className="font-medium text-gray-800 mt-0.5">{formatLocalDate(lease.end_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Monthly Rent</p>
                  <p className="font-medium text-gray-800 mt-0.5">{formatUsd(Number(lease.rent_amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                  <span className="inline-block bg-brand-50 text-brand-700 border border-brand-200 text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 capitalize">
                    {lease.status}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 py-3 text-center">No active lease found</p>
          )}
        </div>
      </Card>

      {/* Messages badge */}
      {!loading && unreadMessages > 0 && (
        <button
          onClick={() => navigate('/tenant/messages')}
          className="w-full bg-brand-50 border border-brand-200 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-brand-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-brand-700" strokeWidth={1.75} />
            <div className="text-left">
              <p className="text-sm font-semibold text-brand-700">New messages</p>
              <p className="text-xs text-brand-500">You have {unreadMessages} unread message{unreadMessages > 1 ? 's' : ''}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-brand-400" strokeWidth={2} />
        </button>
      )}

      {/* Upcoming payments — only when there are any */}
      {!loading && upcomingPayments.length > 0 && (
        <Card>
          <CardHeader title="Upcoming Payments" />
          <div className="px-4">
            {upcomingPayments.map((p) => (
              <PaymentRow key={p.id} payment={p} paymentMethodSetup={paymentMethodSetup} autopayOn={autopayOn} />
            ))}
          </div>
        </Card>
      )}

      {/* Payment history — only completed/failed attempts */}
      <Card>
        <CardHeader title="Payment History" />
        <div className="px-4">
          {loading ? (
            <div className="py-3 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : recentPayments.length === 0 ? (
            <EmptyIllustration name="payments" Fallback={CreditCard} title="No payments yet" subtitle="Your payment history will appear here." size="md" />
          ) : (
            recentPayments.map((p) => (
              <PaymentRow key={p.id} payment={p} paymentMethodSetup={paymentMethodSetup} autopayOn={autopayOn} />
            ))
          )}
        </div>
      </Card>

      {/* Maintenance */}
      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Maintenance</h2>
          <button
            onClick={() => navigate('/tenant/maintenance')}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            + New request
          </button>
        </div>
        <div className="px-4">
          {loading ? (
            <div className="py-3 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : recentMaintenance.length === 0 ? (
            <EmptyIllustration name="maintenance" Fallback={Wrench} title="No maintenance requests" subtitle="Things are smooth on your end. File one from the Maintenance tab if something needs attention." size="md" />
          ) : (
            recentMaintenance.map((r) => <MaintenanceRow key={r.id} request={r} />)
          )}
        </div>
      </Card>
    </div>
  )
}

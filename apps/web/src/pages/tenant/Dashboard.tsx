import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import { formatUsd, formatUsdCents } from '@findstoop/shared/lib/format'
import { supabase } from '../../lib/supabase'
import type { Payment } from '@findstoop/shared/types/payment'
import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import { MessageSquare, ChevronRight, FileSignature, Home as HomeIcon, CreditCard, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { withdrawalDate, isAch } from '@findstoop/shared/lib/paymentSchedule'
import EmptyIllustration from '../../components/shared/EmptyIllustration'

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
        <p className="text-xs text-gray-500">{new Date(date).toLocaleDateString()}</p>
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

export default function TenantDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { lease, nextPayment, upcomingPayments, recentPayments, recentMaintenance, unreadMessages, paymentMethodSetup, autopayEnabled, loading, error } =
    useTenantDashboard(profile?.id)
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

  const daysUntilDue = nextPayment?.due_date
    ? Math.ceil((new Date(nextPayment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  // Urgency tint precedence:
  //   • No payment method → red (trumps everything)
  //   • > 7 days past due → red
  //   • 0–7 days past due → burnt orange
  //   • Otherwise:
  //       autopay ON  → filled FindStoop brand green
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
        <p className="text-gray-500 text-sm mt-0.5">Welcome to your home portal.</p>
      </div>

      {/* Lease awaiting signature */}
      {!loading && lease && !lease.signed_at && (
        <button
          onClick={() => navigate(`/tenant/sign-lease/${lease.id}`)}
          className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-amber-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <FileSignature className="w-5 h-5 text-amber-700" strokeWidth={1.75} />
            <div>
              <p className="text-sm font-semibold text-amber-900">Your lease is ready to sign</p>
              <p className="text-xs text-amber-700">Review the terms and add your signature.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-600" strokeWidth={2} />
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
                  : `Due ${nextPayment.due_date ? new Date(nextPayment.due_date).toLocaleDateString() : 'soon'}`
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
            const payOn = new Date(payOnIso + 'T00:00:00').toLocaleDateString()
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
                  <p className="font-medium text-gray-800 mt-0.5">{new Date(lease.start_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">End</p>
                  <p className="font-medium text-gray-800 mt-0.5">{new Date(lease.end_date).toLocaleDateString()}</p>
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

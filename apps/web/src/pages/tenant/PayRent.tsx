import { useState, useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import { getTenantPayments } from '@findstoop/shared/api/payments'
import { formatUsdCents } from '@findstoop/shared/lib/format'
import { supabase } from '../../lib/supabase'
import type { Payment } from '@findstoop/shared/types/payment'
import type { Lease } from '@findstoop/shared/types/lease'
import { CheckCircle2, Landmark, CreditCard as CardIcon, ShieldCheck } from 'lucide-react'
import PaymentMethodCard from '../../components/tenant/PaymentMethodCard'
import EmptyIllustration from '../../components/shared/EmptyIllustration'
import Dialog from '../../components/shared/Dialog'
import { withdrawalDate, isAch } from '@findstoop/shared/lib/paymentSchedule'
import { CARD_SURCHARGE_PCT, cardSurcharge } from '@findstoop/shared/lib/billing'
import { BRAND, brandColor } from '../../lib/brand'
import { useLandlordBranding } from '../../hooks/useLandlordBranding'

type PayMethod = 'us_bank_account' | 'card'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ''}`} />
}

// ── "My monthly amount" — self-serve leases only ────────────────────────────
// The landlord sets the unit's total; roommates divide it between themselves.
// Saving re-prices only THIS tenant's unpaid future rent rows (set_my_rent_share
// is SECURITY DEFINER and scoped to auth.uid()), so nobody else's amount moves
// and paid months are untouched. The house's coverage against the unit total is
// shown so a shortfall is visible to whoever is looking.
function MyShareEditor({ leaseId, currentAmount, isGhost }: { leaseId: string; currentAmount: number; isGhost: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(currentAmount ? String(currentAmount) : '')
  const [saving, setSaving] = useState(false)
  const [coverage, setCoverage] = useState<{ unit_total: number; allocated: number; shortfall: number } | null>(null)

  const loadCoverage = async () => {
    const due = new Date(); due.setDate(1)
    const iso = due.toISOString().slice(0, 10)
    const { data } = await supabase.rpc('lease_month_coverage', { p_lease_id: leaseId, p_due_date: iso })
    const row = Array.isArray(data) ? data[0] : data
    if (row) setCoverage({ unit_total: Number(row.unit_total), allocated: Number(row.allocated), shortfall: Number(row.shortfall) })
  }

  const save = async () => {
    const amount = value.trim() === '' ? null : Number(value)
    if (amount != null && (Number.isNaN(amount) || amount < 0)) {
      toast.error('Enter a valid amount')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('set_my_rent_share', { p_lease_id: leaseId, p_amount: amount })
      if (error) throw new Error(error.message)
      toast.success(amount == null ? 'Back to an even share' : 'Your monthly amount is updated')
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update your amount')
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); void loadCoverage() }}
        className={`mt-3 text-xs font-medium underline underline-offset-2 ${isGhost ? 'text-brand-700' : 'text-white/90'}`}
      >
        Change my monthly amount
      </button>
    )
  }

  return (
    <div className="mt-3 bg-white rounded-xl border border-gray-200 p-3 text-left">
      <p className="text-xs font-semibold text-ink">Your share of the rent</p>
      <p className="text-[11px] text-mute mt-0.5 leading-relaxed">
        Your house splits the rent between yourselves. Set what you pay each month —
        this only changes your amount, not your roommates'.
      </p>
      {coverage && (
        <p className={`text-[11px] mt-1.5 ${coverage.shortfall > 0 ? 'text-amber-800' : 'text-mute'}`}>
          This month your house covers {formatUsdCents(coverage.allocated)} of {formatUsdCents(coverage.unit_total)}
          {coverage.shortfall > 0 && ` — ${formatUsdCents(coverage.shortfall)} still unassigned.`}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <input
          type="number" inputMode="decimal" min="0" step="0.01"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Leave blank for an even share"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button" onClick={save} disabled={saving}
          className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-sm text-mute hover:text-ink">
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-mute mt-1.5">
        Applies to upcoming months. Anything already paid stays as it was.
      </p>
    </div>
  )
}

// ── Checkout form (inside Elements) ──────────────────────────────────────────
interface CheckoutFormProps {
  rentAmount: number   // base rent — what gets recorded in payments table
  chargeAmount: number // what Stripe is actually charging (rent + surcharge if card)
  surcharge: number    // surcharge component (0 for ACH)
  method: PayMethod
  tenantId: string
  paymentId: string
  onSuccess: (paymentId: string, isAchPending: boolean) => void
  onCancel: () => void
}

function CheckoutForm({ rentAmount, chargeAmount, surcharge, method, tenantId, paymentId, onSuccess, onCancel }: CheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setProcessing(true)
    setErrorMsg(null)

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (error) {
      setErrorMsg(error.message ?? 'Payment failed')
      setProcessing(false)
      return
    }

    // Card → succeeded immediately. ACH → 'processing' for 3-5 business days
    // until the bank settles, then the webhook flips status to completed.
    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      const isAch = paymentIntent.status === 'processing'
      // The Stripe webhook (service role) is the source of truth: it flips the
      // existing pending rent row to completed/processing after reconciling the
      // charged amount. The client no longer writes the payments row itself —
      // that was the path that let a tampered amount be recorded as paid.
      await supabase
        .from('profiles')
        .update({ payment_method_setup_at: new Date().toISOString() })
        .eq('id', tenantId)
        .is('payment_method_setup_at', null)
      toast.success(isAch
        ? 'Payment received — clearing in 3–5 business days.'
        : 'Payment successful!')
      onSuccess(paymentId, isAch)
    }
    setProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {surcharge > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-700">
          <div className="flex justify-between"><span>Rent</span><span>{formatUsdCents(rentAmount)}</span></div>
          <div className="flex justify-between mt-0.5"><span>Card processing fee (3.5%)</span><span>{formatUsdCents(surcharge)}</span></div>
          <div className="flex justify-between mt-1 pt-1 border-t border-gray-200 font-semibold text-gray-900"><span>Total charge</span><span>{formatUsdCents(chargeAmount)}</span></div>
        </div>
      )}
      {method === 'us_bank_account' && (
        <div className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2.5 text-xs text-brand-800">
          <div className="flex justify-between font-medium"><span>Rent (free ACH)</span><span>{formatUsdCents(rentAmount)}</span></div>
          <p className="mt-0.5 text-brand-700">Your landlord covers the bank transfer fee.</p>
        </div>
      )}
      <PaymentElement />
      {errorMsg && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={processing || !stripe}
          className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {processing ? 'Processing…' : `Pay ${formatUsdCents(chargeAmount)}`}
        </button>
      </div>
    </form>
  )
}

// ── Reschedule picker (±7 days from original due date) ──────────────────────
function ReschedulePicker({
  payment,
  autopayEnabled,
}: {
  payment: Payment
  autopayEnabled: boolean
}) {
  const anchor = payment.original_due_date ?? payment.due_date
  const scheduled = (payment as Payment & { scheduled_for?: string | null }).scheduled_for ?? payment.due_date
  const [date, setDate] = useState(scheduled ?? '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const inputId = useId()

  if (!anchor) return null

  // ±7 day clamp anchored to the original due date.
  const minDate = new Date(anchor + 'T00:00:00')
  minDate.setDate(minDate.getDate() - 7)
  const maxDate = new Date(anchor + 'T00:00:00')
  maxDate.setDate(maxDate.getDate() + 7)
  const min = minDate.toISOString().split('T')[0]
  const max = maxDate.toISOString().split('T')[0]

  const save = async () => {
    if (!date || saving) return
    setSaving(true)
    const { error } = await supabase.rpc('reschedule_payment', {
      target_payment_id: payment.id,
      new_date: date,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(
      autopayEnabled
        ? `Auto-pay will charge on ${new Date(date + 'T00:00:00').toLocaleDateString()}`
        : `Rescheduled to ${new Date(date + 'T00:00:00').toLocaleDateString()}`,
    )
    setDirty(false)
  }

  return (
    <div className="mt-3 bg-white/15 rounded-xl px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor={inputId} className="text-xs font-medium opacity-90 shrink-0">
          {autopayEnabled ? 'Auto-pay on:' : 'Pay on:'}
        </label>
        <input
          id={inputId}
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => { setDate(e.target.value); setDirty(true) }}
          className="bg-white/95 text-gray-900 text-xs rounded px-2 py-1 outline-none"
        />
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-xs font-semibold bg-white text-gray-900 px-2.5 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <p className="text-[10px] opacity-75 mt-1">
        Move ±7 days from {new Date(anchor + 'T00:00:00').toLocaleDateString()} before the late-fee window starts.
      </p>
    </div>
  )
}

// ── Payment history row ───────────────────────────────────────────────────────
// Completed payments link to their printable receipt (/tenant/receipt/:id).
function PaymentHistoryRow({ payment }: { payment: Payment }) {
  const statusColor =
    payment.status === 'completed' ? 'text-green-600' :
    payment.status === 'failed'    ? 'text-red-600' : 'text-yellow-600'

  const body = (
    <>
      <div>
        <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace(/_/g, ' ')}</p>
        <p className="text-xs text-gray-500">
          {payment.paid_at
            ? new Date(payment.paid_at).toLocaleDateString()
            : new Date(payment.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-800">{formatUsdCents(Number(payment.amount))}</p>
        <p className={`text-xs font-medium capitalize ${statusColor}`}>
          {payment.status}
          {payment.status === 'completed' && <span className="text-brand-600 font-semibold"> · Receipt</span>}
        </p>
      </div>
    </>
  )

  if (payment.status === 'completed') {
    return (
      <a
        href={`/tenant/receipt/${payment.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-4 px-4 transition-colors"
      >
        {body}
      </a>
    )
  }
  return <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">{body}</div>
}

// ── Pay Rent page ─────────────────────────────────────────────────────────────
export default function TenantPayRent() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const landlordBrand = useLandlordBranding(profile?.id)
  const { lease, nextPayment, paymentMethodSetup, autopayEnabled, loading } = useTenantDashboard(profile?.id)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)
  // Captured at the moment a payment succeeds so the success screen can link
  // to its receipt — ACH lands as 'processing' (no receipt yet), so we track
  // that too rather than assuming every success is immediately 'completed'.
  const [paidInfo, setPaidInfo] = useState<{ id: string; achPending: boolean } | null>(null)
  const [history, setHistory] = useState<Payment[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [method, setMethod] = useState<PayMethod>('us_bank_account')
  // Local optimistic overrides — flipped instantly by the PaymentMethodCard
  // toggle so the hero color updates without waiting for the dashboard hook
  // to refetch.
  const [autopayLocal, setAutopayLocal] = useState<boolean | null>(null)
  const [methodLocal, setMethodLocal] = useState<boolean | null>(null)
  const autopayOn = autopayLocal ?? autopayEnabled
  const methodOn = methodLocal ?? paymentMethodSetup
  // The saved method's rail (card vs bank) drives the "Withdrawn on" line.
  const [savedRail, setSavedRail] = useState<'card' | 'us_bank_account' | null>(null)
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('profiles')
      .select('stripe_default_pm_type, payment_complimentary')
      .eq('id', profile.id).maybeSingle()
      .then(({ data }) => {
        const row = data as { stripe_default_pm_type?: string | null; payment_complimentary?: boolean } | null
        const t = row?.stripe_default_pm_type ?? (row?.payment_complimentary ? 'us_bank_account' : null)
        setSavedRail(t === 'card' || t === 'us_bank_account' ? t : null)
      })
  }, [profile?.id])

  const stripeConfigured = !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

  useEffect(() => {
    if (!profile?.id) return
    getTenantPayments(profile.id, 10).then((data) => {
      setHistory(data)
      setHistoryLoading(false)
    }).catch(() => setHistoryLoading(false))
  }, [profile?.id, paid])

  const rentAmount = Number(nextPayment?.amount ?? 0)
  // Shared helper matches the server's cent-rounding exactly, so the amount
  // shown here always equals what create-payment-intent charges.
  const surcharge = method === 'card' ? cardSurcharge(rentAmount) : 0
  const totalToCharge = +(rentAmount + surcharge).toFixed(2)

  const handleStartPayment = async () => {
    if (!lease || !nextPayment) return
    setPaying(true)

    // Complimentary tenant — silently mark the payment as completed without
    // ever hitting Stripe. The UI is unchanged: the rent CTA shows "Payment
    // Successful!" the same way it would after a legitimate Stripe charge.
    if (profile && (profile as { payment_complimentary?: boolean }).payment_complimentary) {
      try {
        await supabase.from('payments').update({
          status: 'completed',
          paid_at: new Date().toISOString(),
          stripe_payment_id: 'comp',
        }).eq('id', nextPayment.id)
        // Ensure payment_method_setup_at stays stamped so the dashboard
        // never flips back to red.
        await supabase
          .from('profiles')
          .update({ payment_method_setup_at: new Date().toISOString() })
          .eq('id', profile.id)
          .is('payment_method_setup_at', null)
        toast.success('Payment successful!')
        setPaying(false)
        setPaidInfo({ id: nextPayment.id, achPending: false })
        setPaid(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not record payment')
        setPaying(false)
      }
      return
    }

    try {
      // Pass only the payment row id — the edge function derives the amount
      // server-side from that row and verifies we own it. (Never send amount.)
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          paymentId: nextPayment.id,
          paymentMethod: method,
        },
      })
      if (error) throw new Error(error.message)
      setClientSecret(data.clientSecret as string)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start payment')
      setPaying(false)
    }
  }

  const handleSuccess = (paymentId: string, isAchPending: boolean) => {
    setClientSecret(null)
    setPaying(false)
    setPaidInfo({ id: paymentId, achPending: isAchPending })
    setPaid(true)
  }

  const daysUntilDue = nextPayment?.due_date
    ? Math.ceil((new Date(nextPayment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  // Same tiered colors as the Dashboard hero card:
  //   • no payment method → red (trumps everything)
  //   • >7 days past due  → red
  //   • 0–7 days past due → burnt orange
  //   • upcoming, autopay ON  → filled Stoop brand green
  //   • upcoming, autopay OFF → ghost (white card + brand-green ring glow)
  const daysOverdue = daysUntilDue !== null && daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0
  const heroTone =
    !methodOn      ? 'red' :
    daysOverdue > 7 ? 'red' :
    daysOverdue > 0 ? 'orange' :
    autopayOn       ? 'brand' : 'ghost'
  const heroCls =
    heroTone === 'brand'  ? 'bg-brand-600 text-white' :
    heroTone === 'ghost'  ? 'bg-white border-2 border-brand-300 shadow-[0_0_0_4px_rgba(0,168,150,0.12)] text-ink' :
    heroTone === 'orange' ? 'bg-orange-500 text-white' :
                            // Light card + red glowing outline (not a full red fill).
                            'bg-gray-50 border-2 border-red-300 shadow-[0_0_0_4px_rgba(220,38,38,0.15)] text-ink'
  const isRed = heroTone === 'red'
  // Both ghost and red are light-surfaced → dark-on-light child styling.
  const isGhost = heroTone === 'ghost' || isRed

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">Pay Rent</h1>

      {/* Payment card */}
      {loading ? (
        <Skeleton className="h-48" />
      ) : paid ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-600" strokeWidth={1.5} />
          <p className="text-lg font-bold text-green-700">Payment Successful!</p>
          <p className="text-sm text-green-600 mt-1">Your payment has been recorded.</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            {paidInfo && !paidInfo.achPending && (
              <a
                href={`/tenant/receipt/${paidInfo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-green-700 underline"
              >
                View receipt
              </a>
            )}
            <button onClick={() => { setPaid(false); setPaidInfo(null) }} className="text-sm text-green-700 underline">
              Make another payment
            </button>
          </div>
        </div>
      ) : (
        <div className={`relative rounded-2xl p-5 ${heroCls}`}>
          {/* Auto-pay toggle (matches Dashboard hero top-right) */}
          {methodOn && nextPayment && (
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span className={isGhost ? 'text-[11px] font-semibold uppercase tracking-wider text-mute' : 'text-[11px] font-semibold uppercase tracking-wider opacity-80'}>Auto-pay</span>
              <button
                type="button"
                onClick={async () => {
                  if (!profile?.id) return
                  const next = !autopayOn
                  setAutopayLocal(next)
                  const { error } = await supabase.from('profiles').update({ autopay_enabled: next }).eq('id', profile.id)
                  if (error) {
                    setAutopayLocal(!next)
                    toast.error(error.message)
                    return
                  }
                  if (next) {
                    const payOn = (nextPayment as Payment & { scheduled_for?: string | null }).scheduled_for ?? nextPayment.due_date
                    const charge = payOn ? new Date(payOn + 'T00:00:00').toLocaleDateString() : 'your due date'
                    toast.success(`Auto-pay on — we'll charge on ${charge}.${isAch(savedRail) && payOn ? ` Withdrawal from your bank: ${withdrawalDate(payOn, savedRail).toLocaleDateString()}` : ''}`)
                  } else {
                    toast.success('Auto-pay turned off')
                  }
                }}
                aria-pressed={autopayOn}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  autopayOn
                    ? (isGhost ? 'bg-brand-500' : 'bg-white/90')
                    : (isGhost ? 'bg-gray-300' : 'bg-white/30')
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow transition-transform ${
                    autopayOn
                      ? (isGhost ? 'bg-white translate-x-5' : 'bg-brand-600 translate-x-5')
                      : (isGhost ? 'bg-white' : 'bg-gray-400')
                  }`}
                />
              </button>
            </div>
          )}

          <p className={isGhost ? 'text-sm font-medium text-mute' : 'text-sm font-medium opacity-80'}>
            {nextPayment
              ? `Due ${nextPayment.due_date ? new Date(nextPayment.due_date).toLocaleDateString() : 'soon'}`
              : 'No payment due'}
          </p>
          <p className={`text-4xl font-bold mt-1 ${isGhost ? 'text-ink' : ''}`}>
            {nextPayment ? formatUsdCents(Number(nextPayment.amount)) : '—'}
          </p>
          {daysUntilDue !== null && (
            <p className={isGhost ? 'text-sm mt-1 text-mute' : 'text-sm mt-1 opacity-80'}>
              {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} days overdue` :
               daysUntilDue === 0 ? 'Due today' : `${daysUntilDue} days remaining`}
            </p>
          )}
          {/* Withdrawal date — only shown for ACH where it differs from
              the pay-on date by ~3 business days. */}
          {nextPayment && methodOn && autopayOn && isAch(savedRail) && (() => {
            const payOnIso = (nextPayment as Payment & { scheduled_for?: string | null }).scheduled_for ?? nextPayment.due_date
            if (!payOnIso) return null
            return (
              <p className={`text-xs mt-2 ${isGhost ? 'text-mute' : 'opacity-80'}`}>
                Withdrawn on {withdrawalDate(payOnIso, savedRail).toLocaleDateString()} · funds to landlord by {new Date(payOnIso + 'T00:00:00').toLocaleDateString()}
              </p>
            )
          })()}
          {nextPayment && methodOn && (
            <ReschedulePicker payment={nextPayment} autopayEnabled={autopayOn} />
          )}
          {/* Self-serve houses divide the unit's rent between themselves —
              each roommate sets their own monthly amount. Hidden entirely on
              even-split leases, where the server refuses the change anyway. */}
          {lease && (lease as Lease & { rent_split_mode?: string }).rent_split_mode === 'self_serve' && (
            <MyShareEditor leaseId={lease.id} currentAmount={Number(nextPayment?.amount ?? 0)} isGhost={isGhost} />
          )}
          {nextPayment && (
            !stripeConfigured ? (
              // Missing publishable key = a deployment problem, never the
              // tenant's. Say what they can DO, not what an engineer should fix.
              <div className="mt-4 bg-white/20 rounded-xl px-4 py-3 text-sm">
                <p className="font-semibold">Online payments are temporarily unavailable.</p>
                <p className="mt-1 opacity-90">
                  You can still pay by cash or check — your landlord will record it here.{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/tenant/messages')}
                    className="underline font-medium"
                  >
                    Message your landlord
                  </button>{' '}
                  to arrange it, and check back soon.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {/* Payment method selector */}
                <div className={`rounded-xl p-2 grid grid-cols-2 gap-2 text-sm ${isGhost ? 'bg-gray-100' : 'bg-white/15'}`}>
                  <button
                    type="button"
                    onClick={() => setMethod('us_bank_account')}
                    className={`flex items-center gap-2 justify-center px-3 py-2.5 rounded-lg transition-colors ${
                      method === 'us_bank_account'
                        ? (isGhost ? 'bg-white text-ink font-semibold border border-brand-200' : 'bg-white text-gray-900 font-semibold')
                        : (isGhost ? 'text-mute hover:bg-white/60' : 'text-white/90 hover:bg-white/10')
                    }`}
                  >
                    <Landmark className="w-4 h-4" strokeWidth={1.75} />
                    Bank · Free
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('card')}
                    className={`flex items-center gap-2 justify-center px-3 py-2.5 rounded-lg transition-colors ${
                      method === 'card'
                        ? (isGhost ? 'bg-white text-ink font-semibold border border-brand-200' : 'bg-white text-gray-900 font-semibold')
                        : (isGhost ? 'text-mute hover:bg-white/60' : 'text-white/90 hover:bg-white/10')
                    }`}
                  >
                    <CardIcon className="w-4 h-4" strokeWidth={1.75} />
                    {/* Concrete dollars beat percentages — the fee on THIS payment. */}
                    Card · +{formatUsdCents(cardSurcharge(rentAmount))}
                  </button>
                </div>
                {method === 'card' ? (
                  <p className={isGhost ? 'text-xs text-mute text-center' : 'text-xs text-white/80 text-center'}>
                    Card payments include a {formatUsdCents(cardSurcharge(rentAmount))} processing fee ({CARD_SURCHARGE_PCT}%). Total: {formatUsdCents(totalToCharge)}. Bank transfer is free.
                  </p>
                ) : (
                  <p className={isGhost ? 'text-xs text-mute text-center' : 'text-xs text-white/80 text-center'}>
                    Bank transfer is free — you’re saving {formatUsdCents(cardSurcharge(rentAmount))} vs. paying by card.
                  </p>
                )}
                <button
                  onClick={handleStartPayment}
                  disabled={paying}
                  className={`w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors ${
                    isRed ? 'bg-red-600 text-white hover:bg-red-700' :
                    isGhost ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-white text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {paying ? 'Loading…' :
                    !paymentMethodSetup ? 'Setup payment' :
                    `Pay ${formatUsdCents(totalToCharge)} ${method === 'card' ? 'by card' : 'by bank'}`}
                </button>
              </div>
            )
          )}
          {!nextPayment && (
            <p className="mt-3 text-sm opacity-70">
              {lease ? 'All payments are up to date' : 'No active lease yet — your landlord will set this up.'}
            </p>
          )}
        </div>
      )}

      {/* Payment method + auto-pay */}
      {profile?.id && (
        <PaymentMethodCard
          tenantId={profile.id}
          landlordBrand={landlordBrand}
          onAutopayChange={(next) => {
            setAutopayLocal(next)
            if (next && nextPayment) {
              const payOn = (nextPayment as Payment & { scheduled_for?: string | null }).scheduled_for ?? nextPayment.due_date
              const charge = payOn ? new Date(payOn + 'T00:00:00').toLocaleDateString() : 'your due date'
              toast.success(`Auto-pay on — we'll charge on ${charge}.${isAch(savedRail) && payOn ? ` Withdrawal from your bank: ${withdrawalDate(payOn, savedRail).toLocaleDateString()}` : ''}`)
            }
          }}
          onMethodChange={(has) => setMethodLocal(has)}
        />
      )}

      {/* Payment history */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Payment History</h2>
        </div>
        <div className="px-4">
          {historyLoading ? (
            <div className="py-3 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : history.length === 0 ? (
            <EmptyIllustration
              name="payments"
              Fallback={CardIcon}
              title="No payment history yet"
              subtitle="Once you make your first rent payment, you'll see every charge and receipt here."
              size="md"
            />
          ) : (
            history.map((p) => <PaymentHistoryRow key={p.id} payment={p} />)
          )}
        </div>
      </div>

      {/* Branded payment modal — opens once we have a Stripe client_secret. */}
      <Dialog
        open={!!clientSecret}
        onClose={() => { setClientSecret(null); setPaying(false) }}
        overlayClassName="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto"
        panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        panelStyle={{ maxHeight: '85vh' }}
      >
        {(titleId) => !clientSecret ? null : (
          <>
            {/* Branded header */}
            <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-t-2xl p-6 relative">
              <button
                type="button"
                onClick={() => { setClientSecret(null); setPaying(false) }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <span className="text-lg leading-none">×</span>
              </button>
              {/* Rent is a landlord↔tenant transaction — present as the
                  landlord's company when branding is set, platform otherwise. */}
              <div className="flex items-center gap-2.5 mb-3">
                {landlordBrand?.logoUrl ? (
                  <img
                    src={landlordBrand.logoUrl}
                    alt={landlordBrand.companyName ?? 'Your landlord'}
                    className="h-10 max-w-[160px] object-contain bg-white/90 rounded-lg px-1.5 py-1"
                  />
                ) : (
                  <img
                    src={BRAND.logo.square}
                    alt={BRAND.name}
                    className="w-10 h-10 object-contain brightness-0 invert"
                  />
                )}
                <span className="text-sm font-medium tracking-wide opacity-90">
                  {landlordBrand?.companyName ?? BRAND.name}
                </span>
              </div>
              <h2 id={titleId} className="text-2xl font-bold tracking-tight">Pay rent</h2>
              <p className="text-sm text-white/90 mt-1.5 leading-relaxed">
                {method === 'card' ? 'Paying by card' : 'Paying by US bank account (ACH)'}
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{formatUsdCents(Number(totalToCharge))}</span>
              </div>
              {nextPayment?.due_date && (
                <p className="text-xs text-white/80 mt-1">
                  Due {new Date(nextPayment.due_date).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Embedded payment form */}
            <div className="p-6 overflow-y-auto">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: brandColor('400'),
                      colorBackground: '#FFFFFF',
                      colorText: '#1F2937',
                      colorDanger: '#DC2626',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      borderRadius: '8px',
                    },
                  },
                }}
              >
                <CheckoutForm
                  rentAmount={rentAmount}
                  chargeAmount={totalToCharge}
                  surcharge={surcharge}
                  method={method}
                  tenantId={profile?.id ?? ''}
                  paymentId={nextPayment?.id ?? ''}
                  onSuccess={handleSuccess}
                  onCancel={() => { setClientSecret(null); setPaying(false) }}
                />
              </Elements>
            </div>

            {/* Trust footer */}
            <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-xs text-mute border-t border-gray-100 mt-1">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Secured by Stripe · 256-bit encryption</span>
            </div>
          </>
        )}
      </Dialog>
    </div>
  )
}

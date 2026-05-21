import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import { getTenantPayments } from '@findstoop/shared/api/payments'
import { supabase } from '../../lib/supabase'
import type { Payment } from '@findstoop/shared/types/payment'
import { CheckCircle2 } from 'lucide-react'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ''}`} />
}

// ── Checkout form (inside Elements) ──────────────────────────────────────────
interface CheckoutFormProps {
  amount: number
  leaseId: string
  tenantId: string
  onSuccess: () => void
  onCancel: () => void
}

function CheckoutForm({ amount, leaseId, tenantId, onSuccess, onCancel }: CheckoutFormProps) {
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

    if (paymentIntent?.status === 'succeeded') {
      // Record payment in DB
      await supabase.from('payments').insert({
        lease_id: leaseId,
        tenant_id: tenantId,
        amount,
        type: 'rent',
        status: 'completed',
        stripe_payment_id: paymentIntent.id,
        paid_at: new Date().toISOString(),
      })
      toast.success('Payment successful!')
      onSuccess()
    }
    setProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          {processing ? 'Processing…' : `Pay $${amount.toFixed(2)}`}
        </button>
      </div>
    </form>
  )
}

// ── Payment history row ───────────────────────────────────────────────────────
function PaymentHistoryRow({ payment }: { payment: Payment }) {
  const statusColor =
    payment.status === 'completed' ? 'text-green-600' :
    payment.status === 'failed'    ? 'text-red-600' : 'text-yellow-600'

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800 capitalize">{payment.type.replace(/_/g, ' ')}</p>
        <p className="text-xs text-gray-400">
          {payment.paid_at
            ? new Date(payment.paid_at).toLocaleDateString()
            : new Date(payment.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-800">${Number(payment.amount).toFixed(2)}</p>
        <p className={`text-xs font-medium capitalize ${statusColor}`}>{payment.status}</p>
      </div>
    </div>
  )
}

// ── Pay Rent page ─────────────────────────────────────────────────────────────
export default function TenantPayRent() {
  const { profile } = useAuth()
  const { lease, nextPayment, loading } = useTenantDashboard(profile?.id)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)
  const [history, setHistory] = useState<Payment[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const stripeConfigured = !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

  useEffect(() => {
    if (!profile?.id) return
    getTenantPayments(profile.id, 10).then((data) => {
      setHistory(data)
      setHistoryLoading(false)
    }).catch(() => setHistoryLoading(false))
  }, [profile?.id, paid])

  const handleStartPayment = async () => {
    if (!lease || !nextPayment) return
    setPaying(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          amount: Number(nextPayment.amount),
          leaseId: lease.id,
          tenantId: profile?.id,
        },
      })
      if (error) throw new Error(error.message)
      setClientSecret(data.clientSecret as string)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start payment')
      setPaying(false)
    }
  }

  const handleSuccess = () => {
    setClientSecret(null)
    setPaying(false)
    setPaid(true)
  }

  const daysUntilDue = nextPayment?.due_date
    ? Math.ceil((new Date(nextPayment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const urgencyBg =
    daysUntilDue === null       ? 'bg-brand-600' :
    daysUntilDue < 0            ? 'bg-red-600' :
    daysUntilDue <= 3           ? 'bg-red-600' :
    daysUntilDue <= 7           ? 'bg-yellow-500' : 'bg-green-600'

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
          <button onClick={() => setPaid(false)} className="mt-4 text-sm text-green-700 underline">
            Make another payment
          </button>
        </div>
      ) : clientSecret ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-base font-semibold text-gray-900 mb-4">
            Complete Payment — ${Number(nextPayment?.amount ?? 0).toFixed(2)}
          </p>
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <CheckoutForm
              amount={Number(nextPayment?.amount ?? 0)}
              leaseId={lease?.id ?? ''}
              tenantId={profile?.id ?? ''}
              onSuccess={handleSuccess}
              onCancel={() => { setClientSecret(null); setPaying(false) }}
            />
          </Elements>
        </div>
      ) : (
        <div className={`rounded-2xl p-5 text-white ${urgencyBg}`}>
          <p className="text-sm font-medium opacity-80">
            {nextPayment
              ? `Due ${nextPayment.due_date ? new Date(nextPayment.due_date).toLocaleDateString() : 'soon'}`
              : 'No payment due'}
          </p>
          <p className="text-4xl font-bold mt-1">
            {nextPayment ? `$${Number(nextPayment.amount).toFixed(2)}` : '—'}
          </p>
          {daysUntilDue !== null && (
            <p className="text-sm mt-1 opacity-80">
              {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} days overdue` :
               daysUntilDue === 0 ? 'Due today' : `${daysUntilDue} days remaining`}
            </p>
          )}
          {nextPayment && (
            !stripeConfigured ? (
              <div className="mt-4 bg-white/20 rounded-xl px-4 py-3 text-sm">
                Stripe not configured — add <code className="font-mono">VITE_STRIPE_PUBLISHABLE_KEY</code> to enable online payments. Your manager can record cash/check payments manually.
              </div>
            ) : (
              <button
                onClick={handleStartPayment}
                disabled={paying}
                className="mt-4 w-full py-3 bg-white text-gray-800 rounded-xl font-semibold text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {paying ? 'Loading…' : 'Pay Now'}
              </button>
            )
          )}
          {!nextPayment && (
            <p className="mt-3 text-sm opacity-70">All payments are up to date</p>
          )}
        </div>
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
            <p className="text-sm text-gray-400 py-6 text-center">No payment history yet</p>
          ) : (
            history.map((p) => <PaymentHistoryRow key={p.id} payment={p} />)
          )}
        </div>
      </div>
    </div>
  )
}

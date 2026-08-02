import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { X, Loader2, Lock, CreditCard, Landmark, FileText, ExternalLink, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { BRAND, brandColor } from '../../lib/brand'
import ModalShell from '../shared/ModalShell'

let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe(): ReturnType<typeof loadStripe> {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')
  }
  return stripePromise
}

interface SubscriptionSummary {
  id: string
  status: string
  cancelAtPeriodEnd: boolean
  cancelAt: string | null
  currentPeriodEnd: string
  quantity: number
  unitAmount: number
  currency: string
  interval: string
}

interface PaymentMethodSummary {
  id: string
  type: string
  cardBrand: string | null
  cardLast4: string | null
  bankLast4: string | null
  bankName: string | null
}

interface InvoiceSummary {
  id: string
  number: string | null
  status: string | null
  amountPaid: number
  amountDue: number
  currency: string
  created: string
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
}

interface ManageData {
  subscription: SubscriptionSummary
  paymentMethod: PaymentMethodSummary | null
  invoices: InvoiceSummary[]
  setupClientSecret: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onChange: () => void
}

export default function ManageBillingModal({ open, onClose, onChange }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ManageData | null>(null)
  const [view, setView] = useState<'summary' | 'updatePayment' | 'confirmCancel'>('summary')
  const [acting, setActing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data: payload, error } = await supabase.functions.invoke('stripe-manage', { body: { action: 'load' } })
      if (error) throw error
      if (payload?.error) throw new Error(payload.error)
      setData(payload as ManageData)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load billing details')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setView('summary')
      void load()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const cancel = async () => {
    setActing(true)
    try {
      const { data: res, error } = await supabase.functions.invoke('stripe-manage', { body: { action: 'cancel' } })
      if (error) throw error
      if (res?.error) throw new Error(res.error)
      toast.success('Subscription will cancel at the end of the current period.')
      onChange()
      await load()
      setView('summary')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel')
    } finally {
      setActing(false)
    }
  }

  const resume = async () => {
    setActing(true)
    try {
      const { data: res, error } = await supabase.functions.invoke('stripe-manage', { body: { action: 'resume' } })
      if (error) throw error
      if (res?.error) throw new Error(res.error)
      toast.success('Subscription resumed.')
      onChange()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resume')
    } finally {
      setActing(false)
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-xl" aria-label="Manage billing">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* Branded header */}
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-t-2xl p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-2.5 mb-3">
            <img
              src={BRAND.logo.square}
              alt={BRAND.name}
              className="w-10 h-10 object-contain brightness-0 invert"
            />
            <span className="text-sm font-medium tracking-wide opacity-90">{BRAND.name}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Manage billing</h2>
          <p className="text-sm text-white/90 mt-1.5 leading-relaxed">
            Update your payment method, review invoices, or cancel your subscription.
          </p>
        </div>

        <div className="p-6">
          {loading || !data ? (
            <div className="flex items-center justify-center py-16 text-mute">
              <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
            </div>
          ) : view === 'updatePayment' ? (
            <UpdatePaymentSection
              clientSecret={data.setupClientSecret}
              onCancel={() => setView('summary')}
              onSuccess={async () => { setView('summary'); await load(); onChange() }}
            />
          ) : view === 'confirmCancel' ? (
            <CancelConfirmSection
              onBack={() => setView('summary')}
              onConfirm={cancel}
              acting={acting}
              periodEnd={data.subscription.currentPeriodEnd}
            />
          ) : (
            <SummarySection
              data={data}
              onUpdatePayment={() => setView('updatePayment')}
              onCancel={() => setView('confirmCancel')}
              onResume={resume}
              acting={acting}
            />
          )}
        </div>

        <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-xs text-mute">
          <Lock className="w-3 h-3" strokeWidth={2} />
          <span>Secured by Stripe · 256-bit encryption</span>
        </div>
      </div>
    </ModalShell>
  )
}

function SummarySection({
  data,
  onUpdatePayment,
  onCancel,
  onResume,
  acting,
}: {
  data: ManageData
  onUpdatePayment: () => void
  onCancel: () => void
  onResume: () => void
  acting: boolean
}) {
  const sub = data.subscription
  const monthly = (sub.unitAmount * sub.quantity) / 100
  const intervalLabel = sub.interval === 'year' ? '/year' : '/month'

  return (
    <div className="space-y-5">
      {/* Plan summary */}
      <section className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-mute font-semibold">Current plan</p>
            <p className="text-lg font-bold text-ink mt-0.5">${monthly.toLocaleString()}{intervalLabel}</p>
            <p className="text-xs text-mute mt-0.5">
              ${(sub.unitAmount / 100).toFixed(2)}/unit{intervalLabel} · {sub.quantity} {sub.quantity === 1 ? 'unit' : 'units'}
            </p>
          </div>
          <StatusPill status={sub.status} cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
        </div>
        <p className="text-xs text-mute mt-3">
          {sub.cancelAtPeriodEnd
            ? <>Cancels on <strong>{fmtDate(sub.cancelAt ?? sub.currentPeriodEnd)}</strong>. No further charges after that.</>
            : <>Next billing date: <strong>{fmtDate(sub.currentPeriodEnd)}</strong></>}
        </p>
      </section>

      {/* Payment method */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">Payment method</p>
          <button
            type="button"
            onClick={onUpdatePayment}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Update
          </button>
        </div>
        {data.paymentMethod ? (
          <PaymentMethodRow pm={data.paymentMethod} />
        ) : (
          <p className="text-sm text-mute">No payment method on file.</p>
        )}
      </section>

      {/* Invoices */}
      <section>
        <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">Recent invoices</p>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-mute">No invoices yet.</p>
        ) : (
          <ul className="border border-gray-200 rounded-xl divide-y divide-gray-200 overflow-hidden">
            {data.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{inv.number ?? inv.id}</p>
                  <p className="text-xs text-mute">{fmtDate(inv.created)} · {inv.status}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold text-ink">${(Math.max(inv.amountPaid, inv.amountDue) / 100).toLocaleString()}</span>
                  <a
                    href={`/manager/invoice/${inv.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-mute hover:text-ink"
                    title="View invoice"
                  >
                    <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
                  </a>
                  <a
                    href={`/manager/invoice/${inv.id}?print=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-mute hover:text-ink"
                    title="Print or save as PDF"
                  >
                    <FileText className="w-4 h-4" strokeWidth={1.75} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Actions */}
      <section className="pt-2 border-t border-gray-200">
        {sub.cancelAtPeriodEnd ? (
          <button
            type="button"
            onClick={onResume}
            disabled={acting}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
            Resume subscription
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            disabled={acting}
            className="w-full inline-flex items-center justify-center gap-2 text-red-700 hover:bg-red-50 font-medium px-4 py-2.5 rounded-lg border border-red-200 disabled:opacity-50"
          >
            Cancel subscription
          </button>
        )}
      </section>
    </div>
  )
}

function PaymentMethodRow({ pm }: { pm: PaymentMethodSummary }) {
  const isCard = pm.type === 'card'
  const Icon = isCard ? CreditCard : Landmark
  const label = isCard
    ? `${(pm.cardBrand ?? 'Card').toUpperCase()} ····${pm.cardLast4 ?? '••••'}`
    : `${pm.bankName ?? 'Bank account'} ····${pm.bankLast4 ?? '••••'}`
  return (
    <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5">
      <Icon className="w-5 h-5 text-mute" strokeWidth={1.75} />
      <span className="text-sm font-medium text-ink">{label}</span>
    </div>
  )
}

function StatusPill({ status, cancelAtPeriodEnd }: { status: string; cancelAtPeriodEnd: boolean }) {
  let label = status
  let cls = 'bg-gray-100 text-gray-700'
  if (cancelAtPeriodEnd) {
    label = 'Canceling'
    cls = 'bg-amber-100 text-amber-800'
  } else if (status === 'active' || status === 'trialing') {
    label = 'Active'
    cls = 'bg-green-100 text-green-800'
  } else if (status === 'past_due') {
    label = 'Past due'
    cls = 'bg-red-100 text-red-800'
  } else if (status === 'incomplete') {
    label = 'Incomplete'
    cls = 'bg-amber-100 text-amber-800'
  }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function CancelConfirmSection({
  onBack,
  onConfirm,
  acting,
  periodEnd,
}: {
  onBack: () => void
  onConfirm: () => void
  acting: boolean
  periodEnd: string
}) {
  return (
    <div className="text-center py-2">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" strokeWidth={1.5} />
      <h3 className="text-lg font-bold text-ink">Cancel your {BRAND.name} subscription?</h3>
      <p className="text-sm text-mute mt-2 leading-relaxed max-w-md mx-auto">
        Your subscription will stay active through <strong>{fmtDate(periodEnd)}</strong>.
        After that, you'll lose access to the formatted lease PDF, the tenant portal,
        and {BRAND.name} rent payments. You can resume any time before that date.
      </p>
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={acting}
          className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50 disabled:opacity-50"
        >
          Keep subscription
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={acting}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {acting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : null}
          Cancel at period end
        </button>
      </div>
    </div>
  )
}

function UpdatePaymentSection({
  clientSecret,
  onCancel,
  onSuccess,
}: {
  clientSecret: string | null
  onCancel: () => void
  onSuccess: () => void
}) {
  if (!clientSecret) {
    return (
      <div className="text-center py-6 text-mute">Could not start a payment method update.</div>
    )
  }
  return (
    <Elements
      stripe={getStripe()}
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
      <UpdatePaymentForm onCancel={onCancel} onSuccess={onSuccess} />
    </Elements>
  )
}

function UpdatePaymentForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setProcessing(true)
    setErrorMsg(null)
    const { error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/manager/billing` },
    })
    if (error) {
      setErrorMsg(error.message ?? 'Could not save payment method')
      setProcessing(false)
      return
    }
    setDone(true)
    toast.success('Payment method updated')
    setTimeout(onSuccess, 900)
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-base font-semibold text-ink">Payment method saved</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errorMsg}</div>
      )}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
        <strong className="font-semibold">Card surcharge:</strong>{' '}
        Switching to a card adds a 3% processing fee on each future invoice. ACH (US bank account) has no surcharge.
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg disabled:opacity-50"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : null}
          Save payment method
        </button>
      </div>
    </form>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

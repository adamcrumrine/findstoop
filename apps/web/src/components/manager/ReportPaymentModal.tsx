// One-time $4.99 payment for a Basic Rental Analysis Report. Mirrors
// SubscribeModal's Stripe Elements flow, but confirms a single PaymentIntent
// instead of a subscription. On success it returns the paymentIntentId so the
// caller can generate the report (the edge function re-verifies the charge).

import { useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { X, Loader2, Lock, CheckCircle2, FileText } from 'lucide-react'
import { brandColor } from '../../lib/brand'
import ModalShell from '../shared/ModalShell'

let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe(): ReturnType<typeof loadStripe> {
  if (!stripePromise) stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')
  return stripePromise
}

interface Props {
  open: boolean
  onClose: () => void
  onPaid: () => void
  clientSecret: string | null
  price: number
}

export default function ReportPaymentModal({ open, onClose, onPaid, clientSecret, price }: Props) {
  if (!open) return null

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-md" aria-label="Basic report payment">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-t-2xl p-6 relative">
          <button type="button" onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center transition-colors" aria-label="Close">
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-2.5 mb-3">
            <FileText className="w-6 h-6" strokeWidth={1.75} />
            <span className="text-sm font-medium tracking-wide opacity-90">Rental Analysis Report</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Basic report</h2>
          <p className="text-sm text-white/90 mt-1.5 leading-relaxed">Rent estimate, range, market context, and methodology.</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">${price.toFixed(2)}</span>
            <span className="text-sm text-white/80 font-medium">one-time</span>
          </div>
        </div>

        <div className="p-6">
          {clientSecret ? (
            <Elements
              stripe={getStripe()}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: { colorPrimary: brandColor('400'), colorBackground: '#FFFFFF', colorText: '#1F2937', colorDanger: '#DC2626', fontFamily: 'system-ui, -apple-system, sans-serif', borderRadius: '8px' },
                },
              }}
            >
              <PayForm onPaid={onPaid} price={price} />
            </Elements>
          ) : (
            <div className="flex items-center justify-center py-12 text-mute"><Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} /></div>
          )}
        </div>

        <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-xs text-mute">
          <Lock className="w-3 h-3" strokeWidth={2} /><span>Secured by Stripe · 256-bit encryption</span>
        </div>
      </div>
    </ModalShell>
  )
}

function PayForm({ onPaid, price }: { onPaid: () => void; price: number }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const submittingRef = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements || submittingRef.current) return
    submittingRef.current = true
    setProcessing(true)
    setErrorMsg(null)

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/manager/rental-analysis` },
    })
    submittingRef.current = false

    if (error) { setErrorMsg(error.message ?? 'Payment failed'); setProcessing(false); return }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      setDone(true)
      setTimeout(onPaid, 800)
      return
    }
    setProcessing(false)
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-base font-semibold text-ink">Payment confirmed</p>
        <p className="text-sm text-mute mt-0.5">Generating your report…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {errorMsg && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errorMsg}</div>}
      <button type="submit" disabled={!stripe || processing} className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {processing ? <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> Processing…</> : <>Pay ${price.toFixed(2)}</>}
      </button>
    </form>
  )
}

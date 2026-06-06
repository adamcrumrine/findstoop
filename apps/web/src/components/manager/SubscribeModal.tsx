import { useEffect, useRef, useState } from 'react'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { X, Loader2, Lock, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

// Singleton — Stripe recommends one loadStripe per app session.
let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe(): ReturnType<typeof loadStripe> {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')
  }
  return stripePromise
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  clientSecret: string | null
  plan: 'monthly' | 'annual'
  quantity: number
}

const PER_UNIT_MONTHLY = 9
const PER_UNIT_ANNUAL  = 90

export default function SubscribeModal({ open, onClose, onSuccess, clientSecret, plan, quantity }: Props) {
  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const perUnit = plan === 'annual' ? PER_UNIT_ANNUAL : PER_UNIT_MONTHLY
  const total = perUnit * Math.max(1, quantity)
  const intervalLabel = plan === 'annual' ? '/year' : '/month'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
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
              src="/stoop_logo_square_trans.png"
              alt="Stoop"
              className="w-10 h-10 object-contain brightness-0 invert"
            />
            <span className="text-sm font-medium tracking-wide opacity-90">Stoop</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Subscribe to Stoop</h2>
          <p className="text-sm text-white/90 mt-1.5 leading-relaxed">
            Unlock the formatted lease PDF, the tenant portal, and rent collection.
          </p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">${total.toLocaleString()}</span>
            <span className="text-sm text-white/80 font-medium">{intervalLabel}</span>
          </div>
          <p className="text-xs text-white/80 mt-1">
            ${perUnit}/unit/{plan === 'annual' ? 'year' : 'month'} · {quantity} {quantity === 1 ? 'unit' : 'units'} · billed only on active units
          </p>
        </div>

        {/* Payment form */}
        <div className="p-6">
          {clientSecret ? (
            <Elements
              stripe={getStripe()}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#00A896',
                    colorBackground: '#FFFFFF',
                    colorText: '#1F2937',
                    colorDanger: '#DC2626',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    borderRadius: '8px',
                  },
                },
              }}
            >
              <SubscribeForm onSuccess={onSuccess} onClose={onClose} total={total} intervalLabel={intervalLabel} />
            </Elements>
          ) : (
            <div className="flex items-center justify-center py-12 text-mute">
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
            </div>
          )}
        </div>

        {/* Trust footer */}
        <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-xs text-mute">
          <Lock className="w-3 h-3" strokeWidth={2} />
          <span>Secured by Stripe · 256-bit encryption · cancel anytime</span>
        </div>
      </div>
    </div>
  )
}

function SubscribeForm({
  onSuccess,
  onClose,
  total,
  intervalLabel,
}: {
  onSuccess: () => void
  onClose: () => void
  total: number
  intervalLabel: string
}) {
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
      confirmParams: {
        return_url: `${window.location.origin}/manager/billing`,
      },
    })

    submittingRef.current = false

    if (error) {
      setErrorMsg(error.message ?? 'Payment failed')
      setProcessing(false)
      return
    }

    // For ACH the status will be 'processing'; for card it's usually 'succeeded'.
    // Either way the subscription has been confirmed on Stripe's side — webhook
    // will finalize the active status.
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture')) {
      setDone(true)
      toast.success(paymentIntent.status === 'processing'
        ? 'Payment is processing — we\'ll activate your subscription shortly.'
        : 'Subscription active — welcome to Stoop!'
      )
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1200)
      return
    }

    setProcessing(false)
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-base font-semibold text-ink">Payment confirmed</p>
        <p className="text-sm text-mute mt-0.5">Activating your Stoop subscription…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
        <strong className="font-semibold">Heads up — card surcharge:</strong>{' '}
        Pay with a US bank account (ACH) for the lowest cost. Paying by card adds a 3.5% processing
        fee on each billing cycle to offset Stripe's card-network fees.
      </div>

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
            Processing…
          </>
        ) : (
          <>Subscribe — ${total.toLocaleString()}{intervalLabel}</>
        )}
      </button>

      <p className="text-xs text-mute text-center leading-relaxed">
        By subscribing, you authorize Stoop to charge your payment method ${total.toLocaleString()}{intervalLabel}
        until you cancel. Cancel any time from the Billing page.
      </p>
    </form>
  )
}

// Re-export to suppress unused-import lint
export type { StripeJs }

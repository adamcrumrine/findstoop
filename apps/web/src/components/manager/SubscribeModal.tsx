import { useRef, useState } from 'react'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { X, Loader2, Lock, CheckCircle2, Landmark, CreditCard, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { CARD_SURCHARGE_PCT, cardSurchargeCents } from '@findstoop/shared/lib/billing'
import { BRAND, brandColor } from '../../lib/brand'
import ModalShell from '../shared/ModalShell'

// Singleton — Stripe recommends one loadStripe per app session.
let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe(): ReturnType<typeof loadStripe> {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')
  }
  return stripePromise
}

export interface SubscriptionBreakdown {
  subtotalCents: number
  surchargeCents: number
  totalCents: number
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  // Two-step flow: while clientSecret is null the modal shows the rail
  // chooser; picking one calls onSelectRail, the parent creates the
  // subscription server-side (which bakes in the 3.5% card surcharge), and
  // the returned clientSecret + breakdown flip the modal to the payment step.
  onSelectRail: (payWith: 'card' | 'ach') => Promise<void>
  onChangeRail: () => void
  clientSecret: string | null
  breakdown: SubscriptionBreakdown | null
  plan: 'monthly' | 'annual'
  quantity: number
}

const PER_UNIT_MONTHLY = 9
const PER_UNIT_ANNUAL  = 90

function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export default function SubscribeModal({
  open, onClose, onSuccess, onSelectRail, onChangeRail, clientSecret, breakdown, plan, quantity,
}: Props) {
  const [creating, setCreating] = useState<'card' | 'ach' | null>(null)
  if (!open) return null

  const perUnit = plan === 'annual' ? PER_UNIT_ANNUAL : PER_UNIT_MONTHLY
  const baseCents = perUnit * Math.max(1, quantity) * 100
  const intervalLabel = plan === 'annual' ? '/year' : '/month'
  // Exact totals come from the server once the subscription exists; before
  // that the chooser shows the same math (shared helper) as an estimate.
  const totalCents = breakdown?.totalCents ?? baseCents

  const pickRail = async (rail: 'card' | 'ach') => {
    if (creating) return
    setCreating(rail)
    try {
      await onSelectRail(rail)
    } finally {
      setCreating(null)
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-lg" aria-label="Subscribe">
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
          <h2 className="text-2xl font-bold tracking-tight">Subscribe to {BRAND.name}</h2>
          <p className="text-sm text-white/90 mt-1.5 leading-relaxed">
            Unlock the formatted lease PDF, the tenant portal, and rent collection.
          </p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">${fmtCents(totalCents)}</span>
            <span className="text-sm text-white/80 font-medium">{intervalLabel}</span>
          </div>
          <p className="text-xs text-white/80 mt-1">
            {breakdown && breakdown.surchargeCents > 0
              ? `$${fmtCents(breakdown.subtotalCents)} plan + $${fmtCents(breakdown.surchargeCents)} card processing fee (${CARD_SURCHARGE_PCT}%)`
              : `$${perUnit}/unit/${plan === 'annual' ? 'year' : 'month'} · ${quantity} ${quantity === 1 ? 'unit' : 'units'} · billed only on active units`}
          </p>
        </div>

        {/* Step 1: pick the payment rail (decides whether the 3.5% card
            surcharge applies — the server bakes it into the invoice). */}
        {!clientSecret ? (
          <div className="p-6 space-y-3">
            <p className="text-sm text-mute leading-relaxed">
              How would you like to pay? Bank transfer (ACH) has no processing fee;
              cards add a {CARD_SURCHARGE_PCT}% fee on each invoice to cover card-network costs.
            </p>
            <button
              type="button"
              disabled={creating !== null}
              onClick={() => pickRail('ach')}
              className="w-full flex items-center gap-3 border border-gray-300 hover:border-brand-400 hover:bg-brand-50 rounded-xl p-4 text-left transition-colors disabled:opacity-50"
            >
              {creating === 'ach'
                ? <Loader2 className="w-5 h-5 animate-spin text-brand-600" strokeWidth={1.75} />
                : <Landmark className="w-5 h-5 text-brand-600" strokeWidth={1.75} />}
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">US bank account (ACH)</span>
                <span className="block text-xs text-mute mt-0.5">No processing fee</span>
              </span>
              <span className="text-sm font-semibold text-ink">${fmtCents(baseCents)}{intervalLabel}</span>
            </button>
            <button
              type="button"
              disabled={creating !== null}
              onClick={() => pickRail('card')}
              className="w-full flex items-center gap-3 border border-gray-300 hover:border-brand-400 hover:bg-brand-50 rounded-xl p-4 text-left transition-colors disabled:opacity-50"
            >
              {creating === 'card'
                ? <Loader2 className="w-5 h-5 animate-spin text-brand-600" strokeWidth={1.75} />
                : <CreditCard className="w-5 h-5 text-brand-600" strokeWidth={1.75} />}
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">Card / Apple Pay / Google Pay</span>
                <span className="block text-xs text-mute mt-0.5">+{CARD_SURCHARGE_PCT}% processing fee per invoice</span>
              </span>
              <span className="text-sm font-semibold text-ink">
                ${fmtCents(baseCents + cardSurchargeCents(baseCents))}{intervalLabel}
              </span>
            </button>
          </div>
        ) : (
          <div className="p-6">
            <button
              type="button"
              onClick={onChangeRail}
              className="inline-flex items-center gap-1 text-xs text-mute hover:text-ink mb-3 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
              Change payment method
            </button>
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
              <SubscribeForm
                onSuccess={onSuccess}
                onClose={onClose}
                totalCents={totalCents}
                intervalLabel={intervalLabel}
              />
            </Elements>
          </div>
        )}

        {/* Trust footer */}
        <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-xs text-mute">
          <Lock className="w-3 h-3" strokeWidth={2} />
          <span>Secured by Stripe · 256-bit encryption · cancel anytime</span>
        </div>
      </div>
    </ModalShell>
  )
}

function SubscribeForm({
  onSuccess,
  onClose,
  totalCents,
  intervalLabel,
}: {
  onSuccess: () => void
  onClose: () => void
  totalCents: number
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
        : `Subscription active — welcome to ${BRAND.name}!`
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
        <p className="text-sm text-mute mt-0.5">Activating your {BRAND.name} subscription…</p>
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
          <>Subscribe — ${fmtCents(totalCents)}{intervalLabel}</>
        )}
      </button>

      <p className="text-xs text-mute text-center leading-relaxed">
        By subscribing, you authorize {BRAND.name} to charge your payment method ${fmtCents(totalCents)}{intervalLabel}
        until you cancel. Cancel any time from the Billing page.
      </p>
    </form>
  )
}

// Re-export to suppress unused-import lint
export type { StripeJs }

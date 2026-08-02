import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Loader2, CreditCard, Landmark, X, Lock, CheckCircle2, Zap, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { BRAND, brandColor } from '../../lib/brand'
import Dialog from '../shared/Dialog'
import type { LandlordBranding } from '../../hooks/useLandlordBranding'

let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe(): ReturnType<typeof loadStripe> {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')
  }
  return stripePromise
}

interface Props {
  tenantId: string
  // Parent listens so a sibling hero card can flip color optimistically the
  // moment the tenant toggles auto-pay here. Called both on enable + disable.
  onAutopayChange?: (next: boolean) => void
  // Same for save / replace / remove — the hero may want to switch out of
  // the "no method" red state without waiting for a hook refetch.
  onMethodChange?: (hasMethod: boolean) => void
  // Optional landlord branding (logo/company name) for the setup modal
  // header — mirrors PayRent's Pay Rent modal. Callers that don't have it
  // yet get the safe BRAND fallback.
  landlordBrand?: LandlordBranding | null
}

interface State {
  autopay_enabled: boolean
  payment_method_setup_at: string | null
  stripe_default_payment_method_id: string | null
  payment_complimentary: boolean
  pm_type: string | null
  pm_brand: string | null
  pm_last4: string | null
  pm_bank_name: string | null
}

const INITIAL: State = {
  autopay_enabled: false,
  payment_method_setup_at: null,
  stripe_default_payment_method_id: null,
  payment_complimentary: false,
  pm_type: null,
  pm_brand: null,
  pm_last4: null,
  pm_bank_name: null,
}

export default function PaymentMethodCard({ tenantId, onAutopayChange, onMethodChange, landlordBrand }: Props) {
  const [state, setState] = useState<State>(INITIAL)
  const [loading, setLoading] = useState(true)
  const [savingAutopay, setSavingAutopay] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [requestingSetup, setRequestingSetup] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('autopay_enabled, payment_method_setup_at, stripe_default_payment_method_id, payment_complimentary, stripe_default_pm_type, stripe_default_pm_brand, stripe_default_pm_last4, stripe_default_pm_bank_name')
      .eq('id', tenantId)
      .maybeSingle()
    setState((s) => ({
      ...s,
      autopay_enabled: data?.autopay_enabled ?? false,
      payment_method_setup_at: data?.payment_method_setup_at ?? null,
      stripe_default_payment_method_id: data?.stripe_default_payment_method_id ?? null,
      payment_complimentary: data?.payment_complimentary ?? false,
      pm_type: data?.stripe_default_pm_type ?? null,
      pm_brand: data?.stripe_default_pm_brand ?? null,
      pm_last4: data?.stripe_default_pm_last4 ?? null,
      pm_bank_name: data?.stripe_default_pm_bank_name ?? null,
    }))
    setLoading(false)
  }

  useEffect(() => { void load() }, [tenantId])

  const toggleAutopay = async (next: boolean) => {
    if (next && !state.payment_method_setup_at) {
      toast.error('Add a saved payment method first.')
      return
    }
    setSavingAutopay(true)
    setState((s) => ({ ...s, autopay_enabled: next }))
    onAutopayChange?.(next)
    const { error } = await supabase.from('profiles').update({ autopay_enabled: next }).eq('id', tenantId)
    setSavingAutopay(false)
    if (error) {
      setState((s) => ({ ...s, autopay_enabled: !next }))
      onAutopayChange?.(!next)
      toast.error(error.message)
    } else if (!next) {
      toast.success('Auto-pay turned off')
    }
    // The "turned on" success toast is emitted from the parent so it can
    // mention the actual charge date (which the parent already knows).
  }

  const openSetup = async () => {
    setRequestingSetup(true)
    try {
      const { data, error } = await supabase.functions.invoke('save-tenant-payment-method', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setClientSecret(data.clientSecret)
      setSetupOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start setup')
    } finally {
      setRequestingSetup(false)
    }
  }

  const removeMethod = async () => {
    setRemoving(true)
    try {
      const { data, error } = await supabase.functions.invoke('detach-tenant-payment-method', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success('Saved payment method removed')
      setRemoveConfirmOpen(false)
      onAutopayChange?.(false)
      onMethodChange?.(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove method')
    } finally {
      setRemoving(false)
    }
  }

  const onSetupSuccess = async () => {
    setSetupOpen(false)
    setClientSecret(null)
    onMethodChange?.(true)
    // Webhook stamps payment_method_setup_at + stripe_default_payment_method_id;
    // we re-load the profile to surface it. Small delay for the webhook.
    setTimeout(() => { void load() }, 1500)
    toast.success('Payment method saved')
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-center text-mute">
        <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  // Comp tenants don't have a real Stripe PM but should display as if they
  // do — the bypass flow uses payment_method_setup_at as the "has method" gate.
  const hasMethod = !!state.payment_method_setup_at && (state.payment_complimentary || !!state.stripe_default_payment_method_id)

  return (
    <>
      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Payment method</h2>
          <p className="text-xs text-mute mt-1">
            Used for rent and auto-pay. Bank transfers cost 0.8% (never more than $5);
            cards add 3%. You'll see the exact amount before you pay.
          </p>
        </div>

        {hasMethod ? (
          <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-3">
              {state.pm_type === 'us_bank_account' ? (
                <Landmark className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
              ) : (
                <CreditCard className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
              )}
              <div>
                <p className="text-sm font-semibold text-ink">{methodLabel(state)}</p>
                <p className="text-xs text-mute">Set up {new Date(state.payment_method_setup_at!).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={openSetup}
                disabled={requestingSetup}
                className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50"
              >
                {requestingSetup ? 'Loading…' : 'Replace'}
              </button>
              <button
                type="button"
                onClick={() => setRemoveConfirmOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
                title="Remove saved payment method"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-3 text-sm text-red-800 flex items-start gap-2">
            <div className="flex-1">
              <p className="font-semibold">No payment method on file</p>
              <p className="text-xs text-red-700 mt-0.5">Add one to enable auto-pay and one-click rent payments.</p>
            </div>
            <button
              type="button"
              onClick={openSetup}
              disabled={requestingSetup}
              className="shrink-0 inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              {requestingSetup ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : null}
              Add method
            </button>
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-50 inline-flex items-center justify-center shrink-0">
                <Zap className="w-4.5 h-4.5 text-brand-600" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Auto-pay rent</p>
                <p className="text-xs text-mute mt-0.5 leading-relaxed">
                  When on, we charge your saved method on each rent due date (or the date you've rescheduled to).
                  You can reschedule any month up to ±7 days from the due date before late fees kick in.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleAutopay(!state.autopay_enabled)}
              disabled={savingAutopay || !hasMethod}
              aria-pressed={state.autopay_enabled}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
                state.autopay_enabled ? 'bg-brand-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  state.autopay_enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Remove-confirm modal */}
      <Dialog
        open={removeConfirmOpen}
        onClose={() => { if (!removing) setRemoveConfirmOpen(false) }}
        overlayClassName="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        panelClassName="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
      >
        {(titleId) => (
          <>
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 inline-flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5 text-red-700" strokeWidth={1.75} />
            </div>
            <h3 id={titleId} className="text-lg font-bold text-ink">Remove saved payment method?</h3>
            <p className="text-sm text-mute mt-1.5 leading-relaxed">
              We'll detach your card / bank from Stripe and turn off auto-pay. You'll need
              to add a method again before your next rent payment — late fees still kick
              in 7 days after the due date if rent isn't paid.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setRemoveConfirmOpen(false)}
                disabled={removing}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50 disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={removeMethod}
                disabled={removing}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {removing ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : null}
                Remove method
              </button>
            </div>
          </>
        )}
      </Dialog>

      {/* Setup modal */}
      <Dialog
        open={setupOpen && !!clientSecret}
        onClose={() => { setSetupOpen(false); setClientSecret(null) }}
        overlayClassName="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto"
        panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        panelStyle={{ maxHeight: '85vh' }}
      >
        {(titleId) => !clientSecret ? null : (
          <>
            <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-t-2xl p-6 relative">
              <button
                type="button"
                onClick={() => { setSetupOpen(false); setClientSecret(null) }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
              {/* Mirrors PayRent's Pay Rent modal: landlord company when
                  branding is set, platform brand otherwise. */}
              <div className="flex items-center gap-2.5 mb-3">
                {landlordBrand?.logoUrl ? (
                  <img
                    src={landlordBrand.logoUrl}
                    alt={landlordBrand.companyName ?? 'Your landlord'}
                    className="h-10 max-w-[160px] object-contain bg-white/90 rounded-lg px-1.5 py-1"
                  />
                ) : (
                  <img src={BRAND.logo.square} alt={BRAND.name} className="w-10 h-10 object-contain brightness-0 invert" />
                )}
                <span className="text-sm font-medium tracking-wide opacity-90">
                  {landlordBrand?.companyName ?? BRAND.name}
                </span>
              </div>
              <h2 id={titleId} className="text-2xl font-bold tracking-tight">Save a payment method</h2>
              <p className="text-sm text-white/90 mt-1.5 leading-relaxed">
                We won't charge anything today — this just stores your card or bank for rent payments.
              </p>
            </div>
            <div className="p-6 overflow-y-auto">
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
                <SetupForm onSuccess={onSetupSuccess} />
              </Elements>
            </div>
            <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-xs text-mute border-t border-gray-100">
              <Lock className="w-3 h-3" strokeWidth={2} />
              <span>Secured by Stripe</span>
            </div>
          </>
        )}
      </Dialog>
    </>
  )
}

function SetupForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setProcessing(true)
    setErrorMsg(null)
    const { error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/tenant/settings` },
    })
    if (error) {
      setErrorMsg(error.message ?? 'Could not save payment method')
      setProcessing(false)
      return
    }
    setDone(true)
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
    <form onSubmit={handle} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-xs text-brand-900 inline-flex items-start gap-2">
        <Landmark className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} />
        <span>
          Bank transfer costs 0.8%, capped at $5 no matter how large the payment.
          Cards add 3% with no cap — usually several times more.
        </span>
      </div>
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errorMsg}</div>
      )}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {processing ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : null}
        Save payment method
      </button>
    </form>
  )
}

// Builds the human-readable label for the saved method row.
// • Card    → "Visa ····4242"
// • ACH     → "Chase Bank ····4321"  (or "Bank account ····4321" if name missing)
// • Comp    → "Test payment method (no real charge)"
// • Unknown → "Saved payment method"
function methodLabel(s: State): string {
  if (!s.stripe_default_payment_method_id && s.payment_complimentary) {
    return 'Test payment method (no real charge)'
  }
  if (s.pm_type === 'card') {
    const brand = (s.pm_brand ?? 'Card').replace(/^\w/, (c) => c.toUpperCase())
    return s.pm_last4 ? `${brand} ····${s.pm_last4}` : brand
  }
  if (s.pm_type === 'us_bank_account') {
    const bank = s.pm_bank_name ?? 'Bank account'
    return s.pm_last4 ? `${bank} ····${s.pm_last4}` : bank
  }
  return 'Saved payment method'
}

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  CreditCard, RefreshCw, ExternalLink, CheckCircle2, AlertTriangle,
  PauseCircle, Sparkles, Loader2, FileText, Receipt,
} from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'

const FREE_UNITS = 2
const PER_UNIT = 3

interface BillingState {
  activeUnits: number
  paidUnits: number
  status: string | null
  quantity: number
  currentPeriodEnd: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  interval: 'month' | 'year' | null
}

interface BillingEvent {
  id: string
  event_type: string
  processed_at: string
}

async function fetchBillingState(managerId: string): Promise<BillingState> {
  const [profileRes, countRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('subscription_status, subscription_quantity, subscription_current_period_end, subscription_interval, stripe_customer_id, stripe_subscription_id')
      .eq('id', managerId)
      .single(),
    supabase.rpc('count_manager_active_units', { manager_uuid: managerId }),
  ])
  const active = Number(countRes.data ?? 0)
  const intervalRaw = profileRes.data?.subscription_interval ?? null
  const interval = intervalRaw === 'month' || intervalRaw === 'year' ? intervalRaw : null
  return {
    activeUnits: active,
    paidUnits: Math.max(0, active - FREE_UNITS),
    status: profileRes.data?.subscription_status ?? null,
    quantity: profileRes.data?.subscription_quantity ?? 0,
    currentPeriodEnd: profileRes.data?.subscription_current_period_end ?? null,
    stripeCustomerId: profileRes.data?.stripe_customer_id ?? null,
    stripeSubscriptionId: profileRes.data?.stripe_subscription_id ?? null,
    interval,
  }
}

export default function Billing() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState<BillingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [events, setEvents] = useState<BillingEvent[]>([])
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')

  // Handle return-from-Checkout messages
  useEffect(() => {
    if (searchParams.get('session_id')) {
      toast.success('Subscription created — billing details will refresh shortly.')
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('canceled')) {
      toast('Checkout canceled — no charges made.', { icon: 'ℹ️' })
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load billing state
  const refresh = async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const next = await fetchBillingState(profile.id)
      setState(next)
      const { data: evs } = await supabase
        .from('billing_events')
        .select('id, event_type, processed_at')
        .eq('manager_id', profile.id)
        .order('processed_at', { ascending: false })
        .limit(10)
      setEvents(evs ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const monthlyCost = (state?.paidUnits ?? 0) * PER_UNIT

  const handleSubscribe = async () => {
    setSubscribing(true)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-subscribe', {
        body: { plan: selectedPlan },
      })
      if (error) throw error
      if (data?.status === 'checkout' && data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      if (data?.status === 'manage' && data.portalUrl) {
        window.location.href = data.portalUrl
        return
      }
      if (data?.status === 'no_payment_needed') {
        toast(data.message ?? 'No payment method needed yet.', { icon: '✓' })
        return
      }
      toast.error(data?.error ?? 'Could not start billing.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Subscription failed')
    } finally {
      setSubscribing(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-sync-quantity', { body: {} })
      if (error) throw error
      if (data?.status === 'updated') {
        toast.success(`Subscription updated to ${data.paidUnits} paid unit${data.paidUnits === 1 ? '' : 's'}`)
      } else if (data?.status === 'unchanged') {
        toast('Already in sync — no changes needed.', { icon: '✓' })
      } else if (data?.status === 'will_cancel') {
        toast('Subscription will cancel at the end of the current period.', { icon: 'ℹ️' })
      } else if (data?.status === 'subscribe_required') {
        toast.error('You need to start a subscription first.')
      } else if (data?.status === 'no_payment_needed') {
        toast('You\'re back in the free tier — nothing to bill.', { icon: '✓' })
      }
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  const statusInfo = getStatusInfo(state.status, state.stripeSubscriptionId)
  const driftDetected = state.stripeSubscriptionId && state.quantity !== state.paidUnits

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Billing</h1>
        <p className="text-sm text-mute mt-1">
          Your first {FREE_UNITS} active units are free. Past that, ${PER_UNIT} per active unit per month.
        </p>
      </header>

      {/* Status banner */}
      <section className={`rounded-2xl border p-4 mb-6 flex items-start gap-3 ${statusInfo.bannerCls}`}>
        <statusInfo.Icon className={`w-5 h-5 mt-0.5 ${statusInfo.iconCls}`} strokeWidth={1.75} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${statusInfo.headingCls}`}>{statusInfo.heading}</p>
          <p className={`text-xs mt-0.5 ${statusInfo.subCls}`}>{statusInfo.subtitle}</p>
        </div>
      </section>

      {/* Math card */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-4">This month's bill</h2>
        <div className="grid sm:grid-cols-4 gap-4">
          <Stat label="Active units" value={String(state.activeUnits)} />
          <Stat label="Free quota" value={`−${FREE_UNITS}`} muted />
          <Stat label="Paid units" value={String(state.paidUnits)} accent />
          <Stat label="Per month" value={`$${monthlyCost}`} accent />
        </div>

        {driftDetected ? (
          <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
            <div className="flex-1">
              Your subscription is billed for <strong>{state.quantity}</strong> units, but you currently have <strong>{state.paidUnits}</strong> paid units active. Sync to fix.
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-amber-900 underline text-xs font-medium hover:no-underline disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        ) : null}

        {state.currentPeriodEnd && state.status === 'active' && (
          <p className="mt-5 text-xs text-mute">
            Next invoice: {new Date(state.currentPeriodEnd).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        )}
      </section>

      {/* Billing cycle toggle — only when not yet subscribed and there are paid units to charge */}
      {!state.stripeSubscriptionId && state.paidUnits > 0 && (
        <section className="mb-4">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">Billing cycle</p>
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setSelectedPlan('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPlan === 'monthly' ? 'bg-brand-500 text-white' : 'text-ink hover:bg-gray-50'
              }`}
            >
              Monthly · $3/unit
            </button>
            <button
              type="button"
              onClick={() => setSelectedPlan('annual')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPlan === 'annual' ? 'bg-brand-500 text-white' : 'text-ink hover:bg-gray-50'
              }`}
            >
              Annual · $30/unit/yr <span className="text-xs opacity-80">(save 16.7%)</span>
            </button>
          </div>
          {selectedPlan === 'annual' && (
            <p className="text-xs text-amber-700 mt-2 inline-flex items-start gap-1.5 max-w-md">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} />
              Annual prepayments are non-refundable. Removing units mid-year does not generate a credit.
            </p>
          )}
        </section>
      )}

      {/* Actions */}
      <section className="grid sm:grid-cols-2 gap-4 mb-6">
        {state.stripeSubscriptionId ? (
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="bg-white rounded-2xl border border-gray-200 p-5 text-left hover:border-brand-300 hover:shadow-sm transition-all group disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <ExternalLink className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
              {subscribing && <Loader2 className="w-4 h-4 animate-spin text-mute" />}
            </div>
            <p className="mt-3 font-semibold text-ink">Manage billing</p>
            <p className="text-xs text-mute mt-1">Update payment method, view invoices, change plan.</p>
          </button>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={subscribing || state.paidUnits === 0}
            className="bg-brand-50 rounded-2xl border-2 border-brand-200 p-5 text-left hover:border-brand-400 hover:bg-brand-100/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between">
              <Sparkles className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
              {subscribing && <Loader2 className="w-4 h-4 animate-spin text-mute" />}
            </div>
            <p className="mt-3 font-semibold text-ink">
              {state.paidUnits === 0
                ? 'No payment method needed yet'
                : selectedPlan === 'annual' ? 'Prepay annual' : 'Start subscription'}
            </p>
            <p className="text-xs text-mute mt-1">
              {state.paidUnits === 0
                ? `Your ${state.activeUnits} active unit${state.activeUnits === 1 ? '' : 's'} fit${state.activeUnits === 1 ? 's' : ''} in the free quota.`
                : selectedPlan === 'annual'
                  ? `One-time charge of $${state.paidUnits * 30} for ${state.paidUnits} unit${state.paidUnits === 1 ? '' : 's'} for the year.`
                  : `Add a payment method to bill $${monthlyCost}/mo for ${state.paidUnits} unit${state.paidUnits === 1 ? '' : 's'}.`}
            </p>
          </button>
        )}

        <button
          onClick={handleSync}
          disabled={syncing || !state.stripeSubscriptionId}
          className="bg-white rounded-2xl border border-gray-200 p-5 text-left hover:border-brand-300 hover:shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-between">
            <RefreshCw className={`w-5 h-5 text-brand-600 ${syncing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </div>
          <p className="mt-3 font-semibold text-ink">Sync unit count</p>
          <p className="text-xs text-mute mt-1">Reconcile your subscription quantity with active leases.</p>
        </button>
      </section>

      {/* Plan summary */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-4">Your plan</h2>
        <div className="flex items-start gap-3">
          <CreditCard className="w-5 h-5 text-brand-600 mt-0.5" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="font-semibold text-ink">
              FindStoop Growth — {state.interval === 'year' ? 'annual prepay' : 'monthly'}
              {state.interval === 'year' && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full align-middle">
                  Non-refundable
                </span>
              )}
            </p>
            <p className="text-sm text-mute mt-1">
              {state.interval === 'year'
                ? `$30 per active unit per year, billed up front. Starting with unit #${FREE_UNITS + 1}.`
                : `$${PER_UNIT} per active unit per month, starting with unit #${FREE_UNITS + 1}.`}
              {' '}Includes every platform feature, ACH and card billing for your tenants, lease e-sign, maintenance tracking, and more.
            </p>
            <ul className="mt-3 text-xs text-mute space-y-1">
              {state.interval === 'year' ? (
                <>
                  <li>· Annual prepay is non-refundable — no credits for unit removal mid-year</li>
                  <li>· New units added mid-year bill at the monthly rate until next annual renewal</li>
                  <li>· Cancel any time; access continues through the end of your prepaid term</li>
                </>
              ) : (
                <>
                  <li>· Cancel any time; monthly subscriptions stop at the end of the current billing period</li>
                  <li>· Add or remove units freely — we prorate the difference</li>
                  <li>· Annual prepay available at $30/unit/year (16.7% off the monthly rate) — non-refundable</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* Recent events */}
      {events.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-4">Recent billing activity</h2>
          <ul className="divide-y divide-gray-100">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink inline-flex items-center gap-2">
                  {ev.event_type.startsWith('invoice') ? (
                    <Receipt className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  ) : (
                    <FileText className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  )}
                  {prettifyEvent(ev.event_type)}
                </span>
                <span className="text-xs text-mute">
                  {new Date(ev.processed_at).toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div>
      <p className={`text-xs uppercase tracking-wider font-semibold ${muted ? 'text-mute-400' : 'text-mute'}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? 'text-brand-600' : muted ? 'text-mute-400' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}

function getStatusInfo(status: string | null, subscriptionId: string | null) {
  if (!subscriptionId || !status) {
    return {
      heading: 'No subscription yet',
      subtitle: 'You\'re in the free tier. We\'ll prompt you when you cross the free quota.',
      Icon: PauseCircle,
      bannerCls: 'bg-gray-50 border-gray-200',
      iconCls: 'text-mute',
      headingCls: 'text-ink',
      subCls: 'text-mute',
    }
  }
  if (status === 'active' || status === 'trialing') {
    return {
      heading: 'Subscription active',
      subtitle: 'Paid units are billed automatically each month.',
      Icon: CheckCircle2,
      bannerCls: 'bg-green-50 border-green-200',
      iconCls: 'text-green-700',
      headingCls: 'text-green-900',
      subCls: 'text-green-800',
    }
  }
  if (status === 'past_due' || status === 'unpaid') {
    return {
      heading: 'Payment past due',
      subtitle: 'A recent invoice failed. Update your payment method to keep service.',
      Icon: AlertTriangle,
      bannerCls: 'bg-red-50 border-red-200',
      iconCls: 'text-red-700',
      headingCls: 'text-red-900',
      subCls: 'text-red-800',
    }
  }
  if (status === 'canceled') {
    return {
      heading: 'Subscription canceled',
      subtitle: 'Access continues through the end of your last paid period.',
      Icon: PauseCircle,
      bannerCls: 'bg-amber-50 border-amber-200',
      iconCls: 'text-amber-700',
      headingCls: 'text-amber-900',
      subCls: 'text-amber-800',
    }
  }
  return {
    heading: `Subscription status: ${status}`,
    subtitle: 'Something needs your attention. Open billing to review.',
    Icon: AlertTriangle,
    bannerCls: 'bg-amber-50 border-amber-200',
    iconCls: 'text-amber-700',
    headingCls: 'text-amber-900',
    subCls: 'text-amber-800',
  }
}

function prettifyEvent(t: string) {
  return t.split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1).split('_').join(' ')).join(' · ')
}

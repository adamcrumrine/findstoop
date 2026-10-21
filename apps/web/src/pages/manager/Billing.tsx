// Billing — Stoop is free for landlords (pricing decision 2026-10-20).
//
// There is no subscription to start or manage any more (no landlord ever
// completed one). What's left is the billing-event history, if any. Payment
// processing for rent is passed through to the payer, and payouts are set up
// in Settings, not here.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Receipt, FileText } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'

interface BillingEvent {
  id: string
  event_type: string
  processed_at: string
}

export default function Billing() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<BillingEvent[]>([])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('billing_events')
        .select('id, event_type, processed_at')
        .eq('manager_id', profile.id)
        .order('processed_at', { ascending: false })
        .limit(10)
      if (cancelled) return
      setEvents((data ?? []) as BillingEvent[])
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Billing</h1>
      </header>

      <section className="rounded-2xl border border-brand-200 bg-brand-50 p-5 mb-6 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 mt-0.5 text-brand-700" strokeWidth={1.75} />
        <div>
          <p className="text-sm font-semibold text-brand-900">{BRAND.name} is free for landlords</p>
          <p className="text-xs text-brand-800 mt-1 leading-relaxed">
            Every feature, every unit, no subscription. Applicants pay for their own Tenability™ screening,
            and rent-payment processing is paid by whoever pays rent. Rent deposits to the bank account you
            connect in <Link to="/manager/settings" className="underline">Settings</Link>.
          </p>
        </div>
      </section>

      {events.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-4">Past billing activity</h2>
          <ul className="divide-y divide-gray-100">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink inline-flex items-center gap-2">
                    {ev.event_type.startsWith('invoice')
                      ? <Receipt className="w-4 h-4 text-mute" strokeWidth={1.75} />
                      : <FileText className="w-4 h-4 text-mute" strokeWidth={1.75} />}
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

function prettifyEvent(t: string) {
  const KNOWN: Record<string, string> = {
    'customer.subscription.created': 'Subscription started',
    'customer.subscription.updated': 'Subscription updated',
    'customer.subscription.deleted': 'Subscription canceled',
    'invoice.paid': 'Invoice paid',
    'invoice.payment_succeeded': 'Invoice paid',
    'invoice.payment_failed': 'Invoice payment failed',
    'invoice.created': 'Invoice issued',
    'invoice.finalized': 'Invoice issued',
  }
  return KNOWN[t] ?? t.split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1).split('_').join(' ')).join(' · ')
}

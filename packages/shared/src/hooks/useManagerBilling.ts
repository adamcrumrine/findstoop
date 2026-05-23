import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ManagerBilling {
  /** True when the manager has an active or trialing Stripe subscription. */
  subscriptionActive: boolean
  /** Still resolving the lookup. */
  loading: boolean
}

// Light-weight hook for manager-side pages that need to know whether the
// landlord has a paid FindStoop subscription. Used to gate signing flows
// behind the paywall — when no subscription, "Sign now" buttons flip to
// "Subscribe to continue" and route to /manager/billing.
export function useManagerBilling(managerId: string | undefined): ManagerBilling {
  const [subscriptionActive, setSubscriptionActive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!managerId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('stripe_subscription_id, subscription_status')
      .eq('id', managerId)
      .maybeSingle()
      .then((res) => {
        if (cancelled) return
        const d = res.data as { stripe_subscription_id?: string | null; subscription_status?: string | null } | null
        const active = !!d?.stripe_subscription_id &&
          (d?.subscription_status === 'active' || d?.subscription_status === 'trialing')
        setSubscriptionActive(active)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [managerId])

  return { subscriptionActive, loading }
}

import { useState, useEffect } from 'react'
import { useForegroundRefresh } from './useForegroundRefresh'
import { getTenantActiveLease } from '../api/leases'
import { getTenantPayments, getTenantUpcomingPayments, getNextDuePayment } from '../api/payments'
import { getTenantMaintenanceRequests } from '../api/maintenance'
import { getUnreadMessageCount } from '../api/messages'
import { supabase } from '../lib/supabase'
import type { Lease } from '../types/lease'
import type { Payment } from '../types/payment'
import type { MaintenanceRequest } from '../types/maintenance'

export interface TenantDashboardData {
  lease: Lease | null
  nextPayment: Payment | null
  upcomingPayments: Payment[]
  recentPayments: Payment[]
  recentMaintenance: MaintenanceRequest[]
  unreadMessages: number
  paymentMethodSetup: boolean
  autopayEnabled: boolean
  loading: boolean
  error: string | null
}

export function useTenantDashboard(tenantId: string | undefined): TenantDashboardData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lease, setLease] = useState<Lease | null>(null)
  const [nextPayment, setNextPayment] = useState<Payment | null>(null)
  const [upcomingPayments, setUpcomingPayments] = useState<Payment[]>([])
  const [recentPayments, setRecentPayments] = useState<Payment[]>([])
  const [recentMaintenance, setRecentMaintenance] = useState<MaintenanceRequest[]>([])
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [paymentMethodSetup, setPaymentMethodSetup] = useState(false)
  const [autopayEnabled, setAutopayEnabled] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  useForegroundRefresh(() => setRefreshTick((t) => t + 1))

  useEffect(() => {
    if (!tenantId) { setLoading(false); return }
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const [activeLease, history, upcoming, maintenance, unread, nextDue, profileRow] = await Promise.all([
          getTenantActiveLease(tenantId),
          getTenantPayments(tenantId, 5),
          getTenantUpcomingPayments(tenantId, 5),
          getTenantMaintenanceRequests(tenantId, 3),
          getUnreadMessageCount(tenantId),
          getNextDuePayment(tenantId),
          supabase.from('profiles').select('payment_method_setup_at, autopay_enabled').eq('id', tenantId).maybeSingle(),
        ])

        if (cancelled) return
        setLease(activeLease)
        setRecentPayments(history)
        setUpcomingPayments(upcoming)
        setRecentMaintenance(maintenance)
        setUnreadMessages(unread)
        setNextPayment(nextDue)
        const profileData = profileRow.data as { payment_method_setup_at?: string | null; autopay_enabled?: boolean } | null
        setPaymentMethodSetup(!!profileData?.payment_method_setup_at)
        setAutopayEnabled(!!profileData?.autopay_enabled)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [tenantId, refreshTick])

  return { lease, nextPayment, upcomingPayments, recentPayments, recentMaintenance, unreadMessages, paymentMethodSetup, autopayEnabled, loading, error }
}

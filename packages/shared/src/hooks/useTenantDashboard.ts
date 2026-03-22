import { useState, useEffect } from 'react'
import { getTenantActiveLease } from '../api/leases'
import { getTenantPayments, getNextDuePayment } from '../api/payments'
import { getTenantMaintenanceRequests } from '../api/maintenance'
import { getUnreadMessageCount } from '../api/messages'
import type { Lease } from '../types/lease'
import type { Payment } from '../types/payment'
import type { MaintenanceRequest } from '../types/maintenance'

export interface TenantDashboardData {
  lease: Lease | null
  nextPayment: Payment | null
  recentPayments: Payment[]
  recentMaintenance: MaintenanceRequest[]
  unreadMessages: number
  loading: boolean
  error: string | null
}

export function useTenantDashboard(tenantId: string | undefined): TenantDashboardData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lease, setLease] = useState<Lease | null>(null)
  const [nextPayment, setNextPayment] = useState<Payment | null>(null)
  const [recentPayments, setRecentPayments] = useState<Payment[]>([])
  const [recentMaintenance, setRecentMaintenance] = useState<MaintenanceRequest[]>([])
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const [activeLease, payments, maintenance, unread, nextDue] = await Promise.all([
          getTenantActiveLease(tenantId),
          getTenantPayments(tenantId, 3),
          getTenantMaintenanceRequests(tenantId, 3),
          getUnreadMessageCount(tenantId),
          getNextDuePayment(tenantId),
        ])

        if (cancelled) return
        setLease(activeLease)
        setRecentPayments(payments)
        setRecentMaintenance(maintenance)
        setUnreadMessages(unread)
        setNextPayment(nextDue)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [tenantId])

  return { lease, nextPayment, recentPayments, recentMaintenance, unreadMessages, loading, error }
}

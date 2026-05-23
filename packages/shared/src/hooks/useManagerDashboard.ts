import { useState, useEffect } from 'react'
import { getProperties } from '../api/properties'
import { getUnits } from '../api/units'
import { getLeases, getUpcomingLeaseRenewals } from '../api/leases'
import { getRecentPayments, getPaymentsByLeaseIds } from '../api/payments'
import { getMaintenanceRequests } from '../api/maintenance'
import { supabase } from '../lib/supabase'
import type { Property } from '../types/property'
import type { Unit } from '../types/unit'
import type { Lease } from '../types/lease'
import type { Payment } from '../types/payment'
import type { MaintenanceRequest } from '../types/maintenance'

export interface DashboardStats {
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  rentCollectedThisMonth: number
  outstandingPayments: number
  openMaintenanceRequests: number
}

export interface DashboardData {
  stats: DashboardStats
  recentPayments: Payment[]
  openMaintenance: MaintenanceRequest[]
  upcomingRenewals: Lease[]
  /** Leases the tenant has e-signed but the manager hasn't — waiting on the
   *  manager to finalize. Surfaced as a CTA on the dashboard. */
  awaitingManagerSignature: Lease[]
  /** True once the manager has at least one fully-signed lease but no
   *  active FindStoop subscription. Surfaces a hard CTA to complete billing. */
  needsBillingSetup: boolean
  properties: Property[]
  units: Unit[]
  leases: Lease[]
  loading: boolean
  error: string | null
}

export function useManagerDashboard(managerId: string | undefined): DashboardData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [leases, setLeases] = useState<Lease[]>([])
  const [recentPayments, setRecentPayments] = useState<Payment[]>([])
  const [allPayments, setAllPayments] = useState<Payment[]>([])
  const [openMaintenance, setOpenMaintenance] = useState<MaintenanceRequest[]>([])
  const [upcomingRenewals, setUpcomingRenewals] = useState<Lease[]>([])
  const [awaitingManagerSignature, setAwaitingManagerSignature] = useState<Lease[]>([])
  const [needsBillingSetup, setNeedsBillingSetup] = useState(false)

  useEffect(() => {
    if (!managerId) {
      // Without a manager id we can't load — flip loading off so the page
      // can render its (empty) state instead of spinning forever.
      setLoading(false)
      return
    }
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const props = await getProperties(managerId)
        if (cancelled) return
        setProperties(props)

        const propertyIds = props.map((p) => p.id)
        const allUnits = await getUnits(propertyIds)
        if (cancelled) return
        setUnits(allUnits)

        const unitIds = allUnits.map((u) => u.id)
        const [allLeases, maintenance, renewals] = await Promise.all([
          getLeases(unitIds),
          getMaintenanceRequests(unitIds),
          getUpcomingLeaseRenewals(unitIds),
        ])
        if (cancelled) return
        setLeases(allLeases)
        setOpenMaintenance(maintenance.filter((m) => m.status === 'open' || m.status === 'in_progress'))
        setUpcomingRenewals(renewals)

        const leaseIds = allLeases.map((l) => l.id)
        const [recent, all, sigsRes] = await Promise.all([
          getRecentPayments(leaseIds, 5),
          getPaymentsByLeaseIds(leaseIds),
          // Fetch all signatures across the manager's leases. We use this to
          // identify leases where the tenant has signed but the manager
          // hasn't yet — the dashboard surfaces these as a CTA.
          leaseIds.length > 0
            ? supabase.from('lease_signatures').select('lease_id, signer_role').in('lease_id', leaseIds)
            : Promise.resolve({ data: [] as Array<{ lease_id: string; signer_role: string }> }),
        ])
        if (cancelled) return
        setRecentPayments(recent)
        setAllPayments(all)

        // Group signatures by lease, then surface leases where the tenant has
        // signed but no manager/admin has. Exclude fully-signed leases.
        const rolesByLease = new Map<string, Set<string>>()
        const sigs = (sigsRes as { data?: Array<{ lease_id: string; signer_role: string }> }).data ?? []
        for (const s of sigs) {
          const set = rolesByLease.get(s.lease_id) ?? new Set<string>()
          set.add(s.signer_role)
          rolesByLease.set(s.lease_id, set)
        }
        const awaiting = allLeases.filter((l) => {
          if (l.signed_at) return false
          if (l.status === 'terminated' || l.status === 'expired') return false
          const roles = rolesByLease.get(l.id)
          if (!roles) return false
          return roles.has('tenant') && !roles.has('manager') && !roles.has('admin')
        })
        setAwaitingManagerSignature(awaiting)

        // Billing-setup detection: if the manager has any fully-signed lease
        // (or the tenant has signed and they're about to finalize), check
        // whether their FindStoop subscription is active. If not, surface a
        // hard CTA on the dashboard.
        const hasExecutedLease = allLeases.some((l) => l.signed_at != null) ||
          awaiting.length > 0
        if (hasExecutedLease) {
          const { data: subData } = await supabase
            .from('profiles')
            .select('stripe_subscription_id, subscription_status')
            .eq('id', managerId)
            .single()
          const sub = subData as { stripe_subscription_id?: string | null; subscription_status?: string | null } | null
          const subscriptionActive = !!sub?.stripe_subscription_id &&
            (sub?.subscription_status === 'active' || sub?.subscription_status === 'trialing')
          if (!cancelled) setNeedsBillingSetup(!subscriptionActive)
        } else {
          if (!cancelled) setNeedsBillingSetup(false)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [managerId])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const stats: DashboardStats = {
    totalUnits: units.length,
    occupiedUnits: units.filter((u) => u.status === 'occupied').length,
    vacantUnits: units.filter((u) => u.status === 'vacant').length,
    rentCollectedThisMonth: allPayments
      .filter((p) => p.status === 'completed' && p.paid_at && p.paid_at >= startOfMonth)
      .reduce((sum, p) => sum + Number(p.amount), 0),
    outstandingPayments: allPayments
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + Number(p.amount), 0),
    openMaintenanceRequests: openMaintenance.length,
  }

  return {
    stats,
    recentPayments,
    openMaintenance: openMaintenance.slice(0, 5),
    upcomingRenewals,
    awaitingManagerSignature,
    needsBillingSetup,
    properties,
    units,
    leases,
    loading,
    error,
  }
}

import { useState, useEffect } from 'react'
import { getProperties } from '../api/properties'
import { getUnits } from '../api/units'
import { getLeases, getUpcomingLeaseRenewals } from '../api/leases'
import { getRecentPayments, getPaymentsByLeaseIds } from '../api/payments'
import { getMaintenanceRequests } from '../api/maintenance'
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

  useEffect(() => {
    if (!managerId) return
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
        const [recent, all] = await Promise.all([
          getRecentPayments(leaseIds, 5),
          getPaymentsByLeaseIds(leaseIds),
        ])
        if (cancelled) return
        setRecentPayments(recent)
        setAllPayments(all)
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
    properties,
    units,
    leases,
    loading,
    error,
  }
}

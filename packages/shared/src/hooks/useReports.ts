import { useState, useEffect, useCallback } from 'react'
import { getProperties } from '../api/properties'
import { getUnits } from '../api/units'
import { getLeases } from '../api/leases'
import { getAllPayments } from '../api/payments'
import { getMaintenanceRequests } from '../api/maintenance'
import type { Payment } from '../types/payment'
import type { MaintenanceRequest } from '../types/maintenance'
import type { Unit } from '../types/unit'
import type { Lease } from '../types/lease'

export interface MonthlyRevenue {
  month: string   // 'Jan', 'Feb', …
  collected: number
  outstanding: number
}

export interface OccupancyData {
  occupied: number
  vacant: number
  total: number
  rate: number  // percentage 0-100
}

export interface MaintenanceStats {
  open: number
  in_progress: number
  resolved: number
  closed: number
  avgResolutionDays: number | null
}

export interface CollectionRate {
  month: string
  rate: number  // percentage 0-100
  collected: number
  due: number
}

export interface ReportsData {
  monthlyRevenue: MonthlyRevenue[]
  occupancy: OccupancyData
  maintenanceStats: MaintenanceStats
  collectionRates: CollectionRate[]
  totalRevenueYTD: number
  totalProperties: number
  activeLeases: number
  loading: boolean
  error: string | null
}

function getLast6Months(): { label: string; year: number; month: number }[] {
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      label: d.toLocaleString('default', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(), // 0-indexed
    })
  }
  return months
}

function computeMonthlyRevenue(payments: Payment[]): MonthlyRevenue[] {
  const months = getLast6Months()
  return months.map(({ label, year, month }) => {
    const monthPayments = payments.filter((p) => {
      const d = new Date(p.created_at)
      return d.getFullYear() === year && d.getMonth() === month
    })
    const collected = monthPayments
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0)
    const outstanding = monthPayments
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0)
    return { month: label, collected, outstanding }
  })
}

function computeCollectionRates(payments: Payment[]): CollectionRate[] {
  const months = getLast6Months()
  return months.map(({ label, year, month }) => {
    const monthPayments = payments.filter((p) => {
      const d = new Date(p.created_at)
      return d.getFullYear() === year && d.getMonth() === month
    })
    const due = monthPayments.reduce((sum, p) => sum + p.amount, 0)
    const collected = monthPayments
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0)
    const rate = due > 0 ? Math.round((collected / due) * 100) : 0
    return { month: label, rate, collected, due }
  })
}

function computeOccupancy(units: Unit[]): OccupancyData {
  const occupied = units.filter((u) => u.status === 'occupied').length
  const total = units.length
  return {
    occupied,
    vacant: total - occupied,
    total,
    rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
  }
}

function computeMaintenanceStats(requests: MaintenanceRequest[]): MaintenanceStats {
  const resolved = requests.filter((r) => r.status === 'resolved' || r.status === 'closed')
  const avgDays = resolved.length > 0
    ? Math.round(
        resolved
          .filter((r) => r.resolved_at)
          .reduce((sum, r) => {
            const created = new Date(r.created_at).getTime()
            const resolvedAt = new Date(r.resolved_at!).getTime()
            return sum + (resolvedAt - created) / (1000 * 60 * 60 * 24)
          }, 0) / resolved.filter((r) => r.resolved_at).length
      )
    : null

  return {
    open: requests.filter((r) => r.status === 'open').length,
    in_progress: requests.filter((r) => r.status === 'in_progress').length,
    resolved: requests.filter((r) => r.status === 'resolved').length,
    closed: requests.filter((r) => r.status === 'closed').length,
    avgResolutionDays: isNaN(avgDays as number) ? null : avgDays,
  }
}

export function useReports(managerId: string | undefined): ReportsData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([])
  const [occupancy, setOccupancy] = useState<OccupancyData>({ occupied: 0, vacant: 0, total: 0, rate: 0 })
  const [maintenanceStats, setMaintenanceStats] = useState<MaintenanceStats>({ open: 0, in_progress: 0, resolved: 0, closed: 0, avgResolutionDays: null })
  const [collectionRates, setCollectionRates] = useState<CollectionRate[]>([])
  const [totalRevenueYTD, setTotalRevenueYTD] = useState(0)
  const [totalProperties, setTotalProperties] = useState(0)
  const [activeLeases, setActiveLeases] = useState(0)

  const load = useCallback(async () => {
    if (!managerId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const properties = await getProperties(managerId)
      setTotalProperties(properties.length)
      if (properties.length === 0) { setLoading(false); return }

      const propertyIds = properties.map((p) => p.id)
      const units = await getUnits(propertyIds)
      const unitIds = units.map((u) => u.id)

      const [leases, maintenance] = await Promise.all([
        getLeases(unitIds),
        getMaintenanceRequests(unitIds),
      ])

      const leaseIds = leases.map((l: Lease) => l.id)
      const payments = leaseIds.length > 0 ? await getAllPayments(leaseIds) : []

      // Compute all metrics
      setOccupancy(computeOccupancy(units))
      setMaintenanceStats(computeMaintenanceStats(maintenance))
      setMonthlyRevenue(computeMonthlyRevenue(payments))
      setCollectionRates(computeCollectionRates(payments))
      setActiveLeases(leases.filter((l: Lease) => l.status === 'active').length)

      const ytdStart = new Date(new Date().getFullYear(), 0, 1)
      const ytd = payments
        .filter((p) => p.status === 'completed' && new Date(p.paid_at ?? p.created_at) >= ytdStart)
        .reduce((sum, p) => sum + p.amount, 0)
      setTotalRevenueYTD(ytd)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [managerId])

  useEffect(() => { load() }, [load])

  return {
    monthlyRevenue,
    occupancy,
    maintenanceStats,
    collectionRates,
    totalRevenueYTD,
    totalProperties,
    activeLeases,
    loading,
    error,
  }
}

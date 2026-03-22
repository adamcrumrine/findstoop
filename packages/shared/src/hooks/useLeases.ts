import { useState, useEffect, useCallback, useMemo } from 'react'
import { getLeases, getLeasesWithTenants, createLease, updateLease } from '../api/leases'
import { getProfiles } from '../api/profiles'
import type { Lease, LeaseStatus } from '../types/lease'
import type { Profile } from '../types/profile'

export interface LeaseWithTenant extends Lease {
  profile: Profile | null
}

export function useLeases(unitIds: string[]) {
  const [leases, setLeases] = useState<LeaseWithTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const key = unitIds.join(',')

  const load = useCallback(async () => {
    if (unitIds.length === 0) { setLeases([]); setLoading(false); return }
    try {
      setLoading(true)
      setError(null)
      const data = await getLeasesWithTenants(unitIds)
      setLeases(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leases')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => { load() }, [load])

  const add = async (data: Omit<Lease, 'id' | 'created_at'>) => {
    const lease = await createLease(data)
    const profiles = await getProfiles([lease.tenant_id])
    const withTenant: LeaseWithTenant = { ...lease, profile: profiles[0] ?? null }
    setLeases((prev) => [withTenant, ...prev])
    return lease
  }

  const update = async (id: string, data: Partial<Omit<Lease, 'id' | 'created_at'>>) => {
    const lease = await updateLease(id, data)
    setLeases((prev) => prev.map((l) => l.id === id ? { ...l, ...lease } : l))
    return lease
  }

  const filterByStatus = (status: LeaseStatus | 'all') =>
    status === 'all' ? leases : leases.filter((l) => l.status === status)

  return { leases, loading, error, add, update, filterByStatus, reload: load }
}

export function useTenants(unitIds: string[]) {
  const [tenants, setTenants] = useState<Profile[]>([])
  const [leases, setLeases] = useState<Lease[]>([])
  const [loading, setLoading] = useState(true)

  const key = unitIds.join(',')

  useEffect(() => {
    if (unitIds.length === 0) { setTenants([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)

    getLeases(unitIds).then(async (leaseData) => {
      if (cancelled) return
      setLeases(leaseData)
      const tenantIds = [...new Set(leaseData.map((l) => l.tenant_id))]
      const profileData = await getProfiles(tenantIds)
      if (!cancelled) { setTenants(profileData); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const getActiveLease = useMemo(() => (tenantId: string) =>
    leases.find((l) => l.tenant_id === tenantId && l.status === 'active') ?? null,
    [leases]
  )

  return { tenants, leases, loading, getActiveLease }
}

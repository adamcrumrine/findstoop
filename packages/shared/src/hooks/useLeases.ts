import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getLeases, getLeasesWithTenants, getAllLeaseTenantIds,
  getLeaseTenantsForLeaseIds, createLease, updateLease,
} from '../api/leases'
import { getProfiles } from '../api/profiles'
import { syncSubscriptionQuantity } from '../api/billing'
import type { Lease, LeaseStatus } from '../types/lease'
import type { Profile } from '../types/profile'

// Fire-and-forget background sync. We only want to call when a change
// crosses the "active" boundary, since paid-unit count is derived from
// active leases.
function maybeSyncSubscription(prevStatus: LeaseStatus | undefined, nextStatus: LeaseStatus | undefined) {
  const crossesActive =
    (prevStatus !== 'active' && nextStatus === 'active') ||
    (prevStatus === 'active' && nextStatus !== 'active')
  if (crossesActive) {
    void syncSubscriptionQuantity()
  }
}

export interface LeaseWithTenant extends Lease {
  profile: Profile | null      // legacy primary (leases.tenant_id) — kept for back-compat
  // All tenants on the lease (primary + co-tenants via lease_tenants).
  // Populated by useLeases. Empty/undefined on older callers.
  all_tenants?: Profile[]
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
      // Also pull every (lease_id, tenant_id) pair so the card can render
      // an avatar stack of all tenants — not just the legacy primary on
      // leases.tenant_id. Then bulk-fetch profiles for those tenant_ids.
      const leaseIds = data.map((l) => l.id)
      const { data: ltRows } = await getLeaseTenantsForLeaseIds(leaseIds)
      const allTenantIds = Array.from(new Set(ltRows.map((r) => r.tenant_id)))
      const profileList = await getProfiles(allTenantIds)
      const profilesById = new Map(profileList.map((p) => [p.id, p]))
      const tenantsByLease = new Map<string, Profile[]>()
      for (const row of ltRows) {
        const profile = profilesById.get(row.tenant_id)
        if (!profile) continue
        const arr = tenantsByLease.get(row.lease_id) ?? []
        arr.push(profile)
        tenantsByLease.set(row.lease_id, arr)
      }
      const enriched = data.map((l) => ({
        ...l,
        all_tenants: tenantsByLease.get(l.id) ?? (l.profile ? [l.profile] : []),
      }))
      setLeases(enriched)
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
    // If the new lease started as active, paid-unit count just went up.
    maybeSyncSubscription(undefined, lease.status)
    return lease
  }

  const update = async (id: string, data: Partial<Omit<Lease, 'id' | 'created_at'>>) => {
    const previous = leases.find((l) => l.id === id)
    const lease = await updateLease(id, data)
    setLeases((prev) => prev.map((l) => l.id === id ? { ...l, ...lease } : l))
    maybeSyncSubscription(previous?.status, lease.status)
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

    // Fetch leases + ALL associated tenant_ids (primary + co-tenants via
    // lease_tenants). Without the junction-table lookup, roommates added
    // during import or via the manual flow are invisible on the Tenants
    // screen — only the primary lessee shows up.
    Promise.all([getLeases(unitIds), getAllLeaseTenantIds(unitIds)])
      .then(async ([leaseData, allTenantIds]) => {
        if (cancelled) return
        setLeases(leaseData)
        const profileData = await getProfiles(allTenantIds)
        if (!cancelled) { setTenants(profileData); setLoading(false) }
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Co-tenants don't have their id on leases.tenant_id, so we also need to
  // resolve the active lease via the lease_tenants junction. The leases
  // array still only carries the primary tenant_id, but the tenants list
  // (above) already includes co-tenants — so we just need ANY active lease
  // for a unit they appear on. We approximate by tying the tenant back to
  // a lease through their card on the Tenants page (the lease_tenants
  // join table query lives in TenantDetail). For the list view, showing
  // "Active" when the tenant is on any active-status lease via the junction
  // is good enough.
  // Map of tenant_id → all leases they appear on (primary OR co-tenant
  // via lease_tenants). Used for both the "active lease" lookup AND for
  // filtering tenants by lease status on the Tenants screen.
  const [leasesByTenant, setLeasesByTenant] = useState<Record<string, Lease[]>>({})
  useEffect(() => {
    if (leases.length === 0) { setLeasesByTenant({}); return }
    let cancelled = false
    ;(async () => {
      const leaseIds = leases.map((l) => l.id)
      const { data } = await getLeaseTenantsForLeaseIds(leaseIds)
      if (cancelled) return
      const map: Record<string, Lease[]> = {}
      for (const row of data) {
        const lease = leases.find((l) => l.id === row.lease_id)
        if (!lease) continue
        if (!map[row.tenant_id]) map[row.tenant_id] = []
        map[row.tenant_id].push(lease)
      }
      // Also include the legacy primary tenant_id linkage (covers any
      // lease where the join row hasn't been backfilled).
      for (const lease of leases) {
        if (!lease.tenant_id) continue
        const arr = map[lease.tenant_id] ?? []
        if (!arr.some((l) => l.id === lease.id)) arr.push(lease)
        map[lease.tenant_id] = arr
      }
      setLeasesByTenant(map)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases.map((l) => `${l.id}:${l.status}`).join(',')])

  const getActiveLease = useMemo(() => (tenantId: string) =>
    (leasesByTenant[tenantId] ?? []).find((l) => l.status === 'active')
      ?? leases.find((l) => l.tenant_id === tenantId && l.status === 'active')
      ?? null,
    [leases, leasesByTenant]
  )

  const getLeasesForTenant = useMemo(() => (tenantId: string): Lease[] =>
    leasesByTenant[tenantId] ?? [],
    [leasesByTenant]
  )

  return { tenants, leases, loading, getActiveLease, getLeasesForTenant }
}

import { supabase } from '../lib/supabase'
import type { Lease } from '../types/lease'
import type { Profile } from '../types/profile'

// Returns the tenant's current lease.
//   • Active leases always count.
//   • Pending leases only count once the manager has clicked "Send for
//     signature" (sent_for_signature_at is non-null). A pending lease that's
//     still being reviewed/edited by the manager must NOT appear in the
//     tenant's portal — they shouldn't see it until it's ready.
// Active is preferred when both somehow exist (lease renewal overlap, etc.).
// Returns the tenant's "current" lease — the one their portal should
// surface as the working lease (dashboard, documents, pay rent, etc).
// Priority: active → upcoming (signed, future start) → pending+sent.
// Upcoming was missed when that status was introduced, which left
// tenants on signed-but-future leases with an empty portal.
export async function getTenantActiveLease(tenantId: string): Promise<Lease | null> {
  const selection = '*, unit:units(unit_number, properties(name, address, city, state, zip, student_housing))'

  // Lease membership lives in lease_tenants — every roommate has a row there.
  // leases.tenant_id is a LEGACY single-tenant pointer (migration
  // 20260525000003), so filtering on it alone returned nothing for co-tenants
  // and left them with an empty portal and a dead Pay Rent button. Resolve the
  // caller's lease ids first, then match those OR the legacy pointer (which
  // covers any lease that has no lease_tenants rows).
  const { data: memberships } = await supabase
    .from('lease_tenants')
    .select('lease_id')
    .eq('tenant_id', tenantId)
  const leaseIds = (memberships ?? []).map((m) => (m as { lease_id: string }).lease_id)
  const mine = leaseIds.length > 0
    ? `id.in.(${leaseIds.join(',')}),tenant_id.eq.${tenantId}`
    : null

  const { data: active } = await (mine
    ? supabase.from('leases').select(selection).or(mine)
    : supabase.from('leases').select(selection).eq('tenant_id', tenantId))
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (active) return active as unknown as Lease

  // Signed but future-start — tenant should still see documents, lease,
  // and any pre-move-in comms / inspections their landlord has prepared.
  const { data: upcoming } = await (mine
    ? supabase.from('leases').select(selection).or(mine)
    : supabase.from('leases').select(selection).eq('tenant_id', tenantId))
    .eq('status', 'upcoming')
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (upcoming) return upcoming as unknown as Lease

  const { data: pendingSent } = await (mine
    ? supabase.from('leases').select(selection).or(mine)
    : supabase.from('leases').select(selection).eq('tenant_id', tenantId))
    .eq('status', 'pending')
    .not('sent_for_signature_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (pendingSent ?? null) as unknown as Lease | null
}

export async function getLeases(unitIds: string[]): Promise<Lease[]> {
  if (unitIds.length === 0) return []
  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .in('unit_id', unitIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

// Returns every (lease_id, tenant_id) pair from lease_tenants for the
// given lease ids — used to resolve which tenants are on which leases
// when one tenant might be a co-tenant rather than the primary on
// leases.tenant_id.
export async function getLeaseTenantsForLeaseIds(leaseIds: string[]): Promise<{ data: Array<{ lease_id: string; tenant_id: string }> }> {
  if (leaseIds.length === 0) return { data: [] }
  const { data } = await supabase
    .from('lease_tenants')
    .select('lease_id, tenant_id')
    .in('lease_id', leaseIds)
  return { data: (data ?? []) as Array<{ lease_id: string; tenant_id: string }> }
}

// Returns every tenant_id appearing on any lease in the given unit list,
// across BOTH leases.tenant_id (the legacy primary tenant column) and the
// lease_tenants junction table (where co-tenants/roommates live). Use this
// when surfacing tenants — otherwise the Tenants page only shows the
// primary on each lease and co-tenants get hidden.
export async function getAllLeaseTenantIds(unitIds: string[]): Promise<string[]> {
  if (unitIds.length === 0) return []
  const ids = new Set<string>()
  // Primary tenant_id from each lease (covers legacy single-tenant leases).
  const { data: leaseRows } = await supabase
    .from('leases')
    .select('id, tenant_id')
    .in('unit_id', unitIds)
  const leaseIds: string[] = []
  for (const row of (leaseRows ?? []) as Array<{ id: string; tenant_id: string }>) {
    if (row.tenant_id) ids.add(row.tenant_id)
    leaseIds.push(row.id)
  }
  // Co-tenants via the join table — picks up roommates added during import
  // or via the manual flows. Includes the primary too (idempotent dedupe
  // via the Set).
  if (leaseIds.length > 0) {
    const { data: ltRows } = await supabase
      .from('lease_tenants')
      .select('tenant_id')
      .in('lease_id', leaseIds)
    for (const row of (ltRows ?? []) as Array<{ tenant_id: string }>) {
      if (row.tenant_id) ids.add(row.tenant_id)
    }
  }
  return Array.from(ids)
}

export async function getUpcomingLeaseRenewals(unitIds: string[]): Promise<Lease[]> {
  if (unitIds.length === 0) return []
  const now = new Date()
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .in('unit_id', unitIds)
    .eq('status', 'active')
    .gte('end_date', now.toISOString().split('T')[0])
    .lte('end_date', in60Days.toISOString().split('T')[0])
    .order('end_date', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createLease(
  data: Omit<Lease, 'id' | 'created_at'>
): Promise<Lease> {
  const { data: result, error } = await supabase
    .from('leases')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateLease(
  id: string,
  data: Partial<Omit<Lease, 'id' | 'created_at'>>
): Promise<Lease> {
  const { data: result, error } = await supabase
    .from('leases')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function getLeasesWithTenants(unitIds: string[]): Promise<(Lease & { profile: Profile | null })[]> {
  if (unitIds.length === 0) return []
  const { data, error } = await supabase
    .from('leases')
    // Disambiguate the FK path — `lease_tenants` also references profiles,
    // so PostgREST throws PGRST201 without the explicit fkey hint.
    .select('*, profile:profiles!leases_tenant_id_fkey(*)')
    .in('unit_id', unitIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as (Lease & { profile: Profile | null })[]
}

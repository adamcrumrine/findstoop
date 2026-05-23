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
export async function getTenantActiveLease(tenantId: string): Promise<Lease | null> {
  const selection = '*, unit:units(unit_number, properties(name, address, city, state, zip))'
  const { data: active } = await supabase
    .from('leases')
    .select(selection)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (active) return active as unknown as Lease

  const { data: pendingSent } = await supabase
    .from('leases')
    .select(selection)
    .eq('tenant_id', tenantId)
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

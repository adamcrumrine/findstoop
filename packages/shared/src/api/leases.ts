import { supabase } from '../lib/supabase'
import type { Lease } from '../types/lease'

export async function getTenantActiveLease(tenantId: string): Promise<Lease | null> {
  const { data, error } = await supabase
    .from('leases')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()
  if (error) return null
  return data
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

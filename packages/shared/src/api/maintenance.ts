import { supabase } from '../lib/supabase'
import type { MaintenanceRequest } from '../types/maintenance'

export async function getTenantMaintenanceRequests(tenantId: string, limit = 3): Promise<MaintenanceRequest[]> {
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getMaintenanceRequests(unitIds: string[]): Promise<MaintenanceRequest[]> {
  if (unitIds.length === 0) return []
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*')
    .in('unit_id', unitIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

import { supabase } from '../lib/supabase'
import type { MaintenanceRequest, MaintenanceStatus } from '../types/maintenance'

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

export async function getAllTenantMaintenanceRequests(tenantId: string): Promise<MaintenanceRequest[]> {
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
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

export async function createMaintenanceRequest(
  payload: Pick<MaintenanceRequest, 'unit_id' | 'tenant_id' | 'title' | 'description' | 'priority' | 'images'>
): Promise<MaintenanceRequest> {
  const { data, error } = await supabase
    .from('maintenance_requests')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateMaintenanceStatus(
  id: string,
  status: MaintenanceStatus,
  manager_notes?: string
): Promise<void> {
  const updates: Partial<MaintenanceRequest> = { status }
  if (status === 'resolved' || status === 'closed') {
    updates.resolved_at = new Date().toISOString()
  }
  if (manager_notes !== undefined) updates.manager_notes = manager_notes
  const { error } = await supabase.from('maintenance_requests').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
}

export interface TriageResult {
  category: string | null
  priority: MaintenanceRequest['ai_suggested_priority']
  summary: string | null
  recommendation: string | null
}

// Runs AI triage on a request via the edge function. Returns the triage so the
// caller can patch state immediately. Best-effort — callers may ignore errors.
export async function triageMaintenance(requestId: string): Promise<TriageResult> {
  const { data, error } = await supabase.functions.invoke('triage-maintenance', { body: { requestId } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data.triage as TriageResult
}

export async function uploadMaintenancePhoto(tenantId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${tenantId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('maintenance-photos').upload(path, file)
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('maintenance-photos').getPublicUrl(path)
  return data.publicUrl
}

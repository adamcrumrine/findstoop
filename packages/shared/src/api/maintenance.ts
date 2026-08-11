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
  manager_notes?: string,
  extra?: { cost?: number | null; vendor?: string | null; expense_id?: string | null }
): Promise<void> {
  const updates: Partial<MaintenanceRequest> = { status }
  if (status === 'resolved' || status === 'closed') {
    updates.resolved_at = new Date().toISOString()
  }
  if (manager_notes !== undefined) updates.manager_notes = manager_notes
  if (extra?.cost !== undefined) updates.cost = extra.cost
  if (extra?.vendor !== undefined) updates.vendor = extra.vendor
  if (extra?.expense_id !== undefined) updates.expense_id = extra.expense_id
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

export interface UploadedMaintenancePhoto {
  /**
   * Storage PATH, not a URL.
   *
   * These are photographs of the inside of someone's home. The bucket used to
   * be public and this field held a permanent getPublicUrl() — anyone holding
   * the link could view a tenant's bathroom without signing in, and the link
   * was stored in the database forever. It is a path now, signed on demand at
   * render time, so access is checked every time and links expire.
   */
  url: string
  /** Path within the 'maintenance-photos' bucket — the hash record's key. */
  path: string
  /** Lowercase hex SHA-256 of the uploaded bytes, or null when hashing failed. */
  contentHash: string | null
}

/** SHA-256 as lowercase hex via Web Crypto. Null on any failure — hashing is
 *  best-effort; the upload itself must never depend on it. */
async function sha256HexSafe(file: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

export async function uploadMaintenancePhoto(tenantId: string, file: File): Promise<UploadedMaintenancePhoto> {
  const ext = file.name.split('.').pop()
  const path = `${tenantId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('maintenance-photos').upload(path, file)
  if (error) throw new Error(error.message)
  return { url: path, path, contentHash: await sha256HexSafe(file) }
}

/**
 * Signed URLs for stored maintenance photo paths.
 *
 * Legacy rows hold absolute public URLs from when the bucket was public; those
 * are passed through untouched so old requests keep rendering. Anything that
 * isn't a URL is treated as a path and signed.
 */
export async function signMaintenancePhotos(paths: string[], expiresIn = 3600): Promise<string[]> {
  const out = await Promise.all(paths.map(async (p) => {
    if (/^https?:\/\//i.test(p)) return p
    const { data } = await supabase.storage.from('maintenance-photos').createSignedUrl(p, expiresIn)
    return data?.signedUrl ?? ''
  }))
  return out.filter(Boolean)
}

/**
 * Record tamper-evident fingerprints for a request's uploaded photos
 * (maintenance_photo_hashes: server-stamped, immutable, RLS-scoped to the
 * request's parties). Best-effort — a failure leaves photos "unverified",
 * exactly like legacy ones; it must never break request creation.
 */
export async function recordMaintenancePhotoHashes(
  requestId: string,
  photos: UploadedMaintenancePhoto[],
): Promise<void> {
  const rows = photos
    .filter((p) => p.contentHash)
    .map((p) => ({ request_id: requestId, storage_path: p.path, content_hash: p.contentHash }))
  if (rows.length === 0) return
  try {
    await supabase.from('maintenance_photo_hashes').insert(rows)
  } catch { /* best-effort */ }
}

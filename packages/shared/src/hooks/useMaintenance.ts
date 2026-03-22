import { useState, useEffect, useCallback } from 'react'
import {
  getAllTenantMaintenanceRequests,
  getMaintenanceRequests,
  createMaintenanceRequest,
  updateMaintenanceStatus,
  uploadMaintenancePhoto,
} from '../api/maintenance'
import type { MaintenanceRequest, MaintenanceStatus, MaintenancePriority } from '../types/maintenance'

// ── Tenant hook ───────────────────────────────────────────────────────────────

interface NewRequestPayload {
  unit_id: string
  title: string
  description: string
  priority: MaintenancePriority
  photos: File[]
}

interface UseTenantMaintenanceResult {
  requests: MaintenanceRequest[]
  loading: boolean
  error: string | null
  submitting: boolean
  submit: (tenantId: string, payload: NewRequestPayload) => Promise<void>
  reload: () => void
}

export function useTenantMaintenance(tenantId: string | undefined): UseTenantMaintenanceResult {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getAllTenantMaintenanceRequests(tenantId)
      setRequests(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  const submit = async (tid: string, payload: NewRequestPayload) => {
    setSubmitting(true)
    try {
      // Upload photos first
      const imageUrls: string[] = []
      for (const file of payload.photos) {
        const url = await uploadMaintenancePhoto(tid, file)
        imageUrls.push(url)
      }
      await createMaintenanceRequest({
        unit_id: payload.unit_id,
        tenant_id: tid,
        title: payload.title,
        description: payload.description || null,
        priority: payload.priority,
        images: imageUrls.length > 0 ? imageUrls : null,
      })
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  return { requests, loading, error, submitting, submit, reload: load }
}

// ── Manager hook ──────────────────────────────────────────────────────────────

interface UseManagerMaintenanceResult {
  requests: MaintenanceRequest[]
  loading: boolean
  error: string | null
  updating: string | null
  updateStatus: (id: string, status: MaintenanceStatus, notes?: string) => Promise<void>
  reload: () => void
}

export function useManagerMaintenance(unitIds: string[]): UseManagerMaintenanceResult {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getMaintenanceRequests(unitIds)
      setRequests(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [unitIds.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, status: MaintenanceStatus, notes?: string) => {
    setUpdating(id)
    try {
      await updateMaintenanceStatus(id, status, notes)
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status,
                manager_notes: notes ?? r.manager_notes,
                resolved_at: (status === 'resolved' || status === 'closed') ? new Date().toISOString() : r.resolved_at,
              }
            : r
        )
      )
    } finally {
      setUpdating(null)
    }
  }

  return { requests, loading, error, updating, updateStatus, reload: load }
}

// Move-in / move-out inspection hook.
//
// One inspection per (lease, type). Either party can edit until they've
// personally signed; once both sign, the record locks (state='both_signed').
//
// The hook handles autoload + save + sign. Photos within items are uploaded
// to the 'inspection-photos' bucket by the editor component, not this hook
// (uploads need a File handle which doesn't belong in shared state).

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type InspectionType  = 'move_in' | 'move_out'
export type InspectionState = 'draft' | 'manager_signed' | 'tenant_signed' | 'both_signed'

export type ItemCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged' | null

export interface ChecklistItem {
  key:       string
  name:      string
  condition: ItemCondition
  notes:     string
  photos:    string[]   // storage paths
}

export interface ChecklistRoom {
  name:  string
  items: ChecklistItem[]
}

export interface MeterReadings {
  electric: string
  gas:      string
  water:    string
}

export interface ChecklistData {
  rooms:          ChecklistRoom[]
  keys_handover:  string[]
  meter_readings: MeterReadings
}

export interface Inspection {
  id:                  string
  lease_id:            string
  type:                InspectionType
  state:               InspectionState
  checklist_data:      ChecklistData
  manager_notes:       string | null
  tenant_notes:        string | null
  manager_signed_at:   string | null
  tenant_signed_at:    string | null
  manager_signature_name: string | null
  tenant_signature_name:  string | null
  created_at:          string
  updated_at:          string
}

interface UseInspectionResult {
  inspection: Inspection | null
  loading:    boolean
  saving:     boolean
  error:      string | null
  /** Save the local checklist + notes back to the DB. */
  save:       (next: Partial<Pick<Inspection, 'checklist_data' | 'manager_notes' | 'tenant_notes'>>) => Promise<void>
  /** Mark the inspection signed by the calling role. */
  sign:       (role: 'manager' | 'tenant', signatureName: string) => Promise<void>
  /** Create a new inspection of this type (only call when none exists). */
  start:      () => Promise<Inspection | null>
}

export function useInspection(leaseId: string | null | undefined, type: InspectionType): UseInspectionResult {
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!leaseId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .eq('lease_id', leaseId)
      .eq('type', type)
      .maybeSingle()
    if (error) setError(error.message)
    setInspection((data ?? null) as Inspection | null)
    setLoading(false)
  }, [leaseId, type])

  useEffect(() => { load() }, [load])

  const start = useCallback(async (): Promise<Inspection | null> => {
    if (!leaseId) return null
    setSaving(true)
    setError(null)
    // Pull the default checklist from the server-side template function
    const { data: template, error: tplErr } = await supabase.rpc('default_inspection_checklist')
    if (tplErr) { setError(tplErr.message); setSaving(false); return null }
    const { data, error } = await supabase
      .from('inspections')
      .insert({ lease_id: leaseId, type, state: 'draft', checklist_data: template })
      .select()
      .single()
    setSaving(false)
    if (error) { setError(error.message); return null }
    const next = data as Inspection
    setInspection(next)
    return next
  }, [leaseId, type])

  const save = useCallback(async (patch: Partial<Pick<Inspection, 'checklist_data' | 'manager_notes' | 'tenant_notes'>>) => {
    if (!inspection) return
    setSaving(true)
    setError(null)
    const { data, error } = await supabase
      .from('inspections')
      .update(patch)
      .eq('id', inspection.id)
      .select()
      .single()
    setSaving(false)
    if (error) { setError(error.message); return }
    setInspection(data as Inspection)
  }, [inspection])

  const sign = useCallback(async (role: 'manager' | 'tenant', signatureName: string) => {
    if (!inspection) return
    setSaving(true)
    setError(null)

    // Compute the next state based on who's signing + who's already signed
    const otherAlreadySigned = role === 'manager' ? !!inspection.tenant_signed_at : !!inspection.manager_signed_at
    const nextState: InspectionState = otherAlreadySigned ? 'both_signed' : `${role}_signed`

    const patch: Partial<Inspection> = {
      state: nextState,
      ...(role === 'manager'
        ? { manager_signed_at: new Date().toISOString(), manager_signature_name: signatureName }
        : { tenant_signed_at:  new Date().toISOString(), tenant_signature_name:  signatureName }
      ),
    }

    const { data, error } = await supabase
      .from('inspections')
      .update(patch)
      .eq('id', inspection.id)
      .select()
      .single()
    setSaving(false)
    if (error) { setError(error.message); return }
    setInspection(data as Inspection)
  }, [inspection])

  return { inspection, loading, saving, error, save, sign, start }
}

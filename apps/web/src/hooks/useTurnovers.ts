// Turnover hook — finds units in turnover (lease ending soon, or ended with
// the unit not re-leased) and derives each one's checklist from data the app
// already holds: move-out inspection rows, the deposit-disposition letter in
// generated_documents, inbound applications, and any replacement lease. Pure
// derivation lives in lib/turnover.ts; this hook just fetches the evidence.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  turnoverCandidates, deriveTurnover,
  type Turnover, type TurnoverLeaseLike, type VacancyUnitLike,
  type TurnoverInspectionLike, type TurnoverDepositDocLike, type TurnoverApplicationLike,
} from '../lib/turnover'

const todayIso = () => new Date().toISOString().slice(0, 10)

export function useTurnovers<L extends TurnoverLeaseLike, U extends VacancyUnitLike>(
  leases: L[],
  units: U[],
  /** property_id → state code, for the statutory deposit deadline. */
  stateByPropertyId: Record<string, string | null | undefined>,
): { turnovers: Array<Turnover<L, U>>; loading: boolean } {
  const today = todayIso()
  const candidates = useMemo(
    () => turnoverCandidates(leases, units, today),
    [leases, units, today],
  )

  const [loading, setLoading] = useState(false)
  const [inspections, setInspections] = useState<TurnoverInspectionLike[]>([])
  const [depositDocs, setDepositDocs] = useState<TurnoverDepositDocLike[]>([])
  const [applications, setApplications] = useState<TurnoverApplicationLike[]>([])

  const leaseIdsKey = candidates.map((c) => c.lease.id).sort().join(',')
  const unitIdsKey = candidates.map((c) => c.unit.id).sort().join(',')

  useEffect(() => {
    if (!leaseIdsKey) {
      setInspections([]); setDepositDocs([]); setApplications([])
      return
    }
    let cancelled = false
    const leaseIds = leaseIdsKey.split(',')
    const unitIds = unitIdsKey.split(',')
    ;(async () => {
      setLoading(true)
      const [inspRes, docRes, appRes] = await Promise.all([
        supabase
          .from('inspections')
          .select('lease_id, state')
          .in('lease_id', leaseIds)
          .eq('type', 'move_out'),
        supabase
          .from('generated_documents')
          .select('id, lease_id, status')
          .in('lease_id', leaseIds)
          .eq('type', 'security_deposit')
          .neq('status', 'voided'),
        supabase
          .from('applications')
          .select('unit_id, status, screening_status, submitted_at')
          .in('unit_id', unitIds),
      ])
      if (cancelled) return
      setInspections((inspRes.data ?? []) as TurnoverInspectionLike[])
      setDepositDocs((docRes.data ?? []) as TurnoverDepositDocLike[])
      setApplications((appRes.data ?? []) as TurnoverApplicationLike[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [leaseIdsKey, unitIdsKey])

  const turnovers = useMemo(
    () => candidates.map((c) =>
      deriveTurnover(c, {
        moveOutInspection: inspections.find((i) => i.lease_id === c.lease.id) ?? null,
        depositDocs,
        applications,
        state: stateByPropertyId[c.unit.property_id],
      }, today)),
    [candidates, inspections, depositDocs, applications, stateByPropertyId, today],
  )

  return { turnovers, loading }
}

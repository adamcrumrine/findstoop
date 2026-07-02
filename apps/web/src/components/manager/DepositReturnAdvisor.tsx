// Deposit return advisor — sits on the Leases page (same pattern as the
// Renewal advisor). For leases with a held deposit that just ended (or end
// within two weeks) it shows the statutory return deadline counting down and
// a one-click entry into the Deposit Return wizard. Leases that already have
// an itemization letter show a link to it instead of a nudge.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, FileCheck2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Property } from '@findstoop/shared/types/property'
import {
  depositReturnCandidates, depositDeadline, daysBetween, deadlineUrgency,
  DEPOSIT_LOOKAHEAD_DAYS,
} from '../../lib/depositReturn'

interface Props {
  leases: LeaseWithTenant[]
  unitMap: Record<string, Unit>
  propertyMap: Record<string, Property>
  onStart: (lease: LeaseWithTenant) => void
}

const usd = (n: number) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function DepositReturnAdvisor({ leases, unitMap, propertyMap, onStart }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const candidates = useMemo(() => depositReturnCandidates(leases, today), [leases, today])

  // A disposition letter already drafted/sent for a lease replaces its nudge
  // with a link — the work is done (or in the builder's review queue).
  const [docByLease, setDocByLease] = useState<Record<string, string>>({})
  const candidateIdsKey = candidates.map((c) => c.lease.id).sort().join(',')
  useEffect(() => {
    if (!candidateIdsKey) { setDocByLease({}); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('generated_documents')
        .select('id, lease_id, status')
        .in('lease_id', candidateIdsKey.split(','))
        .eq('type', 'security_deposit')
        .neq('status', 'voided')
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const row of (data ?? []) as Array<{ id: string; lease_id: string | null }>) {
        if (row.lease_id) map[row.lease_id] = row.id
      }
      setDocByLease(map)
    })()
    return () => { cancelled = true }
  }, [candidateIdsKey])

  if (candidates.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Banknote className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Deposit return</h2>
        <span className="text-xs text-gray-400">
          {candidates.length} tenanc{candidates.length !== 1 ? 'ies' : 'y'} ended or ending within {DEPOSIT_LOOKAHEAD_DAYS} days
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {candidates.map(({ lease, moveOut }) => {
          const unit = unitMap[lease.unit_id]
          const property = unit ? propertyMap[unit.property_id] : undefined
          const tenantName = lease.profile?.full_name ?? lease.profile?.email ?? 'Tenant'
          const where = [property?.name ?? property?.address, unit?.unit_number ? `Unit ${unit.unit_number}` : null]
            .filter(Boolean).join(' · ')
          const deadline = depositDeadline(moveOut, property?.state)
          const daysLeft = deadline ? daysBetween(today, deadline) : null
          const docId = docByLease[lease.id]

          const countdown = daysLeft == null
            ? { label: 'Check your state’s deadline', tone: 'text-gray-500' }
            : (() => {
                const u = deadlineUrgency(daysLeft)
                if (u === 'overdue') return { label: `Return ${Math.abs(daysLeft)}d overdue`, tone: 'text-red-600' }
                if (daysLeft === 0) return { label: 'Return due today', tone: 'text-red-600' }
                return { label: `Return due in ${daysLeft}d`, tone: u === 'urgent' ? 'text-red-600' : 'text-yellow-600' }
              })()

          return (
            <div key={lease.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{tenantName}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {where || '—'} · moved out {new Date(moveOut + 'T00:00:00').toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums shrink-0 ${countdown.tone}`}>{countdown.label}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-700 tabular-nums">
                <span><span className="text-gray-400 mr-1">Deposit held</span>{lease.security_deposit != null ? usd(Number(lease.security_deposit)) : '—'}</span>
                {deadline && (
                  <span><span className="text-gray-400 mr-1">Deadline</span>{new Date(deadline + 'T00:00:00').toLocaleDateString()}</span>
                )}
                {docId ? (
                  <Link
                    to={`/manager/documents/${docId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Itemization letter on file
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStart(lease)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1.5 rounded-lg transition-colors"
                    title="Itemize deductions and generate the return letter"
                  >
                    <Banknote className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Start deposit return
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

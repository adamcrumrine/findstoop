// "Rent is N days late — send a notice?" banner for the Payments screen.
//
// Stoop's highest-value workflow. For each lease with overdue rent, surfaces
// the next step in the guided late-payment series (Day 5 reminder → Day 10
// formal → Day 15 Pay or Quit) and deep-links the builder to that exact step.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSeriesForLeases } from '@findstoop/shared/api/generatedDocuments'
import { formatUsd } from '@findstoop/shared/lib/format'
import type { Payment } from '@findstoop/shared/types/payment'
import type { LatePaymentSeries, LateSeriesStep } from '@findstoop/shared/types/generatedDocument'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { Unit } from '@findstoop/shared/types/unit'
import { AlarmClock, ArrowRight } from 'lucide-react'

interface Props {
  payments: Payment[]
  leases: LeaseWithTenant[]
  units: Unit[]
}

interface OverdueLease {
  leaseId: string
  tenantName: string
  unitLabel: string | null
  daysLate: number
  amount: number
}

const STEP_LABEL: Record<Exclude<LateSeriesStep, 'done'>, string> = {
  day5: 'Day 5 · Friendly reminder',
  day10: 'Day 10 · Formal notice',
  day15: 'Day 15 · Pay or Quit',
}

function daysBetween(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T00:00:00' : iso); due.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000)
}

export interface OverduePartition {
  /** Leases to prompt a notice on, most overdue first. */
  overdue: OverdueLease[]
  /** Leases held back because Stoop isn't collecting their rent. */
  paused: { count: number; amount: number }
}

/**
 * Most-overdue pending rent payment per lease (5+ days late), split into the
 * ones worth acting on and the ones being held back.
 *
 * Leases with collections paused are held back rather than dropped. They're
 * imported tenancies that never moved onto Stoop, so their pending rows aren't
 * debts this system is collecting — prompting a Pay-or-Quit notice against one
 * would be wrong, and possibly served on someone who has been paying their
 * landlord by check all along. But hiding overdue rent with no trace is its own
 * failure, so they're counted and disclosed instead of vanishing.
 */
export function partitionOverdue(
  payments: Payment[],
  leases: Pick<LeaseWithTenant, 'id' | 'unit_id' | 'profile' | 'collections_paused_at'>[],
  units: Pick<Unit, 'id' | 'unit_number'>[],
): OverduePartition {
  const byLease = new Map<string, Payment>()
  for (const p of payments) {
    if (p.type !== 'rent' || p.status !== 'pending' || !p.due_date) continue
    if (daysBetween(p.due_date) < 5) continue
    const cur = byLease.get(p.lease_id)
    if (!cur || (cur.due_date! > p.due_date)) byLease.set(p.lease_id, p)
  }
  const out: OverdueLease[] = []
  let pausedCount = 0
  let pausedAmount = 0
  for (const [leaseId, p] of byLease) {
    const lease = leases.find((l) => l.id === leaseId)
    if (!lease) continue
    if (lease.collections_paused_at) {
      pausedCount += 1
      pausedAmount += Number(p.amount)
      continue
    }
    const unit = units.find((u) => u.id === lease.unit_id)
    out.push({
      leaseId,
      tenantName: lease.profile?.full_name ?? lease.profile?.email ?? 'Tenant',
      unitLabel: unit?.unit_number ?? null,
      daysLate: daysBetween(p.due_date!),
      amount: Number(p.amount),
    })
  }
  return {
    overdue: out.sort((a, b) => b.daysLate - a.daysLate),
    paused: { count: pausedCount, amount: pausedAmount },
  }
}

export default function LatePaymentBanner({ payments, leases, units }: Props) {
  const navigate = useNavigate()
  const [series, setSeries] = useState<Record<string, LatePaymentSeries>>({})

  const { overdue, paused } = useMemo(
    () => partitionOverdue(payments, leases, units),
    [payments, leases, units],
  )

  const overdueKey = overdue.map((o) => o.leaseId).join(',')
  useEffect(() => {
    if (overdue.length === 0) { setSeries({}); return }
    let cancelled = false
    getSeriesForLeases(overdue.map((o) => o.leaseId))
      .then((m) => { if (!cancelled) setSeries(m) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [overdueKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (overdue.length === 0 && paused.count === 0) return null

  return (
    <div className="space-y-2">
      {overdue.map((o) => {
        const s = series[o.leaseId]
        const nextStep: LateSeriesStep = s?.next_step ?? 'day5'
        if (nextStep === 'done') return null
        const isPayOrQuit = nextStep === 'day15'
        const tone = isPayOrQuit
          ? 'bg-amber-50 border-amber-300'
          : 'bg-red-50 border-red-200'
        return (
          <div key={o.leaseId} className={`rounded-xl border px-4 py-3 ${tone}`}>
            <div className="flex items-start gap-3">
              <AlarmClock className={`w-4 h-4 mt-0.5 shrink-0 ${isPayOrQuit ? 'text-amber-700' : 'text-red-600'}`} strokeWidth={1.75} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isPayOrQuit ? 'text-amber-900' : 'text-red-900'}`}>
                  Rent for {o.tenantName}{o.unitLabel ? ` · Unit ${o.unitLabel}` : ''} is {o.daysLate} days late.
                </p>
                <p className={`text-xs mt-0.5 ${isPayOrQuit ? 'text-amber-800' : 'text-red-800'}`}>
                  {formatUsd(o.amount)} past due. Next step: <strong>{STEP_LABEL[nextStep]}</strong>.
                </p>
                {/* Series progress */}
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-mute">
                  <SeriesChip done={!!s?.day5_doc_id} active={nextStep === 'day5'} label="Day 5" />
                  <SeriesChip done={!!s?.day10_doc_id} active={nextStep === 'day10'} label="Day 10" />
                  <SeriesChip done={!!s?.day15_doc_id} active={nextStep === 'day15'} label="Day 15" />
                </div>
              </div>
              <button
                onClick={() => navigate(`/manager/documents/new?leaseId=${o.leaseId}&type=late_payment&step=${nextStep}`)}
                className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                  isPayOrQuit
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
                }`}
              >
                Send notice <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        )
      })}

      {/* Disclosed, not hidden. Deliberately quiet — grey, no icon, no button:
          this is a note about leases Stoop isn't collecting on, not a task. */}
      {paused.count > 0 && (
        <p className="text-xs text-mute px-1">
          {paused.count} {paused.count === 1 ? 'lease' : 'leases'} with overdue rent
          {' '}({formatUsd(paused.amount)}) {paused.count === 1 ? 'is' : 'are'} not shown —
          {' '}collections are paused until those tenants set up online payments.
        </p>
      )}
    </div>
  )
}

function SeriesChip({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded ${
      done ? 'bg-green-100 text-green-700' : active ? 'bg-white border border-gray-300 text-ink' : 'bg-gray-100 text-mute'
    }`}>
      {label}{done ? ' ✓' : active ? ' • next' : ''}
    </span>
  )
}

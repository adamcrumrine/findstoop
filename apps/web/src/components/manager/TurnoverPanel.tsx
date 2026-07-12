// Turnover panel — the "Turnover" tab on the property detail page.
//
// A turnover is a first-class thing here: when a lease is ending within 60
// days, or has ended with the unit not re-leased, the unit gets a checklist
// that sequences the tools the app already has — move-out inspection →
// deposit return → list the unit → screen applicants → new lease. Every step's
// status is derived from existing rows (inspections, generated_documents,
// applications, leases); nothing new is stored. The vacancy cost ticker sits
// at the top of each card — the reason to keep the checklist moving.

import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Banknote, CheckCircle2, ChevronRight, Circle, CircleDot, ClipboardCheck,
  Copy, FileSignature, Loader2, Megaphone, MinusCircle, RefreshCw, ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'
import type { Unit } from '@findstoop/shared/types/unit'
import type { Property } from '@findstoop/shared/types/property'
import { formatLocalDate } from '@findstoop/shared/lib/format'
import { useTurnovers } from '../../hooks/useTurnovers'
import { vacancyCostForUnit, type Turnover, type TurnoverStepKey, type TurnoverStepStatus } from '../../lib/turnover'
import { getDepositRule, daysBetween, deadlineDaysLabel } from '../../lib/depositReturn'
import VacancyCostTicker from './VacancyCostTicker'

type PropertyTurnover = Turnover<LeaseWithTenant, Unit>

const STEP_META: Record<TurnoverStepKey, { title: string; Icon: LucideIcon }> = {
  inspection: { title: 'Move-out inspection', Icon: ClipboardCheck },
  deposit:    { title: 'Return the deposit',  Icon: Banknote },
  listing:    { title: 'List the unit',       Icon: Megaphone },
  screening:  { title: 'Screen applicants',   Icon: ShieldCheck },
  lease:      { title: 'New lease signed',    Icon: FileSignature },
}

const STATUS_ICON: Record<TurnoverStepStatus, { Icon: LucideIcon; cls: string }> = {
  done:        { Icon: CheckCircle2, cls: 'text-green-600' },
  in_progress: { Icon: CircleDot,    cls: 'text-brand-600' },
  todo:        { Icon: Circle,       cls: 'text-gray-300' },
  skipped:     { Icon: MinusCircle,  cls: 'text-gray-300' },
}

const copyApplyLink = (unitId: string) => {
  const link = `${window.location.origin}/apply/${unitId}`
  navigator.clipboard.writeText(link).then(() => toast.success('Apply link copied'))
}

// ── Per-step copy + action ────────────────────────────────────────────────────
// Plain facts about where the step stands, and the one link that moves it.

interface StepView {
  sub: React.ReactNode
  action?: { to: string; label: string } | { onClick: () => void; label: string }
}

function stepView(t: PropertyTurnover, key: TurnoverStepKey, status: TurnoverStepStatus, state: string | null): StepView {
  const today = new Date().toISOString().slice(0, 10)
  switch (key) {
    case 'inspection': {
      const to = `/manager/lease/${t.lease.id}/inspection/move_out`
      if (status === 'done') return { sub: 'Signed by both parties and on file.' }
      if (status === 'in_progress') return { sub: 'Started — collect both signatures to lock the record.', action: { to, label: 'Open inspection' } }
      return { sub: 'Walk the unit with photos — documented condition is what makes deposit deductions stick.', action: { to, label: 'Start inspection' } }
    }
    case 'deposit': {
      if (status === 'skipped') return { sub: 'No deposit held on this lease — nothing to return.' }
      if (status === 'done') {
        return {
          sub: 'Itemization letter sent.',
          ...(t.depositDocId ? { action: { to: `/manager/documents/${t.depositDocId}`, label: 'View letter' } } : {}),
        }
      }
      const rule = getDepositRule(state)
      let sub: React.ReactNode
      if (t.depositDeadline != null && t.depositDaysLeft != null) {
        const overdue = t.depositDaysLeft < 0
        const urgent = t.depositDaysLeft <= 7
        const countdown = overdue ? `${Math.abs(t.depositDaysLeft)} days overdue`
          : t.depositDaysLeft === 0 ? 'due today'
          : `${t.depositDaysLeft} days left`
        sub = (
          <span className={overdue ? 'text-red-600 font-medium' : urgent ? 'text-amber-700 font-medium' : undefined}>
            {rule ? `${rule.statuteCite}: ` : ''}return due by {formatLocalDate(t.depositDeadline)} — {countdown}.
          </span>
        )
      } else if (t.moveOut > today) {
        sub = rule
          ? `The ${deadlineDaysLabel(rule)} clock (${rule.statuteCite}) starts at move-out on ${formatLocalDate(t.moveOut)}.`
          : 'The statutory clock starts at move-out — most states allow 14–30 days. Check your state’s statute.'
      } else {
        sub = 'No statutory deadline on file for this state — check your state’s statute before relying on a date.'
      }
      const action = status === 'in_progress' && t.depositDocId
        ? { to: `/manager/documents/${t.depositDocId}`, label: 'Finish letter' }
        : { to: `/manager/leases?deposit=${t.lease.id}`, label: 'Start deposit return' }
      return { sub, action }
    }
    case 'listing': {
      if (status === 'done') {
        return {
          sub: t.applicationCount > 0
            ? `${t.applicationCount} application${t.applicationCount === 1 ? '' : 's'} received.`
            : 'Covered — a new lease is already signed.',
        }
      }
      return {
        sub: 'Share the apply link anywhere you market the unit — applications land in your inbox.',
        action: { onClick: () => copyApplyLink(t.unit.id), label: 'Copy apply link' },
      }
    }
    case 'screening': {
      if (status === 'done') return { sub: 'An applicant has cleared screening.' }
      if (status === 'in_progress') {
        return {
          sub: `${t.applicationCount} application${t.applicationCount === 1 ? '' : 's'} waiting — screen before you decide.`,
          action: { to: '/manager/applications', label: 'Review applicants' },
        }
      }
      return { sub: 'Applications show up here once the unit is marketed.', action: { to: '/manager/screening', label: 'Open screening' } }
    }
    case 'lease': {
      if (status === 'done') return { sub: 'Signed — this turnover is done.' }
      if (status === 'in_progress') return { sub: 'A replacement lease is drafted — get it signed.', action: { to: '/manager/leases', label: 'Open leases' } }
      return { sub: 'Create the lease once you’ve picked your tenant.', action: { to: '/manager/leases', label: 'Create lease' } }
    }
  }
}

// ── One turnover card ─────────────────────────────────────────────────────────

function TurnoverCard({ turnover, property, leases }: {
  turnover: PropertyTurnover
  property: Property
  leases: LeaseWithTenant[]
}) {
  const t = turnover
  const today = new Date().toISOString().slice(0, 10)
  const tenantName = t.lease.profile?.full_name ?? t.lease.profile?.email ?? 'Tenant'
  const daysToEnd = daysBetween(today, t.moveOut)
  const phaseLabel = t.phase === 'moved_out'
    ? `Moved out ${formatLocalDate(t.moveOut)}`
    : `Lease ends in ${daysToEnd}d (${formatLocalDate(t.moveOut)})`
  const vacancy = vacancyCostForUnit(t.unit, leases, today)
  const blockingTitle = t.blocking ? STEP_META[t.blocking].title : null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              Unit {t.unit.unit_number}
              <span className="font-normal text-mute"> · {tenantName}</span>
            </p>
            <p className="text-xs text-mute mt-0.5">{phaseLabel}</p>
          </div>
          {t.complete ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
              Complete
            </span>
          ) : blockingTitle ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
              Up next: {blockingTitle}
            </span>
          ) : null}
        </div>
        {vacancy && <VacancyCostTicker cost={vacancy} className="mt-2" />}
      </div>

      <ol className="divide-y divide-gray-50">
        {t.steps.map(({ key, status }, i) => {
          const meta = STEP_META[key]
          const icon = STATUS_ICON[status]
          const view = stepView(t, key, status, property.state)
          const isBlocking = t.blocking === key
          const muted = status === 'skipped' || status === 'done'
          return (
            <li key={key} className={`px-4 py-3 flex items-start gap-3 ${isBlocking ? 'bg-amber-50/50' : ''}`}>
              <icon.Icon className={`w-[18px] h-[18px] mt-0.5 shrink-0 ${icon.cls}`} strokeWidth={1.75} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium inline-flex items-center gap-1.5 ${muted ? 'text-mute' : 'text-ink'}`}>
                  <span className="text-mute-400 tabular-nums">{i + 1}.</span>
                  <meta.Icon className="w-3.5 h-3.5 text-mute" strokeWidth={1.75} />
                  {meta.title}
                </p>
                <p className="text-xs text-mute mt-0.5 leading-relaxed">{view.sub}</p>
              </div>
              {view.action && status !== 'done' && (
                'to' in view.action ? (
                  <Link
                    to={view.action.to}
                    className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                      isBlocking
                        ? 'text-white bg-brand-600 hover:bg-brand-700'
                        : 'text-brand-700 border border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {view.action.label} <ChevronRight className="w-3 h-3" strokeWidth={2} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={view.action.onClick}
                    className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                      isBlocking
                        ? 'text-white bg-brand-600 hover:bg-brand-700'
                        : 'text-brand-700 border border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    <Copy className="w-3 h-3" strokeWidth={1.75} /> {view.action.label}
                  </button>
                )
              )}
              {view.action && status === 'done' && 'to' in view.action && (
                <Link to={view.action.to} className="shrink-0 text-xs font-medium text-brand-700 hover:underline">
                  {view.action.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TurnoverPanel({ property, units, leases }: {
  property: Property
  units: Unit[]
  leases: LeaseWithTenant[]
}) {
  const stateByPropertyId = { [property.id]: property.state }
  const { turnovers, loading } = useTurnovers(leases, units, stateByPropertyId)

  if (loading && turnovers.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-mute">
        <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (turnovers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <RefreshCw className="w-10 h-10 mx-auto mb-2 text-mute-400" strokeWidth={1.5} />
        <p className="font-semibold text-ink">No turnovers right now</p>
        <p className="text-sm text-mute mt-1 max-w-md mx-auto">
          When a lease is ending within 60 days — or a tenant has moved out and the unit
          isn&apos;t re-leased yet — a step-by-step turnover checklist appears here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {turnovers.map((t) => (
        <TurnoverCard key={t.lease.id} turnover={t} property={property} leases={leases} />
      ))}
    </div>
  )
}

// Turnover copilot + vacancy cost ticker — pure logic.
//
// Two related jobs:
//
// 1. Vacancy cost: every vacant unit is quietly losing money. We put a daily
//    number on it (last lease's rent, falling back to the unit's listed rent,
//    divided by the average month length) and a running total since the unit
//    went vacant — the motivation to move the turnover along.
//
// 2. Turnover state machine: when a lease is ending soon (within
//    TURNOVER_LOOKAHEAD_DAYS) or has ended with the unit not re-leased, we
//    derive a five-step checklist ENTIRELY from data the app already holds —
//    move-out inspection rows, the deposit-disposition letter in
//    generated_documents, inbound applications, and any replacement lease on
//    the unit. No new tables; the checklist is a view over existing state.
//
// Statutory deposit deadlines come from depositReturn.ts (facts with
// citations, omission over invention — same editorial rule).

import {
  addDaysIso, daysBetween, depositDeadline, effectiveMoveOutDate,
  type DepositLeaseLike,
} from './depositReturn'

// ── Vacancy cost ─────────────────────────────────────────────────────────────

/** Average Gregorian month length — turns monthly rent into a daily rate. */
export const DAYS_PER_MONTH = 30.44

export interface VacancyUnitLike {
  id: string
  property_id: string
  unit_number: string
  rent_amount: number
  status: string
  created_at: string
}

export interface VacancyLeaseLike extends DepositLeaseLike {
  unit_id: string
  start_date: string
  rent_amount: number
}

export interface VacancyCost {
  /** Rent lost per vacant day, in dollars. */
  dailyLoss: number
  /** Whole days the unit has sat vacant (0 on the day it went vacant). */
  vacantDays: number
  /** dailyLoss × vacantDays. */
  totalLoss: number
  /** ISO date the vacancy clock started. */
  since: string
  /** True when the clock runs from unit creation (no prior tenancy found). */
  neverLeased: boolean
}

/** The date a lease's tenancy ended, when it's already in the past. */
function pastTenancyEnd(lease: VacancyLeaseLike, todayIso: string): string | null {
  if (lease.tentative_move_out_date && lease.tentative_move_out_date <= todayIso) {
    return lease.tentative_move_out_date
  }
  if (lease.status === 'expired' || lease.status === 'terminated') {
    return lease.end_date <= todayIso ? lease.end_date : null
  }
  return null
}

/**
 * What a vacant unit is costing, or null when the unit isn't vacant (or we
 * have no rent figure to price the loss with).
 *
 * Daily rate source, best signal first: the most recent lease's rent (what
 * the unit actually earned), then the unit's listed rent_amount.
 * Vacant-since: the latest tenancy end already in the past, else the day the
 * unit was added (never leased).
 */
export function vacancyCostForUnit(
  unit: VacancyUnitLike,
  leases: VacancyLeaseLike[],
  todayIso: string,
): VacancyCost | null {
  if (unit.status !== 'vacant') return null

  const unitLeases = leases.filter((l) => l.unit_id === unit.id)
  const latest = unitLeases.slice().sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0]
  const monthly = Number(latest?.rent_amount ?? unit.rent_amount)
  const fallback = Number(unit.rent_amount)
  const rent = Number.isFinite(monthly) && monthly > 0 ? monthly
    : Number.isFinite(fallback) && fallback > 0 ? fallback
    : 0
  if (rent <= 0) return null

  const dailyLoss = rent / DAYS_PER_MONTH
  const pastEnds = unitLeases
    .map((l) => pastTenancyEnd(l, todayIso))
    .filter((d): d is string => d != null)
    .sort()
  const neverLeased = pastEnds.length === 0
  const created = (unit.created_at ?? '').slice(0, 10)
  const since = neverLeased ? (created || todayIso) : pastEnds[pastEnds.length - 1]
  const vacantDays = Math.max(0, daysBetween(since, todayIso))

  return { dailyLoss, vacantDays, totalLoss: dailyLoss * vacantDays, since, neverLeased }
}

export interface PortfolioVacancy {
  vacantUnits: number
  dailyLoss: number
  totalLoss: number
}

/** Sum of vacancy costs across every vacant unit in the portfolio. */
export function portfolioVacancy(
  units: VacancyUnitLike[],
  leases: VacancyLeaseLike[],
  todayIso: string,
): PortfolioVacancy {
  let vacantUnits = 0
  let dailyLoss = 0
  let totalLoss = 0
  for (const unit of units) {
    const cost = vacancyCostForUnit(unit, leases, todayIso)
    if (!cost) continue
    vacantUnits += 1
    dailyLoss += cost.dailyLoss
    totalLoss += cost.totalLoss
  }
  return { vacantUnits, dailyLoss, totalLoss }
}

// ── Turnover candidates ──────────────────────────────────────────────────────

/** How far ahead a lease end pulls the unit into turnover mode. */
export const TURNOVER_LOOKAHEAD_DAYS = 60

export interface TurnoverLeaseLike extends VacancyLeaseLike {
  signed_at?: string | null
}

export type TurnoverPhase = 'upcoming' | 'moved_out'

export interface TurnoverCandidate<L extends TurnoverLeaseLike, U extends VacancyUnitLike> {
  lease: L
  unit: U
  /** Effective move-out date (future for 'upcoming', past for 'moved_out'). */
  moveOut: string
  phase: TurnoverPhase
  /** A newer lease on the same unit, if one exists (the re-lease). */
  nextLease: L | null
}

/** Is this lease a live (or signed-and-waiting) replacement tenancy? */
function isSignedNextLease(lease: TurnoverLeaseLike): boolean {
  return lease.status === 'active' || lease.status === 'upcoming' || lease.signed_at != null
}

/**
 * At most one turnover per unit: the most recent ended tenancy with the unit
 * not re-leased, or — failing that — an active lease ending within
 * TURNOVER_LOOKAHEAD_DAYS. Month-to-month tenancies with no recorded move-out
 * date never qualify (the tenant is still there).
 */
export function turnoverCandidates<L extends TurnoverLeaseLike, U extends VacancyUnitLike>(
  leases: L[],
  units: U[],
  todayIso: string,
): Array<TurnoverCandidate<L, U>> {
  const horizon = addDaysIso(todayIso, TURNOVER_LOOKAHEAD_DAYS)
  const out: Array<TurnoverCandidate<L, U>> = []

  for (const unit of units) {
    const unitLeases = leases.filter((l) => l.unit_id === unit.id)

    // Ended tenancies, most recent first.
    const ended = unitLeases
      .map((l) => ({ lease: l, moveOut: effectiveMoveOutDate(l, todayIso) }))
      .filter((x): x is { lease: L; moveOut: string } => x.moveOut != null && x.moveOut <= todayIso)
      .sort((a, b) => (a.moveOut < b.moveOut ? 1 : -1))

    const findNextLease = (outgoing: L, moveOut: string): L | null =>
      unitLeases
        .filter((l) => l.id !== outgoing.id && l.start_date >= outgoing.start_date && l.end_date > moveOut
          && l.status !== 'expired' && l.status !== 'terminated')
        .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0] ?? null

    const recentEnd = ended[0]
    if (recentEnd) {
      const nextLease = findNextLease(recentEnd.lease, recentEnd.moveOut)
      // An active replacement lease means the unit is re-leased — turnover over.
      const reLeased = nextLease?.status === 'active' || unit.status === 'occupied'
      if (!reLeased) {
        out.push({ lease: recentEnd.lease, unit, moveOut: recentEnd.moveOut, phase: 'moved_out', nextLease })
        continue
      }
    }

    // No open post-move-out turnover — is a tenancy ending soon?
    const endingSoon = unitLeases
      .map((l) => ({ lease: l, moveOut: effectiveMoveOutDate(l, todayIso) }))
      .filter((x): x is { lease: L; moveOut: string } =>
        x.moveOut != null && x.moveOut > todayIso && x.moveOut <= horizon)
      .sort((a, b) => (a.moveOut < b.moveOut ? -1 : 1))[0]
    if (endingSoon) {
      const nextLease = findNextLease(endingSoon.lease, endingSoon.moveOut)
      out.push({ lease: endingSoon.lease, unit, moveOut: endingSoon.moveOut, phase: 'upcoming', nextLease })
    }
  }

  // Most urgent first: moved-out units before upcoming ends, earliest move-out first.
  return out.sort((a, b) =>
    a.phase !== b.phase ? (a.phase === 'moved_out' ? -1 : 1)
      : a.moveOut < b.moveOut ? -1 : a.moveOut > b.moveOut ? 1 : 0)
}

// ── Turnover step state machine ──────────────────────────────────────────────

export type TurnoverStepKey = 'inspection' | 'deposit' | 'listing' | 'screening' | 'lease'
export type TurnoverStepStatus = 'todo' | 'in_progress' | 'done' | 'skipped'

export const TURNOVER_STEP_ORDER: TurnoverStepKey[] = [
  'inspection', 'deposit', 'listing', 'screening', 'lease',
]

export interface TurnoverStep {
  key: TurnoverStepKey
  status: TurnoverStepStatus
}

export interface TurnoverInspectionLike {
  lease_id: string
  state: string
}

export interface TurnoverDepositDocLike {
  id: string
  lease_id: string | null
  status: string
}

export interface TurnoverApplicationLike {
  unit_id: string
  status: string
  screening_status: string
  submitted_at: string
}

export interface Turnover<L extends TurnoverLeaseLike, U extends VacancyUnitLike>
  extends TurnoverCandidate<L, U> {
  steps: TurnoverStep[]
  /** First step still needing attention, or null when everything is done. */
  blocking: TurnoverStepKey | null
  /** Statutory deposit-return deadline (null when the state isn't on file or no deposit). */
  depositDeadline: string | null
  /** Days until the deposit deadline — negative when overdue. */
  depositDaysLeft: number | null
  /** Deposit-disposition letter to link to, when one exists. */
  depositDocId: string | null
  /** Applications received during this turnover window. */
  applicationCount: number
  complete: boolean
}

export interface TurnoverEvidence {
  /** Move-out inspection for the outgoing lease, if started. */
  moveOutInspection: TurnoverInspectionLike | null
  /** Deposit-disposition letters (type 'security_deposit', not voided) for the lease. */
  depositDocs: TurnoverDepositDocLike[]
  /** All applications for the unit (filtered to the turnover window here). */
  applications: TurnoverApplicationLike[]
  /** Property state code, for the statutory deposit deadline. */
  state: string | null | undefined
}

/**
 * Derive the checklist from evidence the app already holds. Later steps
 * cascade: a signed replacement lease closes out listing/screening/lease
 * regardless of what we can see about them.
 */
export function deriveTurnover<L extends TurnoverLeaseLike, U extends VacancyUnitLike>(
  candidate: TurnoverCandidate<L, U>,
  evidence: TurnoverEvidence,
  todayIso: string,
): Turnover<L, U> {
  const { lease, unit, moveOut, nextLease } = candidate

  // Only count applications from this turnover's window — the outgoing
  // tenant's own application from years ago isn't marketing progress.
  const windowStart = addDaysIso(moveOut, -TURNOVER_LOOKAHEAD_DAYS)
  const apps = evidence.applications.filter(
    (a) => a.unit_id === unit.id && a.submitted_at.slice(0, 10) >= windowStart && a.status !== 'withdrawn',
  )

  const leaseSigned = nextLease != null && isSignedNextLease(nextLease)

  // 1 — move-out inspection.
  const insp = evidence.moveOutInspection
  const inspection: TurnoverStepStatus = !insp ? 'todo' : insp.state === 'both_signed' ? 'done' : 'in_progress'

  // 2 — deposit return. Skipped when no deposit is held; otherwise the
  // disposition letter (sent or signed) is the completion signal.
  const deposit = Number(lease.security_deposit)
  const holdsDeposit = Number.isFinite(deposit) && deposit > 0
  const depositDocs = evidence.depositDocs.filter((d) => d.lease_id === lease.id && d.status !== 'voided')
  const depositStatus: TurnoverStepStatus = !holdsDeposit ? 'skipped'
    : depositDocs.some((d) => d.status === 'sent' || d.status === 'signed') ? 'done'
    : depositDocs.length > 0 ? 'in_progress'
    : 'todo'

  // 3 — list / market the unit. No listings object exists yet, so inbound
  // applications are the observable proof marketing happened.
  const listing: TurnoverStepStatus = leaseSigned || apps.length > 0 ? 'done' : 'todo'

  // 4 — screen applicants.
  const screening: TurnoverStepStatus = leaseSigned ? 'done'
    : apps.some((a) => a.screening_status === 'complete' || a.status === 'approved') ? 'done'
    : apps.length > 0 ? 'in_progress'
    : 'todo'

  // 5 — new lease signed.
  const leaseStep: TurnoverStepStatus = leaseSigned ? 'done' : nextLease != null ? 'in_progress' : 'todo'

  const byKey: Record<TurnoverStepKey, TurnoverStepStatus> = {
    inspection, deposit: depositStatus, listing, screening, lease: leaseStep,
  }
  const steps = TURNOVER_STEP_ORDER.map((key) => ({ key, status: byKey[key] }))
  const blocking = steps.find((s) => s.status === 'todo' || s.status === 'in_progress')?.key ?? null

  // Deadline only matters while a held deposit hasn't been returned, and the
  // clock only runs once the tenant has actually moved out.
  const deadline = holdsDeposit && depositStatus !== 'done' && moveOut <= todayIso
    ? depositDeadline(moveOut, evidence.state)
    : null

  return {
    ...candidate,
    steps,
    blocking,
    depositDeadline: deadline,
    depositDaysLeft: deadline ? daysBetween(todayIso, deadline) : null,
    depositDocId: depositDocs[0]?.id ?? null,
    applicationCount: apps.length,
    complete: blocking === null,
  }
}

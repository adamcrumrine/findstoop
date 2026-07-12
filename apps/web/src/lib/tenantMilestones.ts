// Pure logic for the tenant home's lease-milestone cards: the renewal window
// ("your lease ends soon") and the deposit-return mirror ("where your deposit
// stands"). Kept free of React/Supabase so it unit-tests like depositReturn.
//
// These are the tenant-facing mirrors of manager features that already exist:
// the renewal advisor (manager decides) and the deposit-return wizard (manager
// itemizes). The tenant deserves the same visibility into where things stand.

import {
  depositDeadline,
  daysBetween,
  getDepositRule,
  deadlineDaysLabel,
  UNKNOWN_STATE_DEADLINE_NOTE,
} from './depositReturn'

/** How far ahead of lease end the renewal card appears. Matches the manager
 * renewal advisor's outermost window so both parties see the milestone at
 * the same time. */
export const RENEWAL_WINDOW_DAYS = 90

/** How long after the deposit deadline the mirror card keeps showing —
 * an overdue itemization is exactly when the tenant most needs to see it. */
export const DEPOSIT_MIRROR_GRACE_DAYS = 45

export interface RenewalWindowInfo {
  /** Whole days until the lease's end_date (0 = ends today). */
  daysLeft: number
  endDate: string
  /** imminent ≤ 30d, soon ≤ 60d, approaching ≤ 90d — drives card urgency. */
  phase: 'approaching' | 'soon' | 'imminent'
}

interface RenewalLeaseLike {
  status: string
  end_date: string | null
  month_to_month?: boolean
}

/**
 * The tenant's renewal-window milestone: an active fixed-term lease ending
 * within RENEWAL_WINDOW_DAYS. Month-to-month tenancies never enter a renewal
 * window (their end_date is already in the past and rolling).
 */
export function renewalWindow(lease: RenewalLeaseLike | null | undefined, todayIso: string): RenewalWindowInfo | null {
  if (!lease || lease.status !== 'active' || lease.month_to_month || !lease.end_date) return null
  const daysLeft = daysBetween(todayIso, lease.end_date)
  if (daysLeft < 0 || daysLeft > RENEWAL_WINDOW_DAYS) return null
  const phase = daysLeft <= 30 ? 'imminent' : daysLeft <= 60 ? 'soon' : 'approaching'
  return { daysLeft, endDate: lease.end_date, phase }
}

export interface DepositMirrorInfo {
  /** Total refundable deposit held (security + pet), dollars. */
  depositHeld: number
  moveOutDate: string
  /** Statutory itemization deadline, or null when the state's rule is unknown. */
  deadline: string | null
  /** Whole days until the deadline (negative = overdue). Null without a deadline. */
  daysToDeadline: number | null
  /** Human summary of the state rule, e.g. "Ohio: 30 days (ORC 5321.16)". */
  ruleNote: string
}

interface DepositLeaseLike {
  end_date: string | null
  security_deposit: number | null
  pet_deposit: number | null
}

/**
 * The tenant's deposit-return mirror: after move-out, where the deposit
 * stands and when the landlord's itemization is legally due. Shows from
 * move-out day until DEPOSIT_MIRROR_GRACE_DAYS past the deadline (or past
 * move-out when the state rule is unknown).
 */
export function depositMirror(
  lease: DepositLeaseLike | null | undefined,
  state: string | null | undefined,
  todayIso: string,
): DepositMirrorInfo | null {
  if (!lease?.end_date) return null
  const depositHeld = (Number(lease.security_deposit) || 0) + (Number(lease.pet_deposit) || 0)
  if (depositHeld <= 0) return null

  const sinceMoveOut = daysBetween(lease.end_date, todayIso)
  if (sinceMoveOut < 0) return null // hasn't moved out yet

  const deadline = depositDeadline(lease.end_date, state)
  const daysToDeadline = deadline ? daysBetween(todayIso, deadline) : null

  // Stop showing once the story is long over.
  const horizon = deadline
    ? daysToDeadline !== null && daysToDeadline < -DEPOSIT_MIRROR_GRACE_DAYS
    : sinceMoveOut > DEPOSIT_MIRROR_GRACE_DAYS
  if (horizon) return null

  const rule = getDepositRule(state)
  const ruleNote = rule
    ? `Your landlord must return your deposit with an itemized statement within ${deadlineDaysLabel(rule)} of move-out (${rule.statuteCite}, verified ${rule.verifiedAsOf}).`
    : UNKNOWN_STATE_DEADLINE_NOTE

  return { depositHeld, moveOutDate: lease.end_date, deadline, daysToDeadline, ruleNote }
}

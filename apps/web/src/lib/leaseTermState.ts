// What phase of its term is a lease in? — pure logic, no data access.
//
// This replaces an inline derivation on the Leases page that treated ANY
// active lease past its end date as month-to-month:
//
//   isMonthToMonth = !!lease.month_to_month || (status === 'active' && daysLeft <= 0)
//
// That conflated two genuinely different situations. A fixed-term lease that
// simply lapsed (both M2M flags false) was labelled "MONTH-TO-MONTH", so a
// manager who deliberately left auto-renew OFF still saw the lease described
// as month-to-month — the toggle looked broken because nothing it controlled
// was actually being read.
//
// The distinction now:
//   • month_to_month = true  → a real rolling tenancy. Ending it needs notice.
//   • term ended, M2M off    → lapsed fixed term. The daily cron expires it
//                              (see cron-lifecycle-daily sweep 0); this state
//                              is what the manager sees in the meantime.

export type LeaseTermPhase =
  | 'upcoming'      // signed, start date in the future
  | 'in_term'       // inside the fixed term
  | 'month_to_month'// rolled to a month-to-month tenancy
  | 'term_ended'    // fixed term lapsed, not rolling — pending expiry
  | 'closed'        // expired / terminated

export interface LeaseTermInput {
  status: string
  end_date?: string | null
  month_to_month?: boolean | null
  auto_renew_month_to_month?: boolean | null
}

/**
 * Parse a DATE column ('YYYY-MM-DD') as local midnight.
 *
 * `new Date('2026-08-01')` is parsed as UTC midnight, which in any negative
 * UTC offset (all of the US) is the PREVIOUS day locally — so the common
 * `new Date(str); d.setHours(0,0,0,0)` pattern silently shifts the date back
 * one day and a lease reads as ended a day early. Build from the parts
 * instead. Falls back to Date parsing for full timestamps.
 */
function parseLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Days from `today` until end_date (negative once past). Null when undated. */
export function daysLeftInTerm(lease: LeaseTermInput, today: Date = new Date()): number | null {
  if (!lease.end_date) return null
  const t = new Date(today); t.setHours(0, 0, 0, 0)
  const end = parseLocalDate(lease.end_date)
  return Math.round((end.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}

export function leaseTermPhase(lease: LeaseTermInput, today: Date = new Date()): LeaseTermPhase {
  if (lease.status === 'expired' || lease.status === 'terminated') return 'closed'
  if (lease.status === 'upcoming') return 'upcoming'
  // The flag is the source of truth for a rolling tenancy — never infer it
  // from the calendar.
  if (lease.month_to_month === true) return 'month_to_month'
  if (lease.status !== 'active') return 'in_term'
  const daysLeft = daysLeftInTerm(lease, today)
  if (daysLeft === null || daysLeft > 0) return 'in_term'
  // Past the end date with auto-renew on, the cron just hasn't run yet —
  // show it as what it's about to become rather than as a lapsed term.
  if (lease.auto_renew_month_to_month === true) return 'month_to_month'
  return 'term_ended'
}

/** True only for a genuine rolling tenancy — drives the M2M badge and copy. */
export function isMonthToMonth(lease: LeaseTermInput, today: Date = new Date()): boolean {
  return leaseTermPhase(lease, today) === 'month_to_month'
}

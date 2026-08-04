import type { Payment } from '../types/payment'

// One source of truth for the tenant-rail status pill used on every screen
// that shows a payment row (manager Dashboard, manager Payments, manager
// Property → Payments tab, tenant Dashboard, tenant Pay Rent). If we ever
// change the labels or colors, this is the only place we touch.
//
// Status precedence:
//   • status = 'completed'  → Paid (brand teal — money in, the success state)
//   • status = 'processing' → Processing (amber)        — ACH in flight
//   • status = 'failed'     → Failed (red)
//   • status = 'disputed'   → Disputed (red)         — chargeback in review
//   • status = 'refunded'   → Refunded (gray)        — money returned
//   • status = 'pending' + anchor date is past → Past due (red)
//   • status = 'pending' + scheduled_for is set → Scheduled (blue — informational future)
//   • status = 'pending' otherwise → Upcoming (gray)
//
// One override sits on top of that: a lease with collections_paused_at set is
// not being collected through Stoop at all — the tenant still pays their
// landlord the way they always have. Calling their imported rent "Past due" in
// red states something untrue about money Stoop was never asked to collect, so
// those rows read "Paused" in grey instead. Only the alarming states are
// replaced; a paused lease that HAS a completed payment still shows Paid.
export interface RowStatus { label: string; cls: string }

/**
 * Parse a payment date as LOCAL midnight.
 *
 * DATE columns arrive as '2026-08-01'. `new Date()` reads that as UTC
 * midnight, which is the previous evening anywhere west of Greenwich — so in
 * Ohio the common `new Date(str); d.setHours(0,0,0,0)` pattern lands on
 * Jul 31 and rent due TODAY reads as "Past due". Build from the parts
 * instead. Falls through to Date parsing for full timestamps.
 */
export function parseLocalDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

export function rowStatus(
  p: Payment,
  today: Date = new Date(),
  /** leases.collections_paused_at is set — this lease isn't on Stoop rails. */
  collectionsPaused = false,
): RowStatus {
  if (p.status === 'completed')  return { label: 'Paid',       cls: 'text-brand-700 bg-brand-50 border-brand-200' }
  if (p.status === 'processing') return { label: 'Processing', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (p.status === 'failed')     return { label: 'Failed',     cls: 'text-red-700 bg-red-50 border-red-200' }
  if (p.status === 'disputed')   return { label: 'Disputed',   cls: 'text-red-700 bg-red-50 border-red-200' }
  if (p.status === 'refunded')   return { label: 'Refunded',   cls: 'text-gray-600 bg-gray-100 border-gray-200' }
  const scheduledFor = (p as Payment & { scheduled_for?: string | null }).scheduled_for
  const anchor = scheduledFor ?? p.due_date
  if (anchor) {
    const t = new Date(today); t.setHours(0, 0, 0, 0)
    const due = parseLocalDay(anchor)
    if (due.getTime() <= t.getTime() && collectionsPaused) {
      return { label: 'Paused', cls: 'text-gray-600 bg-gray-100 border-gray-200' }
    }
    if (due.getTime() < t.getTime()) {
      return { label: 'Past due', cls: 'text-red-700 bg-red-50 border-red-200' }
    }
    // Due today is its own state — calling it "Upcoming" undersells it, and
    // calling it "Past due" (the old off-by-one) was simply wrong.
    if (due.getTime() === t.getTime()) {
      return { label: 'Due today', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    }
  }
  return scheduledFor
    ? { label: 'Scheduled', cls: 'text-blue-700 bg-blue-50 border-blue-200' }
    : { label: 'Upcoming',  cls: 'text-gray-600 bg-gray-100 border-gray-200' }
}

/**
 * Lease ids whose collections are paused, for rowStatus's third argument.
 *
 * Every payment surface needs the same lookup, and each one has the lease list
 * already; without a shared helper they drift, and a row reads "Past due" on
 * one screen and "Paused" on the next for the same charge.
 */
export function pausedLeaseIds(
  leases: Array<{ id: string; collections_paused_at?: string | null }>,
): Set<string> {
  return new Set(leases.filter((l) => !!l.collections_paused_at).map((l) => l.id))
}

// Same anchor priority used everywhere — when the money actually moves (or
// is scheduled to). Use this for sorting / row dates.
export function paymentAnchor(p: Payment): string {
  return (p as Payment & { scheduled_for?: string | null }).scheduled_for
    ?? p.paid_at ?? p.due_date ?? p.created_at
}

/** Settled = the money question is closed. Everything else still needs eyes. */
function isSettled(p: Payment): boolean {
  return p.status === 'completed' || p.status === 'refunded'
}

/** Anchor as a local-midnight timestamp — see parseLocalDay. */
function anchorTime(p: Payment): number {
  return parseLocalDay(paymentAnchor(p)).getTime()
}

/**
 * Ledger order for a full payments list: what needs attention now, then what's
 * coming, then history.
 *
 *   1. Unsettled payments, oldest first — the most overdue rent leads, then
 *      today's, then scheduled future ones.
 *   2. Settled history after that, newest first.
 *
 * Sorting the whole list newest-first (the previous behaviour) buried the
 * next payment due behind a year of pre-generated future rows, so the top of
 * the page was next July rather than this month.
 *
 * History starts at the beginning of the CURRENT MONTH, not today. Cutting at
 * today meant a payment vanished from view the morning after it was marked
 * paid: it moved behind every remaining future row — for a 12-month schedule
 * across 8 tenants, roughly a hundred of them — and then reappeared under a
 * second divider for the month it had just left. A month's rent belongs with
 * that month's other rent whether or not it has been collected yet; the list
 * is grouped by month dividers, and reordering inside a month fights them.
 */
export function ledgerOrder(payments: Payment[], today: Date = new Date()): Payment[] {
  const t = new Date(today); t.setHours(0, 0, 0, 0); t.setDate(1)
  const cutoff = t.getTime()
  const isHistory = (p: Payment) => isSettled(p) && anchorTime(p) < cutoff

  const current = payments.filter((p) => !isHistory(p)).sort((a, b) => anchorTime(a) - anchorTime(b))
  const history = payments.filter(isHistory).sort((a, b) => anchorTime(b) - anchorTime(a))
  return [...current, ...history]
}

/**
 * The payment window a manager actually wants on a tenant summary: start at
 * the oldest UNSETTLED payment (so anything past due leads) and read forward
 * in date order into the future.
 *
 * The obvious `sort(desc).slice(0, n)` is wrong for a lease with a full
 * schedule generated up front — a 12-month lease has rows out to next July,
 * so descending shows next July, June, May… and the payment actually due
 * this month never appears.
 *
 * When every payment is settled there's nothing forward-looking to show, so
 * fall back to the most recent history (still ascending, so the newest is at
 * the bottom where the eye lands after reading down).
 */
export function upcomingPaymentWindow(payments: Payment[], limit = 5): Payment[] {
  const asc = payments
    .slice()
    .sort((a, b) => +new Date(paymentAnchor(a)) - +new Date(paymentAnchor(b)))
  const firstOpen = asc.findIndex((p) => !isSettled(p))
  if (firstOpen === -1) return asc.slice(-limit)
  return asc.slice(firstOpen, firstOpen + limit)
}

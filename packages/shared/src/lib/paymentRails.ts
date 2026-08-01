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
export interface RowStatus { label: string; cls: string }

export function rowStatus(p: Payment): RowStatus {
  if (p.status === 'completed')  return { label: 'Paid',       cls: 'text-brand-700 bg-brand-50 border-brand-200' }
  if (p.status === 'processing') return { label: 'Processing', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (p.status === 'failed')     return { label: 'Failed',     cls: 'text-red-700 bg-red-50 border-red-200' }
  if (p.status === 'disputed')   return { label: 'Disputed',   cls: 'text-red-700 bg-red-50 border-red-200' }
  if (p.status === 'refunded')   return { label: 'Refunded',   cls: 'text-gray-600 bg-gray-100 border-gray-200' }
  const scheduledFor = (p as Payment & { scheduled_for?: string | null }).scheduled_for
  const anchor = scheduledFor ?? p.due_date
  if (anchor) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(anchor); due.setHours(0, 0, 0, 0)
    if (due.getTime() < today.getTime()) {
      return { label: 'Past due', cls: 'text-red-700 bg-red-50 border-red-200' }
    }
  }
  return scheduledFor
    ? { label: 'Scheduled', cls: 'text-blue-700 bg-blue-50 border-blue-200' }
    : { label: 'Upcoming',  cls: 'text-gray-600 bg-gray-100 border-gray-200' }
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

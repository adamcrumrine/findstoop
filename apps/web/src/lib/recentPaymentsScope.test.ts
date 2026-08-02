import { describe, it, expect } from 'vitest'
import type { Lease } from '@findstoop/shared/types/lease'
import type { Payment } from '@findstoop/shared/types/payment'

// The dashboard's "Recent Payments" feed sorts by paid_at, which is when the
// row was RECORDED — not when the money moved. Marking a departed household's
// back-rent as paid stamps every row with today, so historical charges from
// leases that ended months ago jump to the top of a feed headed "here's what's
// happening with your properties".
//
// That is exactly what happened on 301/303 E 14th Ave: ten July charges
// totalling $4,000, belonging to two expired leases whose tenants had already
// moved out, were recorded in one batch on Aug 1 and filled four of the five
// slots. The one genuinely current payment was the only real entry.
//
// The rule this pins: the feed draws from active leases only. Ended leases keep
// their history — it stays in Payments and in the reports — it just isn't live
// activity.

function lease(id: string, status: Lease['status'], end: string): Lease {
  return { id, unit_id: 'u1', tenant_id: 't1', status, start_date: '2025-08-01', end_date: end } as Lease
}

function pay(leaseId: string, amount: number, due: string, paidAt: string): Payment {
  return {
    id: `${leaseId}-${amount}-${due}`, lease_id: leaseId, tenant_id: 't1', amount,
    type: 'rent', status: 'completed', stripe_payment_id: null, due_date: due,
    paid_at: paidAt, memo: null, scheduled_for: null, original_due_date: null,
    initiated_at: null, created_at: due,
  } as Payment
}

/** Mirrors the scoping in useManagerDashboard. */
const feedLeaseIds = (leases: Lease[]) => leases.filter((l) => l.status === 'active').map((l) => l.id)
const feed = (leases: Lease[], payments: Payment[]) => {
  const ids = new Set(feedLeaseIds(leases))
  return payments.filter((p) => ids.has(p.lease_id))
    .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))
    .slice(0, 5)
}

describe('recent payments feed scope', () => {
  // The real situation, reduced.
  const leases = [
    lease('unit303-new', 'active', '2027-07-22'),   // moved in Aug 1
    lease('unit301-new', 'active', '2027-07-23'),
    lease('unit301-old', 'expired', '2026-07-31'),  // moved out
    lease('unit303-old', 'expired', '2026-07-12'),
  ]
  const payments = [
    pay('unit303-new', 525, '2026-08-01', '2026-08-01T22:45:57Z'), // genuine
    // Back-rent recorded in one batch on Aug 1 — note the timestamps are all
    // within 30 seconds of each other, the signature of a bulk entry.
    pay('unit301-old', 350, '2026-07-01', '2026-08-01T15:08:31Z'),
    pay('unit303-old', 475, '2026-07-01', '2026-08-01T15:08:27Z'),
    pay('unit303-old', 475, '2026-07-01', '2026-08-01T15:08:24Z'),
    pay('unit303-old', 475, '2026-07-01', '2026-08-01T15:08:22Z'),
    pay('unit301-old', 350, '2026-07-01', '2026-08-01T15:08:17Z'),
  ]

  it('shows only payments on leases that are still running', () => {
    expect(feed(leases, payments).map((p) => p.lease_id)).toEqual(['unit303-new'])
  })

  it('back-rent recorded today does not outrank live activity', () => {
    // Unscoped, the batch buries the real payment: it is one row out of six,
    // and with a limit of 5 the older genuine entries fall off entirely.
    const unscoped = [...payments].sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at))).slice(0, 5)
    expect(unscoped.filter((p) => p.lease_id.endsWith('-old'))).toHaveLength(4)
    expect(feed(leases, payments).filter((p) => p.lease_id.endsWith('-old'))).toHaveLength(0)
  })

  it('an ended lease keeps its payments — they are excluded from the feed, not deleted', () => {
    // Scoping is a display decision. The rows are untouched.
    expect(payments.filter((p) => p.lease_id === 'unit303-old')).toHaveLength(3)
  })

  it('a manager with no active leases gets an empty feed, not a stale one', () => {
    const allEnded = leases.map((l) => ({ ...l, status: 'expired' as const }))
    expect(feed(allEnded, payments)).toEqual([])
  })

  it('terminated leases are excluded too, not just expired ones', () => {
    const terminated = [{ ...leases[0], status: 'terminated' as Lease['status'] }, ...leases.slice(1)]
    expect(feed(terminated, payments)).toEqual([])
  })
})

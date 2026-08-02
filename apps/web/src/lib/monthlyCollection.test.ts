import { describe, it, expect } from 'vitest'
import type { Payment } from '@findstoop/shared/types/payment'

// The dashboard reported "rent collected this month" as any payment whose
// paid_at fell in the current month, whatever period it was FOR. Recording a
// batch of back-rent (an import backfill of last season's tenants) therefore
// appeared as this month's collection, under a header naming this month.
//
// These pin the corrected split. The logic lives in useManagerDashboard, which
// pulls from Supabase; the classification is reproduced here so the rule is
// executable rather than only asserted in a comment.

function pay(due: string, status: Payment['status'], amount: number, paidAt?: string): Payment {
  return {
    id: `${due}-${status}-${amount}`,
    lease_id: 'l1', tenant_id: 't1', amount, type: 'rent', status,
    stripe_payment_id: null, due_date: due, paid_at: paidAt ?? null, memo: null,
    scheduled_for: null, original_due_date: null, initiated_at: null, created_at: due,
  } as Payment
}

const MONTH = '2026-08'
const startOfMonth = '2026-08-01T00:00:00.000Z'

const dueThisMonth = (p: Payment) => {
  const anchor = (p as Payment & { scheduled_for?: string | null }).scheduled_for ?? p.due_date
  return !!anchor && anchor.slice(0, 7) === MONTH
}
const sum = (rows: Payment[]) => rows.reduce((s, p) => s + Number(p.amount), 0)

function classify(all: Payment[]) {
  const thisMonth = all.filter(dueThisMonth)
  return {
    collected: sum(thisMonth.filter((p) => p.status === 'completed')),
    processing: sum(thisMonth.filter((p) => p.status === 'processing')),
    outstanding: sum(thisMonth.filter((p) => p.status === 'pending')),
    backRent: sum(all.filter((p) =>
      p.status === 'completed' && p.paid_at && p.paid_at >= startOfMonth && !dueThisMonth(p))),
  }
}

describe('monthly collection split', () => {
  // Mirrors the real 301/303 E 14th Ave situation that exposed this.
  const rows: Payment[] = [
    // August charges
    pay('2026-08-01', 'completed', 525, '2026-08-01T22:45:00.000Z'), // genuinely paid
    pay('2026-08-01', 'processing', 425),                            // ACH in flight
    pay('2026-08-01', 'processing', 560),
    pay('2026-08-01', 'pending', 525),                               // nobody has started
    // July charges from departed tenants, backfilled today
    pay('2026-07-01', 'completed', 475, '2026-08-01T15:08:00.000Z'),
    pay('2026-07-01', 'completed', 350, '2026-08-01T15:08:00.000Z'),
  ]

  it('back-rent settled this month is NOT counted as this month collected', () => {
    expect(classify(rows).collected).toBe(525)
  })

  it('reports back-rent separately rather than hiding it', () => {
    expect(classify(rows).backRent).toBe(825)
  })

  it('in-flight ACH is its own bucket — not collected, not delinquent', () => {
    const c = classify(rows)
    expect(c.processing).toBe(985)
    expect(c.collected).not.toContain(985)
    expect(c.outstanding).toBe(525)
  })

  it('every August charge lands in exactly one bucket', () => {
    const c = classify(rows)
    expect(c.collected + c.processing + c.outstanding).toBe(525 + 425 + 560 + 525)
  })

  it('a month with only back-rent reports zero collected', () => {
    const onlyBack = [pay('2026-07-01', 'completed', 400, '2026-08-02T10:00:00.000Z')]
    const c = classify(onlyBack)
    expect(c.collected).toBe(0)
    expect(c.backRent).toBe(400)
  })

  it('month matching is string-based so a UTC shift cannot move the 1st', () => {
    // new Date('2026-08-01') is Jul 31 evening in the US; the prefix compare
    // is immune to that.
    expect(dueThisMonth(pay('2026-08-01', 'pending', 100))).toBe(true)
    expect(dueThisMonth(pay('2026-07-31', 'pending', 100))).toBe(false)
    expect(dueThisMonth(pay('2026-09-01', 'pending', 100))).toBe(false)
  })
})

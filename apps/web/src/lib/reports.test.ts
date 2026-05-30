import { describe, it, expect } from 'vitest'
import { periodOf, computeCollectionRates } from '@findstoop/shared/hooks/useReports'
import type { Payment } from '@findstoop/shared/types/payment'

// Only the date + amount + status fields are read by these functions, so we
// build minimal payments and cast.
const pay = (over: Partial<Payment>): Payment =>
  ({ id: Math.random().toString(36), lease_id: 'l', tenant_id: 't', amount: 0, type: 'rent',
     status: 'completed', due_date: null, paid_at: null, created_at: new Date().toISOString(),
     ...over } as Payment)

const ymd = (y: number, mZeroBased: number, d: number) =>
  `${y}-${String(mZeroBased + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

describe('periodOf', () => {
  it('buckets by due_date, NOT created_at (the migrated-history bug)', () => {
    const p = pay({ due_date: '2026-03-15', created_at: '2026-05-30T12:00:00Z' })
    expect(periodOf(p).getFullYear()).toBe(2026)
    expect(periodOf(p).getMonth()).toBe(2) // March, not May
  })
  it('falls back to paid_at, then created_at', () => {
    expect(periodOf(pay({ due_date: null, paid_at: '2026-02-10T00:00:00Z' })).getMonth()).toBe(1)
    expect(periodOf(pay({ due_date: null, paid_at: null, created_at: '2026-01-05T00:00:00Z' })).getMonth()).toBe(0)
  })
  it('pins a pure date string to local midnight (no TZ day-shift)', () => {
    const d = periodOf(pay({ due_date: '2026-06-01' }))
    expect(d.getDate()).toBe(1)
    expect(d.getMonth()).toBe(5) // June — not May 31
  })
})

describe('computeCollectionRates', () => {
  it('buckets due/collected by rent period even when rows are created late', () => {
    const now = new Date()
    const thisM = (d: number) => ymd(now.getFullYear(), now.getMonth(), d)
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastM = (d: number) => ymd(last.getFullYear(), last.getMonth(), d)

    const payments = [
      pay({ amount: 1000, status: 'completed', due_date: thisM(15) }),
      pay({ amount: 1000, status: 'pending',   due_date: thisM(20) }),
      // Due LAST month but created_at = now (simulates a backfilled row).
      pay({ amount: 500,  status: 'completed', due_date: lastM(10), created_at: now.toISOString() }),
    ]

    const rates = computeCollectionRates(payments)
    const current = rates[rates.length - 1]   // last entry = current month
    const previous = rates[rates.length - 2]

    expect(current.due).toBe(2000)
    expect(current.collected).toBe(1000)
    expect(current.rate).toBe(50)

    // Regression: the backfilled row lands in LAST month (by due_date),
    // not the current month (which the old created_at logic would have done).
    expect(previous.due).toBe(500)
    expect(previous.collected).toBe(500)
    expect(previous.rate).toBe(100)
  })
})

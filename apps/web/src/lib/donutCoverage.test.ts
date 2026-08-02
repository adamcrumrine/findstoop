import { describe, it, expect } from 'vitest'
import { rowStatus } from '@findstoop/shared/lib/paymentRails'
import type { Payment } from '@findstoop/shared/types/payment'

// The donut buckets by rowStatus().label and then renders only labels listed
// in its own order array. A label added to rowStatus without being added there
// is silently dropped — the chart keeps rendering, but the month's total
// quietly stops matching reality. That is exactly what happened when
// 'Due today' was introduced: every payment due on the current date vanished.
//
// This guards the contract: every label rowStatus can produce must be known
// to the chart.

// Mirrors the order array + STATUS_COLORS keys in MonthlyDonut.tsx.
const DONUT_LABELS = new Set([
  'Paid', 'Processing', 'Scheduled', 'Upcoming', 'Due today',
  'Past due', 'Failed', 'Disputed', 'Refunded',
])

function pay(overrides: Partial<Payment>): Payment {
  return {
    id: 'p', lease_id: 'l', tenant_id: 't', amount: 100, type: 'rent',
    status: 'pending', stripe_payment_id: null, due_date: '2026-08-01',
    paid_at: null, memo: null, scheduled_for: null, original_due_date: null,
    initiated_at: null, created_at: '2026-08-01',
    ...overrides,
  } as Payment
}

const TODAY = new Date(2026, 7, 1)

describe('donut covers every status rowStatus can emit', () => {
  const cases: Array<[string, Payment]> = [
    ['completed',           pay({ status: 'completed' })],
    ['processing',          pay({ status: 'processing' })],
    ['failed',              pay({ status: 'failed' })],
    ['disputed',            pay({ status: 'disputed' })],
    ['refunded',            pay({ status: 'refunded' })],
    ['due today',           pay({ status: 'pending', due_date: '2026-08-01' })],
    ['past due',            pay({ status: 'pending', due_date: '2026-07-15' })],
    ['upcoming',            pay({ status: 'pending', due_date: '2026-08-20' })],
    ['scheduled',           pay({ status: 'pending', due_date: '2026-08-20', scheduled_for: '2026-08-20' } as Partial<Payment>)],
  ]

  for (const [name, p] of cases) {
    it(`${name} maps to a label the chart knows`, () => {
      const label = rowStatus(p, TODAY).label
      expect(DONUT_LABELS.has(label), `rowStatus produced "${label}" which the donut would drop`).toBe(true)
    })
  }

  it('a payment due today is not silently dropped', () => {
    // The specific regression: three tenants owing rent on the 1st disappeared
    // from the chart entirely.
    expect(rowStatus(pay({ status: 'pending', due_date: '2026-08-01' }), TODAY).label).toBe('Due today')
    expect(DONUT_LABELS.has('Due today')).toBe(true)
  })
})

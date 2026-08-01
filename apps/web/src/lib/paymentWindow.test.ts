import { describe, it, expect } from 'vitest'
import { upcomingPaymentWindow } from '@findstoop/shared/lib/paymentRails'
import type { Payment } from '@findstoop/shared/types/payment'

// Minimal Payment factory — only the fields paymentAnchor/status read.
function pay(due: string, status: Payment['status'], paidAt?: string): Payment {
  return {
    id: due + status,
    lease_id: 'l1',
    tenant_id: 't1',
    amount: 525,
    type: 'rent',
    status,
    stripe_payment_id: null,
    due_date: due,
    paid_at: paidAt ?? null,
    memo: null,
    scheduled_for: null,
    original_due_date: null,
    initiated_at: null,
    created_at: due,
  } as Payment
}

describe('upcomingPaymentWindow', () => {
  // The regression: a 12-month lease has its whole schedule generated up
  // front, so sorting descending surfaced next July and buried the payment
  // actually due now.
  it('starts at the next unsettled payment, not the far future', () => {
    const schedule = [
      pay('2026-08-01', 'pending'), pay('2026-09-01', 'pending'),
      pay('2026-10-01', 'pending'), pay('2026-11-01', 'pending'),
      pay('2026-12-01', 'pending'), pay('2027-01-01', 'pending'),
      pay('2027-07-01', 'pending'),
    ]
    const win = upcomingPaymentWindow(schedule, 5)
    expect(win.map((p) => p.due_date)).toEqual([
      '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01',
    ])
  })

  it('past-due payments lead the window', () => {
    const rows = [
      pay('2026-05-01', 'completed', '2026-05-01'),
      pay('2026-06-01', 'pending'),   // missed
      pay('2026-07-01', 'completed', '2026-07-01'),
      pay('2026-08-01', 'pending'),
    ]
    const win = upcomingPaymentWindow(rows, 5)
    expect(win[0].due_date).toBe('2026-06-01')
    expect(win.map((p) => p.due_date)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })

  it('is ascending, oldest first', () => {
    const win = upcomingPaymentWindow([
      pay('2026-10-01', 'pending'), pay('2026-08-01', 'pending'), pay('2026-09-01', 'pending'),
    ], 5)
    expect(win.map((p) => p.due_date)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('treats failed and processing as unsettled so they stay visible', () => {
    const win = upcomingPaymentWindow([
      pay('2026-06-01', 'completed', '2026-06-01'),
      pay('2026-07-01', 'failed'),
      pay('2026-08-01', 'processing'),
    ], 5)
    expect(win.map((p) => p.status)).toEqual(['failed', 'processing'])
  })

  it('refunded counts as settled', () => {
    const win = upcomingPaymentWindow([
      pay('2026-06-01', 'refunded'),
      pay('2026-08-01', 'pending'),
    ], 5)
    expect(win.map((p) => p.due_date)).toEqual(['2026-08-01'])
  })

  it('all settled falls back to the most recent history', () => {
    const win = upcomingPaymentWindow([
      pay('2026-04-01', 'completed', '2026-04-01'),
      pay('2026-05-01', 'completed', '2026-05-01'),
      pay('2026-06-01', 'completed', '2026-06-01'),
    ], 2)
    expect(win.map((p) => p.due_date)).toEqual(['2026-05-01', '2026-06-01'])
  })

  it('empty input is safe', () => {
    expect(upcomingPaymentWindow([], 5)).toEqual([])
  })
})

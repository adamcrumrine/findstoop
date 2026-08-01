import { describe, it, expect } from 'vitest'
import { upcomingPaymentWindow, ledgerOrder, rowStatus, parseLocalDay } from '@findstoop/shared/lib/paymentRails'
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

describe('rowStatus date handling', () => {
  const AUG1 = new Date(2026, 7, 1) // local Aug 1

  // The regression: '2026-08-01' parsed as UTC midnight is Jul 31 evening in
  // any US timezone, so rent due TODAY was labelled "Past due".
  it('rent due today is not past due', () => {
    expect(rowStatus(pay('2026-08-01', 'pending'), AUG1).label).toBe('Due today')
  })

  it('yesterday is past due', () => {
    expect(rowStatus(pay('2026-07-31', 'pending'), AUG1).label).toBe('Past due')
  })

  it('tomorrow is upcoming', () => {
    expect(rowStatus(pay('2026-08-02', 'pending'), AUG1).label).toBe('Upcoming')
  })

  it('parseLocalDay keeps the calendar day regardless of UTC offset', () => {
    const d = parseLocalDay('2026-08-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August
    expect(d.getDate()).toBe(1)
  })

  it('settled statuses ignore dates entirely', () => {
    expect(rowStatus(pay('2026-07-01', 'completed', '2026-07-01'), AUG1).label).toBe('Paid')
    expect(rowStatus(pay('2026-07-01', 'refunded'), AUG1).label).toBe('Refunded')
  })
})

describe('ledgerOrder', () => {
  const TODAY = new Date(2026, 7, 1) // 2026-08-01 local

  it('leads with what needs attention, ascending, then history newest-first', () => {
    const rows = [
      pay('2027-07-01', 'pending'),                 // far future
      pay('2026-05-01', 'completed', '2026-05-01'), // history
      pay('2026-06-01', 'pending'),                 // overdue
      pay('2026-08-01', 'pending'),                 // due today
      pay('2026-07-01', 'completed', '2026-07-01'), // history, newer
      pay('2026-09-01', 'pending'),                 // upcoming
    ]
    expect(ledgerOrder(rows, TODAY).map((p) => p.due_date)).toEqual([
      '2026-06-01', // most overdue first
      '2026-08-01', // due today
      '2026-09-01', // then forward
      '2027-07-01',
      '2026-07-01', // history, newest first
      '2026-05-01',
    ])
  })

  it('an unpaid past row outranks everything, however old', () => {
    const rows = [
      pay('2026-08-01', 'pending'),
      pay('2024-01-01', 'failed'),
    ]
    expect(ledgerOrder(rows, TODAY)[0].due_date).toBe('2024-01-01')
  })

  it('a bare date on the boundary is not shifted by timezone', () => {
    // Parsed as UTC midnight this lands on Jul 31 locally in the US and would
    // be misfiled as history.
    const rows = [pay('2026-08-01', 'completed', '2026-08-01')]
    expect(ledgerOrder(rows, TODAY)[0].due_date).toBe('2026-08-01')
    // Still current (not history) because it is not strictly before today.
    const onlyHistory = ledgerOrder([pay('2026-07-31', 'completed', '2026-07-31')], TODAY)
    expect(onlyHistory).toHaveLength(1)
  })

  it('empty input is safe', () => {
    expect(ledgerOrder([], TODAY)).toEqual([])
  })
})

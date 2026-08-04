import { describe, it, expect } from 'vitest'
import { partitionOverdue } from '../components/documents/LatePaymentBanner'
import type { Payment } from '@findstoop/shared/types/payment'

// Hawk's portfolio was imported with full rent history for tenants who never
// onboarded. Their imported pending rows made the Payments screen read like a
// collections crisis — "Rent for Tammy Ring is 33 days late" — for money Stoop
// has never been asked to collect.
//
// The dangerous direction here is the false silence: suppressing a real
// delinquent tenant loses actual rent, and a Pay-or-Quit notice served on the
// wrong person is worse than an ugly dashboard. These pin both edges.

// Local-midnight arithmetic, matching the component. Building this from
// toISOString() lands on the wrong calendar day west of UTC after ~7pm, which
// silently shifts every "days late" assertion by one.
const daysAgo = (n: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const rent = (leaseId: string, amount: number, due: string): Payment =>
  ({ id: `p-${leaseId}-${due}`, lease_id: leaseId, tenant_id: 't', amount, type: 'rent',
     status: 'pending', due_date: due } as unknown as Payment)

const live = { id: 'l-live', unit_id: 'u1', profile: { full_name: 'Elizabeth Henrikson' }, collections_paused_at: null }
const dormant = { id: 'l-dormant', unit_id: 'u2', profile: { full_name: 'Tammy Ring' }, collections_paused_at: '2026-08-03T00:00:00Z' }
const units = [{ id: 'u1', unit_number: '301' }, { id: 'u2', unit_number: 'Falls at Hayden Run' }]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (payments: Payment[], leases: any[] = [live, dormant]) =>
  partitionOverdue(payments, leases, units as any) // eslint-disable-line @typescript-eslint/no-explicit-any

describe('leases Stoop is actually collecting on', () => {
  it('still prompts a notice', () => {
    const { overdue, paused } = run([rent('l-live', 557.5, daysAgo(33))])
    expect(overdue).toHaveLength(1)
    expect(overdue[0].tenantName).toBe('Elizabeth Henrikson')
    expect(overdue[0].daysLate).toBe(33)
    expect(paused.count).toBe(0)
  })

  it('is unaffected by a paused lease sitting next to it', () => {
    // The regression that matters: silencing must not be portfolio-wide.
    const { overdue } = run([
      rent('l-dormant', 1725, daysAgo(33)),
      rent('l-live', 557.5, daysAgo(33)),
    ])
    expect(overdue.map((o) => o.tenantName)).toEqual(['Elizabeth Henrikson'])
  })

  it('keeps the 5-day grace window', () => {
    expect(run([rent('l-live', 557.5, daysAgo(4))]).overdue).toHaveLength(0)
    expect(run([rent('l-live', 557.5, daysAgo(5))]).overdue).toHaveLength(1)
  })

  it('resumes the moment the pause is lifted', () => {
    // What the payment-method trigger does in the database.
    const resumed = { ...dormant, collections_paused_at: null }
    const { overdue, paused } = run([rent('l-dormant', 1725, daysAgo(33))], [resumed])
    expect(overdue).toHaveLength(1)
    expect(paused.count).toBe(0)
  })
})

describe('leases that never moved to Stoop', () => {
  it('raises no notice prompt', () => {
    const { overdue } = run([rent('l-dormant', 1725, daysAgo(33))])
    expect(overdue).toHaveLength(0)
  })

  it('is disclosed rather than disappeared', () => {
    // Silence, not concealment — the manager is still told the money exists.
    const { paused } = run([rent('l-dormant', 1725, daysAgo(33))])
    expect(paused).toEqual({ count: 1, amount: 1725 })
  })

  it('reports the oldest unpaid month, not every month, per lease', () => {
    // Imported leases carry years of pending rows; counting them all would
    // report a number that looks like fraud rather than a stale import.
    const { paused } = run([
      rent('l-dormant', 1725, daysAgo(33)),
      rent('l-dormant', 1725, daysAgo(64)),
      rent('l-dormant', 1725, daysAgo(95)),
    ])
    expect(paused.count).toBe(1)
    expect(paused.amount).toBe(1725)
  })
})

describe('the banner stays quiet when there is nothing to say', () => {
  it('reports nothing on a clean portfolio', () => {
    expect(run([rent('l-live', 557.5, daysAgo(1))])).toEqual({
      overdue: [], paused: { count: 0, amount: 0 },
    })
  })

  it('ignores non-rent and already-settled rows', () => {
    const settled = { ...rent('l-live', 557.5, daysAgo(33)), status: 'completed' } as Payment
    const utility = { ...rent('l-live', 80, daysAgo(33)), type: 'utility' } as unknown as Payment
    expect(run([settled, utility]).overdue).toHaveLength(0)
  })
})

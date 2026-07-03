import { describe, it, expect } from 'vitest'
import {
  assessRenewalRisk, RISK_TIER_LABEL, LATE_GRACE_DAYS,
  type RenewalRiskInput, type RiskLeaseLike, type RiskPaymentLike, type RiskMaintenanceLike,
} from './renewalRisk'

const TODAY = '2026-07-02'

// A quiet, first-term tenant on a summer-ending lease — the zero-signal base.
const lease: RiskLeaseLike = {
  id: 'lease-1',
  unit_id: 'unit-1',
  tenant_id: 'tenant-1',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
  rent_amount: 1400,
}

function assess(overrides: Partial<RenewalRiskInput> = {}) {
  return assessRenewalRisk({
    lease,
    allLeases: [lease],
    payments: [],
    maintenance: [],
    marketEstimate: null,
    todayIso: TODAY,
    ...overrides,
  })
}

const rentPayment = (over: Partial<RiskPaymentLike>): RiskPaymentLike => ({
  lease_id: 'lease-1',
  type: 'rent',
  status: 'completed',
  due_date: '2026-05-01',
  paid_at: '2026-05-01T12:00:00Z',
  created_at: '2026-04-20T00:00:00Z',
  ...over,
})

const ticket = (created: string, unit = 'unit-1'): RiskMaintenanceLike => ({
  unit_id: unit,
  created_at: created + 'T09:00:00Z',
})

describe('assessRenewalRisk — baseline', () => {
  it('scores a quiet tenancy as low risk with the standard-offer framing', () => {
    const r = assess()
    expect(r.tier).toBe('low')
    expect(r.score).toBe(0)
    expect(r.reasons).toEqual([])
    expect(r.recommendation).toContain('standard early offer')
  })

  it('exposes badge labels for every tier', () => {
    expect(RISK_TIER_LABEL.low).toContain('Low')
    expect(RISK_TIER_LABEL.medium).toContain('Medium')
    expect(RISK_TIER_LABEL.high).toContain('High')
  })
})

describe('maintenance friction', () => {
  it('3+ tickets in the last 6 months = strong signal (+2, medium)', () => {
    const r = assess({ maintenance: [ticket('2026-02-10'), ticket('2026-04-01'), ticket('2026-06-15')] })
    expect(r.score).toBe(2)
    expect(r.tier).toBe('medium')
    expect(r.reasons[0]).toBe('3 maintenance tickets in the last 6 months')
  })

  it('3+ tickets spread across the tenancy = mild signal (+1)', () => {
    const r = assess({ maintenance: [ticket('2025-10-01'), ticket('2025-11-20'), ticket('2026-03-01')] })
    expect(r.score).toBe(1)
    expect(r.tier).toBe('low')
    expect(r.reasons[0]).toBe('3 maintenance tickets this tenancy')
  })

  it('ignores tickets from other units and from before the tenancy started', () => {
    const r = assess({
      maintenance: [
        ticket('2026-05-01', 'unit-999'),   // someone else's unit
        ticket('2025-06-01'),               // before this tenancy began
        ticket('2026-06-01'),
      ],
    })
    expect(r.score).toBe(0)
  })

  it('counts prior-lease-period tickets when the tenant renewed (tenancy window, not lease window)', () => {
    const prior: RiskLeaseLike = { ...lease, id: 'lease-0', start_date: '2024-09-01', end_date: '2025-08-31' }
    const r = assess({
      allLeases: [prior, lease],
      maintenance: [ticket('2024-10-01'), ticket('2025-03-01'), ticket('2026-06-01')],
    })
    // 3 tickets this tenancy (+1) offset by renewed-before stickiness (−1).
    expect(r.reasons).toContain('3 maintenance tickets this tenancy')
    expect(r.score).toBe(0)
  })
})

describe('payment friction', () => {
  it('a rent payment cleared within the grace window is not late', () => {
    const r = assess({
      payments: [rentPayment({ paid_at: `2026-05-0${1 + LATE_GRACE_DAYS}T00:00:00Z` })],
    })
    expect(r.score).toBe(0)
  })

  it('counts late-cleared, failed, and past-due-pending rent (+1 for 1–2, +2 for 3+)', () => {
    const one = assess({ payments: [rentPayment({ paid_at: '2026-05-15T00:00:00Z' })] })
    expect(one.score).toBe(1)
    expect(one.reasons[0]).toBe('1 late or missed rent payment in the last 12 months')

    const three = assess({
      payments: [
        rentPayment({ due_date: '2026-03-01', paid_at: '2026-03-20T00:00:00Z' }), // cleared late
        rentPayment({ due_date: '2026-04-01', status: 'failed', paid_at: null }), // bounced
        rentPayment({ due_date: '2026-06-01', status: 'pending', paid_at: null }), // sitting past due
      ],
    })
    expect(three.score).toBe(2)
    expect(three.tier).toBe('medium')
    expect(three.reasons[0]).toBe('3 late or missed rent payments in the last 12 months')
  })

  it('does not double count a late month that produced both a late rent row and a late fee', () => {
    const r = assess({
      payments: [
        rentPayment({ due_date: '2026-05-01', paid_at: '2026-05-20T00:00:00Z' }),
        rentPayment({ type: 'late_fee', due_date: '2026-05-15', paid_at: null, status: 'pending' }),
      ],
    })
    // max(1 late rent, 1 late fee) = 1 event → +1, not +2.
    expect(r.score).toBe(1)
  })

  it('late fees alone still register as payment friction', () => {
    const r = assess({
      payments: [rentPayment({ type: 'late_fee', due_date: '2026-04-10', paid_at: null, status: 'pending' })],
    })
    expect(r.score).toBe(1)
  })

  it('ignores payments outside the 12-month window and on unrelated leases', () => {
    const r = assess({
      payments: [
        rentPayment({ due_date: '2025-05-01', paid_at: '2025-05-25T00:00:00Z' }), // 14 months ago
        rentPayment({ lease_id: 'other-lease', due_date: '2026-05-01', status: 'failed' }),
      ],
    })
    expect(r.score).toBe(0)
  })
})

describe('rent vs market', () => {
  it('paying ≥5% over market = shop-around risk (+2) with a hold-the-rent tilt', () => {
    const r = assess({ marketEstimate: 1250 }) // rent 1400 = 12% over
    expect(r.score).toBe(2)
    expect(r.tier).toBe('medium')
    expect(r.reasons[0]).toBe('Paying ~$150 over market — cheaper comparables are easy to find')
    expect(r.recommendation).toContain('holding at current rent')
  })

  it('under market beyond the 10% cap = raise-shock risk (+1) with raise-carefully copy', () => {
    const r = assess({ marketEstimate: 1580 }) // gap $180, ~13% under
    expect(r.score).toBe(1)
    expect(r.reasons[0]).toBe('Paying ~$180 under market — raise carefully')
    expect(r.recommendation.toLowerCase()).toContain('gently')
  })

  it('small gaps in either direction contribute nothing', () => {
    expect(assess({ marketEstimate: 1440 }).score).toBe(0) // ~3% under
    expect(assess({ marketEstimate: 1360 }).score).toBe(0) // ~3% over
    expect(assess({ marketEstimate: null }).score).toBe(0)
  })
})

describe('tenure', () => {
  it('2+ years in subtracts a point and reads as stickiness', () => {
    const settled: RiskLeaseLike = { ...lease, start_date: '2023-09-01' }
    const r = assess({ lease: settled, allLeases: [settled] })
    expect(r.score).toBe(-1)
    expect(r.tier).toBe('low')
    expect(r.reasons[0]).toContain('long-tenured tenants usually renew')
  })

  it('a prior lease on the same unit counts as a renewal (sticky) even under 2 years', () => {
    const prior: RiskLeaseLike = { ...lease, id: 'lease-0', start_date: '2025-03-01', end_date: '2025-08-31' }
    const r = assess({ allLeases: [prior, lease] })
    expect(r.score).toBe(-1)
    expect(r.reasons[0]).toBe('Has renewed before — repeat renewers tend to stay')
  })

  it('another tenant’s lease on the unit is not this tenant’s history', () => {
    const stranger: RiskLeaseLike = { ...lease, id: 'lease-x', tenant_id: 'tenant-9', start_date: '2023-01-01' }
    expect(assess({ allLeases: [stranger, lease] }).score).toBe(0)
  })
})

describe('lease-end seasonality', () => {
  it.each([
    ['2026-11-30', 'November'],
    ['2026-12-31', 'December'],
    ['2027-01-31', 'January'],
    ['2027-02-28', 'February'],
  ])('a %s end date adds the winter-stakes point', (end, month) => {
    const winter = { ...lease, end_date: end }
    const r = assess({ lease: winter, allLeases: [winter] })
    expect(r.score).toBe(1)
    expect(r.reasons[0]).toContain(month)
    expect(r.reasons[0]).toContain('winter vacancies take longer to fill')
  })

  it('spring–fall end dates do not', () => {
    for (const end of ['2026-03-31', '2026-06-30', '2026-10-31']) {
      const l = { ...lease, end_date: end }
      expect(assess({ lease: l, allLeases: [l] }).score).toBe(0)
    }
  })
})

describe('tiers, reasons, and recommendations compose', () => {
  it('stacked frictions reach high tier with turnover framing', () => {
    const winter = { ...lease, end_date: '2026-12-31' }
    const r = assess({
      lease: winter,
      allLeases: [winter],
      maintenance: [ticket('2026-02-10'), ticket('2026-04-01'), ticket('2026-06-15')], // +2
      payments: [rentPayment({ paid_at: '2026-05-20T00:00:00Z' })],                    // +1
      marketEstimate: 1250,                                                            // +2 over market
    })
    expect(r.score).toBe(6) // +2 +1 +2 +1 (winter)
    expect(r.tier).toBe('high')
    expect(r.reasons).toHaveLength(3) // capped at the top three
    expect(r.recommendation).toContain('Budget for turnover')
  })

  it('stickiness can pull a single friction back to low', () => {
    const settled: RiskLeaseLike = { ...lease, start_date: '2022-09-01' }
    const r = assess({
      lease: settled,
      allLeases: [settled],
      payments: [rentPayment({ paid_at: '2026-05-20T00:00:00Z' })], // +1
    })
    expect(r.score).toBe(0)
    expect(r.tier).toBe('low')
    // Risk drivers lead; sticky context sorts after them.
    expect(r.reasons[0]).toContain('late or missed rent payment')
    expect(r.reasons[1]).toContain('long-tenured')
  })

  it('under-market gap plus winter end lands medium with renew-early, close-the-gap-gradually copy', () => {
    const winter = { ...lease, end_date: '2027-01-31' }
    const r = assess({ lease: winter, allLeases: [winter], marketEstimate: 1580 })
    expect(r.score).toBe(2)
    expect(r.tier).toBe('medium')
    expect(r.recommendation).toContain('close the market gap gradually')
  })
})

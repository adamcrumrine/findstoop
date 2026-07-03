import { describe, it, expect } from 'vitest'
import {
  vacancyCostForUnit, portfolioVacancy, turnoverCandidates, deriveTurnover,
  DAYS_PER_MONTH, TURNOVER_LOOKAHEAD_DAYS,
  type VacancyUnitLike, type TurnoverLeaseLike, type TurnoverEvidence,
} from './turnover'

const TODAY = '2026-07-02'

const unit = (over: Partial<VacancyUnitLike> = {}): VacancyUnitLike => ({
  id: 'u1', property_id: 'p1', unit_number: '1', rent_amount: 1500,
  status: 'vacant', created_at: '2026-01-01T00:00:00Z', ...over,
})

const lease = (over: Partial<TurnoverLeaseLike> = {}): TurnoverLeaseLike => ({
  id: 'l1', unit_id: 'u1', status: 'expired',
  start_date: '2025-06-20', end_date: '2026-06-20',
  rent_amount: 1400, security_deposit: 1400, signed_at: '2025-06-01T00:00:00Z',
  ...over,
})

const evidence = (over: Partial<TurnoverEvidence> = {}): TurnoverEvidence => ({
  moveOutInspection: null, depositDocs: [], applications: [], state: 'OH', ...over,
})

// ── Vacancy cost ─────────────────────────────────────────────────────────────

describe('vacancyCostForUnit', () => {
  it('prices the loss from the most recent lease rent, not the listed rent', () => {
    const cost = vacancyCostForUnit(unit(), [lease()], TODAY)
    expect(cost).not.toBeNull()
    expect(cost!.dailyLoss).toBeCloseTo(1400 / DAYS_PER_MONTH, 5)
    // Vacant since the lease ended 12 days ago.
    expect(cost!.since).toBe('2026-06-20')
    expect(cost!.vacantDays).toBe(12)
    expect(cost!.totalLoss).toBeCloseTo((1400 / DAYS_PER_MONTH) * 12, 5)
    expect(cost!.neverLeased).toBe(false)
  })

  it('falls back to the unit listed rent when never leased, clocked from creation', () => {
    const cost = vacancyCostForUnit(unit({ created_at: '2026-06-02T09:00:00Z' }), [], TODAY)
    expect(cost!.dailyLoss).toBeCloseTo(1500 / DAYS_PER_MONTH, 5)
    expect(cost!.vacantDays).toBe(30)
    expect(cost!.neverLeased).toBe(true)
  })

  it('returns null for occupied units and rentless units', () => {
    expect(vacancyCostForUnit(unit({ status: 'occupied' }), [lease()], TODAY)).toBeNull()
    expect(vacancyCostForUnit(unit({ rent_amount: 0 }), [], TODAY)).toBeNull()
  })

  it('ignores an active lease whose end date is future when picking the vacancy start', () => {
    // Data drift: unit flagged vacant but a future-dated active lease exists —
    // the clock must not start from a future date.
    const cost = vacancyCostForUnit(unit(), [lease({ status: 'active', end_date: '2026-09-01' })], TODAY)
    expect(cost!.neverLeased).toBe(true)
    expect(cost!.since).toBe('2026-01-01')
  })
})

describe('portfolioVacancy', () => {
  it('sums daily + accrued loss across vacant units only', () => {
    const units = [unit(), unit({ id: 'u2', status: 'occupied' }), unit({ id: 'u3', rent_amount: 900, created_at: '2026-07-02T00:00:00Z' })]
    const agg = portfolioVacancy(units, [lease()], TODAY)
    expect(agg.vacantUnits).toBe(2)
    expect(agg.dailyLoss).toBeCloseTo(1400 / DAYS_PER_MONTH + 900 / DAYS_PER_MONTH, 5)
    // u3 went vacant today — only u1 has accrued loss.
    expect(agg.totalLoss).toBeCloseTo((1400 / DAYS_PER_MONTH) * 12, 5)
  })
})

// ── Turnover candidates ──────────────────────────────────────────────────────

describe('turnoverCandidates', () => {
  it('flags an ended lease with a vacant unit as a moved-out turnover', () => {
    const [c] = turnoverCandidates([lease()], [unit()], TODAY)
    expect(c).toBeDefined()
    expect(c.phase).toBe('moved_out')
    expect(c.moveOut).toBe('2026-06-20')
    expect(c.nextLease).toBeNull()
  })

  it('flags an active lease ending within the lookahead as upcoming', () => {
    const l = lease({ status: 'active', end_date: '2026-08-01' })
    const [c] = turnoverCandidates([l], [unit({ status: 'occupied' })], TODAY)
    expect(c.phase).toBe('upcoming')
    expect(c.moveOut).toBe('2026-08-01')
  })

  it('skips leases ending beyond the lookahead window', () => {
    const l = lease({ status: 'active', end_date: '2026-12-01' })
    expect(turnoverCandidates([l], [unit({ status: 'occupied' })], TODAY)).toHaveLength(0)
  })

  it('skips month-to-month tenancies with no recorded move-out date', () => {
    const l = lease({ status: 'active', month_to_month: true, end_date: '2026-05-01' })
    expect(turnoverCandidates([l], [unit({ status: 'occupied' })], TODAY)).toHaveLength(0)
  })

  it('drops the turnover once the unit is re-leased with an active lease', () => {
    const oldLease = lease()
    const newLease = lease({ id: 'l2', status: 'active', start_date: '2026-06-25', end_date: '2027-06-25' })
    expect(turnoverCandidates([oldLease, newLease], [unit({ status: 'occupied' })], TODAY)).toHaveLength(0)
  })

  it('keeps the turnover (with nextLease attached) while the replacement is only upcoming', () => {
    const oldLease = lease()
    const newLease = lease({ id: 'l2', status: 'upcoming', start_date: '2026-08-01', end_date: '2027-08-01' })
    const [c] = turnoverCandidates([oldLease, newLease], [unit()], TODAY)
    expect(c).toBeDefined()
    expect(c.nextLease?.id).toBe('l2')
  })

  it('orders moved-out turnovers ahead of upcoming ones', () => {
    const ended = lease()
    const ending = lease({ id: 'l2', unit_id: 'u2', status: 'active', end_date: '2026-07-15' })
    const out = turnoverCandidates([ended, ending], [unit(), unit({ id: 'u2', status: 'occupied' })], TODAY)
    expect(out.map((c) => c.phase)).toEqual(['moved_out', 'upcoming'])
  })
})

// ── Step derivation ──────────────────────────────────────────────────────────

describe('deriveTurnover', () => {
  const candidate = () => turnoverCandidates([lease()], [unit()], TODAY)[0]

  const statusOf = (t: ReturnType<typeof deriveTurnover>, key: string) =>
    t.steps.find((s) => s.key === key)?.status

  it('starts with everything todo and inspection blocking', () => {
    const t = deriveTurnover(candidate(), evidence(), TODAY)
    expect(statusOf(t, 'inspection')).toBe('todo')
    expect(statusOf(t, 'deposit')).toBe('todo')
    expect(t.blocking).toBe('inspection')
    expect(t.complete).toBe(false)
  })

  it('tracks the move-out inspection through draft → both_signed', () => {
    const started = deriveTurnover(candidate(), evidence({ moveOutInspection: { lease_id: 'l1', state: 'draft' } }), TODAY)
    expect(statusOf(started, 'inspection')).toBe('in_progress')
    const done = deriveTurnover(candidate(), evidence({ moveOutInspection: { lease_id: 'l1', state: 'both_signed' } }), TODAY)
    expect(statusOf(done, 'inspection')).toBe('done')
  })

  it('computes the statutory deposit deadline while the deposit is unreturned', () => {
    const t = deriveTurnover(candidate(), evidence(), TODAY)
    // OH: move-out 2026-06-20 + 30 days.
    expect(t.depositDeadline).toBe('2026-07-20')
    expect(t.depositDaysLeft).toBe(18)
  })

  it('marks the deposit done once the disposition letter is sent, clearing the deadline', () => {
    const t = deriveTurnover(candidate(), evidence({
      depositDocs: [{ id: 'd1', lease_id: 'l1', status: 'sent' }],
    }), TODAY)
    expect(statusOf(t, 'deposit')).toBe('done')
    expect(t.depositDeadline).toBeNull()
  })

  it('skips the deposit step when no deposit is held', () => {
    const [c] = turnoverCandidates([lease({ security_deposit: null })], [unit()], TODAY)
    const t = deriveTurnover(c, evidence(), TODAY)
    expect(statusOf(t, 'deposit')).toBe('skipped')
    expect(t.depositDeadline).toBeNull()
  })

  it('treats in-window applications as listing done + screening in progress', () => {
    const t = deriveTurnover(candidate(), evidence({
      applications: [{ unit_id: 'u1', status: 'submitted', screening_status: 'not_ordered', submitted_at: '2026-06-25T12:00:00Z' }],
    }), TODAY)
    expect(statusOf(t, 'listing')).toBe('done')
    expect(statusOf(t, 'screening')).toBe('in_progress')
    expect(t.applicationCount).toBe(1)
  })

  it('ignores stale applications from before the turnover window', () => {
    const old = `${new Date(new Date(TODAY).getTime() - (TURNOVER_LOOKAHEAD_DAYS + 60) * 86_400_000).toISOString()}`
    const t = deriveTurnover(candidate(), evidence({
      applications: [{ unit_id: 'u1', status: 'submitted', screening_status: 'not_ordered', submitted_at: old }],
    }), TODAY)
    expect(statusOf(t, 'listing')).toBe('todo')
    expect(t.applicationCount).toBe(0)
  })

  it('completes screening when an applicant clears (or is approved)', () => {
    const t = deriveTurnover(candidate(), evidence({
      applications: [{ unit_id: 'u1', status: 'approved', screening_status: 'complete', submitted_at: '2026-06-25T12:00:00Z' }],
    }), TODAY)
    expect(statusOf(t, 'screening')).toBe('done')
  })

  it('cascades a signed replacement lease into listing/screening/lease done', () => {
    const oldLease = lease()
    const newLease = lease({ id: 'l2', status: 'upcoming', start_date: '2026-08-01', end_date: '2027-08-01' })
    const [c] = turnoverCandidates([oldLease, newLease], [unit()], TODAY)
    const t = deriveTurnover(c, evidence(), TODAY)
    expect(statusOf(t, 'listing')).toBe('done')
    expect(statusOf(t, 'screening')).toBe('done')
    expect(statusOf(t, 'lease')).toBe('done')
    // Inspection + deposit still matter even after the re-lease.
    expect(t.blocking).toBe('inspection')
  })

  it('is complete when every step is done or skipped', () => {
    const oldLease = lease({ security_deposit: null })
    const newLease = lease({ id: 'l2', status: 'upcoming', start_date: '2026-08-01', end_date: '2027-08-01' })
    const [c] = turnoverCandidates([oldLease, newLease], [unit()], TODAY)
    const t = deriveTurnover(c, evidence({ moveOutInspection: { lease_id: 'l1', state: 'both_signed' } }), TODAY)
    expect(t.blocking).toBeNull()
    expect(t.complete).toBe(true)
  })
})

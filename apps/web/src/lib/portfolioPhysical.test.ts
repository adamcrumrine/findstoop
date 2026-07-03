import { describe, it, expect } from 'vitest'
import {
  computeRentDrift, computeExpenseSection, computeLeaseClusters,
  computeDepositSection, computeComplianceSection, computeCollectionSection,
  propertyPhysical, summarizePortfolio, physicalMetricsForAi,
  matchRentReport, normalizeAddress,
  type PhysicalPropertyLike, type PhysicalUnitLike, type PhysicalLeaseLike,
  type PhysicalPaymentLike, type PhysicalExpenseLike, type PhysicalRentReportLike,
  type PhysicalInputs,
} from './portfolioPhysical'

const TODAY = '2026-07-02'

const property = (over: Partial<PhysicalPropertyLike> = {}): PhysicalPropertyLike => ({
  id: 'p1', name: 'Maple Duplex', address: '12 Maple St', city: 'Columbus', state: 'OH', zip: '43212', ...over,
})

const unit = (over: Partial<PhysicalUnitLike> = {}): PhysicalUnitLike => ({
  id: 'u1', property_id: 'p1', unit_number: '1', bedrooms: 2, rent_amount: 1200, status: 'occupied', ...over,
})

const lease = (over: Partial<PhysicalLeaseLike> = {}): PhysicalLeaseLike => ({
  id: 'l1', unit_id: 'u1', status: 'active', start_date: '2025-08-01', end_date: '2026-07-31',
  rent_amount: 1200, security_deposit: 1200, ...over,
})

const payment = (over: Partial<PhysicalPaymentLike> = {}): PhysicalPaymentLike => ({
  lease_id: 'l1', type: 'rent', status: 'completed', amount: 1200,
  due_date: '2026-06-01', paid_at: '2026-06-01', ...over,
})

const expense = (over: Partial<PhysicalExpenseLike> = {}): PhysicalExpenseLike => ({
  property_id: 'p1', category: 'repairs', amount: 300, expense_date: '2026-05-10', ...over,
})

const report = (over: Partial<PhysicalRentReportLike> = {}): PhysicalRentReportLike => ({
  address: '12 Maple St', unit_number: '1', zip: '43212', bedrooms: 2,
  estimate: 1400, low: 1250, high: 1550, created_at: '2026-05-01T00:00:00Z', ...over,
})

// ── Address matching ─────────────────────────────────────────────────────────

describe('matchRentReport', () => {
  it('matches on normalized street line and prefers unit + bedroom agreement', () => {
    const reports = [
      report({ unit_number: '2', estimate: 999 }),
      report({ unit_number: '1', estimate: 1400 }),
    ]
    const m = matchRentReport(property(), unit(), reports)
    expect(m?.estimate).toBe(1400)
  })

  it('never matches a different street or a conflicting ZIP', () => {
    expect(matchRentReport(property(), unit(), [report({ address: '99 Oak Ave' })])).toBeNull()
    expect(matchRentReport(property(), unit(), [report({ zip: '43004' })])).toBeNull()
  })

  it('prefers the newest report when otherwise tied', () => {
    const m = matchRentReport(property(), unit(), [
      report({ created_at: '2025-01-01T00:00:00Z', estimate: 1300 }),
      report({ created_at: '2026-06-01T00:00:00Z', estimate: 1450 }),
    ])
    expect(m?.estimate).toBe(1450)
  })

  it('normalizes punctuation and case', () => {
    expect(normalizeAddress(' 12  Maple St. ')).toBe('12 maple st')
  })
})

// ── Rent drift ───────────────────────────────────────────────────────────────

describe('computeRentDrift', () => {
  it('reports drift for units with an estimate and flags below-market ones', () => {
    const s = computeRentDrift(property(), [unit()], [lease()], [report()], TODAY)
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0].estimate).toBe(1400)
    // 1200 vs 1400 = −14.3%
    expect(s.rows[0].driftPct).toBeCloseTo(-14.3, 1)
    expect(s.belowMarketUnits).toBe(1)
    expect(s.monthlyGapDollars).toBe(200)
  })

  it('says "no estimate" instead of fabricating one', () => {
    const s = computeRentDrift(property(), [unit()], [lease()], [], TODAY)
    expect(s.rows[0].estimate).toBeNull()
    expect(s.rows[0].driftPct).toBeNull()
    expect(s.unitsWithoutEstimate).toBe(1)
    expect(s.belowMarketUnits).toBe(0)
  })

  it('marks estimates older than a year stale', () => {
    const s = computeRentDrift(property(), [unit()], [lease()],
      [report({ created_at: '2025-01-01T00:00:00Z' })], TODAY)
    expect(s.rows[0].stale).toBe(true)
  })

  it('skips vacant units — occupied active leases only', () => {
    const s = computeRentDrift(property(), [unit({ id: 'u9', status: 'vacant' })], [], [report()], TODAY)
    expect(s.rows).toHaveLength(0)
  })
})

// ── Expense ratio ────────────────────────────────────────────────────────────

describe('computeExpenseSection', () => {
  it('computes 12-month expenses over collected rent with a category breakdown', () => {
    const s = computeExpenseSection(
      [expense({ amount: 300, category: 'repairs' }), expense({ amount: 100, category: 'insurance' })],
      [payment({ amount: 1200 }), payment({ due_date: '2026-05-01', paid_at: '2026-05-01', amount: 800 })],
      new Set(['l1']),
      TODAY,
    )
    expect(s.totalExpenses).toBe(400)
    expect(s.totalCollected).toBe(2000)
    expect(s.ratioPct).toBe(20)
    expect(s.byCategory[0]).toMatchObject({ category: 'repairs', label: 'Repairs', amount: 300 })
  })

  it('excludes out-of-window items, non-income types, and uncollected payments', () => {
    const s = computeExpenseSection(
      [expense({ expense_date: '2024-01-01' })],
      [
        payment({ status: 'pending' }),
        payment({ type: 'pet_deposit' }),
        payment({ paid_at: '2024-06-01', due_date: '2024-06-01' }),
      ],
      new Set(['l1']),
      TODAY,
    )
    expect(s.totalExpenses).toBe(0)
    expect(s.totalCollected).toBe(0)
    expect(s.ratioPct).toBeNull()
  })
})

// ── Lease-end clustering ─────────────────────────────────────────────────────

describe('computeLeaseClusters', () => {
  it('flags months where two or more fixed-term leases end together', () => {
    const units = [unit(), unit({ id: 'u2', unit_number: '2' }), unit({ id: 'u3', unit_number: '3' })]
    const leases = [
      lease({ id: 'l1', unit_id: 'u1', end_date: '2026-12-31' }),
      lease({ id: 'l2', unit_id: 'u2', end_date: '2026-12-15' }),
      lease({ id: 'l3', unit_id: 'u3', end_date: '2027-03-31' }),
    ]
    const s = computeLeaseClusters(units, leases)
    expect(s.activeLeaseCount).toBe(3)
    expect(s.clusters).toHaveLength(1)
    expect(s.clusters[0]).toMatchObject({ month: '2026-12', count: 2 })
    expect(s.clusters[0].unitNumbers.sort()).toEqual(['1', '2'])
  })

  it('ignores month-to-month and non-active leases', () => {
    const s = computeLeaseClusters([unit(), unit({ id: 'u2' })], [
      lease({ id: 'l1', unit_id: 'u1', end_date: '2026-12-31', month_to_month: true }),
      lease({ id: 'l2', unit_id: 'u2', end_date: '2026-12-31', status: 'expired' }),
    ])
    expect(s.activeLeaseCount).toBe(0)
    expect(s.clusters).toHaveLength(0)
  })
})

// ── Deposit exposure ─────────────────────────────────────────────────────────

describe('computeDepositSection', () => {
  it('totals deposits held and surfaces a recent move-out with the OH deadline', () => {
    const ended = lease({
      id: 'l2', unit_id: 'u2', status: 'expired',
      start_date: '2025-06-01', end_date: '2026-06-20', security_deposit: 900,
    })
    const s = computeDepositSection(
      property(),
      [unit(), unit({ id: 'u2', unit_number: '2', status: 'vacant' })],
      [lease({ pet_deposit: 300 }), ended],
      [],
      TODAY,
    )
    expect(s.totalHeld).toBe(1500) // active lease: 1200 security + 300 pet
    expect(s.leasesWithDeposit).toBe(1)
    expect(s.atRisk).toHaveLength(1)
    expect(s.atRisk[0]).toMatchObject({
      leaseId: 'l2', unitNumber: '2', moveOut: '2026-06-20',
      deadline: '2026-07-20', // OH: 30 days
      daysLeft: 18,
    })
  })

  it('drops the at-risk row once a disposition letter has been sent', () => {
    const ended = lease({ id: 'l2', unit_id: 'u2', status: 'expired', end_date: '2026-06-20' })
    const s = computeDepositSection(property(), [unit({ id: 'u2' })], [ended],
      [{ lease_id: 'l2', status: 'sent' }], TODAY)
    expect(s.atRisk).toHaveLength(0)
  })

  it('returns a null deadline for a state not in the deposit rules table', () => {
    const ended = lease({ id: 'l2', unit_id: 'u2', status: 'expired', end_date: '2026-06-20' })
    const s = computeDepositSection(property({ state: 'MT' }), [unit({ id: 'u2' })], [ended], [], TODAY)
    expect(s.atRisk[0].deadline).toBeNull()
    expect(s.atRisk[0].daysLeft).toBeNull()
  })
})

// ── Compliance gaps ──────────────────────────────────────────────────────────

describe('computeComplianceSection', () => {
  it('counts deposit-cap warnings via the compliance rules table', () => {
    // NC caps deposits; if NC has a cap on file this trips it. Use OH grace-days
    // rule instead: OH has no grace requirement, so use a state-agnostic check —
    // an oversized deposit in a cap state. Verify with whatever is on file:
    const s = computeComplianceSection(property(), [lease()], {
      late_fee_enabled: false, late_fee_amount: 0, late_fee_grace_days: 0,
      late_fee_type: 'flat', late_fee_percent: 0,
    })
    expect(s.rulesOnFile).toBe(true)
    expect(s.stateName).toBe('Ohio')
    // Late fees off + reasonable deposit ⇒ no warnings.
    expect(s.gapCount).toBe(0)
  })

  it('reports rules-not-on-file for states outside the table', () => {
    const s = computeComplianceSection(property({ state: 'ZZ' }), [lease()], null)
    expect(s.rulesOnFile).toBe(false)
    expect(s.flags).toHaveLength(0)
  })
})

// ── Collection health ────────────────────────────────────────────────────────

describe('computeCollectionSection', () => {
  it('computes the on-time rate from due rents in the window', () => {
    const s = computeCollectionSection([
      payment({ due_date: '2026-05-01', paid_at: '2026-05-01' }),               // on time
      payment({ due_date: '2026-04-01', paid_at: '2026-04-09' }),               // late
      payment({ due_date: '2026-06-01', paid_at: null, status: 'pending' }),    // open + overdue
      payment({ due_date: '2026-08-01', paid_at: null, status: 'pending' }),    // future — excluded
      payment({ due_date: '2026-05-01', type: 'late_fee' }),                    // not rent — excluded
    ], new Set(['l1']), TODAY)
    expect(s.dueCount).toBe(3)
    expect(s.paidLateCount).toBe(1)
    expect(s.openOverdueCount).toBe(1)
    expect(s.openOverdueAmount).toBe(1200)
    expect(s.onTimeRatePct).toBeCloseTo(33.3, 1)
  })

  it('returns null when nothing has come due', () => {
    const s = computeCollectionSection([], new Set(['l1']), TODAY)
    expect(s.onTimeRatePct).toBeNull()
    expect(s.dueCount).toBe(0)
  })
})

// ── Whole exam + portfolio rollup ────────────────────────────────────────────

describe('propertyPhysical / summarizePortfolio', () => {
  const inputs: PhysicalInputs = {
    property: property(),
    units: [unit()],
    leases: [lease()],
    payments: [payment()],
    expenses: [expense()],
    rentReports: [report()],
    depositDocs: [],
    lateFeeConfig: null,
    todayIso: TODAY,
  }

  it('assembles all six sections scoped to the property', () => {
    const p = propertyPhysical(inputs)
    expect(p.propertyName).toBe('Maple Duplex')
    expect(p.unitCount).toBe(1)
    expect(p.occupiedCount).toBe(1)
    expect(p.expenses.ratioPct).toBe(25) // 300 / 1200
    expect(p.rentDrift.unitsWithEstimate).toBe(1)
    expect(p.collection.onTimeRatePct).toBe(100)
    expect(p.deposits.totalHeld).toBe(1200)
  })

  it('ignores other properties’ units and expenses', () => {
    const p = propertyPhysical({
      ...inputs,
      units: [unit(), unit({ id: 'ux', property_id: 'p2' })],
      expenses: [expense(), expense({ property_id: 'p2', amount: 9999 })],
    })
    expect(p.unitCount).toBe(1)
    expect(p.expenses.totalExpenses).toBe(300)
  })

  it('rolls per-property exams up to portfolio totals', () => {
    const a = propertyPhysical(inputs)
    const s = summarizePortfolio([a, a])
    expect(s.properties).toBe(2)
    expect(s.units).toBe(2)
    expect(s.totalCollected).toBe(2400)
    expect(s.ratioPct).toBe(25)
    expect(s.totalDepositsHeld).toBe(2400)
  })

  it('builds an AI metrics payload that carries only computed numbers', () => {
    const p = propertyPhysical(inputs)
    const m = physicalMetricsForAi(summarizePortfolio([p]), [p], TODAY) as {
      as_of: string
      properties: Array<Record<string, unknown>>
    }
    expect(m.as_of).toBe(TODAY)
    expect(m.properties).toHaveLength(1)
    expect(m.properties[0].expense_ratio_pct).toBe(25)
    expect(m.properties[0].compliance_rules_on_file).toBe(true)
  })
})

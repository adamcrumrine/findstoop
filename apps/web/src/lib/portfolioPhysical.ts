// Annual portfolio physical — pure metric computation.
//
// Once a year (on demand) the manager gets a "physical exam" of a property or
// the whole portfolio: rent vs market, expense ratio, lease-end clustering,
// deposit exposure, compliance gaps, collection health. Every number here is
// derived from data the app already holds — leases, payments, expenses, saved
// Rental Analysis reports, the compliance rules table. Nothing is estimated
// or invented: where a signal is missing (no rent estimate on file, state not
// in the rules database) the section says so instead of guessing — the same
// omission-over-invention rule as depositReturn.ts / complianceRules.ts.
//
// The AI narrative (supabase/functions/portfolio-physical) only narrates and
// prioritizes the metrics computed here; it never contributes figures.

import {
  addDaysIso, daysBetween, depositDeadline, effectiveMoveOutDate,
  type DepositLeaseLike,
} from './depositReturn'
import {
  checkDepositCap, checkLateFeeCompliance, getComplianceRules,
  type ComplianceFlag, type LateFeeConfigLike,
} from './complianceRules'
import { EXPENSE_CATEGORY_META } from '@findstoop/shared/types/expense'

// ── Input shapes (structural "Like" types, style of turnover.ts) ─────────────

export interface PhysicalPropertyLike {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
}

export interface PhysicalUnitLike {
  id: string
  property_id: string
  unit_number: string
  bedrooms: number | null
  rent_amount: number
  status: string
}

export interface PhysicalLeaseLike extends DepositLeaseLike {
  id: string
  unit_id: string
  start_date: string
  rent_amount: number
  pet_deposit?: number | null
}

export interface PhysicalPaymentLike {
  lease_id: string
  type: string
  status: string
  amount: number
  due_date: string | null
  paid_at: string | null
}

export interface PhysicalExpenseLike {
  property_id: string
  category: string
  amount: number
  expense_date: string
}

/** A saved Rental Analysis report (rent_reports row). */
export interface PhysicalRentReportLike {
  address: string
  unit_number: string | null
  zip: string | null
  bedrooms: number
  estimate: number
  low: number
  high: number
  created_at: string
}

/** Deposit-disposition letters (generated_documents type='security_deposit'). */
export interface PhysicalDepositDocLike {
  lease_id: string | null
  status: string
}

// ── Constants ────────────────────────────────────────────────────────────────

/** The exam looks back this many days (a year of payments + expenses). */
export const PHYSICAL_WINDOW_DAYS = 365

/** A saved rent estimate older than this is flagged stale (still shown). */
export const ESTIMATE_STALE_DAYS = 365

/** Rent this far below the estimate counts as "below market". */
export const BELOW_MARKET_THRESHOLD_PCT = 5

/** Payment types counted as operating income for the expense ratio. */
const INCOME_TYPES = new Set(['rent', 'late_fee', 'utility', 'fee', 'fine', 'other'])

/** How far back an ended tenancy still counts as open deposit exposure. */
export const DEPOSIT_EXPOSURE_LOOKBACK_DAYS = 90

// ── Section result shapes ────────────────────────────────────────────────────

export interface RentDriftRow {
  unitId: string
  unitNumber: string
  currentRent: number
  /** Null when no saved Rental Analysis matches this unit — never fabricated. */
  estimate: number | null
  low: number | null
  high: number | null
  /** (rent − estimate) / estimate × 100. Negative = below market. Null without an estimate. */
  driftPct: number | null
  estimateDate: string | null
  /** Estimate exists but is older than ESTIMATE_STALE_DAYS. */
  stale: boolean
}

export interface RentDriftSection {
  rows: RentDriftRow[]
  unitsWithEstimate: number
  unitsWithoutEstimate: number
  /** Occupied units renting ≥ BELOW_MARKET_THRESHOLD_PCT below their estimate. */
  belowMarketUnits: number
  /** Sum of (estimate − rent) across below-market units — monthly $ left on the table. */
  monthlyGapDollars: number
}

export interface ExpenseCategoryRow {
  category: string
  label: string
  amount: number
}

export interface ExpenseSection {
  totalExpenses: number
  totalCollected: number
  /** Expenses ÷ collected × 100, or null when nothing was collected. */
  ratioPct: number | null
  byCategory: ExpenseCategoryRow[]
}

export interface LeaseEndCluster {
  /** YYYY-MM the leases end in. */
  month: string
  count: number
  unitNumbers: string[]
}

export interface LeaseClusterSection {
  activeLeaseCount: number
  /** Months where 2+ fixed-term leases end together, soonest first. */
  clusters: LeaseEndCluster[]
}

export interface DepositAtRisk {
  leaseId: string
  unitNumber: string
  moveOut: string
  /** Statutory return deadline, or null when the state's rule isn't on file. */
  deadline: string | null
  /** Days until the deadline (negative = overdue). Null without a deadline. */
  daysLeft: number | null
}

export interface DepositSection {
  /** Security + pet deposits held on active/upcoming leases. */
  totalHeld: number
  leasesWithDeposit: number
  /** Ended tenancies with a held deposit and no disposition letter sent. */
  atRisk: DepositAtRisk[]
}

export interface ComplianceSection {
  /** True when the property's state is in the compliance rules table. */
  rulesOnFile: boolean
  stateName: string
  flags: ComplianceFlag[]
  /** Warning-level flags only — the "gaps". */
  gapCount: number
}

export interface CollectionSection {
  /** Rent payments that came due inside the window. */
  dueCount: number
  dueAmount: number
  /** Completed but paid after the due date. */
  paidLateCount: number
  /** Past due and still not completed. */
  openOverdueCount: number
  openOverdueAmount: number
  /** % of due rents paid on time, or null when nothing came due. */
  onTimeRatePct: number | null
}

export interface PropertyPhysical {
  propertyId: string
  propertyName: string
  state: string
  unitCount: number
  occupiedCount: number
  rentDrift: RentDriftSection
  expenses: ExpenseSection
  leaseClusters: LeaseClusterSection
  deposits: DepositSection
  compliance: ComplianceSection
  collection: CollectionSection
}

export interface PortfolioSummary {
  properties: number
  units: number
  occupied: number
  totalCollected: number
  totalExpenses: number
  ratioPct: number | null
  totalDepositsHeld: number
  depositsAtRisk: number
  belowMarketUnits: number
  monthlyGapDollars: number
  complianceGaps: number
  onTimeRatePct: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

/** Lowercase, strip punctuation, collapse whitespace — for address matching. */
export function normalizeAddress(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Find the saved Rental Analysis report for a unit, or null. Matching is
 * conservative: the report's address must contain the property's street line
 * (or vice versa), and when both sides carry a ZIP they must agree. Among
 * matches we prefer the same unit number, then the same bedroom count, then
 * the newest report. A near-miss returns null — we never show a neighbor's
 * estimate as this unit's market rent.
 */
export function matchRentReport(
  property: Pick<PhysicalPropertyLike, 'address' | 'zip'>,
  unit: Pick<PhysicalUnitLike, 'unit_number' | 'bedrooms'>,
  reports: PhysicalRentReportLike[],
): PhysicalRentReportLike | null {
  const street = normalizeAddress(property.address)
  if (!street) return null

  const candidates = reports.filter((r) => {
    const rAddr = normalizeAddress(r.address)
    if (!rAddr) return false
    const addressMatches = rAddr.includes(street) || street.includes(rAddr)
    if (!addressMatches) return false
    if (r.zip && property.zip && r.zip.trim() !== property.zip.trim()) return false
    return true
  })
  if (candidates.length === 0) return null

  const unitNo = (unit.unit_number ?? '').trim().toLowerCase()
  const score = (r: PhysicalRentReportLike) => {
    let s = 0
    if (unitNo && (r.unit_number ?? '').trim().toLowerCase() === unitNo) s += 2
    if (unit.bedrooms != null && r.bedrooms === unit.bedrooms) s += 1
    return s
  }
  return candidates
    .slice()
    .sort((a, b) => score(b) - score(a) || b.created_at.localeCompare(a.created_at))[0]
}

/** First lease per unit that is currently active (or upcoming as fallback). */
function currentLeaseByUnit(leases: PhysicalLeaseLike[]): Map<string, PhysicalLeaseLike> {
  const byUnit = new Map<string, PhysicalLeaseLike>()
  const ranked = leases.slice().sort((a, b) => {
    const rank = (l: PhysicalLeaseLike) => (l.status === 'active' ? 0 : l.status === 'upcoming' ? 1 : 2)
    return rank(a) - rank(b) || b.start_date.localeCompare(a.start_date)
  })
  for (const l of ranked) {
    if (l.status !== 'active' && l.status !== 'upcoming') continue
    if (!byUnit.has(l.unit_id)) byUnit.set(l.unit_id, l)
  }
  return byUnit
}

// ── Section computations ─────────────────────────────────────────────────────

export function computeRentDrift(
  property: PhysicalPropertyLike,
  units: PhysicalUnitLike[],
  leases: PhysicalLeaseLike[],
  reports: PhysicalRentReportLike[],
  todayIso: string,
): RentDriftSection {
  const leaseByUnit = currentLeaseByUnit(leases)
  const rows: RentDriftRow[] = []

  for (const unit of units) {
    const lease = leaseByUnit.get(unit.id)
    if (!lease || lease.status !== 'active') continue // vacant units are the vacancy ticker's job
    const rent = Number(lease.rent_amount)
    if (!Number.isFinite(rent) || rent <= 0) continue

    const report = matchRentReport(property, unit, reports)
    if (!report) {
      rows.push({
        unitId: unit.id, unitNumber: unit.unit_number, currentRent: rent,
        estimate: null, low: null, high: null, driftPct: null, estimateDate: null, stale: false,
      })
      continue
    }
    const estimate = Number(report.estimate)
    const created = report.created_at.slice(0, 10)
    rows.push({
      unitId: unit.id,
      unitNumber: unit.unit_number,
      currentRent: rent,
      estimate,
      low: Number(report.low),
      high: Number(report.high),
      driftPct: estimate > 0 ? round1(((rent - estimate) / estimate) * 100) : null,
      estimateDate: created,
      stale: daysBetween(created, todayIso) > ESTIMATE_STALE_DAYS,
    })
  }

  const withEstimate = rows.filter((r) => r.estimate != null)
  const belowMarket = withEstimate.filter((r) => (r.driftPct ?? 0) <= -BELOW_MARKET_THRESHOLD_PCT)
  return {
    rows,
    unitsWithEstimate: withEstimate.length,
    unitsWithoutEstimate: rows.length - withEstimate.length,
    belowMarketUnits: belowMarket.length,
    monthlyGapDollars: round2(belowMarket.reduce((s, r) => s + Math.max(0, (r.estimate ?? 0) - r.currentRent), 0)),
  }
}

export function computeExpenseSection(
  expenses: PhysicalExpenseLike[],
  payments: PhysicalPaymentLike[],
  leaseIds: Set<string>,
  todayIso: string,
): ExpenseSection {
  const windowStart = addDaysIso(todayIso, -PHYSICAL_WINDOW_DAYS)

  const inWindowExpenses = expenses.filter(
    (e) => e.expense_date >= windowStart && e.expense_date <= todayIso,
  )
  const totalExpenses = round2(inWindowExpenses.reduce((s, e) => s + Number(e.amount), 0))

  const byCat = new Map<string, number>()
  for (const e of inWindowExpenses) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount))
  }
  const labelFor = (key: string) =>
    EXPENSE_CATEGORY_META.find((m) => m.key === key)?.label ?? key.replace(/_/g, ' ')
  const byCategory = [...byCat.entries()]
    .map(([category, amount]) => ({ category, label: labelFor(category), amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount)

  // Collected income: completed payments of income types whose money date
  // (paid_at, falling back to due_date) is inside the window.
  let totalCollected = 0
  for (const p of payments) {
    if (!leaseIds.has(p.lease_id)) continue
    if (p.status !== 'completed' || !INCOME_TYPES.has(p.type)) continue
    const moneyDate = (p.paid_at ?? p.due_date ?? '').slice(0, 10)
    if (!moneyDate || moneyDate < windowStart || moneyDate > todayIso) continue
    totalCollected += Number(p.amount)
  }
  totalCollected = round2(totalCollected)

  return {
    totalExpenses,
    totalCollected,
    ratioPct: totalCollected > 0 ? round1((totalExpenses / totalCollected) * 100) : null,
    byCategory,
  }
}

export function computeLeaseClusters(
  units: PhysicalUnitLike[],
  leases: PhysicalLeaseLike[],
): LeaseClusterSection {
  const unitNoById = new Map(units.map((u) => [u.id, u.unit_number]))
  // Month-to-month tenancies have no meaningful fixed end to cluster.
  const active = leases.filter((l) => l.status === 'active' && !l.month_to_month)

  const byMonth = new Map<string, string[]>()
  for (const l of active) {
    const month = l.end_date.slice(0, 7)
    const arr = byMonth.get(month) ?? []
    arr.push(unitNoById.get(l.unit_id) ?? '—')
    byMonth.set(month, arr)
  }
  const clusters = [...byMonth.entries()]
    .filter(([, unitsIn]) => unitsIn.length >= 2)
    .map(([month, unitNumbers]) => ({ month, count: unitNumbers.length, unitNumbers }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return { activeLeaseCount: active.length, clusters }
}

export function computeDepositSection(
  property: PhysicalPropertyLike,
  units: PhysicalUnitLike[],
  leases: PhysicalLeaseLike[],
  depositDocs: PhysicalDepositDocLike[],
  todayIso: string,
): DepositSection {
  const unitNoById = new Map(units.map((u) => [u.id, u.unit_number]))

  const holding = leases.filter((l) => l.status === 'active' || l.status === 'upcoming')
  const totalHeld = round2(holding.reduce(
    (s, l) => s + Number(l.security_deposit ?? 0) + Number(l.pet_deposit ?? 0), 0,
  ))
  const leasesWithDeposit = holding.filter(
    (l) => Number(l.security_deposit ?? 0) + Number(l.pet_deposit ?? 0) > 0,
  ).length

  // Turnover deposits still open: tenancy ended recently, deposit held, and no
  // disposition letter has gone out (same completion signal as turnover.ts).
  const lookbackStart = addDaysIso(todayIso, -DEPOSIT_EXPOSURE_LOOKBACK_DAYS)
  const returned = new Set(
    depositDocs
      .filter((d) => d.lease_id && (d.status === 'sent' || d.status === 'signed'))
      .map((d) => d.lease_id as string),
  )

  const atRisk: DepositAtRisk[] = []
  for (const l of leases) {
    const deposit = Number(l.security_deposit ?? 0)
    if (!(deposit > 0) || returned.has(l.id)) continue
    const moveOut = effectiveMoveOutDate(l, todayIso)
    if (!moveOut || moveOut > todayIso || moveOut < lookbackStart) continue
    const deadline = depositDeadline(moveOut, property.state)
    atRisk.push({
      leaseId: l.id,
      unitNumber: unitNoById.get(l.unit_id) ?? '—',
      moveOut,
      deadline,
      daysLeft: deadline ? daysBetween(todayIso, deadline) : null,
    })
  }
  atRisk.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))

  return { totalHeld, leasesWithDeposit, atRisk }
}

export function computeComplianceSection(
  property: PhysicalPropertyLike,
  leases: PhysicalLeaseLike[],
  lateFeeConfig: LateFeeConfigLike | null,
): ComplianceSection {
  const rules = getComplianceRules(property.state)
  const flags: ComplianceFlag[] = [
    ...checkLateFeeCompliance(lateFeeConfig, property.state),
    ...leases
      .filter((l) => l.status === 'active' || l.status === 'upcoming')
      .map((l) => checkDepositCap(l.security_deposit, l.rent_amount, property.state))
      .filter((f): f is ComplianceFlag => f !== null),
  ]
  return {
    rulesOnFile: rules != null,
    stateName: rules?.stateName ?? property.state.trim().toUpperCase(),
    flags,
    gapCount: flags.filter((f) => f.level === 'warning').length,
  }
}

export function computeCollectionSection(
  payments: PhysicalPaymentLike[],
  leaseIds: Set<string>,
  todayIso: string,
): CollectionSection {
  const windowStart = addDaysIso(todayIso, -PHYSICAL_WINDOW_DAYS)

  let dueCount = 0
  let dueAmount = 0
  let paidLateCount = 0
  let openOverdueCount = 0
  let openOverdueAmount = 0

  for (const p of payments) {
    if (!leaseIds.has(p.lease_id) || p.type !== 'rent') continue
    const due = (p.due_date ?? '').slice(0, 10)
    if (!due || due < windowStart || due > todayIso) continue
    dueCount += 1
    dueAmount += Number(p.amount)
    if (p.status === 'completed') {
      const paid = (p.paid_at ?? '').slice(0, 10)
      if (paid && paid > due) paidLateCount += 1
    } else {
      openOverdueCount += 1
      openOverdueAmount += Number(p.amount)
    }
  }

  const lateOrOpen = paidLateCount + openOverdueCount
  return {
    dueCount,
    dueAmount: round2(dueAmount),
    paidLateCount,
    openOverdueCount,
    openOverdueAmount: round2(openOverdueAmount),
    onTimeRatePct: dueCount > 0 ? round1(((dueCount - lateOrOpen) / dueCount) * 100) : null,
  }
}

// ── Full property + portfolio exams ──────────────────────────────────────────

export interface PhysicalInputs {
  property: PhysicalPropertyLike
  units: PhysicalUnitLike[]
  leases: PhysicalLeaseLike[]
  payments: PhysicalPaymentLike[]
  expenses: PhysicalExpenseLike[]
  rentReports: PhysicalRentReportLike[]
  depositDocs: PhysicalDepositDocLike[]
  lateFeeConfig: LateFeeConfigLike | null
  todayIso: string
}

export function propertyPhysical(inputs: PhysicalInputs): PropertyPhysical {
  const { property, units, leases, payments, expenses, rentReports, depositDocs, lateFeeConfig, todayIso } = inputs
  const propUnits = units.filter((u) => u.property_id === property.id)
  const unitIds = new Set(propUnits.map((u) => u.id))
  const propLeases = leases.filter((l) => unitIds.has(l.unit_id))
  const leaseIds = new Set(propLeases.map((l) => l.id))
  const propExpenses = expenses.filter((e) => e.property_id === property.id)

  return {
    propertyId: property.id,
    propertyName: property.name,
    state: property.state,
    unitCount: propUnits.length,
    occupiedCount: propUnits.filter((u) => u.status === 'occupied').length,
    rentDrift: computeRentDrift(property, propUnits, propLeases, rentReports, todayIso),
    expenses: computeExpenseSection(propExpenses, payments, leaseIds, todayIso),
    leaseClusters: computeLeaseClusters(propUnits, propLeases),
    deposits: computeDepositSection(property, propUnits, propLeases, depositDocs, todayIso),
    compliance: computeComplianceSection(property, propLeases, lateFeeConfig),
    collection: computeCollectionSection(payments, leaseIds, todayIso),
  }
}

export function summarizePortfolio(perProperty: PropertyPhysical[]): PortfolioSummary {
  const totalCollected = round2(perProperty.reduce((s, p) => s + p.expenses.totalCollected, 0))
  const totalExpenses = round2(perProperty.reduce((s, p) => s + p.expenses.totalExpenses, 0))
  const totalDue = perProperty.reduce((s, p) => s + p.collection.dueCount, 0)
  const totalLate = perProperty.reduce(
    (s, p) => s + p.collection.paidLateCount + p.collection.openOverdueCount, 0,
  )
  return {
    properties: perProperty.length,
    units: perProperty.reduce((s, p) => s + p.unitCount, 0),
    occupied: perProperty.reduce((s, p) => s + p.occupiedCount, 0),
    totalCollected,
    totalExpenses,
    ratioPct: totalCollected > 0 ? round1((totalExpenses / totalCollected) * 100) : null,
    totalDepositsHeld: round2(perProperty.reduce((s, p) => s + p.deposits.totalHeld, 0)),
    depositsAtRisk: perProperty.reduce((s, p) => s + p.deposits.atRisk.length, 0),
    belowMarketUnits: perProperty.reduce((s, p) => s + p.rentDrift.belowMarketUnits, 0),
    monthlyGapDollars: round2(perProperty.reduce((s, p) => s + p.rentDrift.monthlyGapDollars, 0)),
    complianceGaps: perProperty.reduce((s, p) => s + p.compliance.gapCount, 0),
    onTimeRatePct: totalDue > 0 ? round1(((totalDue - totalLate) / totalDue) * 100) : null,
  }
}

// ── Year-over-year ───────────────────────────────────────────────────────────
// Every money section windows backward from todayIso, so "last year" is the
// same computation with todayIso shifted back one window. Only the flow
// metrics (collected, expenses, ratio, on-time rate) are meaningful across
// years — point-in-time sections (deposits held, compliance, drift) are not
// diffed.

/** The prior-year portfolio summary for the same inputs. */
export function priorYearSummary(perPropertyInputs: PhysicalInputs[]): PortfolioSummary {
  return summarizePortfolio(
    perPropertyInputs.map((i) =>
      propertyPhysical({ ...i, todayIso: addDaysIso(i.todayIso, -PHYSICAL_WINDOW_DAYS) }),
    ),
  )
}

/**
 * Whether the prior window has enough activity to make comparisons honest —
 * a portfolio in its first year gets no YoY strip rather than "∞% growth"
 * against an empty year.
 */
export function hasPriorYearSignal(prior: PortfolioSummary): boolean {
  return prior.totalCollected > 0 || prior.totalExpenses > 0
}

/** Signed percent change, null when the prior value can't support one. */
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null
  return round1(((current - prior) / prior) * 100)
}

/**
 * Compact metrics payload for the portfolio-physical edge function. The model
 * narrates and prioritizes these numbers; the report UI renders the full
 * computed sections, so this only needs the signal, not every row.
 */
export function physicalMetricsForAi(
  summary: PortfolioSummary,
  perProperty: PropertyPhysical[],
  todayIso: string,
): Record<string, unknown> {
  return {
    as_of: todayIso,
    window_days: PHYSICAL_WINDOW_DAYS,
    portfolio: summary,
    properties: perProperty.map((p) => ({
      name: p.propertyName,
      state: p.state,
      units: p.unitCount,
      occupied: p.occupiedCount,
      expense_ratio_pct: p.expenses.ratioPct,
      collected_12mo: p.expenses.totalCollected,
      expenses_12mo: p.expenses.totalExpenses,
      top_expense_categories: p.expenses.byCategory.slice(0, 3),
      on_time_rate_pct: p.collection.onTimeRatePct,
      rents_due_12mo: p.collection.dueCount,
      paid_late_12mo: p.collection.paidLateCount,
      open_overdue: p.collection.openOverdueCount,
      open_overdue_amount: p.collection.openOverdueAmount,
      units_below_market: p.rentDrift.belowMarketUnits,
      monthly_rent_gap_dollars: p.rentDrift.monthlyGapDollars,
      units_without_rent_estimate: p.rentDrift.unitsWithoutEstimate,
      lease_end_clusters: p.leaseClusters.clusters.map((c) => ({ month: c.month, leases_ending: c.count })),
      deposits_held: p.deposits.totalHeld,
      deposit_returns_open: p.deposits.atRisk.map((d) => ({
        unit: d.unitNumber, moved_out: d.moveOut, statutory_deadline: d.deadline, days_left: d.daysLeft,
      })),
      compliance_warnings: p.compliance.flags
        .filter((f) => f.level === 'warning')
        .map((f) => f.message),
      compliance_rules_on_file: p.compliance.rulesOnFile,
    })),
  }
}

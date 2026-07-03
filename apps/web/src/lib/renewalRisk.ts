// Renewal risk — rules-based flight-risk heuristic for the renewal advisor.
//
// The advisor already suggests a number (renewalAdvisor.ts); this module adds
// the "will they even stay?" read, derived ENTIRELY from data the app already
// holds — no ML, no API calls, no new tables. Everything here is a pure
// function over row-shaped inputs (same pattern as turnover.ts), so the copy
// and thresholds are tested, not ad-libbed.
//
// Scoring rules (points accumulate; higher = more likely to walk):
//
//   Signal                                                          Points
//   ─────────────────────────────────────────────────────────────── ──────
//   Maintenance friction (tickets on the unit during this tenancy)
//     3+ tickets in the last 6 months                                 +2
//     else 3+ this tenancy, or 2 in the last 6 months                 +1
//   Payment friction (rent rows + late fees, last 12 months)
//     3+ late / failed / past-due-beyond-grace events                 +2
//     1–2 such events                                                 +1
//   Rent vs market (same estimate the advisor prices from)
//     paying ≥5% OVER market — easy to find cheaper (shop-around)     +2
//     paying under market by MORE than the advisor's 10% cap —
//       a hard correction is what pushes good tenants to look         +1
//   Tenure (leases on this unit for this tenant)
//     2+ years in, or has renewed before — stickier                   −1
//   Lease-end seasonality
//     ends Nov–Feb — a winter vacancy takes longer to fill, so a
//       walk-away costs more (raises the stakes, nudges "renew early") +1
//
//   Tier: score ≤ 1 → low · 2–3 → medium · ≥ 4 → high
//
// The output is a coarse tier, the top plain-English reasons, and a one-line
// recommendation that plugs into the advisor's framing ("renew early with a
// modest increase", "budget for turnover").

import { addDaysIso, daysBetween } from './depositReturn'

// ── Thresholds (documented above; exported for tests + UI copy) ─────────────

/** Days past the due date before a rent payment counts as "late". */
export const LATE_GRACE_DAYS = 5
/** Lookback window for payment friction. */
export const PAYMENT_LOOKBACK_DAYS = 365
/** Recent-maintenance window. */
export const MAINTENANCE_RECENT_DAYS = 183
/** Tenure (months) after which a tenant reads as "settled in". */
export const STICKY_TENURE_MONTHS = 24
/** Paying this fraction over market = shop-around risk. */
export const OVER_MARKET_PCT = 0.05
/** Under-market gap beyond the advisor's cap = raise-shock risk (renewalAdvisor.MAX_INCREASE_PCT). */
export const UNDER_MARKET_PCT = 0.10

export type RiskTier = 'low' | 'medium' | 'high'

/** Badge copy per tier — kept here so the wording is tested with the logic. */
export const RISK_TIER_LABEL: Record<RiskTier, string> = {
  low: 'Low flight risk',
  medium: 'Medium flight risk',
  high: 'High flight risk',
}

// ── Row-shaped inputs (structural, so hooks' richer types slot straight in) ──

export interface RiskLeaseLike {
  id: string
  unit_id: string
  tenant_id: string
  start_date: string
  end_date: string
  rent_amount: number
}

export interface RiskPaymentLike {
  lease_id: string
  type: string
  status: string
  due_date: string | null
  paid_at: string | null
  created_at: string
}

export interface RiskMaintenanceLike {
  unit_id: string
  created_at: string
}

export interface RenewalRiskInput {
  /** The lease up for renewal. */
  lease: RiskLeaseLike
  /** All leases the caller already has — used to find this tenant's history on the unit. */
  allLeases: RiskLeaseLike[]
  /** Any superset of payments (filtered internally to this tenancy + 12 months). */
  payments: RiskPaymentLike[]
  /** Any superset of maintenance requests (filtered internally to this unit + tenancy window). */
  maintenance: RiskMaintenanceLike[]
  /** Market estimate the advisor already matched (null = unknown, signal skipped). */
  marketEstimate: number | null
  todayIso: string
}

export interface RenewalRisk {
  tier: RiskTier
  /** Raw score, for tests/debugging — the UI shows the tier. */
  score: number
  /** Top reasons, most impactful first (max 3). Plain landlord English. */
  reasons: string[]
  /** One line that plugs into the advisor's framing. */
  recommendation: string
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const day = (iso: string) => iso.slice(0, 10)

/** Month name of an ISO date, for the seasonality reason ("ends in December"). */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

interface Signal { points: number; reason: string }

/**
 * Score a lease's renewal / flight risk from data already on hand.
 * Pure: same inputs, same answer. Missing data (no market estimate, no
 * payment rows) simply contributes nothing — the tier degrades toward 'low'
 * rather than guessing.
 */
export function assessRenewalRisk(input: RenewalRiskInput): RenewalRisk {
  const { lease, allLeases, payments, maintenance, marketEstimate, todayIso } = input
  const signals: Signal[] = []

  // ── Tenancy chain: this tenant's leases on this unit (renewals included) ──
  const chain = allLeases.filter(
    (l) => l.unit_id === lease.unit_id && l.tenant_id === lease.tenant_id,
  )
  const chainIds = new Set<string>([lease.id, ...chain.map((l) => l.id)])
  const tenancyStart = chain.reduce(
    (min, l) => (l.start_date < min ? l.start_date : min),
    lease.start_date,
  )
  const tenureMonths = Math.floor(Math.max(0, daysBetween(tenancyStart, todayIso)) / 30.44)
  const hasRenewedBefore = chain.some((l) => l.id !== lease.id && l.start_date < lease.start_date)

  // ── Maintenance friction ───────────────────────────────────────────────────
  // Tickets on the unit created during this tenancy. (Unit-scoped, not
  // tenant-scoped, so co-tenant tickets count — they live there too.)
  const recentCutoff = addDaysIso(todayIso, -MAINTENANCE_RECENT_DAYS)
  const tickets = maintenance.filter((m) => {
    if (m.unit_id !== lease.unit_id) return false
    const created = day(m.created_at)
    return created >= tenancyStart && created <= todayIso
  })
  const recentTickets = tickets.filter((m) => day(m.created_at) >= recentCutoff).length
  if (recentTickets >= 3) {
    signals.push({ points: 2, reason: `${recentTickets} maintenance tickets in the last 6 months` })
  } else if (tickets.length >= 3) {
    signals.push({ points: 1, reason: `${tickets.length} maintenance tickets this tenancy` })
  } else if (recentTickets === 2) {
    signals.push({ points: 1, reason: `2 maintenance tickets in the last 6 months` })
  }

  // ── Payment friction ───────────────────────────────────────────────────────
  // Late events in the last 12 months, from two independent traces:
  //   · rent rows that failed, cleared late (beyond grace), or sit past due
  //   · late_fee rows the manager actually charged
  // We take the max of the two counts rather than the sum — a late month
  // usually produces BOTH a late rent row and a late-fee row, and double
  // counting one bad month as two would overstate the friction.
  const paymentCutoff = addDaysIso(todayIso, -PAYMENT_LOOKBACK_DAYS)
  const inWindow = payments.filter((p) => {
    if (!chainIds.has(p.lease_id)) return false
    const anchor = day(p.due_date ?? p.paid_at ?? p.created_at)
    return anchor >= paymentCutoff && anchor <= todayIso
  })
  const lateRent = inWindow.filter((p) => {
    if (p.type !== 'rent') return false
    if (p.status === 'failed') return true
    if (!p.due_date) return false
    const graceEnd = addDaysIso(day(p.due_date), LATE_GRACE_DAYS)
    if (p.status === 'completed') return p.paid_at != null && day(p.paid_at) > graceEnd
    // pending/processing rent already past due + grace = money not arriving on time
    return (p.status === 'pending' || p.status === 'processing') && graceEnd < todayIso
  }).length
  const lateFees = inWindow.filter((p) => p.type === 'late_fee').length
  const lateEvents = Math.max(lateRent, lateFees)
  if (lateEvents >= 3) {
    signals.push({ points: 2, reason: `${lateEvents} late or missed rent payments in the last 12 months` })
  } else if (lateEvents >= 1) {
    signals.push({ points: 1, reason: `${lateEvents} late or missed rent payment${lateEvents === 1 ? '' : 's'} in the last 12 months` })
  }

  // ── Rent vs market ─────────────────────────────────────────────────────────
  // Reuses the advisor's matched estimate — never a fresh lookup. Both
  // directions carry risk, for different reasons.
  const rent = Number(lease.rent_amount)
  const market = marketEstimate == null ? null : Number(marketEstimate)
  let overMarket = false
  let underMarketBig = false
  if (market != null && Number.isFinite(market) && market > 0 && Number.isFinite(rent) && rent > 0) {
    if (rent >= market * (1 + OVER_MARKET_PCT)) {
      overMarket = true
      signals.push({ points: 2, reason: `Paying ~${usd(rent - market)} over market — cheaper comparables are easy to find` })
    } else if (market > rent * (1 + UNDER_MARKET_PCT)) {
      // The gap is wider than the advisor's 10% cap — any raise that chases
      // market lands as sticker shock.
      underMarketBig = true
      signals.push({ points: 1, reason: `Paying ~${usd(market - rent)} under market — raise carefully` })
    }
  }

  // ── Tenure ─────────────────────────────────────────────────────────────────
  if (tenureMonths >= STICKY_TENURE_MONTHS) {
    const years = Math.floor(tenureMonths / 12)
    signals.push({ points: -1, reason: `${years}+ year${years === 1 ? '' : 's'} in — long-tenured tenants usually renew` })
  } else if (hasRenewedBefore) {
    signals.push({ points: -1, reason: `Has renewed before — repeat renewers tend to stay` })
  }

  // ── Lease-end seasonality ──────────────────────────────────────────────────
  // A November–February end date doesn't make the tenant likelier to leave,
  // but it makes losing them costlier — winter re-rents are slow. It raises
  // the stakes, so it nudges the tier and the "renew early" framing.
  const endMonth = Number(lease.end_date.slice(5, 7)) // 1–12
  if (endMonth >= 11 || endMonth <= 2) {
    signals.push({ points: 1, reason: `Lease ends in ${MONTHS[endMonth - 1]} — winter vacancies take longer to fill` })
  }

  // ── Tier + copy ────────────────────────────────────────────────────────────
  const score = signals.reduce((sum, s) => sum + s.points, 0)
  const tier: RiskTier = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'

  // Most impactful reasons first; sticky-tenure context (negative points)
  // sorts last so risk drivers lead.
  const reasons = signals
    .slice()
    .sort((a, b) => b.points - a.points)
    .map((s) => s.reason)
    .slice(0, 3)

  const recommendation = recommend(tier, overMarket, underMarketBig)

  return { tier, score, reasons, recommendation }
}

/**
 * One-line next step per tier, tilted by the market position. Written to plug
 * into the advisor's suggested number, not compete with it.
 */
function recommend(tier: RiskTier, overMarket: boolean, underMarketBig: boolean): string {
  if (tier === 'high') {
    if (overMarket) {
      return 'Budget for turnover — or hold the rent and renew early; keeping them beats re-listing above market.'
    }
    if (underMarketBig) {
      return 'Budget for turnover if you plan a big raise — otherwise renew early with a modest increase and close the gap over two renewals.'
    }
    return 'Budget for turnover — and if you would rather keep them, renew early with a friendly offer.'
  }
  if (tier === 'medium') {
    if (overMarket) {
      return 'Renew early and consider holding at current rent — a raise on an above-market rate invites shopping around.'
    }
    if (underMarketBig) {
      return 'Renew early with a modest increase — close the market gap gradually, not all at once.'
    }
    return 'Renew early with a modest increase — plenty of runway and a clean offer keep this one.'
  }
  if (underMarketBig) {
    return 'Safe to raise, but gently — spread a big market gap over more than one renewal.'
  }
  return 'Solid renewal candidate — a standard early offer should land.'
}

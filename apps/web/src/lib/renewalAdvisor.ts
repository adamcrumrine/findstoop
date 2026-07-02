// Renewal advisor — pure pricing + matching logic for the Leases-page panel.
//
// Small landlords chronically under-raise rent and bungle renewal timing, so
// for leases inside the renewal window we suggest a number they can defend:
// meet the market halfway, never below current rent, never more than a 10%
// jump (retention beats squeezing out the last dollar), rounded to a clean $5.
// The UI copy comes from here too so the reasoning is tested, not ad-libbed.

/** Leases ending within this many days get a renewal-advisor row. */
export const RENEWAL_WINDOW_DAYS = 120

/** Cap the suggested increase at 10% over current rent. */
export const MAX_INCREASE_PCT = 0.10

export interface RenewalSuggestion {
  suggested: number
  action: 'increase' | 'hold'
  /** One plain-English sentence for the UI. */
  reasoning: string
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

/**
 * suggest = clamp(midpoint(current, market), floor: current, cap: current×1.10),
 * rounded to the nearest $5 (rounded down at the cap so 10% is a hard ceiling).
 * Market at/below current — or unknown — suggests holding at current rent.
 */
export function suggestRenewalRent(currentRent: number, marketEstimate: number | null): RenewalSuggestion {
  const current = Number(currentRent)
  const market = marketEstimate == null ? null : Number(marketEstimate)

  if (market == null || !Number.isFinite(market) || market <= 0) {
    return {
      suggested: current,
      action: 'hold',
      reasoning: `No market estimate yet — the offer starts at your current ${usd(current)}.`,
    }
  }

  if (market <= current) {
    return {
      suggested: current,
      action: 'hold',
      reasoning: `Market is ~${usd(market)}, at or below your current ${usd(current)} — holding steady favors keeping a good tenant over risking a vacancy.`,
    }
  }

  const cap = current * (1 + MAX_INCREASE_PCT)
  const midpoint = (current + market) / 2
  const clamped = Math.min(Math.max(midpoint, current), cap)
  let suggested = Math.round(clamped / 5) * 5
  if (suggested > cap) suggested = Math.floor(cap / 5) * 5 // never breach the 10% cap
  if (suggested <= current) {
    return {
      suggested: current,
      action: 'hold',
      reasoning: `Market is ~${usd(market)} — close to your current ${usd(current)}; holding steady favors retention.`,
    }
  }

  const capped = midpoint > cap
  return {
    suggested,
    action: 'increase',
    reasoning: capped
      ? `Market is ~${usd(market)}; capping the increase at ${usd(suggested)} (10% over current) balances income and retention risk.`
      : `Market is ~${usd(market)}; a modest increase to ${usd(suggested)} balances income and retention risk.`,
  }
}

// ── Saved-report matching ────────────────────────────────────────────────────
// Rental Analysis reports are paid, saved artifacts — the advisor reuses the
// landlord's existing reports instead of buying a new estimate per page view.

export interface RentReportLike {
  address: string
  unit_number: string | null
  estimate: number
}

const normalizeAddress = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Find the landlord's most recent saved rent report for a property address
 * (reports arrive newest-first). Matches on the normalized street line —
 * report addresses may carry city/zip the property row keeps in other columns,
 * so prefix matches count. A report pinned to a different unit doesn't match.
 */
export function matchRentReport<T extends RentReportLike>(
  reports: T[],
  address: string,
  unitNumber?: string | null,
): T | null {
  const target = normalizeAddress(address ?? '')
  if (!target) return null
  const unit = (unitNumber ?? '').trim().toLowerCase()
  for (const r of reports) {
    const cand = normalizeAddress(r.address ?? '')
    if (!cand) continue
    if (cand !== target && !cand.startsWith(target + ' ') && !target.startsWith(cand + ' ')) continue
    const rUnit = (r.unit_number ?? '').trim().toLowerCase()
    if (rUnit && unit && rUnit !== unit) continue
    return r
  }
  return null
}

// ── Respond-by default ───────────────────────────────────────────────────────

const toIso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}
const minIso = (a: string, b: string) => (a < b ? a : b)
const maxIso = (a: string, b: string) => (a > b ? a : b)

/**
 * Default "please respond by" date for the offer letter: two weeks out, pulled
 * earlier if that would leave less than 30 days of runway before the lease
 * ends — but never sooner than a week from today, and never past the end date.
 */
export function defaultRespondBy(leaseEnd: string, todayIso: string): string {
  const twoWeeks = addDays(todayIso, 14)
  const runway = addDays(leaseEnd, -30)
  let respondBy = minIso(twoWeeks, runway)
  respondBy = maxIso(respondBy, addDays(todayIso, 7))
  return minIso(respondBy, leaseEnd)
}

// Pure rent-estimate engine. ZERO I/O and ZERO imports by design — the Deno
// edge function runs it server-side, and vitest imports the same file for unit
// tests (see apps/web/src/lib/rentEstimate.test.ts). All market + parcel data
// is fetched by the caller and passed in; this module only does the math.
//
// The estimate is built entirely from PUBLIC data:
//   baseline rent (Census ACS / HUD SAFMR) → hedonic adjustments for the
//   specific unit (sqft/baths/age/type) → recency trend (BLS CPI) → confidence
//   band (ACS margins of error + model uncertainty).
//
// The coefficient tables below are deliberate, documented placeholders. Once
// FindStoop has enough first-party leases to calibrate, refit them (or replace
// computeEstimate with a trained model) — the call signature can stay the same.

// ── Inputs ──────────────────────────────────────────────────────────────────

/** Where the area baseline rent came from, best → worst. Drives confidence. */
export type BaselineSource = 'acs_tract' | 'acs_zip' | 'safmr' | 'fmr'

/** Where the subject unit's physical attributes came from. */
export type AttributesSource = 'parcel' | 'user'

export interface BaselineRent {
  /** Median gross rent for the subject's bedroom count, in dollars/month. */
  value: number
  /** ACS 90% margin of error for `value`, if known (dollars). null for HUD. */
  moe: number | null
  source: BaselineSource
  /** Data vintage, e.g. 2023 for ACS 5-year ending 2023. */
  vintageYear: number
}

export interface SubjectUnit {
  bedrooms: number
  bathrooms: number | null
  sqft: number | null
  yearBuilt: number | null
  /** Free-form; mapped to a coarse class internally. */
  propertyType: string | null
  attributesSource: AttributesSource
}

export interface RecencyTrend {
  /** Multiplicative factor, e.g. 1.06 = +6% rent growth since the baseline vintage. */
  factor: number
  /** ISO date the trend is current as of (for display). */
  asOf: string
}

/** First-party lease comps near the subject (already inflation-adjusted and
 *  distance/recency-weighted by the caller). The engine blends these with the
 *  public-data model — real observed rents beat survey statistics. */
export interface LeaseSignalInput {
  /** Effective (weighted) sample size — drives the blend weight. */
  nEff: number
  /** Weighted median of grossed-up nearby rents (dollars/month). */
  weightedMedianGrossed: number
  /** The subject's own current lease, grossed to today — strongest anchor. */
  subjectGrossedRent?: number | null
}

export interface EstimateParams {
  baseline: BaselineRent
  subject: SubjectUnit
  recency: RecencyTrend
  /**
   * Optional hard floor from HUD SAFMR for the same bedroom count, used as a
   * guardrail so adjustments can't drive the estimate implausibly low.
   */
  safmrFloor?: number | null
  /** ACS gross rent includes utilities; scale toward contract rent. */
  utilitiesAdjustment?: number
  /** Observed leases from FindStoop's own database (optional). */
  leaseSignal?: LeaseSignalInput | null
}

// ── Outputs ───────────────────────────────────────────────────────────────

export interface RentEstimateResult {
  estimateMonthly: number
  low: number
  high: number
  confidence: 'low' | 'medium' | 'high'
  /** Each multiplicative factor, for the transparent "how we calculated this" panel. */
  factors: {
    base: number
    utilities: number
    size: number
    bath: number
    age: number
    type: number
    recency: number
  }
  baseline: { value: number; source: BaselineSource; bedroom: number; vintageYear: number }
  caveats: string[]
  /** Present when first-party lease data was blended in. */
  leaseBlend: { weight: number; anchor: number; usedSubjectLease: boolean } | null
}

// ── Coefficient tables (calibrate against first-party leases later) ──────────

const TYPICAL_SQFT: Record<number, number> = { 0: 550, 1: 750, 2: 1050, 3: 1450, 4: 1850 }
const BASE_BATH: Record<number, number> = { 0: 1, 1: 1, 2: 1.5, 3: 2, 4: 2.5 }
const SIZE_EXPONENT = 0.35 // rent rises sub-linearly with square footage
const BATH_PER_UNIT = 0.03 // ~3% per bathroom vs. the bedroom's typical count
const MODEL_UNCERTAINTY = 0.08 // 1-sigma, on top of ACS sampling error

/** Coarse property classes and their rent multiplier vs. the ACS area mix. */
function typeFactor(propertyType: string | null): number {
  const t = (propertyType ?? '').toLowerCase()
  if (/single|sfh|detached|house/.test(t)) return 1.07
  if (/town|row/.test(t)) return 1.03
  if (/condo|coop/.test(t)) return 1.0
  if (/apartment|multi|duplex|triplex|flat/.test(t)) return 0.98
  return 1.0 // unknown → neutral
}

/** Year-built bucket multiplier (newer commands a premium). */
function ageFactor(yearBuilt: number | null, currentYear: number): number {
  if (!yearBuilt || yearBuilt < 1800 || yearBuilt > currentYear + 1) return 1.0
  const age = currentYear - yearBuilt
  if (age <= 10) return 1.06
  if (age <= 30) return 1.02
  if (age <= 50) return 1.0
  return 0.95
}

function clampBedroom(beds: number): number {
  if (!Number.isFinite(beds) || beds < 0) return 1
  return Math.min(4, Math.round(beds))
}

function round5(n: number): number {
  return Math.round(n / 5) * 5
}

// ── Engine ──────────────────────────────────────────────────────────────────

export function computeEstimate(params: EstimateParams, currentYear = new Date().getUTCFullYear()): RentEstimateResult {
  const { baseline, subject, recency } = params
  const utilities = params.utilitiesAdjustment ?? 0.93
  const caveats: string[] = []

  const bed = clampBedroom(subject.bedrooms)

  // 1. Base — area median gross rent for this bedroom count, pulled toward
  //    contract rent (ACS gross includes utilities). HUD baselines already
  //    approximate contract rent, so skip the utilities haircut for them.
  const isHud = baseline.source === 'safmr' || baseline.source === 'fmr'
  const fUtil = isHud ? 1 : utilities
  const base = baseline.value

  // 2. Size — relative to the typical sqft for this bedroom count.
  let fSize = 1
  if (subject.sqft && subject.sqft > 200) {
    fSize = Math.pow(subject.sqft / (TYPICAL_SQFT[bed] ?? TYPICAL_SQFT[2]), SIZE_EXPONENT)
    fSize = Math.min(1.4, Math.max(0.7, fSize)) // never let size alone swing > ±40%
  } else {
    caveats.push('Square footage unknown — size not adjusted.')
  }

  // 3. Bathrooms — vs. the typical bath count for this bedroom count.
  let fBath = 1
  if (subject.bathrooms && subject.bathrooms > 0) {
    fBath = 1 + BATH_PER_UNIT * (subject.bathrooms - (BASE_BATH[bed] ?? 1.5))
    fBath = Math.min(1.15, Math.max(0.9, fBath))
  }

  // 4. Age and 5. Type.
  const fAge = ageFactor(subject.yearBuilt, currentYear)
  const fType = typeFactor(subject.propertyType)

  // 6. Recency — trend the (lagged) baseline forward to today.
  const fRecency = recency.factor > 0 ? recency.factor : 1

  let estimate = base * fUtil * fSize * fBath * fAge * fType * fRecency

  // Guardrail: don't let hedonic adjustments push below a plausible floor or
  // run away above the baseline.
  const floor = params.safmrFloor ? params.safmrFloor * 0.85 : base * fRecency * 0.6
  const ceiling = base * fRecency * 1.4
  if (estimate < floor) { estimate = floor; caveats.push('Estimate clamped up to a plausible market floor.') }
  if (estimate > ceiling) { estimate = ceiling; caveats.push('Estimate clamped to a plausible ceiling.') }

  // ── Blend in first-party lease data ─────────────────────────────────────
  // Real observed rents (already inflation-adjusted + distance/recency
  // weighted) pull the model toward the ground truth. Shrinkage: weight grows
  // with effective sample size (nEff 1 → 0.2, 4 → 0.5, 12 → 0.75). The
  // subject's OWN current lease is the strongest possible anchor.
  const ls = params.leaseSignal
  let leaseBlend: RentEstimateResult['leaseBlend'] = null
  if (ls && (ls.weightedMedianGrossed > 0 || ls.subjectGrossedRent)) {
    const K = 4
    let w = ls.nEff > 0 ? ls.nEff / (ls.nEff + K) : 0
    const usedSubjectLease = !!ls.subjectGrossedRent
    const anchor = ls.subjectGrossedRent ?? ls.weightedMedianGrossed
    if (usedSubjectLease) w = Math.max(w, 0.6)
    if (w > 0 && anchor > 0) {
      estimate = w * anchor + (1 - w) * estimate
      leaseBlend = { weight: Math.round(w * 100) / 100, anchor, usedSubjectLease }
    }
  }

  // ── Confidence band ────────────────────────────────────────────────────
  // Combine ACS sampling error (from the MOE) with model uncertainty, then
  // widen for missing inputs / weaker baselines.
  const cvData = baseline.moe && baseline.value > 0 ? (baseline.moe / baseline.value) / 1.645 : 0.12
  let cvModel = MODEL_UNCERTAINTY
  if (subject.attributesSource === 'user') cvModel += 0.03 // self-reported attrs
  if (baseline.source === 'acs_zip') cvModel += 0.02
  if (baseline.source === 'safmr') cvModel += 0.04
  if (baseline.source === 'fmr') cvModel += 0.06
  let halfwidth = Math.sqrt(cvData * cvData + cvModel * cvModel)
  // Observed local rents shrink uncertainty — tighten the band in proportion
  // to how much of the estimate is anchored on real lease data.
  if (leaseBlend) halfwidth *= 1 - 0.45 * leaseBlend.weight

  const low = round5(estimate * (1 - 1.28 * halfwidth)) // ~80% band
  const high = round5(estimate * (1 + 1.28 * halfwidth))

  let confidence: RentEstimateResult['confidence']
  // A strong real-lease anchor can earn 'high' even off a ZIP/HUD baseline.
  const strongAnchor = (leaseBlend?.weight ?? 0) >= 0.5
  if (halfwidth < 0.1 && (baseline.source === 'acs_tract' || strongAnchor)) confidence = 'high'
  else if (halfwidth < 0.18) confidence = 'medium'
  else confidence = 'low'

  if (baseline.source === 'fmr' || baseline.source === 'safmr') {
    caveats.push('Local sample was thin — anchored to HUD Fair Market Rents; treat the range as wide.')
  }
  if (subject.attributesSource === 'user') {
    caveats.push('Property details were self-reported, not pulled from county records.')
  }

  return {
    estimateMonthly: round5(estimate),
    low,
    high,
    confidence,
    factors: { base, utilities: fUtil, size: fSize, bath: fBath, age: fAge, type: fType, recency: fRecency },
    baseline: { value: baseline.value, source: baseline.source, bedroom: bed, vintageYear: baseline.vintageYear },
    caveats,
    leaseBlend,
  }
}

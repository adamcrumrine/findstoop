import { describe, it, expect } from 'vitest'
// The engine is shared with the Deno edge function, so it lives in _shared.
// Vitest/esbuild resolves the .ts path directly (the module has no imports).
import { computeEstimate, type EstimateParams } from '../../../../supabase/functions/_shared/rentEstimate.ts'

const base = (over: Partial<EstimateParams> = {}): EstimateParams => ({
  baseline: { value: 1400, moe: 90, source: 'acs_tract', vintageYear: 2023 },
  subject: { bedrooms: 2, bathrooms: 1.5, sqft: 1050, yearBuilt: 1995, propertyType: 'Single Family Home', attributesSource: 'parcel' },
  recency: { factor: 1.06, asOf: '2026-05-01' },
  safmrFloor: 1100,
  ...over,
})

describe('computeEstimate', () => {
  it('returns a low < estimate < high band', () => {
    const r = computeEstimate(base(), 2026)
    expect(r.low).toBeLessThan(r.estimateMonthly)
    expect(r.estimateMonthly).toBeLessThan(r.high)
  })

  it('applies the utilities haircut to ACS baselines but not HUD ones', () => {
    const acs = computeEstimate(base({ subject: { ...base().subject, sqft: null, bathrooms: null, yearBuilt: null, propertyType: null } }), 2026)
    expect(acs.factors.utilities).toBeCloseTo(0.93, 5)
    const hud = computeEstimate(base({ baseline: { value: 1400, moe: null, source: 'safmr', vintageYear: 2025 }, subject: { ...base().subject, sqft: null, bathrooms: null, yearBuilt: null, propertyType: null } }), 2026)
    expect(hud.factors.utilities).toBe(1)
  })

  it('trends the baseline forward via the recency factor', () => {
    const flat = computeEstimate(base({ recency: { factor: 1, asOf: '2026-05-01' } }), 2026)
    const trended = computeEstimate(base({ recency: { factor: 1.1, asOf: '2026-05-01' } }), 2026)
    expect(trended.estimateMonthly).toBeGreaterThan(flat.estimateMonthly)
  })

  it('gives a larger unit a higher estimate (sub-linear in sqft)', () => {
    const small = computeEstimate(base({ subject: { ...base().subject, sqft: 800 } }), 2026)
    const big = computeEstimate(base({ subject: { ...base().subject, sqft: 1600 } }), 2026)
    expect(big.estimateMonthly).toBeGreaterThan(small.estimateMonthly)
    // doubling sqft must NOT double rent
    expect(big.estimateMonthly).toBeLessThan(small.estimateMonthly * 2)
  })

  it('widens the band and lowers confidence for HUD-anchored, self-reported inputs', () => {
    const strong = computeEstimate(base(), 2026)
    const weak = computeEstimate(base({
      baseline: { value: 1400, moe: null, source: 'fmr', vintageYear: 2025 },
      subject: { ...base().subject, attributesSource: 'user' },
    }), 2026)
    const strongWidth = strong.high - strong.low
    const weakWidth = weak.high - weak.low
    expect(weakWidth).toBeGreaterThan(strongWidth)
    expect(weak.confidence).toBe('low')
    expect(strong.confidence === 'high' || strong.confidence === 'medium').toBe(true)
  })

  it('clamps an implausibly low result up to the SAFMR floor', () => {
    const r = computeEstimate(base({ subject: { ...base().subject, sqft: 250, bathrooms: 1, propertyType: 'apartment', yearBuilt: 1900 } }), 2026)
    expect(r.estimateMonthly).toBeGreaterThanOrEqual(1100 * 0.85)
  })

  it('handles missing subject attributes without throwing', () => {
    const r = computeEstimate(base({
      subject: { bedrooms: 3, bathrooms: null, sqft: null, yearBuilt: null, propertyType: null, attributesSource: 'user' },
    }), 2026)
    expect(r.estimateMonthly).toBeGreaterThan(0)
    expect(r.caveats.length).toBeGreaterThan(0)
  })
})

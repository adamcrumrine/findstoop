import { describe, it, expect } from 'vitest'
import { BRAND } from './brand'
import {
  isValidBrandHex,
  hexToRgb,
  tripletToHex,
  relativeLuminance,
  contrastRatio,
  deriveBrandRamp,
  applyLandlordBrand,
  clearLandlordBrand,
} from './landlordBrand'

const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const

const tripletToRgb = (t: string): [number, number, number] =>
  t.split(' ').map(Number) as [number, number, number]

/** Fake documentElement so the DOM writes are testable in the node environment. */
function fakeRoot() {
  const vars: Record<string, string> = {}
  return { vars, style: { setProperty: (p: string, v: string) => { vars[p] = v } } }
}

describe('isValidBrandHex', () => {
  it('accepts 6-digit hex, either case', () => {
    expect(isValidBrandHex('#2E5984')).toBe(true)
    expect(isValidBrandHex('#ffee00')).toBe(true)
  })
  it('rejects everything else', () => {
    expect(isValidBrandHex('2E5984')).toBe(false)   // missing #
    expect(isValidBrandHex('#FE0')).toBe(false)     // shorthand
    expect(isValidBrandHex('#12345G')).toBe(false)  // non-hex digit
    expect(isValidBrandHex('')).toBe(false)
  })
})

describe('hex/triplet conversions', () => {
  it('round-trips hex → rgb → triplet → hex', () => {
    expect(hexToRgb('#008275')).toEqual([0, 130, 117])
    expect(tripletToHex('0 130 117')).toBe('#008275')
    expect(tripletToHex(hexToRgb('#2e5984').join(' '))).toBe('#2e5984')
  })
})

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for same color', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrastRatio([0, 130, 117], [0, 130, 117])).toBeCloseTo(1, 5)
  })
  it('is symmetric', () => {
    expect(contrastRatio([255, 238, 0], [255, 255, 255]))
      .toBeCloseTo(contrastRatio([255, 255, 255], [255, 238, 0]), 10)
  })
})

describe('deriveBrandRamp', () => {
  it('produces all 10 steps as space-separated RGB triplets', () => {
    const ramp = deriveBrandRamp('#2E5984')
    expect(Object.keys(ramp).sort()).toEqual([...STEPS].sort())
    for (const step of STEPS) {
      expect(ramp[step]).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    }
  })

  it('gets monotonically darker from 50 to 900', () => {
    for (const hex of ['#2E5984', '#FFEE00', '#00A896']) {
      const ramp = deriveBrandRamp(hex)
      for (let i = 1; i < STEPS.length; i++) {
        const lighter = relativeLuminance(tripletToRgb(ramp[STEPS[i - 1]]))
        const darker = relativeLuminance(tripletToRgb(ramp[STEPS[i]]))
        expect(darker, `${hex} ${STEPS[i]} vs ${STEPS[i - 1]}`).toBeLessThan(lighter)
      }
    }
  })

  // The whole point of the derivation: buttons (white on 500) and links
  // (600 on white) must clear AA no matter what the landlord picks —
  // including pathological near-white picks like pure yellow or a pastel.
  it('guarantees 4.5:1 vs white on the 500 and 600 steps for any pick', () => {
    const picks = ['#FFEE00', '#FFB6C1', '#87CEEB', '#00A896', '#FF0000', '#777777', '#FFFFFF', '#000000']
    for (const hex of picks) {
      const ramp = deriveBrandRamp(hex)
      expect(contrastRatio(tripletToRgb(ramp['500']), [255, 255, 255]), `${hex} 500`)
        .toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tripletToRgb(ramp['600']), [255, 255, 255]), `${hex} 600`)
        .toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the picked hue (a red pick stays red-dominant)', () => {
    const [r, g, b] = tripletToRgb(deriveBrandRamp('#FF0000')['500'])
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('throws on invalid input', () => {
    expect(() => deriveBrandRamp('teal')).toThrow()
    expect(() => deriveBrandRamp('#FE0')).toThrow()
  })
})

describe('applyLandlordBrand / clearLandlordBrand', () => {
  it('writes the derived accent + primary ramps plus gradient endpoints', () => {
    const root = fakeRoot()
    applyLandlordBrand('#2E5984', null, root)
    for (const step of STEPS) {
      expect(root.vars[`--brand-${step}`]).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
      // Primary defaults to the accent ramp when no distinct primary is given.
      expect(root.vars[`--primary-${step}`]).toBe(root.vars[`--brand-${step}`])
    }
    expect(root.vars['--brand-grad-from']).toBe(root.vars['--brand-500'])
    expect(root.vars['--brand-grad-to']).toBe(root.vars['--brand-400'])
  })

  it('writes a distinct primary ramp when a primary color is provided', () => {
    const root = fakeRoot()
    applyLandlordBrand('#2E5984', '#B8442D', root)
    // Accent and primary derive from different hues → at least one step differs.
    const differs = STEPS.some((step) => root.vars[`--primary-${step}`] !== root.vars[`--brand-${step}`])
    expect(differs).toBe(true)
  })

  it('ignores invalid colors instead of blanking the palette', () => {
    const root = fakeRoot()
    applyLandlordBrand('not-a-color', null, root)
    expect(Object.keys(root.vars)).toHaveLength(0)
  })

  it('clear restores the build brand exactly (apply → clear roundtrip)', () => {
    const root = fakeRoot()
    applyLandlordBrand('#FFEE00', null, root)
    clearLandlordBrand(root)
    for (const step of STEPS) {
      expect(root.vars[`--brand-${step}`]).toBe(BRAND.colors[step])
      expect(root.vars[`--primary-${step}`]).toBe(BRAND.colors[step])
    }
    expect(root.vars['--brand-grad-from']).toBe(BRAND.gradient[0])
    expect(root.vars['--brand-grad-to']).toBe(BRAND.gradient[1])
  })
})

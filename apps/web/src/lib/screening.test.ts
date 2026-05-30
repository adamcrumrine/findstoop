import { describe, it, expect } from 'vitest'
import { scoreBand, affordability } from './screening'

describe('scoreBand', () => {
  it('labels each band with its range', () => {
    expect(scoreBand(95).label).toBe('Strong')
    expect(scoreBand(90).range).toBe('90–100')
    expect(scoreBand(75).label).toBe('Moderate')
    expect(scoreBand(50).label).toBe('Thin')
    expect(scoreBand(49).label).toBe('Weak')
    expect(scoreBand(0).label).toBe('Weak')
  })
  it('handles a missing score', () => {
    expect(scoreBand(null).label).toBe('Not scored yet')
  })
})

describe('affordability', () => {
  it('flags at/above the 3x guideline', () => {
    const a = affordability(3.2)
    expect(a.label).toContain('3.2×')
    expect(a.label).toContain('at/above')
    expect(a.tone).toContain('emerald')
  })
  it('flags just-under between 2.5 and 3', () => {
    expect(affordability(2.7).label).toContain('just under')
    expect(affordability(2.5).label).toContain('just under')
  })
  it('flags below 2.5 as below guideline', () => {
    expect(affordability(2.0).label).toContain('below')
    expect(affordability(2.0).tone).toContain('red')
  })
  it('handles missing income', () => {
    expect(affordability(null).label).toBe('Income not provided')
  })
})

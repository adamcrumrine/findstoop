import { describe, it, expect } from 'vitest'
import { suggestRenewalRent, matchRentReport, defaultRespondBy, MAX_INCREASE_PCT } from './renewalAdvisor'

describe('suggestRenewalRent', () => {
  it('suggests the current↔market midpoint, rounded to the nearest $5', () => {
    // The canonical example: current 1,340 vs market ~1,450 → midpoint 1,395.
    const r = suggestRenewalRent(1340, 1450)
    expect(r.suggested).toBe(1395)
    expect(r.action).toBe('increase')
    expect(r.reasoning).toContain('$1,450')
    expect(r.reasoning).toContain('$1,395')
  })

  it('rounds the midpoint to the nearest $5', () => {
    // midpoint = (1000 + 1084) / 2 = 1042 → 1040
    expect(suggestRenewalRent(1000, 1084).suggested).toBe(1040)
    // midpoint = (1000 + 1086) / 2 = 1043 → 1045
    expect(suggestRenewalRent(1000, 1086).suggested).toBe(1045)
  })

  it('caps the increase at 10% over current rent', () => {
    const r = suggestRenewalRent(1000, 1800) // midpoint 1400 ≫ cap 1100
    expect(r.suggested).toBe(1100)
    expect(r.action).toBe('increase')
    expect(r.reasoning).toContain('10%')
  })

  it('never breaches the cap via rounding', () => {
    // cap = 999 × 1.10 = 1098.9 → rounding to 1100 would breach; round down.
    const r = suggestRenewalRent(999, 1800)
    expect(r.suggested).toBe(1095)
    expect(r.suggested).toBeLessThanOrEqual(999 * (1 + MAX_INCREASE_PCT))
  })

  it('never suggests below current rent (floor)', () => {
    for (const market of [1001, 1050, 1200, 5000]) {
      expect(suggestRenewalRent(1000, market).suggested).toBeGreaterThanOrEqual(1000)
    }
  })

  it('holds at current rent when market is below current, with retention reasoning', () => {
    const r = suggestRenewalRent(1450, 1400)
    expect(r.suggested).toBe(1450)
    expect(r.action).toBe('hold')
    expect(r.reasoning.toLowerCase()).toContain('holding')
  })

  it('holds at current rent when market equals current', () => {
    const r = suggestRenewalRent(1450, 1450)
    expect(r.suggested).toBe(1450)
    expect(r.action).toBe('hold')
  })

  it('holds when the midpoint rounds back to (or below) current rent', () => {
    // midpoint = 1451.5 → rounds to 1450 = current → hold, not "increase to same".
    const r = suggestRenewalRent(1450, 1453)
    expect(r.suggested).toBe(1450)
    expect(r.action).toBe('hold')
  })

  it('holds at current rent when there is no market estimate', () => {
    const r = suggestRenewalRent(1200, null)
    expect(r.suggested).toBe(1200)
    expect(r.action).toBe('hold')
    expect(r.reasoning).toContain('No market estimate')
  })
})

describe('matchRentReport', () => {
  const reports = [
    { address: '301 E 14th Ave', unit_number: '303', estimate: 1500 },
    { address: '301 E 14th Ave', unit_number: null, estimate: 1450 },
    { address: '99 Oak St., Columbus', unit_number: null, estimate: 1200 },
  ]

  it('matches on normalized street address, ignoring case and punctuation', () => {
    expect(matchRentReport(reports, '99 Oak St')?.estimate).toBe(1200)
    expect(matchRentReport(reports, '301 e. 14TH ave', null)?.estimate).toBe(1500)
  })

  it('prefers newest (reports are newest-first) and respects unit pinning', () => {
    // Unit 5 must not pick up the report pinned to unit 303.
    expect(matchRentReport(reports, '301 E 14th Ave', '5')?.estimate).toBe(1450)
    expect(matchRentReport(reports, '301 E 14th Ave', '303')?.estimate).toBe(1500)
  })

  it('returns null when nothing matches', () => {
    expect(matchRentReport(reports, '742 Evergreen Terrace')).toBeNull()
    expect(matchRentReport([], '99 Oak St')).toBeNull()
    expect(matchRentReport(reports, '')).toBeNull()
  })

  it('does not match a different street number with a shared prefix', () => {
    expect(matchRentReport(reports, '99 Oakwood')).toBeNull()
  })
})

describe('defaultRespondBy', () => {
  const today = '2026-07-02'

  it('defaults to two weeks out when the lease end is far away', () => {
    expect(defaultRespondBy('2026-11-15', today)).toBe('2026-07-16')
  })

  it('pulls earlier to leave 30 days of runway before the lease ends', () => {
    // Lease ends in 25 days → runway target is in the past → floor at +7 days.
    expect(defaultRespondBy('2026-07-27', today)).toBe('2026-07-09')
    // Lease ends in 40 days → end − 30 = +10 days, sooner than two weeks.
    expect(defaultRespondBy('2026-08-11', today)).toBe('2026-07-12')
  })

  it('never lands after the lease end date', () => {
    expect(defaultRespondBy('2026-07-05', today)).toBe('2026-07-05')
  })
})

import { describe, it, expect } from 'vitest'
import { inScope, ALL } from './scope'

// Portfolio scope replaced ten separate per-page property <select>s that
// didn't agree with each other — picking a property on Payments and opening
// Maintenance dropped you back to the whole portfolio, and half the pages had
// no filter at all.
//
// The predicate below is what every page now shares, so its edge cases are
// worth pinning: a wrong "false" hides a payment a landlord is looking for,
// and a wrong "true" shows another property's data under a filtered heading.

const wide = { propertyId: ALL, unitId: ALL, unitIdsInScope: null }
const byProperty = { propertyId: 'prop-1', unitId: ALL, unitIdsInScope: ['u1', 'u2'] }
const byUnit = { propertyId: 'prop-1', unitId: 'u1', unitIdsInScope: ['u1'] }

describe('nothing selected', () => {
  it('lets everything through', () => {
    expect(inScope(wide, { unitId: 'u1' })).toBe(true)
    expect(inScope(wide, { propertyId: 'prop-9' })).toBe(true)
    expect(inScope(wide, {})).toBe(true)
  })
})

describe('filtered to a property', () => {
  it('matches a record carrying that property id', () => {
    expect(inScope(byProperty, { propertyId: 'prop-1' })).toBe(true)
    expect(inScope(byProperty, { propertyId: 'prop-2' })).toBe(false)
  })

  it('matches a record that only knows its unit', () => {
    // Most records hang off a unit, not a property — payments, maintenance,
    // leases. Resolving through unitIdsInScope is the common path.
    expect(inScope(byProperty, { unitId: 'u2' })).toBe(true)
    expect(inScope(byProperty, { unitId: 'u9' })).toBe(false)
  })

  it('prefers an explicit property id over the unit lookup', () => {
    // If a record states its property, believe it — the unit list is derived
    // and could lag a freshly added unit.
    expect(inScope(byProperty, { propertyId: 'prop-1', unitId: 'u9' })).toBe(true)
  })

  it('keeps portfolio-level records that belong to neither', () => {
    // A subscription invoice isn't about a property; hiding it behind a
    // property filter would make it look like it had disappeared.
    expect(inScope(byProperty, {})).toBe(true)
    expect(inScope(byProperty, { unitId: null, propertyId: null })).toBe(true)
  })
})

describe('filtered to a unit', () => {
  it('matches only that unit', () => {
    expect(inScope(byUnit, { unitId: 'u1' })).toBe(true)
    expect(inScope(byUnit, { unitId: 'u2' })).toBe(false)
  })

  it('is strict even for records with no unit', () => {
    // Asking for one unit is the most specific request available; letting
    // unattached records through would quietly widen it.
    expect(inScope(byUnit, {})).toBe(false)
    expect(inScope(byUnit, { propertyId: 'prop-1' })).toBe(false)
  })

  it('beats the property filter when both are set', () => {
    const both = { propertyId: 'prop-1', unitId: 'u1', unitIdsInScope: ['u1'] }
    expect(inScope(both, { unitId: 'u2', propertyId: 'prop-1' })).toBe(false)
  })
})

describe('multi-select semantics', () => {
  // Every status filter now takes an array. Empty means "not filtering", not
  // "match nothing" — a manager who just unticked the last box wants the list
  // back, not an empty table.
  const passes = (selected: string[], value: string) => selected.length === 0 || selected.includes(value)

  it('empty selection matches everything', () => {
    expect(passes([], 'failed')).toBe(true)
    expect(passes([], 'completed')).toBe(true)
  })

  it('one selection behaves like the old single select', () => {
    expect(passes(['failed'], 'failed')).toBe(true)
    expect(passes(['failed'], 'completed')).toBe(false)
  })

  it('several selections are an OR, which is the whole point', () => {
    const chasing = ['failed', 'pending']
    expect(passes(chasing, 'failed')).toBe(true)
    expect(passes(chasing, 'pending')).toBe(true)
    expect(passes(chasing, 'completed')).toBe(false)
  })
})

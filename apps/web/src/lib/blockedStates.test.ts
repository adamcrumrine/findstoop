import { describe, it, expect } from 'vitest'
import { shouldGeoBlockSignup, isBlockedState } from './blockedStates'

const inCalifornia = { detected: true, country: 'US', state: 'CA' }
const inOhio = { detected: true, country: 'US', state: 'OH' }
const undetected = { detected: false, country: null, state: null }

describe('shouldGeoBlockSignup', () => {
  // The regression this guards. A renter on an Ohio lease, IP-geolocated to
  // California, was shown "Stoop isn't open in California yet" and could not
  // create an account or pay rent. The pause is a landlord-side compliance
  // matter and has nothing to do with where a renter sits.
  it('NEVER blocks a renter, whatever the geo says', () => {
    expect(shouldGeoBlockSignup('tenant', inCalifornia)).toBe(false)
    expect(shouldGeoBlockSignup('tenant', { detected: true, country: 'US', state: 'NY' })).toBe(false)
    expect(shouldGeoBlockSignup('tenant', { detected: true, country: 'US', state: 'IL' })).toBe(false)
    expect(shouldGeoBlockSignup('tenant', inOhio)).toBe(false)
    expect(shouldGeoBlockSignup('tenant', undetected)).toBe(false)
  })

  it('blocks a landlord signing up from a paused state', () => {
    expect(shouldGeoBlockSignup('manager', inCalifornia)).toBe(true)
  })

  it('lets a landlord through from an open state', () => {
    expect(shouldGeoBlockSignup('manager', inOhio)).toBe(false)
  })

  it('fails open when geo detection has not resolved or failed', () => {
    expect(shouldGeoBlockSignup('manager', undetected)).toBe(false)
    expect(shouldGeoBlockSignup('manager', { detected: true, country: null, state: null })).toBe(false)
  })

  it('only applies to US visitors', () => {
    // A non-US region code could collide with a US state abbreviation.
    expect(shouldGeoBlockSignup('manager', { detected: true, country: 'CA', state: 'NY' })).toBe(false)
  })

  it('isBlockedState still recognises the paused list for property validation', () => {
    expect(isBlockedState('CA')).toBe(true)
    expect(isBlockedState('ca')).toBe(true)
    expect(isBlockedState('OH')).toBe(false)
    expect(isBlockedState(null)).toBe(false)
  })
})

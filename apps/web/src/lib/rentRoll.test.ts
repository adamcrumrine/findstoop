import { describe, it, expect } from 'vitest'
import { summarizeRentRoll, type RentRollRow } from '@findstoop/shared/api/rentRoll'

const row = (over: Partial<RentRollRow>): RentRollRow => ({
  propertyId: 'p', propertyName: 'P', propertyAddress: '', unitId: Math.random().toString(36),
  unitNumber: '1', bedrooms: 1, bathrooms: 1, status: 'occupied', tenants: 'T',
  leaseStart: null, leaseEnd: null, monthlyRent: 0, securityDeposit: null, ...over,
})

describe('summarizeRentRoll', () => {
  it('counts occupancy and sums occupied vs potential rent', () => {
    const s = summarizeRentRoll([
      row({ status: 'occupied', monthlyRent: 1000 }),
      row({ status: 'occupied', monthlyRent: 1500 }),
      row({ status: 'vacant', monthlyRent: 900 }),
    ])
    expect(s.units).toBe(3)
    expect(s.occupied).toBe(2)
    expect(s.vacant).toBe(1)
    expect(s.occupiedRent).toBe(2500)
    expect(s.potentialRent).toBe(3400)
    expect(s.occupancyRate).toBe(67)
  })
  it('handles an empty portfolio', () => {
    const s = summarizeRentRoll([])
    expect(s.units).toBe(0)
    expect(s.occupancyRate).toBe(0)
    expect(s.potentialRent).toBe(0)
  })
})

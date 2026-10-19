import { describe, it, expect } from 'vitest'
import { renewalDates, renewableOn, termEnd, shareSummary, scaleShares, buildRenewalLease } from './leaseRenewal'
import { draftRenewal, renewedLease } from '@findstoop/shared/lib/leaseSuccession'

describe('renewalDates', () => {
  it('starts the day after the current term and runs 12 months', () => {
    // 301 E 14th: current term ends 2027-07-23.
    expect(renewalDates('2027-07-23', '2026-10-19')).toEqual({ start: '2027-07-24', end: '2028-07-23' })
  })

  it('never starts in the past — a lapsed lease renews from the 1st of next month', () => {
    expect(renewalDates('2026-05-31', '2026-10-19')).toEqual({ start: '2026-11-01', end: '2027-10-31' })
  })

  it('a lease is renewable from day 2 of its term', () => {
    expect(renewableOn('2026-08-01')).toBe('2026-08-02')
    expect(renewableOn('2026-12-31')).toBe('2027-01-01')
  })

  it('termEnd handles month-end and leap-year starts', () => {
    expect(termEnd('2027-08-01', 12)).toBe('2028-07-31')
    expect(termEnd('2028-03-01', 6)).toBe('2028-08-31')
  })
})

describe('shareSummary', () => {
  it('leaves the remainder to the tenants without a fixed share', () => {
    // 301 today: three fixed shares, Samantha covers the rest.
    const s = shareSummary([425, 535, 560, null], 2100)
    expect(s.remainder).toBe(580)
    expect(s.openCount).toBe(1)
    expect(s.over).toBe(false)
    expect(s.gap).toBe(false)
  })

  it('flags shares that overshoot the rent, or all-fixed shares that miss it', () => {
    expect(shareSummary([1200, 1000], 2100).over).toBe(true)
    expect(shareSummary([1000, 1000], 2100).gap).toBe(true)
    expect(shareSummary([1050, 1050], 2100).gap).toBe(false)
  })
})

describe('scaleShares', () => {
  it('spreads a rent increase across fixed shares instead of dumping it on the remainder', () => {
    const scaled = scaleShares([425, 535, 560, null], 2100, 2200)
    expect(scaled[3]).toBeNull()
    const s = shareSummary(scaled, 2200)
    // Remainder grows only by its proportional slice (580 → ~607.62), not by the full $100.
    expect(s.remainder).toBeGreaterThan(600)
    expect(s.remainder).toBeLessThan(610)
  })

  it('lands all-fixed shares exactly on the new rent despite rounding', () => {
    const scaled = scaleShares([700, 700, 700], 2100, 2150)
    const total = (scaled as number[]).reduce((a, b) => a + Math.round(b * 100), 0) / 100
    expect(total).toBe(2150)
  })
})

describe('buildRenewalLease', () => {
  const current = {
    unit_id: 'u301', rent_amount: 2100, security_deposit: 2100, pet_deposit: null, utility_notes: null,
    payment_due_day: 1, insurance_required: true, auto_renew_month_to_month: false,
    property_built_before_1978: true, lead_known: null, lead_disclosure_details: null,
    is_student: true, rent_split_mode: 'self_serve', monthly_pet_fee: 20, pet_fee_payer_id: 'sam',
    collect_last_months_rent: true, signed_at: '2026-08-02', payment_schedule_generated_at: '2026-05-25',
  }
  const tenants = [
    { tenant_id: 'sam', is_primary: true, sort_order: 0, rent_share: null, landlord_absorbs_fees: false },
    { tenant_id: 'ava', is_primary: true, sort_order: 1, rent_share: 425, landlord_absorbs_fees: false },
  ]

  it('carries the terms forward as an unsigned draft', () => {
    const row = buildRenewalLease(current, { start: '2027-07-24', end: '2028-07-23', rent: 2200, petFee: 20, tenants })
    expect(row).toMatchObject({
      unit_id: 'u301', tenant_id: 'sam', start_date: '2027-07-24', end_date: '2028-07-23', rent_amount: 2200,
      status: 'pending', signed_at: null, security_deposit: 2100, is_student: true,
      property_built_before_1978: true, rent_split_mode: 'self_serve', monthly_pet_fee: 20, pet_fee_payer_id: 'sam',
    })
    // One-time and per-lease state never carries over.
    expect(row).not.toHaveProperty('collect_last_months_rent')
    expect(row).not.toHaveProperty('payment_schedule_generated_at')
  })

  it('drops the pet-fee payer when they are not renewing', () => {
    const row = buildRenewalLease(current, { start: '2027-07-24', end: '2028-07-23', rent: 2100, petFee: 20, tenants: [tenants[1]] })
    expect(row.pet_fee_payer_id).toBeNull()
    expect(row.tenant_id).toBe('ava')
  })
})

describe('draftRenewal / renewedLease', () => {
  const tenantsOf = (l: { t: string[] }) => l.t
  const current = { id: 'cur', unit_id: 'u', status: 'active', start_date: '2026-08-01', t: ['a', 'b'] }
  const draft = { id: 'd', unit_id: 'u', status: 'pending', start_date: '2027-07-24', t: ['a'] }
  const stranger = { id: 's', unit_id: 'u', status: 'pending', start_date: '2027-08-01', t: ['z'] }

  it('finds the drafted renewal for the same tenants, not an unrelated draft', () => {
    expect(draftRenewal(current, [current, stranger, draft], tenantsOf)?.id).toBe('d')
    expect(draftRenewal(current, [current, stranger], tenantsOf)).toBeNull()
  })

  it('links a renewal back to the lease it renews', () => {
    expect(renewedLease(draft, [current, draft], tenantsOf)?.id).toBe('cur')
    expect(renewedLease(stranger, [current, stranger], tenantsOf)).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { signedSuccessor, isRenewed, pickCurrentLease } from '@findstoop/shared/lib/leaseSuccession'

// 301 E 14th shape: current term Aug 2026 – Jul 2027, renewal signed in October.
const current = { id: 'cur', unit_id: 'u301', status: 'active', start_date: '2026-08-01', tenants: ['sam', 'ava'] }
const renewal = { id: 'ren', unit_id: 'u301', status: 'active', start_date: '2027-07-24', tenants: ['sam', 'ava'] }
const tenantsOf = (l: { tenants: string[] }) => l.tenants

describe('signedSuccessor', () => {
  it('finds a later signed lease on the same unit', () => {
    expect(signedSuccessor(current, [current, renewal])?.id).toBe('ren')
  })

  it('ignores unsigned drafts, other units, and earlier leases', () => {
    const draft = { ...renewal, id: 'draft', status: 'pending' }
    const otherUnit = { ...renewal, id: 'other', unit_id: 'u303' }
    const prior = { ...current, id: 'prior', status: 'expired', start_date: '2025-08-01' }
    expect(signedSuccessor(current, [current, draft, otherUnit, prior])).toBeNull()
    expect(signedSuccessor(renewal, [current, renewal])).toBeNull()
  })
})

describe('isRenewed', () => {
  it('is true when the successor keeps any of the same tenants', () => {
    const partial = { ...renewal, tenants: ['ava', 'newbie'] }
    expect(isRenewed(current, [current, partial], tenantsOf)).toBe(true)
  })

  it('is false for a re-let to a new household — that deposit is still due', () => {
    const relet = { ...renewal, tenants: ['x', 'y'] }
    expect(isRenewed(current, [current, relet], tenantsOf)).toBe(false)
  })
})

describe('pickCurrentLease', () => {
  it('keeps the in-effect lease after a renewal is signed', () => {
    expect(pickCurrentLease([renewal, current], '2026-10-19')?.id).toBe('cur')
  })

  it('moves to the renewal once its term starts', () => {
    expect(pickCurrentLease([current, renewal], '2027-07-24')?.id).toBe('ren')
  })

  it('falls back to the soonest signed future lease before any term starts', () => {
    const later = { ...renewal, id: 'later', start_date: '2028-08-01' }
    expect(pickCurrentLease([later, renewal], '2026-10-19')?.id).toBe('ren')
    expect(pickCurrentLease([], '2026-10-19')).toBeNull()
  })
})

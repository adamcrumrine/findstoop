import { describe, it, expect } from 'vitest'
import { leaseTermPhase, isMonthToMonth, daysLeftInTerm } from './leaseTermState'

const TODAY = new Date('2026-08-01T12:00:00Z')

describe('leaseTermPhase', () => {
  it('inside the fixed term', () => {
    expect(leaseTermPhase({ status: 'active', end_date: '2027-07-31' }, TODAY)).toBe('in_term')
  })

  it('upcoming lease has not started', () => {
    expect(leaseTermPhase({ status: 'upcoming', end_date: '2027-07-31' }, TODAY)).toBe('upcoming')
  })

  // The regression this module exists for: a lapsed fixed term with auto-renew
  // OFF must NOT be reported as month-to-month, or the toggle reads as broken.
  it('lapsed term with month-to-month off is term_ended, not month_to_month', () => {
    const lease = {
      status: 'active',
      end_date: '2026-07-31',
      month_to_month: false,
      auto_renew_month_to_month: false,
    }
    expect(leaseTermPhase(lease, TODAY)).toBe('term_ended')
    expect(isMonthToMonth(lease, TODAY)).toBe(false)
  })

  it('lapsed term with auto-renew ON reads as month-to-month before the cron flips it', () => {
    const lease = {
      status: 'active',
      end_date: '2026-07-31',
      month_to_month: false,
      auto_renew_month_to_month: true,
    }
    expect(leaseTermPhase(lease, TODAY)).toBe('month_to_month')
    expect(isMonthToMonth(lease, TODAY)).toBe(true)
  })

  it('the month_to_month flag wins even while still inside the original term', () => {
    const lease = { status: 'active', end_date: '2027-01-01', month_to_month: true }
    expect(leaseTermPhase(lease, TODAY)).toBe('month_to_month')
  })

  it('turning auto-renew off does not un-roll an existing month-to-month tenancy', () => {
    // Ending a live M2M tenancy needs notice — it must stay month_to_month
    // until the manager terminates it explicitly.
    const lease = {
      status: 'active',
      end_date: '2026-01-31',
      month_to_month: true,
      auto_renew_month_to_month: false,
    }
    expect(leaseTermPhase(lease, TODAY)).toBe('month_to_month')
  })

  it('expired and terminated are closed', () => {
    expect(leaseTermPhase({ status: 'expired', end_date: '2026-07-31' }, TODAY)).toBe('closed')
    expect(leaseTermPhase({ status: 'terminated', end_date: '2026-07-31' }, TODAY)).toBe('closed')
  })

  it('a closed lease is never month-to-month even with the flag set', () => {
    expect(isMonthToMonth({ status: 'expired', end_date: '2026-07-31', month_to_month: true }, TODAY)).toBe(false)
  })

  it('undated lease stays in_term', () => {
    expect(leaseTermPhase({ status: 'active', end_date: null }, TODAY)).toBe('in_term')
    expect(daysLeftInTerm({ status: 'active', end_date: null }, TODAY)).toBeNull()
  })

  it('day-of expiry: end_date === today is still in term', () => {
    expect(daysLeftInTerm({ status: 'active', end_date: '2026-08-01' }, TODAY)).toBe(0)
    // daysLeft === 0 means the last day, which counts as ended for phase
    // purposes only once it is strictly past — matches the cron's `<` filter.
    expect(leaseTermPhase({ status: 'active', end_date: '2026-08-02' }, TODAY)).toBe('in_term')
  })
})

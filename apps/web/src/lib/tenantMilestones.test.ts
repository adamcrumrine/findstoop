import { describe, it, expect } from 'vitest'
import { renewalWindow, depositMirror, RENEWAL_WINDOW_DAYS, DEPOSIT_MIRROR_GRACE_DAYS } from './tenantMilestones'

const TODAY = '2026-07-11'

describe('renewalWindow', () => {
  const lease = (over: Record<string, unknown> = {}) => ({
    status: 'active',
    end_date: '2026-08-15',
    month_to_month: false,
    ...over,
  })

  it('returns the window for an active fixed-term lease ending within 90 days', () => {
    const w = renewalWindow(lease(), TODAY)
    expect(w).not.toBeNull()
    expect(w!.daysLeft).toBe(35)
    expect(w!.endDate).toBe('2026-08-15')
  })

  it('phases by urgency: imminent ≤30, soon ≤60, approaching ≤90', () => {
    expect(renewalWindow(lease({ end_date: '2026-07-25' }), TODAY)!.phase).toBe('imminent')
    expect(renewalWindow(lease({ end_date: '2026-09-01' }), TODAY)!.phase).toBe('soon')
    expect(renewalWindow(lease({ end_date: '2026-10-01' }), TODAY)!.phase).toBe('approaching')
  })

  it('returns null outside the window', () => {
    expect(renewalWindow(lease({ end_date: '2026-11-15' }), TODAY)).toBeNull()
  })

  it('returns null exactly one day past the window boundary', () => {
    const boundary = renewalWindow(lease({ end_date: '2026-10-09' }), TODAY) // 90 days out
    expect(boundary).not.toBeNull()
    expect(boundary!.daysLeft).toBe(RENEWAL_WINDOW_DAYS)
    expect(renewalWindow(lease({ end_date: '2026-10-10' }), TODAY)).toBeNull()
  })

  it('returns null once the end date has passed', () => {
    expect(renewalWindow(lease({ end_date: '2026-07-10' }), TODAY)).toBeNull()
  })

  it('ends-today still counts (day 0)', () => {
    expect(renewalWindow(lease({ end_date: TODAY }), TODAY)!.daysLeft).toBe(0)
  })

  it('returns null for month-to-month, non-active, or missing end_date', () => {
    expect(renewalWindow(lease({ month_to_month: true }), TODAY)).toBeNull()
    expect(renewalWindow(lease({ status: 'expired' }), TODAY)).toBeNull()
    expect(renewalWindow(lease({ end_date: null }), TODAY)).toBeNull()
    expect(renewalWindow(null, TODAY)).toBeNull()
  })
})

describe('depositMirror', () => {
  const ended = (over: Record<string, unknown> = {}) => ({
    end_date: '2026-07-01',
    security_deposit: 1200,
    pet_deposit: null,
    ...over,
  })

  it('shows deposit, deadline, and statutory note after move-out in a known state', () => {
    const m = depositMirror(ended(), 'OH', TODAY)
    expect(m).not.toBeNull()
    expect(m!.depositHeld).toBe(1200)
    expect(m!.deadline).toBe('2026-07-31') // OH: 30 days
    expect(m!.daysToDeadline).toBe(20)
    expect(m!.ruleNote).toContain('30 days')
    expect(m!.ruleNote).toContain('5321.16')
  })

  it('sums security and pet deposits', () => {
    expect(depositMirror(ended({ pet_deposit: 300 }), 'OH', TODAY)!.depositHeld).toBe(1500)
  })

  it('returns null before move-out', () => {
    expect(depositMirror(ended({ end_date: '2026-07-12' }), 'OH', TODAY)).toBeNull()
  })

  it('shows on move-out day itself', () => {
    expect(depositMirror(ended({ end_date: TODAY }), 'OH', TODAY)).not.toBeNull()
  })

  it('returns null with no deposit held', () => {
    expect(depositMirror(ended({ security_deposit: 0 }), 'OH', TODAY)).toBeNull()
    expect(depositMirror(ended({ security_deposit: null }), 'OH', TODAY)).toBeNull()
  })

  it('keeps showing while overdue, then stops past the grace horizon', () => {
    // Deadline 2026-07-31; grace ends 45 days later (2026-09-14).
    expect(depositMirror(ended(), 'OH', '2026-08-20')!.daysToDeadline).toBeLessThan(0)
    expect(depositMirror(ended(), 'OH', '2026-09-14')).not.toBeNull()
    expect(depositMirror(ended(), 'OH', '2026-09-15')).toBeNull()
  })

  it('unknown state: no deadline, conservative note, grace window from move-out', () => {
    const m = depositMirror(ended(), 'TX', TODAY)
    expect(m).not.toBeNull()
    expect(m!.deadline).toBeNull()
    expect(m!.daysToDeadline).toBeNull()
    expect(m!.ruleNote).toContain('check your state')
    const pastGrace = depositMirror(ended(), 'TX', `2026-08-${15 + DEPOSIT_MIRROR_GRACE_DAYS - 45}`)
    expect(pastGrace).not.toBeNull() // still inside 45 days of move-out
    expect(depositMirror(ended(), 'TX', '2026-08-16')).toBeNull() // 46 days after move-out
  })
})

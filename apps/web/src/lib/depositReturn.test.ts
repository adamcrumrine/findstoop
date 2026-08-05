import { describe, it, expect } from 'vitest'
import {
  getDepositRule, depositDeadline, deadlineUrgency, addDaysIso, daysBetween,
  addBusinessDaysIso, deadlineDaysLabel, DEPOSIT_STATE_RULES,
  computeDepositMath, formatDeductionsForLetter,
  conditionWorsened, suggestDeductionsFromInspections,
  effectiveMoveOutDate, depositReturnCandidates,
  DEPOSIT_LOOKBACK_DAYS, DEPOSIT_LOOKAHEAD_DAYS,
  type DeductionLine, type InspectionRoomLike, type DepositLeaseLike,
} from './depositReturn'

const line = (over: Partial<DeductionLine>): DeductionLine => ({
  id: 'x', description: 'Carpet burn', category: 'damage', amount: 100, ...over,
})

describe('state rules + deadline', () => {
  it('knows the Ohio 30-day rule with the ORC citation', () => {
    const rule = getDepositRule('OH')
    expect(rule?.deadlineDays).toBe(30)
    expect(rule?.statuteCite).toContain('5321.16')
    expect(rule?.requiresItemization).toBe(true)
    expect(rule?.forwardingAddressMatters).toBe(true)
  })

  it('normalizes state casing/whitespace', () => {
    expect(getDepositRule(' oh ')?.state).toBe('OH')
  })

  it('returns null for states not on file (conservative default)', () => {
    expect(getDepositRule('VT')).toBeNull()
    expect(getDepositRule('')).toBeNull()
    expect(getDepositRule(null)).toBeNull()
  })

  it('computes the Ohio deadline as move-out + 30 days', () => {
    expect(depositDeadline('2026-06-01', 'OH')).toBe('2026-07-01')
    // Crosses a month boundary + leap handling via UTC math.
    expect(depositDeadline('2026-01-31', 'OH')).toBe('2026-03-02')
  })

  it('returns no deadline for unknown states or bad dates', () => {
    expect(depositDeadline('2026-06-01', 'VT')).toBeNull()
    expect(depositDeadline('not-a-date', 'OH')).toBeNull()
    expect(depositDeadline(null, 'OH')).toBeNull()
  })

  it('classifies deadline urgency', () => {
    expect(deadlineUrgency(20)).toBe('ok')
    expect(deadlineUrgency(7)).toBe('urgent')
    expect(deadlineUrgency(0)).toBe('urgent')
    expect(deadlineUrgency(-1)).toBe('overdue')
  })

  it('date helpers are UTC-stable', () => {
    expect(addDaysIso('2026-02-27', 3)).toBe('2026-03-02')
    expect(daysBetween('2026-06-01', '2026-07-01')).toBe(30)
    expect(daysBetween('2026-07-01', '2026-06-01')).toBe(-30)
  })
})

describe('computeDepositMath', () => {
  it('deposit minus deductions = refund', () => {
    const m = computeDepositMath(1200, [line({ amount: 150 }), line({ amount: 80.5 })])
    expect(m).toEqual({ deposit: 1200, totalDeductions: 230.5, refund: 969.5, balanceOwed: 0 })
  })

  it('flips to a balance owed when deductions exceed the deposit', () => {
    const m = computeDepositMath(500, [line({ amount: 400 }), line({ amount: 300 })])
    expect(m.refund).toBe(0)
    expect(m.balanceOwed).toBe(200)
  })

  it('ignores negative / non-numeric amounts and null deposits', () => {
    const m = computeDepositMath(null, [line({ amount: -50 }), line({ amount: NaN })])
    expect(m).toEqual({ deposit: 0, totalDeductions: 0, refund: 0, balanceOwed: 0 })
  })

  it('rounds to cents (no float drift)', () => {
    const m = computeDepositMath(100, [line({ amount: 0.1 }), line({ amount: 0.2 })])
    expect(m.totalDeductions).toBe(0.3)
    expect(m.refund).toBe(99.7)
  })
})

describe('formatDeductionsForLetter', () => {
  it('renders one itemized line per deduction with category and amount', () => {
    const text = formatDeductionsForLetter([
      line({ description: 'Bedroom carpet burn', category: 'damage', amount: 180 }),
      line({ description: 'Kitchen deep clean', category: 'cleaning', amount: 95.5 }),
      line({ description: 'June rent shortfall', category: 'unpaid_rent', amount: 250 }),
    ])
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Damage beyond wear and tear — Bedroom carpet burn: $180.00')
    expect(lines[1]).toBe('Cleaning — Kitchen deep clean: $95.50')
    expect(lines[2]).toBe('Unpaid rent — June rent shortfall: $250.00')
  })

  it('states a full refund when there are no deductions', () => {
    expect(formatDeductionsForLetter([])).toContain('full deposit is being returned')
  })
})

describe('inspection-diff suggestions', () => {
  const rooms = (cond: string, notes = '', photos: string[] = []): InspectionRoomLike[] => ([
    {
      name: 'Bedroom(s)',
      items: [
        { key: 'bed_walls', name: 'Walls', condition: cond, notes, photos },
        { key: 'bed_floor', name: 'Floor / carpet', condition: 'good', notes: '', photos: [] },
      ],
    },
  ])

  it('flags only items whose condition worsened', () => {
    expect(conditionWorsened('good', 'damaged')).toBe(true)
    expect(conditionWorsened('good', 'good')).toBe(false)
    expect(conditionWorsened('fair', 'excellent')).toBe(false)
    expect(conditionWorsened(null, 'poor')).toBe(false)
    expect(conditionWorsened('good', null)).toBe(false)
  })

  it('suggests declined items with description, conditions, notes, and photos', () => {
    const moveIn = rooms('good')
    const moveOut = rooms('damaged', 'Large hole behind the door', ['lease/insp/bed_walls-1.jpg'])
    const s = suggestDeductionsFromInspections(moveIn, moveOut)
    expect(s).toHaveLength(1)
    expect(s[0].key).toBe('Bedroom(s):bed_walls')
    expect(s[0].item).toBe('Walls')
    expect(s[0].description).toContain('Good at move-in, Damaged at move-out')
    expect(s[0].description).toContain('Large hole behind the door')
    expect(s[0].photoPaths).toEqual(['lease/insp/bed_walls-1.jpg'])
  })

  it('defaults poor/damaged endings to "damage" and milder declines to "other"', () => {
    const damaged = suggestDeductionsFromInspections(rooms('good'), rooms('damaged'))
    expect(damaged[0].category).toBe('damage')
    const mild = suggestDeductionsFromInspections(rooms('excellent'), rooms('fair'))
    expect(mild[0].category).toBe('other')
  })

  it('returns nothing when either inspection is missing', () => {
    expect(suggestDeductionsFromInspections(null, rooms('damaged'))).toEqual([])
    expect(suggestDeductionsFromInspections(rooms('good'), undefined)).toEqual([])
    expect(suggestDeductionsFromInspections([], rooms('damaged'))).toEqual([])
  })
})

describe('deposit-return candidates (the Leases-page nudge)', () => {
  const today = '2026-07-02'
  const mk = (over: Partial<DepositLeaseLike>): DepositLeaseLike => ({
    id: 'l1', status: 'expired', end_date: '2026-06-20', security_deposit: 1200, ...over,
  })

  it('resolves the move-out date by lease state', () => {
    expect(effectiveMoveOutDate(mk({}), today)).toBe('2026-06-20')
    expect(effectiveMoveOutDate(mk({ status: 'terminated' }), today)).toBe('2026-06-20')
    // Active fixed-term ending soon → end_date counts.
    expect(effectiveMoveOutDate(mk({ status: 'active', end_date: '2026-07-10' }), today)).toBe('2026-07-10')
    // Active rolled past its end date (implicit M2M) → no move-out yet.
    expect(effectiveMoveOutDate(mk({ status: 'active', end_date: '2026-05-01' }), today)).toBeNull()
    // Explicit M2M with no recorded move-out → no move-out yet.
    expect(effectiveMoveOutDate(mk({ status: 'active', month_to_month: true }), today)).toBeNull()
    // M2M soft notice → the recorded tentative date wins.
    expect(effectiveMoveOutDate(mk({ status: 'active', month_to_month: true, tentative_move_out_date: '2026-07-05' }), today)).toBe('2026-07-05')
    expect(effectiveMoveOutDate(mk({ status: 'pending' }), today)).toBeNull()
  })

  it('keeps only leases with a held deposit and a move-out in the window', () => {
    const inWindow = mk({ id: 'a' })
    const noDeposit = mk({ id: 'b', security_deposit: 0 })
    const nullDeposit = mk({ id: 'c', security_deposit: null })
    const tooOld = mk({ id: 'd', end_date: addDaysIso(today, -(DEPOSIT_LOOKBACK_DAYS + 1)) })
    const tooFar = mk({ id: 'e', status: 'active', end_date: addDaysIso(today, DEPOSIT_LOOKAHEAD_DAYS + 1) })
    const got = depositReturnCandidates([inWindow, noDeposit, nullDeposit, tooOld, tooFar], today)
    expect(got.map((c) => c.lease.id)).toEqual(['a'])
    expect(got[0].moveOut).toBe('2026-06-20')
  })

  it('sorts soonest-ended first (most-overdue at the top)', () => {
    const got = depositReturnCandidates([
      mk({ id: 'later', end_date: '2026-06-28' }),
      mk({ id: 'earlier', end_date: '2026-06-01' }),
    ], today)
    expect(got.map((c) => c.lease.id)).toEqual(['earlier', 'later'])
  })

  it('window edges are inclusive', () => {
    const oldest = mk({ id: 'edge-old', end_date: addDaysIso(today, -DEPOSIT_LOOKBACK_DAYS) })
    const newest = mk({ id: 'edge-new', status: 'active', end_date: addDaysIso(today, DEPOSIT_LOOKAHEAD_DAYS) })
    expect(depositReturnCandidates([oldest, newest], today)).toHaveLength(2)
  })

  // 301/303 E 14th Ave: the previous student tenancies ran entirely on the old
  // platform. Their imported ledgers carry a deposit figure, so the advisor
  // opened the Leases page with a red statutory countdown over money Stoop has
  // never held and cannot return.
  it('says nothing about a tenancy that never ran on Stoop', () => {
    const offPlatform = mk({ id: 'imported', collections_paused_at: '2026-08-04T00:17:39Z' })
    expect(depositReturnCandidates([offPlatform], today)).toEqual([])
  })

  it('still prompts for a real tenancy sitting beside it', () => {
    // The regression that would matter: silencing must not be portfolio-wide.
    const got = depositReturnCandidates([
      mk({ id: 'imported', collections_paused_at: '2026-08-04T00:17:39Z' }),
      mk({ id: 'genuine' }),
    ], today)
    expect(got.map((c) => c.lease.id)).toEqual(['genuine'])
  })
})

// ── Multi-state rules (2026-07 expansion) ────────────────────────────────────

describe('expanded state rules', () => {
  it('every state entry carries a citation, penalty, wear note, and verified date', () => {
    for (const rule of Object.values(DEPOSIT_STATE_RULES)) {
      expect(rule.statuteCite.length).toBeGreaterThan(4)
      expect(rule.penaltyNote.length).toBeGreaterThan(10)
      expect(rule.wearAndTearNote.length).toBeGreaterThan(10)
      expect(rule.verifiedAsOf).toMatch(/^\d{4}-\d{2}$/)
      expect(rule.requiresItemization).toBe(true)
    }
  })

  it('covers the nine launch states', () => {
    for (const st of ['OH', 'TX', 'FL', 'GA', 'AZ', 'CO', 'NC', 'PA', 'MI']) {
      expect(getDepositRule(st), st).not.toBeNull()
    }
  })

  it('FL uses the 15-day full-return obligation as the countdown', () => {
    expect(getDepositRule('FL')!.deadlineDays).toBe(15)
    expect(depositDeadline('2026-01-01', 'FL')).toBe('2026-01-16')
    expect(getDepositRule('FL')!.deadlineNote).toContain('30 days')
  })

  it('addBusinessDaysIso skips weekends', () => {
    // 2026-01-05 is a Monday.
    expect(addBusinessDaysIso('2026-01-05', 5)).toBe('2026-01-12')
    // Friday + 1 business day lands on Monday.
    expect(addBusinessDaysIso('2026-01-09', 1)).toBe('2026-01-12')
  })

  it('AZ deadline counts 14 BUSINESS days', () => {
    const rule = getDepositRule('AZ')!
    expect(rule.businessDays).toBe(true)
    expect(depositDeadline('2026-01-05', 'AZ')).toBe('2026-01-23')
    expect(deadlineDaysLabel(rule)).toBe('14 business days')
  })

  it('calendar-day states label plainly', () => {
    expect(deadlineDaysLabel(getDepositRule('OH')!)).toBe('30 days')
  })

  it('interest facts exist only where the statute requires them', () => {
    expect(getDepositRule('PA')!.interestNote).toContain('250.511b')
    expect(getDepositRule('OH')!.interestNote).toContain('5%')
    expect(getDepositRule('TX')!.interestNote).toBeUndefined()
    expect(getDepositRule('GA')!.interestNote).toBeUndefined()
  })
})

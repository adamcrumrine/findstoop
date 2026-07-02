import { describe, it, expect } from 'vitest'
import {
  COMPLIANCE_RULES, FEDERAL_DISCLOSURES,
  getComplianceRules, getRequiredDisclosures, getDepositCompliance, notOnFileNote,
  checkLateFeeCompliance, checkDepositCap,
  type LateFeeConfigLike,
} from './complianceRules'
import { DEPOSIT_STATE_RULES } from './depositReturn'

const feeConfig = (over: Partial<LateFeeConfigLike> = {}): LateFeeConfigLike => ({
  late_fee_enabled: true,
  late_fee_amount: 50,
  late_fee_grace_days: 5,
  late_fee_type: 'flat',
  late_fee_percent: 5,
  ...over,
})

// ── Table hygiene — the "omission over invention" invariants ─────────────────

describe('rules table hygiene', () => {
  const entries = Object.entries(COMPLIANCE_RULES)

  it('keys match the entry state code, uppercased', () => {
    for (const [key, rule] of entries) {
      expect(rule.state).toBe(key)
      expect(key).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('every state carries a lastReviewed stamp of 2026-07', () => {
    for (const [, rule] of entries) {
      expect(rule.lastReviewed).toBe('2026-07')
    }
  })

  it('every rendered rule carries its citation', () => {
    for (const [state, rule] of entries) {
      if (rule.entryNotice) expect(rule.entryNotice.statuteCite, `${state} entryNotice`).toBeTruthy()
      if (rule.deposit) expect(rule.deposit.statuteCite, `${state} deposit`).toBeTruthy()
      if (rule.noticeToTerminate) expect(rule.noticeToTerminate.statuteCite, `${state} termination`).toBeTruthy()
      for (const d of rule.requiredDisclosures ?? []) {
        expect(d.statuteCite, `${state} disclosure ${d.id}`).toBeTruthy()
      }
      // Late fees: either a statute is cited, or the note explicitly says no
      // statute governs (Ohio's reasonableness standard).
      if (rule.lateFees && !rule.lateFees.statuteCite) {
        expect(rule.lateFees.capNote.toLowerCase(), `${state} lateFees`).toContain('no')
      }
    }
    for (const d of FEDERAL_DISCLOSURES) expect(d.statuteCite).toBeTruthy()
  })

  it('never duplicates a deposit deadline that depositReturn owns', () => {
    // The deposit topic here only carries cap facts; deadlines stay in
    // DEPOSIT_STATE_RULES so the two can never drift apart.
    for (const [, rule] of entries) {
      if (rule.deposit) expect(rule.deposit).not.toHaveProperty('deadlineDays')
    }
  })
})

// ── Lookups ──────────────────────────────────────────────────────────────────

describe('getComplianceRules', () => {
  it('knows Ohio fully, with the repo-reviewed cites', () => {
    const oh = getComplianceRules('OH')!
    expect(oh.entryNotice?.hours).toBe(24)
    expect(oh.entryNotice?.statuteCite).toContain('5321.04(A)(8)')
    expect(oh.deposit?.statuteCite).toContain('5321.16')
    expect(oh.deposit?.maxDepositMonths).toBeUndefined() // no cap in Ohio
    expect(oh.noticeToTerminate?.monthToMonthDays).toBe(30)
    expect(oh.noticeToTerminate?.statuteCite).toContain('5321.17')
    expect(oh.requiredDisclosures?.some((d) => d.statuteCite.includes('5321.18'))).toBe(true)
  })

  it('normalizes state casing/whitespace', () => {
    expect(getComplianceRules(' oh ')?.state).toBe('OH')
  })

  it('returns null for states not on file (conservative default)', () => {
    expect(getComplianceRules('WY')).toBeNull()
    expect(getComplianceRules('')).toBeNull()
    expect(getComplianceRules(null)).toBeNull()
  })
})

describe('getRequiredDisclosures', () => {
  it('includes the federal lead-paint item for EVERY state, known or not', () => {
    for (const state of ['OH', 'TX', 'WY', 'zz', null]) {
      const items = getRequiredDisclosures(state)
      expect(items.some((d) => d.id === 'lead-paint')).toBe(true)
    }
  })

  it('appends state-specific items after the federal ones', () => {
    const oh = getRequiredDisclosures('OH')
    expect(oh[0].id).toBe('lead-paint')
    expect(oh.some((d) => d.id === 'oh-landlord-identity')).toBe(true)
    // Unknown state: federal only.
    expect(getRequiredDisclosures('WY')).toHaveLength(FEDERAL_DISCLOSURES.length)
  })
})

describe('getDepositCompliance (composes with depositReturn)', () => {
  it('returns the depositReturn rule object itself for Ohio — no copy', () => {
    const { returnRule, capInfo } = getDepositCompliance('OH')
    expect(returnRule).toBe(DEPOSIT_STATE_RULES.OH)
    expect(capInfo?.statuteCite).toContain('5321.16')
  })

  it('half-populates when only one table knows the state', () => {
    // NC: cap on file here, no return deadline in depositReturn.
    const nc = getDepositCompliance('NC')
    expect(nc.returnRule).toBeNull()
    expect(nc.capInfo?.maxDepositMonths).toBe(2)
  })

  it('is empty for unknown states', () => {
    const wy = getDepositCompliance('WY')
    expect(wy.returnRule).toBeNull()
    expect(wy.capInfo).toBeNull()
  })
})

describe('notOnFileNote', () => {
  it('names the state and tells the landlord to check the statutes', () => {
    expect(notOnFileNote('OH')).toContain('Ohio')
    expect(notOnFileNote('wy')).toContain('WY')
    expect(notOnFileNote(null)).toContain('your state')
    expect(notOnFileNote('OH').toLowerCase()).toContain('check')
  })
})

// ── checkLateFeeCompliance ───────────────────────────────────────────────────

describe('checkLateFeeCompliance', () => {
  it('is silent when late fees are disabled or the state is not on file', () => {
    expect(checkLateFeeCompliance(feeConfig({ late_fee_enabled: false }), 'CO')).toEqual([])
    expect(checkLateFeeCompliance(feeConfig(), 'WY')).toEqual([])
    expect(checkLateFeeCompliance(null, 'CO')).toEqual([])
  })

  it('flags a grace period shorter than the state requires (CO: 7 days)', () => {
    const flags = checkLateFeeCompliance(feeConfig({ late_fee_grace_days: 2 }), 'CO')
    const grace = flags.find((f) => f.message.includes('grace'))
    expect(grace?.level).toBe('warning')
    expect(grace?.message).toContain('2-day grace period')
    expect(grace?.message).toContain('7 days')
    expect(grace?.statuteCite).toContain('38-12-105')
  })

  it('passes a compliant Colorado config with a single ok flag', () => {
    const flags = checkLateFeeCompliance(
      feeConfig({ late_fee_grace_days: 7, late_fee_type: 'flat', late_fee_amount: 50 }),
      'CO',
    )
    expect(flags).toHaveLength(1)
    expect(flags[0].level).toBe('ok')
  })

  it('flags a flat fee above a greater-of cap, explaining the percent leg (CO: $50 / 5%)', () => {
    const flags = checkLateFeeCompliance(
      feeConfig({ late_fee_grace_days: 7, late_fee_type: 'flat', late_fee_amount: 80 }),
      'CO',
    )
    const cap = flags.find((f) => f.message.includes('$80'))
    expect(cap?.level).toBe('warning')
    expect(cap?.message).toContain('$50')
    expect(cap?.message).toContain('5%')
  })

  it('flags a percent fee above the percent cap (NC: 5%)', () => {
    const flags = checkLateFeeCompliance(
      feeConfig({ late_fee_grace_days: 5, late_fee_type: 'percent', late_fee_percent: 8 }),
      'NC',
    )
    const cap = flags.find((f) => f.message.includes('8%'))
    expect(cap?.level).toBe('warning')
    expect(cap?.message).toContain('5%')
    expect(cap?.statuteCite).toContain('42-46')
  })

  it('adds an info note when our rent-based percent meets a past-due-based cap (CO)', () => {
    const flags = checkLateFeeCompliance(
      feeConfig({ late_fee_grace_days: 7, late_fee_type: 'percent', late_fee_percent: 5 }),
      'CO',
    )
    expect(flags.some((f) => f.level === 'info' && f.message.includes('past due'))).toBe(true)
    expect(flags.some((f) => f.level === 'warning')).toBe(false)
  })

  it('can return multiple conflicts at once (TX: 2-day grace + flat fee is fine)', () => {
    // Texas fixes only the grace floor structurally; a 0-day grace conflicts.
    const flags = checkLateFeeCompliance(feeConfig({ late_fee_grace_days: 0 }), 'TX')
    expect(flags.some((f) => f.level === 'warning' && f.message.includes('2 days'))).toBe(true)
  })

  it('says ok for Ohio (reasonableness standard, nothing structural to conflict with)', () => {
    const flags = checkLateFeeCompliance(feeConfig({ late_fee_grace_days: 0, late_fee_amount: 500 }), 'OH')
    expect(flags).toHaveLength(1)
    expect(flags[0].level).toBe('ok')
  })
})

// ── checkDepositCap ──────────────────────────────────────────────────────────

describe('checkDepositCap', () => {
  it('flags a deposit above the cap (NC: 2 months)', () => {
    const flag = checkDepositCap(2500, 1000, 'NC')
    expect(flag?.level).toBe('warning')
    expect(flag?.message).toContain('$2,500')
    expect(flag?.message).toContain('$2,000')
    expect(flag?.statuteCite).toContain('42-51')
  })

  it('handles fractional-month caps (AZ: 1.5 months)', () => {
    expect(checkDepositCap(1500, 1000, 'AZ')).toBeNull()
    const flag = checkDepositCap(1600, 1000, 'AZ')
    expect(flag?.message).toContain('1.5 months')
    expect(flag?.message).toContain('$1,500')
  })

  it('is null at or under the cap', () => {
    expect(checkDepositCap(2000, 1000, 'NC')).toBeNull()
  })

  it('is null for uncapped or unknown states — Ohio has no cap', () => {
    expect(checkDepositCap(10_000, 1000, 'OH')).toBeNull()
    expect(checkDepositCap(10_000, 1000, 'WY')).toBeNull()
  })

  it('is null when the numbers cannot support a determination', () => {
    expect(checkDepositCap(null, 1000, 'NC')).toBeNull()
    expect(checkDepositCap(0, 1000, 'NC')).toBeNull()
    expect(checkDepositCap(2500, 0, 'NC')).toBeNull()
    expect(checkDepositCap(2500, NaN, 'NC')).toBeNull()
  })
})

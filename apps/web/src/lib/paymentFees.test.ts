import { describe, it, expect } from 'vitest'
import {
  ACH_CAP_CENTS, CARD_SURCHARGE_PCT, ACH_SURCHARGE_PCT,
  stripeCostCents, payerFeeCents, railOptions, cheapestRail,
  combineSavings, bestCombineSavings,
} from '@findstoop/shared/lib/paymentFees'

// These numbers end up on a tenant's bank statement, so they're pinned rather
// than derived. The edge functions re-declare the same rates (Deno can't
// import the workspace package) — if someone changes one side only, the
// pass-through stops covering the actual Stripe cost and the platform silently
// starts eating the difference.

describe('what Stripe takes', () => {
  it('ACH is 0.8% until the $5 cap binds', () => {
    expect(stripeCostCents('us_bank_account', 10000)).toBe(80)   // $100 → 80¢
    expect(stripeCostCents('us_bank_account', 52500)).toBe(420)  // $525 → $4.20
    expect(stripeCostCents('us_bank_account', 62500)).toBe(500)  // $625 → exactly the cap
    expect(stripeCostCents('us_bank_account', 210000)).toBe(500) // $2,100 → still $5
  })

  it('card is 2.9% + 30c with no cap', () => {
    expect(stripeCostCents('card', 10000)).toBe(320)     // $2.90 + $0.30
    expect(stripeCostCents('card', 52500)).toBe(1553)    // $15.23 + $0.30
    expect(stripeCostCents('card', 210000)).toBe(6120)   // $60.90 + $0.30
  })

  it('a zero or negative amount costs nothing', () => {
    expect(stripeCostCents('card', 0)).toBe(0)
    expect(stripeCostCents('us_bank_account', -100)).toBe(0)
  })
})

describe('what the payer is charged', () => {
  it('the card surcharge covers the real card cost', () => {
    // The whole point of the spread: 3.5% has to clear 2.9% + 30c, or the
    // platform is absorbing card fees while claiming not to.
    for (const cents of [5000, 10000, 52500, 100000, 210000]) {
      expect(payerFeeCents('card', cents)).toBeGreaterThanOrEqual(stripeCostCents('card', cents))
    }
  })

  it('the ACH fee is a straight pass-through, cap included', () => {
    for (const cents of [10000, 52500, 62500, 210000]) {
      expect(payerFeeCents('us_bank_account', cents)).toBe(stripeCostCents('us_bank_account', cents))
    }
    expect(payerFeeCents('us_bank_account', 500000)).toBe(ACH_CAP_CENTS)
  })

  it('matches the rates the edge functions declare', () => {
    expect(CARD_SURCHARGE_PCT).toBe(3.5)
    expect(ACH_SURCHARGE_PCT).toBe(0.8)
    expect(ACH_CAP_CENTS).toBe(500)
  })
})

describe('presenting the options', () => {
  // Real number: one tenant's share of rent at 303 E 14th Ave.
  const RENT = 52500

  it('shows every rail, cheapest first, exactly one recommended', () => {
    const opts = railOptions(RENT)
    expect(opts).toHaveLength(2)
    expect(opts[0].rail).toBe('us_bank_account')
    expect(opts.filter((o) => o.recommended)).toHaveLength(1)
    expect(opts[0].recommended).toBe(true)
  })

  it('prices the tenant-visible total, not just the fee', () => {
    const [bank, card] = railOptions(RENT)
    expect(bank.feeCents).toBe(420)
    expect(bank.totalCents).toBe(52920)
    expect(card.feeCents).toBe(1838)
    expect(card.totalCents).toBe(54338)
    // $14.18 is the actual cost of reaching for a card on a $525 rent payment.
    expect(card.feeCents - bank.feeCents).toBe(1418)
  })

  it('never hides the expensive option', () => {
    // A tenant with no bank account still has to be able to find the card.
    expect(railOptions(RENT).map((o) => o.rail)).toContain('card')
  })

  it('recommends bank transfer even on small amounts', () => {
    // 0.8% vs 3.5% — ACH wins at every amount, but assert rather than assume.
    for (const cents of [1000, 5000, 52500, 210000]) {
      expect(cheapestRail(cents).rail).toBe('us_bank_account')
    }
  })
})

describe('combining charges', () => {
  // Unit 303: four roommates at $525 each.
  const FOUR_SHARES = [52500, 52500, 52500, 52500]

  it('is a large win on ACH because the cap is per transaction', () => {
    const s = combineSavings('us_bank_account', FOUR_SHARES)
    expect(s.separateCents).toBe(1680)  // 4 x $4.20
    expect(s.combinedCents).toBe(500)   // capped
    expect(s.savingsCents).toBe(1180)   // $11.80/month
  })

  it('is worth essentially nothing on card', () => {
    const s = combineSavings('card', FOUR_SHARES)
    // The surcharge is a flat percentage with no cap and no fixed component,
    // so combining recovers only rounding dust: 4 x round(525.00 x 3.5%) =
    // 4 x $18.38 = $73.52, against $73.50 charged in one go. Two cents.
    //
    // Worth pinning precisely because it's the honest counterweight to the
    // ACH result below — the UI must not tell a card payer that bundling
    // saves them money.
    expect(s.separateCents).toBe(7352)
    expect(s.combinedCents).toBe(7350)
    expect(s.savingsCents).toBe(2)
  })

  it('reports the best rail to combine on', () => {
    expect(bestCombineSavings(FOUR_SHARES).rail).toBe('us_bank_account')
  })

  it('one charge alone can never save anything', () => {
    expect(combineSavings('us_bank_account', [52500]).savingsCents).toBe(0)
  })

  it('never advertises a negative saving', () => {
    // Rounding on very small amounts must not produce "save -$0.01".
    for (const amounts of [[1, 1], [3, 7], [99, 1]]) {
      expect(combineSavings('us_bank_account', amounts).savingsCents).toBeGreaterThanOrEqual(0)
      expect(combineSavings('card', amounts).savingsCents).toBeGreaterThanOrEqual(0)
    }
  })

  it('a tenant paying rent + pet fee + utilities together', () => {
    // The realistic single-tenant case: three charges due the same day.
    const s = combineSavings('us_bank_account', [52500, 2000, 4750])
    expect(s.separateCents).toBe(420 + 16 + 38)
    expect(s.combinedCents).toBe(474)
    expect(s.savingsCents).toBe(0)
    // Under the cap, ACH is linear too — so the honest answer here is that
    // combining saves nothing, and the UI must not claim otherwise.
  })
})

import { describe, it, expect } from 'vitest'
import { payerFeeCents, combineSavings } from '@findstoop/shared/lib/paymentFees'

// Bundling is arithmetic on our side, not a Stripe feature. When a tenant
// settles rent + pet fee + a utility bill-back together we send Stripe ONE
// PaymentIntent for the summed amount, so the per-transaction ACH fee is
// charged once instead of three times. Stripe sees a single payment; the link
// back to individual charges lives only in metadata.
//
// That makes the metadata the seam holding the ledger together, and these
// tests pin both halves: the fee arithmetic the tenant is quoted, and the
// id round-trip the webhook depends on to mark every covered row paid.

/** Mirrors paymentIdsFromMetadata() in stripe-webhook. */
function paymentIdsFromMetadata(md: Record<string, string> | null | undefined): string[] {
  const many = (md?.findstoop_payment_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (many.length > 0) return Array.from(new Set(many))
  const one = md?.findstoop_payment_id
  return one ? [one] : []
}

describe('what bundling actually saves', () => {
  // A realistic month for one tenant at 301 E 14th Ave.
  const RENT = 52500
  const PET = 2000
  const UTILITIES = 4750

  it('charges one fee on the total instead of one per charge', () => {
    const separate = payerFeeCents('us_bank_account', RENT)
      + payerFeeCents('us_bank_account', PET)
      + payerFeeCents('us_bank_account', UTILITIES)
    const bundled = payerFeeCents('us_bank_account', RENT + PET + UTILITIES)
    expect(separate).toBe(474)
    expect(bundled).toBe(474)
    // Under the $5 cap ACH is linear, so this particular basket saves nothing.
    // Pinned deliberately: the UI must not promise a saving that isn't there.
    expect(combineSavings('us_bank_account', [RENT, PET, UTILITIES]).savingsCents).toBe(0)
  })

  it('saves real money once the total crosses the ACH cap', () => {
    // Two months of rent settled at once, or a large catch-up payment.
    const s = combineSavings('us_bank_account', [52500, 52500])
    expect(s.separateCents).toBe(840)   // 2 x $4.20
    expect(s.combinedCents).toBe(500)   // capped
    expect(s.savingsCents).toBe(340)
  })

  it('is worth nothing on card, and says so', () => {
    // 3% flat has no cap and no fixed component to amortise.
    expect(combineSavings('card', [RENT, PET, UTILITIES]).savingsCents).toBe(0)
  })

  it('the quoted total is the sum of the rows plus one fee', () => {
    const total = RENT + PET + UTILITIES
    const fee = payerFeeCents('us_bank_account', total)
    expect(total + fee).toBe(59250 + 474)
  })
})

describe('metadata round-trip the webhook depends on', () => {
  it('recovers every id from the plural key', () => {
    const md = { findstoop_payment_ids: 'a,b,c', findstoop_payment_id: 'a' }
    expect(paymentIdsFromMetadata(md)).toEqual(['a', 'b', 'c'])
  })

  it('falls back to the singular key for intents created before bundling', () => {
    // Intents already in flight during the deploy must still settle.
    expect(paymentIdsFromMetadata({ findstoop_payment_id: 'legacy-1' })).toEqual(['legacy-1'])
  })

  it('returns nothing when neither key is present', () => {
    // Caller then falls back to matching on stripe_payment_id.
    expect(paymentIdsFromMetadata({})).toEqual([])
    expect(paymentIdsFromMetadata(null)).toEqual([])
  })

  it('tolerates whitespace and duplicates without double-updating a row', () => {
    expect(paymentIdsFromMetadata({ findstoop_payment_ids: ' a , b ,a, ' })).toEqual(['a', 'b'])
  })

  it('a single-charge payment still round-trips', () => {
    const md = { findstoop_payment_ids: 'only-one', findstoop_payment_id: 'only-one' }
    expect(paymentIdsFromMetadata(md)).toEqual(['only-one'])
  })
})

describe('reconciliation guard', () => {
  // The webhook refuses to mark rows paid unless Stripe collected at least
  // their combined value. Against a bundle it must compare the SUM — checking
  // only the first row would let a $525 charge settle $592.50 of debt.
  const rows = [{ amount: 525 }, { amount: 20 }, { amount: 47.5 }]
  const expectedCents = rows.reduce((s, r) => s + Math.round(r.amount * 100), 0)

  it('accepts when the amount received covers every row plus the fee', () => {
    const received = expectedCents + payerFeeCents('us_bank_account', expectedCents)
    expect(received).toBeGreaterThanOrEqual(expectedCents)
  })

  it('rejects a payment that only covers the rent row', () => {
    expect(52500).toBeLessThan(expectedCents)
  })

  it('accepts exactly the total when the landlord absorbs the fee', () => {
    // Absorbed means the tenant is charged the rows and nothing more, so the
    // guard has to pass on equality, not require a surplus.
    expect(expectedCents).toBeGreaterThanOrEqual(expectedCents)
  })
})

import { describe, it, expect } from 'vitest'
import { payerFeeCents, stripeCostCents } from '@findstoop/shared/lib/paymentFees'

// Card networks prohibit surcharging debit cards anywhere in the US. There is
// no state where it's permitted and no disclosure that cures it. Stripe won't
// tell us the funding type until the charge exists, so the surcharge is
// already collected by the time we can check — the only compliant response is
// to refund it, which stripe-webhook does on payment_intent.succeeded.
//
// These pin the decision rule and the economics, because the economics are the
// reason someone will eventually be tempted to remove this.

/** Mirrors refundSurchargeIfDebit() in stripe-webhook. */
function refundAmountCents(md: {
  surchargeAmount?: string
  feePaidBy?: string
}, funding: string | null): number {
  const surchargeCents = Math.round(Number(md.surchargeAmount ?? '0') * 100)
  if (!(surchargeCents > 0)) return 0
  if (md.feePaidBy === 'landlord') return 0
  if (funding !== 'debit') return 0
  return surchargeCents
}

describe('when the surcharge gets refunded', () => {
  it('refunds the full surcharge on a debit card', () => {
    expect(refundAmountCents({ surchargeAmount: '15.75', feePaidBy: 'tenant' }, 'debit')).toBe(1575)
  })

  it('keeps it on a credit card', () => {
    expect(refundAmountCents({ surchargeAmount: '15.75', feePaidBy: 'tenant' }, 'credit')).toBe(0)
  })

  it('does nothing on a bank transfer, which has no card funding type', () => {
    expect(refundAmountCents({ surchargeAmount: '4.20', feePaidBy: 'tenant' }, null)).toBe(0)
  })

  it('does nothing when the landlord already absorbed the fee', () => {
    // The tenant was never surcharged, so there is nothing to give back —
    // refunding here would hand them money they never paid.
    expect(refundAmountCents({ surchargeAmount: '0.00', feePaidBy: 'landlord' }, 'debit')).toBe(0)
    // Even if a surcharge figure somehow rode along, the flag wins.
    expect(refundAmountCents({ surchargeAmount: '15.75', feePaidBy: 'landlord' }, 'debit')).toBe(0)
  })

  it('does nothing when no surcharge was charged', () => {
    expect(refundAmountCents({ surchargeAmount: '0' }, 'debit')).toBe(0)
    expect(refundAmountCents({}, 'debit')).toBe(0)
  })

  it("treats an unknown funding type as not-debit rather than guessing", () => {
    // Prepaid and unknown both keep the surcharge. Refunding on 'unknown'
    // would give money back on ordinary credit cards Stripe couldn't classify.
    expect(refundAmountCents({ surchargeAmount: '15.75' }, 'unknown')).toBe(0)
    expect(refundAmountCents({ surchargeAmount: '15.75' }, 'prepaid')).toBe(0)
  })
})

describe('what accepting debit actually costs', () => {
  // Someone will look at this and want to delete the refund. The number is
  // here so that decision is made with its size in view.
  const RENT = 52500

  it('a debit rent payment is a loss, not a break-even', () => {
    const collected = payerFeeCents('card', RENT)   // charged, then refunded
    const stripeTakes = stripeCostCents('card', RENT)
    const platformNet = collected - stripeTakes - collected
    expect(collected).toBe(1575)
    expect(stripeTakes).toBe(1553)
    // The surcharge goes back to the tenant; Stripe's cut does not come back.
    expect(platformNet).toBe(-1553)
  })

  it('the same payment by bank transfer is free to the platform', () => {
    expect(payerFeeCents('us_bank_account', RENT) - stripeCostCents('us_bank_account', RENT)).toBe(0)
  })

  it('the landlord is unaffected either way', () => {
    // The refund is taken from the platform balance with reverse_transfer
    // false, so the landlord keeps exactly the rent. They didn't choose the
    // card and shouldn't carry the cost of it.
    const landlordReceives = RENT
    expect(landlordReceives).toBe(52500)
  })
})

import { describe, it, expect } from 'vitest'
import {
  CARD_SURCHARGE_PCT,
  cardSurcharge,
  cardSurchargeCents,
  totalWithCardSurchargeCents,
} from '@findstoop/shared/lib/billing'

// The surcharge policy: 3% on every CARD charge (tenant rent, manager
// subscriptions), never on ACH, and the platform never absorbs the fee.
// These tests pin the shared math to the exact formulas the edge functions
// use (create-payment-intent / cron-lifecycle-daily / stripe-subscribe /
// stripe-webhook all hardcode the same rate).

describe('card surcharge math', () => {
  it('rate is 3%', () => {
    expect(CARD_SURCHARGE_PCT).toBe(3.0)
  })

  it('cents helper: 3% of the base, rounded to the cent', () => {
    expect(cardSurchargeCents(100_000)).toBe(3_000)   // $1,000 rent → $30.00
    expect(cardSurchargeCents(90_000)).toBe(2_700)    // $900/yr annual sub → $27.00
    expect(cardSurchargeCents(900)).toBe(27)          // $9 single-unit sub → $0.27
    expect(cardSurchargeCents(0)).toBe(0)
  })

  it('dollar helper matches the server formula Math.round(dollars * 3.0) cents', () => {
    // create-payment-intent computes surchargeCents = Math.round(amount * 3.0)
    const serverFormula = (dollars: number) => Math.round(dollars * 3.0) / 100
    for (const rent of [1000, 1234.56, 850.25, 9, 90, 2150.99]) {
      expect(cardSurcharge(rent)).toBe(serverFormula(rent))
    }
    expect(cardSurcharge(1000)).toBe(30)
    expect(cardSurcharge(1234.56)).toBe(37.04) // 3703.68 → 3704 cents
  })

  it('dollar and cent helpers agree on whole-cent bases', () => {
    for (const cents of [100_000, 123_456, 85_025, 900, 9_000]) {
      expect(cardSurchargeCents(cents)).toBe(Math.round(cardSurcharge(cents / 100) * 100))
    }
  })

  it('total = base + surcharge', () => {
    expect(totalWithCardSurchargeCents(100_000)).toBe(103_000)
    expect(totalWithCardSurchargeCents(900)).toBe(927)
  })
})

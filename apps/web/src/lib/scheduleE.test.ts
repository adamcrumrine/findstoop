import { describe, it, expect } from 'vitest'
import { sumByCategory, categoryTotal, netIncome } from './scheduleE'
import { EXPENSE_CATEGORY_META } from '@findstoop/shared/types/expense'

describe('sumByCategory', () => {
  it('sums amounts per category and coerces strings', () => {
    const m = sumByCategory([
      { category: 'repairs', amount: 100 },
      { category: 'repairs', amount: '50.50' },
      { category: 'insurance', amount: 1200 },
    ])
    expect(m.repairs).toBe(150.5)
    expect(m.insurance).toBe(1200)
    expect(m.taxes).toBeUndefined()
  })
})

describe('categoryTotal (Schedule E line 20)', () => {
  it('totals all categories', () => {
    expect(categoryTotal({ repairs: 150.5, insurance: 1200 })).toBe(1350.5)
  })
  it('is 0 for no expenses', () => {
    expect(categoryTotal({})).toBe(0)
  })
})

describe('netIncome (Schedule E line 21)', () => {
  it('subtracts total expenses from income', () => {
    expect(netIncome(10000, { repairs: 2000, taxes: 3000 })).toBe(5000)
  })
  it('can be a loss (negative)', () => {
    expect(netIncome(1000, { repairs: 4000 })).toBe(-3000)
  })
})

describe('EXPENSE_CATEGORY_META', () => {
  it('maps 15 categories 1:1 to Schedule E lines 5–19, no dupes', () => {
    expect(EXPENSE_CATEGORY_META).toHaveLength(15)
    expect(EXPENSE_CATEGORY_META.map((m) => m.line)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(new Set(EXPENSE_CATEGORY_META.map((m) => m.key)).size).toBe(15)
  })
})

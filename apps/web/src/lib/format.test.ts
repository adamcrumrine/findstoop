import { describe, it, expect } from 'vitest'
import { formatUsd, formatUsdCents, formatPhone } from '@findstoop/shared/lib/format'

describe('formatUsd', () => {
  it('renders whole dollars with separators', () => {
    expect(formatUsd(1500)).toBe('$1,500')
    expect(formatUsd(15000)).toBe('$15,000')
    expect(formatUsd(0)).toBe('$0')
  })
  it('guards null / NaN', () => {
    expect(formatUsd(null)).toBe('$0')
    expect(formatUsd(undefined)).toBe('$0')
    expect(formatUsd(NaN)).toBe('$0')
  })
})

describe('formatUsdCents', () => {
  it('always shows two decimals', () => {
    expect(formatUsdCents(1500)).toBe('$1,500.00')
    expect(formatUsdCents(1500.5)).toBe('$1,500.50')
    expect(formatUsdCents(1500.75)).toBe('$1,500.75')
  })
  it('guards null', () => {
    expect(formatUsdCents(null)).toBe('$0.00')
  })
})

describe('formatPhone', () => {
  it('formats 10-digit US numbers', () => {
    expect(formatPhone('6144004091')).toBe('(614) 400-4091')
    expect(formatPhone('+1 614-400-4091')).toBe('(614) 400-4091')
  })
  it('passes through non-10-digit input unchanged', () => {
    expect(formatPhone('123')).toBe('123')
    expect(formatPhone('')).toBe('')
  })
})

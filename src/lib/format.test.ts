import { describe, expect, it } from 'vitest'
import { formatMoney, type Currency } from './format'

describe('formatMoney', () => {
  const cases: [Currency, number | string, string][] = [
    ['TRY', 1220, '₺1,220'], ['USD', 85, '$85'], ['NGN', 15000, '₦15,000'],
    ['TRY', 1220.5, '₺1,220.50'], ['USD', 85.5, '$85.50'], ['NGN', 15000.5, '₦15,000.50'],
    ['TRY', 0, '₺0'], ['USD', 0, '$0'], ['NGN', 0, '₦0'],
    ['TRY', -50, '−₺50'], ['USD', -85.5, '−$85.50'], ['NGN', -15000.01, '−₦15,000.01'],
    ['TRY', '1220.00', '₺1,220'], ['USD', '85.50', '$85.50'], ['NGN', '15000.01', '₦15,000.01'],
    ['TRY', 1.005, '₺1.01'], ['USD', 85.999, '$86'], ['NGN', 0.004, '₦0'],
    ['TRY', -0, '₺0'], ['USD', -0.004, '$0'], ['NGN', 999999999999.99, '₦999,999,999,999.99'],
  ]
  it.each(cases)('formats %s %s as %s', (currency, amount, expected) => {
    expect(formatMoney(amount, currency)).toBe(expected)
  })
  it.each([NaN, Infinity, -Infinity, '', ' ', 'not money', '1,220', 'Infinity'])('rejects invalid amount %s', (amount) => {
    expect(() => formatMoney(amount, 'TRY')).toThrow('Amount must be a finite number')
  })
})

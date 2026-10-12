export type Currency = 'TRY' | 'USD' | 'NGN'

const symbols: Record<Currency, string> = { TRY: '₺', USD: '$', NGN: '₦' }
const amountFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

/** Display only: whole amounts have no decimals; fractions have two, in every currency. */
export function formatMoney(amount: number | string, currency: Currency): string {
  if (typeof amount === 'string' && !/^[+-]?\d+(?:\.\d+)?$/.test(amount.trim())) {
    throw new TypeError('Amount must be a finite number')
  }
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) throw new TypeError('Amount must be a finite number')

  // Decide after rounding, so 85.999 displays as $86, not $86.00.
  const parts = amountFormatter.formatToParts(numericAmount)
  const isWhole = parts.some((part) => part.type === 'fraction' && part.value === '00')
  const digits = parts
    .filter((part) => part.type !== 'minusSign' && part.type !== 'plusSign')
    .filter((part) => !isWhole || (part.type !== 'decimal' && part.type !== 'fraction'))
    .map((part) => part.value)
    .join('')
  const sign = parts.some((part) => part.type === 'minusSign') ? '−' : ''
  return `${sign}${symbols[currency]}${digits}`
}

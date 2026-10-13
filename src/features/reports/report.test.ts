import { describe, expect, it } from 'vitest'
import { csvCell, reportCsv, exportName } from './report-export'
import {
  displayCell,
  findDefinition,
  rangeSchema,
  reportSchema,
  type Report,
} from './report-model'
describe('report export integrity', () => {
  it.each([
    '=SUM(A1:A2)',
    '+cmd',
    '-formula',
    '@formula',
    '\t=1',
    '\r=1',
    '\u0000 =1',
  ])('neutralizes untrusted spreadsheet formula %s', (value) =>
    expect(csvCell(value)).toBe(`"'${value}"`),
  )
  it('preserves numeric negative amounts as numbers', () =>
    expect(csvCell(-50.25)).toBe('-50.25'))
  it('escapes commas, quotes and newlines in supplier text', () =>
    expect(csvCell('Shop, "Peter"\nCampus')).toBe('"Shop, ""Peter""\nCampus"'))
  it('retains missing margins as blank CSV cells', () =>
    expect(csvCell(null)).toBe(''))
  it('keeps Unicode and a UTF-8 BOM with machine-readable money', () => {
    const data = {
      rows: [{ name: 'İşbank ₺ ₦', amount: 1500.25 }],
      from: '2026-10-01',
      to: '2026-10-31',
    } as unknown as Report
    const csv = reportCsv(data, [
      { key: 'name', label: 'Account' },
      { key: 'amount', label: 'Amount' },
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"İşbank ₺ ₦",1500.25')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it('exports all supplied rows, including beyond the screen page', () => {
    const data = {
      rows: Array.from({ length: 1205 }, (_, i) => ({ quantity: i })),
    } as unknown as Report
    expect(
      reportCsv(data, [{ key: 'quantity', label: 'Sold' }]).split('\r\n'),
    ).toHaveLength(1207)
  })
})
describe('report display and date validation', () => {
  it('uses two decimals only for fractional amounts in all currencies', () => {
    for (const [currency, whole, fraction] of [
      ['TRY', '₺100', '₺100.50'],
      ['USD', '$100', '$100.50'],
      ['NGN', '₦100', '₦100.50'],
    ]) {
      expect(
        displayCell(
          { amount: 100, currency },
          {
            key: 'amount',
            label: 'Amount',
            kind: 'money',
            currencyKey: 'currency',
          },
        ),
      ).toBe(whole)
      expect(
        displayCell(
          { amount: 100.5, currency },
          {
            key: 'amount',
            label: 'Amount',
            kind: 'money',
            currencyKey: 'currency',
          },
        ),
      ).toBe(fraction)
    }
  })
  it('shows server margin ratios as percentages without computing profit', () =>
    expect(
      displayCell(
        { amount: 0.365, unit: 'ratio' },
        { key: 'amount', label: 'Margin', kind: 'money', currencyKey: 'unit' },
      ),
    ).toBe('36.5%'))
  it('shows unavailable margin as a dash', () =>
    expect(
      displayCell(
        { amount: null, unit: 'ratio' },
        { key: 'amount', label: 'Margin', kind: 'money', currencyKey: 'unit' },
      ),
    ).toBe('—'))
  it('does not invent an unknown currency', () =>
    expect(() =>
      displayCell(
        { amount: 1, currency: 'EUR' },
        {
          key: 'amount',
          label: 'Amount',
          kind: 'money',
          currencyKey: 'currency',
        },
      ),
    ).toThrow('Report currency is unavailable'))
  it.each([
    { from: '2026-10-01', to: '2026-10-31' },
    { from: '2026-10-13', to: '2026-10-13' },
  ])('accepts inclusive business-date range', (r) =>
    expect(rangeSchema.safeParse(r).success).toBe(true),
  )
  it.each([
    { from: '2026-10-31', to: '2026-10-01' },
    { from: '2026-02-30', to: '2026-10-01' },
    { from: '', to: '' },
  ])('rejects invalid date ranges', (r) =>
    expect(rangeSchema.safeParse(r).success).toBe(false),
  )
  it('does not silently accept nonfinite server money', () =>
    expect(
      reportSchema.safeParse({
        report: 'sales',
        from: '2026-10-01',
        to: '2026-10-31',
        business_date: '2026-10-13',
        generated_at: '2026-10-13',
        previous_from: '2026-09-01',
        previous_to: '2026-09-30',
        summary: {},
        rows: [{ amount: Infinity }],
        total: 1,
        offset: 0,
      }).success,
    ).toBe(false))
  it('preserves separate extra counts for plate and standalone exports', () =>
    expect(findDefinition('extras')!.columns.map((c) => c.key)).toEqual([
      'extra_name',
      'on_plate',
      'standalone',
      'quantity',
      'revenue',
    ]))
  it('formats delivery times in Nicosia rather than the device zone', () =>
    expect(
      displayCell(
        { picked_up_at: '2026-10-13T12:00:00Z' },
        { key: 'picked_up_at', label: 'Picked up', kind: 'time' },
      ),
    ).toContain('15:00:00'))
})

describe('current outstanding scope', () => {
  it.each(['debts', 'unpaid', 'advances'])(
    'marks %s as current rather than a past snapshot',
    (name) => expect(findDefinition(name)?.current).toBe(true),
  )
  it('labels current export filenames independently of the chosen period', () => {
    const data = {
      scope: 'current',
      business_date: '2026-10-13',
      from: '2020-01-01',
      to: '2020-01-31',
    } as Report
    expect(exportName(findDefinition('debts')!, data, 'pdf')).toBe(
      'sfx-debts-outstanding-now-2026-10-13.pdf',
    )
  })
  it('keeps dated exports labelled with their report range', () => {
    const data = {
      scope: 'period',
      business_date: '2026-10-13',
      from: '2026-10-01',
      to: '2026-10-31',
    } as Report
    expect(exportName(findDefinition('sales')!, data, 'csv')).toBe(
      'sfx-sales-2026-10-01-to-2026-10-31.csv',
    )
  })
})

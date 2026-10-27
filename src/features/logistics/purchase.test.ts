import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  purchaseSchema,
  purchasePayload,
  itemSchema,
  quantitySchema,
  lineAmountSchema,
  changeSchema,
  logisticsAttemptSchema,
  purchaseQuoteSchema,
} from './purchase-model'
import { canVisit } from '@/features/auth/permissions'
import { runLogistics } from './logistics-api'
import { SaveError } from '@/features/orders/order-api'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/features/menu/menu-api', () => ({ client: () => ({ rpc }) }))
const values = {
  funding: 'advance' as const,
  advance_id: '60000000-0000-4000-8000-000000000001',
  account_id: '1',
  supplier: 'Metro Market',
  category_id: '1',
  rate: '47.9',
  due_date: '2026-10-20',
  note: 'Supplies',
  items: [
    {
      description: 'Chicken',
      quantity: '4.125',
      unit: 'kg',
      amount: '1,250.50',
    },
  ],
}
const attempt = {
  action: 'purchase' as const,
  request_id: '60000000-0000-4000-8000-000000000002',
  payload: { supplier: 'Metro Market' },
}
describe('M6 inputs and funding', () => {
  it('retains entered lines without sending a client total', () => {
    const p = purchasePayload(purchaseSchema.parse(values))
    expect(p.items[0]).toMatchObject({ quantity: '4.125', amount: '1250.50' })
    expect(p).not.toHaveProperty('amount')
    expect(p).not.toHaveProperty('amount_try')
    expect(p).not.toHaveProperty('rate')
    expect(p).not.toHaveProperty('account_id')
    expect(p).not.toHaveProperty('due_date')
  })
  it('credit strips inactive advance/account/rate and keeps due date optional', () => {
    const p = purchasePayload(
      purchaseSchema.parse({ ...values, funding: 'credit', due_date: '' }),
    )
    expect(p).toHaveProperty('on_credit', true)
    for (const key of [
      'advance_id',
      'account_id',
      'rate',
      'due_date',
      'receipt_path',
    ])
      expect(p).not.toHaveProperty(key)
  })
  it('account funding sends only its selected account and confirmed rate', () => {
    const p = purchasePayload(
      purchaseSchema.parse({ ...values, funding: 'account' }),
    )
    expect(p).toMatchObject({ account_id: 1, rate: '47.9' })
    expect(p).not.toHaveProperty('advance_id')
    expect(p).not.toHaveProperty('on_credit')
  })
  it('requires supplier, category and at least one line', () => {
    for (const v of [
      { ...values, supplier: ' ' },
      { ...values, category_id: '' },
      { ...values, items: [] },
    ])
      expect(purchaseSchema.safeParse(v).success).toBe(false)
  })
  it('validates funding-specific fields only', () => {
    expect(
      purchaseSchema.safeParse({
        ...values,
        funding: 'credit',
        advance_id: '',
        account_id: '',
        rate: 'bad',
        due_date: '',
      }).success,
    ).toBe(true)
    expect(
      purchaseSchema.safeParse({ ...values, advance_id: '' }).success,
    ).toBe(false)
    expect(
      purchaseSchema.safeParse({
        ...values,
        funding: 'account',
        account_id: '',
      }).success,
    ).toBe(false)
  })
  it.each(['0', '-1', 'NaN', 'Infinity', '1.0001'])(
    'rejects quantity %s',
    (quantity) => {
      expect(quantitySchema.safeParse(quantity).success).toBe(false)
    },
  )
  it('accepts zero-value lines while server requires a positive total', () => {
    expect(lineAmountSchema.parse('0')).toBe('0')
    expect(
      itemSchema.safeParse({ ...values.items[0], amount: '0' }).success,
    ).toBe(true)
  })
  it('rejects sub-cent lines, negative amounts and missing descriptions', () => {
    for (const amount of ['1.001', '-1', 'NaN', '1,00'])
      expect(lineAmountSchema.safeParse(amount).success).toBe(false)
    expect(
      itemSchema.safeParse({ ...values.items[0], description: ' ' }).success,
    ).toBe(false)
  })
  it('validates optional due date and limits item count', () => {
    expect(
      purchaseSchema.safeParse({
        ...values,
        funding: 'credit',
        due_date: '2026-02-30',
      }).success,
    ).toBe(false)
    expect(
      purchaseSchema.safeParse({
        ...values,
        items: Array(51).fill(values.items[0]),
      }).success,
    ).toBe(false)
  })
  it('requires positive cents for returned change', () => {
    for (const amount of ['0', '-1', '1.001'])
      expect(
        changeSchema.safeParse({
          advance_id: values.advance_id,
          account_id: '1',
          amount,
        }).success,
      ).toBe(false)
  })
  it('rejects damaged requests and incomplete previews', () => {
    expect(
      logisticsAttemptSchema.safeParse({ ...attempt, action: 'reverse' })
        .success,
    ).toBe(false)
    expect(
      logisticsAttemptSchema.safeParse({ ...attempt, request_id: 'bad' })
        .success,
    ).toBe(false)
    expect(
      purchaseQuoteSchema.safeParse({ amount: 900, remaining_after: 100 })
        .success,
    ).toBe(false)
  })
  it('allows Logistics and Admin but denies Operations for each new route', () => {
    for (const path of ['/purchases', '/purchases/new', '/advances']) {
      expect(canVisit('logistics', path)).toBe(true)
      expect(canVisit('admin', path)).toBe(true)
      expect(canVisit('operations', path)).toBe(false)
    }
  })
})
describe('M6 RPC recovery', () => {
  beforeEach(() => {
    rpc.mockReset()
  })
  it('replays the exact actor request without making a fresh nonce', async () => {
    rpc.mockResolvedValue({
      data: {
        action: 'purchase',
        id: values.advance_id,
        business_date: '2026-10-13',
        currency: 'TRY',
        amount: 900,
        amount_try: 900,
        debt_id: null,
      },
      error: null,
    })
    await runLogistics(attempt)
    await runLogistics(attempt)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc.mock.calls[0]).toEqual([
      'run_logistics_action',
      {
        p_action: 'purchase',
        p: attempt.payload,
        p_request_id: attempt.request_id,
      },
    ])
  })
  it('preserves database errors verbatim', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Amount must be between 0 and the 100.00 still held',
      },
    })
    await expect(runLogistics(attempt)).rejects.toMatchObject({
      message: 'Amount must be between 0 and the 100.00 still held',
      uncertain: false,
    })
  })
  it.each(['42501', 'PGRST301', '08006', ''])(
    'retains request for uncertain code %s',
    async (code) => {
      rpc.mockResolvedValue({
        data: null,
        error: { code, message: 'Retry confirmation' },
      })
      await expect(runLogistics(attempt)).rejects.toMatchObject({
        uncertain: true,
      })
    },
  )
  it('retains a thrown network failure', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    const failure = await runLogistics(attempt).catch((e) => e)
    expect(failure).toBeInstanceOf(SaveError)
    expect(failure.uncertain).toBe(true)
    expect(failure.message).toBe('Failed to fetch')
  })
  it('requires a complete matching confirmation', async () => {
    for (const data of [
      null,
      { action: 'purchase', id: values.advance_id },
      {
        action: 'change',
        id: 1,
        business_date: '2026-10-13',
        currency: 'TRY',
        amount: 100,
        remaining_after: 0,
      },
    ]) {
      rpc.mockResolvedValue({ data, error: null })
      await expect(runLogistics(attempt)).rejects.toMatchObject({
        uncertain: true,
      })
    }
  })
})

// Inventory attribution must survive validation before money reaches the RPC.
describe('inventory purchase attribution', () => {
  it('preserves the inventory id on validated purchase lines', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const result = itemSchema.parse({ inventory_item_id: id, description: 'Rice', quantity: '2', unit: 'kg', amount: '100' })
    expect(result.inventory_item_id).toBe(id)
    expect(result.amount).toBe('100')
  })
  it('requires actual purchase units for linked items', () => {
    expect(itemSchema.safeParse({ inventory_item_id: '00000000-0000-4000-8000-000000000001', description: 'Rice', quantity: '2', unit: '', amount: '100' }).success).toBe(false)
  })
})

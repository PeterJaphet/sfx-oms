import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  withdrawalSchema,
  withdrawalPayload,
  rateSchema,
  signedAmountSchema,
  transferSchema,
  adjustmentSchema,
  attemptSchema,
  withdrawalQuoteSchema,
} from './money-model'
import { canVisit } from '@/features/auth/permissions'
import { runMoney } from './money-api'
import { SaveError } from '@/features/orders/order-api'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/features/menu/menu-api', () => ({ client: () => ({ rpc }) }))
const values = {
  kind: 'advance' as const,
  account_id: '1',
  amount: '2,500.50',
  purpose: 'Buy ingredients',
  category_id: '1',
  recipient_id: '00000000-0000-4000-8000-000000000001',
  rate: '',
}
const attempt = {
  action: 'withdraw' as const,
  request_id: '00000000-0000-4000-8000-000000000002',
  payload: { amount: '2500.50' },
}
describe('M5 staff input and roles', () => {
  it('requires category for advances as well as expenses', () => {
    for (const kind of ['advance', 'direct_expense'] as const)
      expect(
        withdrawalSchema.safeParse({ ...values, kind, category_id: '' })
          .success,
      ).toBe(false)
  })
  it('requires an advance recipient but omits it for direct expenses', () => {
    expect(
      withdrawalSchema.safeParse({ ...values, recipient_id: '' }).success,
    ).toBe(false)
    const expense = withdrawalSchema.parse({
      ...values,
      kind: 'direct_expense',
      recipient_id: '',
    })
    expect(withdrawalPayload(expense)).not.toHaveProperty('recipient_id')
  })
  it('normalizes grouped amounts without calculating totals', () => {
    expect(withdrawalPayload(withdrawalSchema.parse(values))).toMatchObject({
      amount: '2500.50',
      account_id: 1,
      category_id: 1,
    })
  })
  it.each(['0', '-1', 'NaN', 'Infinity', '2.501'])(
    'rejects invalid withdrawal %s',
    (amount) => {
      expect(withdrawalSchema.safeParse({ ...values, amount }).success).toBe(
        false,
      )
    },
  )
  it('allows six decimals for rates and two for signed adjustments', () => {
    expect(rateSchema.parse('0.027123')).toBe('0.027123')
    expect(signedAmountSchema.parse('-1,250.50')).toBe('-1250.50')
    for (const rate of ['0', '-1', 'NaN', '0.0271234'])
      expect(rateSchema.safeParse(rate).success).toBe(false)
    for (const amount of ['0', '-0', '1.001', 'NaN'])
      expect(signedAmountSchema.safeParse(amount).success).toBe(false)
  })
  it('requires distinct transfer accounts', () => {
    expect(
      transferSchema.safeParse({
        from_account: '1',
        to_account: '1',
        amount_from: '10',
        amount_to: '10',
        note: '',
      }).success,
    ).toBe(false)
  })
  it('requires an adjustment reason', () => {
    expect(
      adjustmentSchema.safeParse({
        account_id: '1',
        amount: '-10',
        reason: '  ',
        rate: '',
      }).success,
    ).toBe(false)
  })
  it('protects Admin pages and excludes Logistics from Money', () => {
    for (const path of [
      '/money',
      '/money/withdraw',
      '/money/history',
      '/money/expenses',
    ]) {
      expect(canVisit('operations', path)).toBe(true)
      expect(canVisit('logistics', path)).toBe(false)
    }
    for (const path of ['/money/approvals', '/money/tools']) {
      expect(canVisit('operations', path)).toBe(false)
      expect(canVisit('admin', path)).toBe(true)
    }
  })
  it('rejects malformed saved requests and incomplete server previews', () => {
    expect(
      attemptSchema.safeParse({ ...attempt, request_id: 'bad' }).success,
    ).toBe(false)
    expect(
      attemptSchema.safeParse({ ...attempt, action: 'delete' }).success,
    ).toBe(false)
    expect(
      withdrawalQuoteSchema.safeParse({ amount: 2500, balance_after: 7500 })
        .success,
    ).toBe(false)
  })
})
describe('M5 RPC confirmation', () => {
  beforeEach(() => {
    rpc.mockReset()
  })
  it('preserves the nonce and payload on retry', async () => {
    rpc.mockResolvedValue({
      data: { action: 'withdraw', id: 'saved', status: 'approved' },
      error: null,
    })
    await runMoney(attempt)
    await runMoney(attempt)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc.mock.calls[0]).toEqual([
      'run_money_action',
      {
        p_action: 'withdraw',
        p: attempt.payload,
        p_request_id: attempt.request_id,
      },
    ])
  })
  it('preserves a definite database rejection verbatim', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Not enough money in this account (balance 20.00)',
      },
    })
    await expect(runMoney(attempt)).rejects.toMatchObject({
      message: 'Not enough money in this account (balance 20.00)',
      uncertain: false,
    })
  })
  it.each(['42501', 'PGRST301', '08006', ''])(
    'retains a request with uncertain code %s',
    async (code) => {
      rpc.mockResolvedValue({
        data: null,
        error: { code, message: 'Retry after sign in' },
      })
      await expect(runMoney(attempt)).rejects.toMatchObject({ uncertain: true })
    },
  )
  it('retains a request when fetch rejects', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    const caught = await runMoney(attempt).catch((error) => error)
    expect(caught).toBeInstanceOf(SaveError)
    expect(caught.message).toBe('Failed to fetch')
    expect(caught.uncertain).toBe(true)
  })
  it('rejects a missing or mismatched confirmation as uncertain', async () => {
    for (const data of [
      null,
      { action: 'reverse' },
      { action: 'withdraw' },
      { action: 'withdraw', id: 'saved' },
    ]) {
      rpc.mockResolvedValue({ data, error: null })
      await expect(runMoney(attempt)).rejects.toMatchObject({ uncertain: true })
    }
  })
})

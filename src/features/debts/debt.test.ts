import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  openingSchema,
  recordSchema,
  recordPayload,
  settlementSchema,
  debtAttemptSchema,
  openingQuoteSchema,
} from './debt-model'
import { canVisit } from '@/features/auth/permissions'
import { runDebt } from './debt-api'
import { SaveError } from '@/features/orders/order-api'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/features/menu/menu-api', () => ({ client: () => ({ rpc }) }))
const values = {
  kind: 'loan' as const,
  direction: 'we_owe' as const,
  counterparty: 'Hilary',
  description: 'Loan into business',
  currency: 'USD' as const,
  amount: '100',
  due_date: '',
  account_id: '4',
  rate: '47.9',
}
const attempt = {
  action: 'record' as const,
  request_id: '70000000-0000-4000-8000-000000000001',
  payload: { amount: '100' },
}
describe('M7 inputs and permissions', () => {
  it('allows a zero opening and signed openings with cents', () => {
    expect(
      openingSchema.parse({
        amount: '0',
        reason: 'Opening at go-live',
        rate: '',
      }).amount,
    ).toBe('0')
    expect(
      openingSchema.parse({
        amount: '-1,250.50',
        reason: 'Opening at go-live',
        rate: '',
      }).amount,
    ).toBe('-1250.50')
  })
  it.each(['NaN', 'Infinity', '1.001', '1,00'])(
    'rejects opening amount %s',
    (amount) => {
      expect(
        openingSchema.safeParse({ amount, reason: 'Opening', rate: '' })
          .success,
      ).toBe(false)
    },
  )
  it('opening debts strip every money-moving field', () => {
    const p = recordPayload(recordSchema.parse(values), true)
    expect(p).toMatchObject({ opening: true, amount: '100', currency: 'USD' })
    expect(p).not.toHaveProperty('account_id')
    expect(p).not.toHaveProperty('rate')
  })
  it('manual debt is not mistaken for a loan', () => {
    const p = recordPayload(recordSchema.parse({ ...values, kind: 'manual' }))
    expect(p).not.toHaveProperty('account_id')
    expect(p).not.toHaveProperty('rate')
    expect(p).not.toHaveProperty('amount_try')
  })
  it('loan retains its own-currency amount and selected account', () => {
    expect(recordPayload(recordSchema.parse(values))).toMatchObject({
      amount: '100',
      account_id: 4,
      currency: 'USD',
      rate: '47.9',
      opening: false,
    })
  })
  it.each(['0', '-1', '1.001', 'NaN'])('rejects debt amount %s', (amount) => {
    expect(recordSchema.safeParse({ ...values, amount }).success).toBe(false)
  })
  it('requires counterparty, description and loan account', () => {
    for (const v of [
      { ...values, counterparty: ' ' },
      { ...values, description: ' ' },
      { ...values, account_id: '' },
    ])
      expect(recordSchema.safeParse(v).success).toBe(false)
  })
  it('keeps due date optional but validates it when entered', () => {
    expect(recordSchema.safeParse(values).success).toBe(true)
    expect(
      recordSchema.safeParse({ ...values, due_date: '2026-02-30' }).success,
    ).toBe(false)
  })
  it('permits omitted covers for same currency and rejects bad entered covers', () => {
    expect(
      settlementSchema.safeParse({
        account_id: '1',
        amount: '100',
        covers: '',
        note: '',
      }).success,
    ).toBe(true)
    for (const covers of ['0', '-1', '1.001'])
      expect(
        settlementSchema.safeParse({
          account_id: '1',
          amount: '100',
          covers,
          note: '',
        }).success,
      ).toBe(false)
  })
  it('rejects malformed requests and incomplete opening previews', () => {
    expect(
      debtAttemptSchema.safeParse({ ...attempt, action: 'delete' }).success,
    ).toBe(false)
    expect(
      debtAttemptSchema.safeParse({ ...attempt, request_id: 'bad' }).success,
    ).toBe(false)
    expect(
      openingQuoteSchema.safeParse({ amount: 0, balance_after: 0 }).success,
    ).toBe(false)
  })
  it('Operations can read/settle debts but cannot enter setup; Logistics is denied', () => {
    expect(canVisit('operations', '/debts')).toBe(true)
    expect(canVisit('operations', '/setup')).toBe(false)
    for (const path of ['/debts', '/setup']) {
      expect(canVisit('admin', path)).toBe(true)
      expect(canVisit('logistics', path)).toBe(false)
    }
  })
})
describe('M7 safe RPC confirmation', () => {
  beforeEach(() => {
    rpc.mockReset()
  })
  it('keeps the exact request UUID for retries', async () => {
    rpc.mockResolvedValue({
      data: {
        action: 'record',
        id: '70000000-0000-4000-8000-000000000002',
        amount: 100,
        currency: 'USD',
      },
      error: null,
    })
    await runDebt(attempt)
    await runDebt(attempt)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc.mock.calls[0]).toEqual([
      'run_debt_action',
      {
        p_action: 'record',
        p: attempt.payload,
        p_request_id: attempt.request_id,
      },
    ])
  })
  it('preserves the above-limit database message', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Payments over ₺2000.00 need Admin' },
    })
    await expect(runDebt(attempt)).rejects.toMatchObject({
      message: 'Payments over ₺2000.00 need Admin',
      uncertain: false,
    })
  })
  it.each(['42501', 'PGRST301', '08006', ''])(
    'retains uncertain request code %s',
    async (code) => {
      rpc.mockResolvedValue({
        data: null,
        error: { code, message: 'Retry confirmation' },
      })
      await expect(runDebt(attempt)).rejects.toMatchObject({ uncertain: true })
    },
  )
  it('retains a thrown network error', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    const failure = await runDebt(attempt).catch((e) => e)
    expect(failure).toBeInstanceOf(SaveError)
    expect(failure.uncertain).toBe(true)
    expect(failure.message).toBe('Failed to fetch')
  })
  it('requires the correct complete confirmation', async () => {
    for (const data of [
      null,
      { action: 'record', id: '70000000-0000-4000-8000-000000000002' },
      { action: 'cancel', id: '70000000-0000-4000-8000-000000000002' },
    ]) {
      rpc.mockResolvedValue({ data, error: null })
      await expect(runDebt(attempt)).rejects.toMatchObject({ uncertain: true })
    }
  })
})

import { assertOnline } from '@/lib/connectivity'
import { z } from 'zod'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { Json } from '@/lib/db.types'
import { client } from '@/features/menu/menu-api'
import { SaveError } from '@/features/orders/order-api'
import {
  balanceSchema,
  currencySchema,
  withdrawalQuoteSchema,
  type MoneyAttempt,
} from './money-model'

export async function refreshMoney(qc: QueryClient) {
  await Promise.all(
    [
      'money',
      'account-balances',
      'orders',
      'order-payments',
      'activity',
      'reports',
      'advances',
      'debts',
      'close',
    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  )
}
export function useMoneyReference() {
  return useQuery({
    queryKey: ['money', 'reference'],
    staleTime: 15000,
    refetchInterval: 15000,
    queryFn: async () => {
      const db = client()
      const [balances, accounts, categories, people, rates, settings, day] =
        await Promise.all([
          db
            .from('v_account_balances')
            .select('id,name,currency,balance,balance_try_estimate')
            .order('sort_order'),
          db.from('accounts').select('*').order('sort_order'),
          db.from('expense_categories').select('*').order('sort_order'),
          db
            .from('profiles')
            .select('id,full_name,role,is_active')
            .order('full_name'),
          db
            .from('fx_rates')
            .select('*')
            .order('effective_date', { ascending: false })
            .order('id', { ascending: false }),
          db.from('settings').select('*').single(),
          db.rpc('business_date'),
        ])
      for (const result of [
        balances,
        accounts,
        categories,
        people,
        rates,
        settings,
        day,
      ])
        if (result.error) throw new Error(result.error.message)
      return {
        balances: z.array(balanceSchema).parse(balances.data),
        accounts: accounts.data!.map((a) => ({
          ...a,
          currency: currencySchema.parse(a.currency),
        })),
        categories: categories.data!,
        people: people.data!,
        rates: rates.data!,
        settings: settings.data!,
        day: z.string().parse(day.data),
      }
    },
  })
}
export async function quoteWithdrawal(p: Json) {
  const result = await client().rpc('quote_withdrawal', { p })
  if (result.error) throw new Error(result.error.message)
  return withdrawalQuoteSchema.parse(result.data)
}
export async function runMoney(attempt: MoneyAttempt) {
  assertOnline()
  let result
  try {
    result = await client().rpc('run_money_action', {
      p_action: attempt.action,
      p: attempt.payload as Json,
      p_request_id: attempt.request_id,
    })
  } catch (error) {
    throw new SaveError(
      error instanceof Error ? error.message : String(error),
      true,
    )
  }
  if (result.error)
    throw new SaveError(
      result.error.message,
      !result.error.code || result.error.code === 'SFX_OFFLINE' ||
        result.error.code === '42501' ||
        result.error.code.startsWith('PGRST') ||
        result.error.code.startsWith('08'),
    )
  const data = z
    .object({
      action: z.string(),
      id: z.union([z.string().min(1), z.number().positive()]).optional(),
      status: z
        .enum(['pending_approval', 'approved', 'rejected', 'reversed'])
        .optional(),
    })
    .safeParse(result.data)
  if (
    !data.success ||
    data.data.action !== attempt.action ||
    (['withdraw', 'decide', 'transfer', 'adjust', 'reverse'].includes(
      attempt.action,
    ) &&
      !data.data.id) ||
    (['withdraw', 'decide'].includes(attempt.action) && !data.data.status)
  )
    throw new SaveError(
      'Money confirmation was not received; retry the same request',
      true,
    )
  return data.data
}
export async function loadAccountEntries(id: number) {
  const result = await client()
    .from('ledger_entries')
    .select('*')
    .eq('account_id', id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(20)
  if (result.error) throw new Error(result.error.message)
  const reversals = result.data.length
    ? await client()
        .from('ledger_entries')
        .select('reverses_id')
        .in(
          'reverses_id',
          result.data.map((e) => e.id),
        )
    : { data: [], error: null }
  if (reversals.error) throw new Error(reversals.error.message)
  const reversed = new Set(reversals.data!.map((e) => e.reverses_id))
  return result.data.map((e) => ({ ...e, isReversed: reversed.has(e.id) }))
}
export async function loadWithdrawals(status: string, offset: number) {
  const db = client()
  let request = db
    .from('withdrawals')
    .select('*')
    .order('requested_at', { ascending: false })
    .order('id')
    .range(offset, offset + 49)
  if (status !== 'all')
    request = request.eq(
      'status',
      status as 'pending_approval' | 'approved' | 'rejected' | 'reversed',
    )
  const result = await request
  if (result.error) throw new Error(result.error.message)
  return result.data
}
export function usePendingCount(enabled: boolean) {
  return useQuery({
    queryKey: ['money', 'pending-count'],
    enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      const result = await client()
        .from('withdrawals')
        .select('id', { head: true, count: 'exact' })
        .eq('status', 'pending_approval')
      if (result.error) throw new Error(result.error.message)
      if (result.count === null) throw new Error('Approval count is missing')
      return result.count
    },
  })
}
export async function loadRecentExpenses() {
  const result = await client()
    .from('v_expenses')
    .select('*')
    .order('business_date', { ascending: false })
    .order('id')
    .limit(20)
  if (result.error) throw new Error(result.error.message)
  return result.data.map((e) =>
    z
      .object({
        id: z.string(),
        business_date: z.string(),
        category: z.string(),
        description: z.string(),
        amount_try: z.number(),
        kind: z.string(),
        source: z.string(),
      })
      .parse(e),
  )
}

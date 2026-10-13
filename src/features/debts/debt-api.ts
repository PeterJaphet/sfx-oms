import { assertOnline } from '@/lib/connectivity'
import { z } from 'zod'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { Json } from '@/lib/db.types'
import { client } from '@/features/menu/menu-api'
import { SaveError } from '@/features/orders/order-api'
import { currencySchema } from '@/features/money/money-model'
import {
  debtSchema,
  setupSchema,
  openingQuoteSchema,
  recordQuoteSchema,
  settlementQuoteSchema,
  summarySchema,
  unpaidSchema,
  debtResultSchema,
  type DebtAttempt,
} from './debt-model'
export function useDebtReference() {
  return useQuery({
    queryKey: ['debts', 'reference'],
    staleTime: 15000,
    refetchInterval: 15000,
    queryFn: async () => {
      const db = client()
      const [accounts, rates, settings] = await Promise.all([
        db
          .from('accounts')
          .select('*')
          .eq('is_active', true)
          .order('sort_order'),
        db
          .from('fx_rates')
          .select('*')
          .order('effective_date', { ascending: false })
          .order('id', { ascending: false }),
        db.from('settings').select('*').single(),
      ])
      for (const r of [accounts, rates, settings])
        if (r.error) throw new Error(r.error.message)
      return {
        accounts: accounts.data!.map((a) => ({
          ...a,
          currency: currencySchema.parse(a.currency),
        })),
        rates: rates.data!,
        settings: settings.data!,
      }
    },
  })
}
export async function loadSetup() {
  const r = await client().rpc('get_setup_accounts')
  if (r.error) throw new Error(r.error.message)
  return setupSchema.parse(r.data)
}
export async function loadDebts(
  state = 'open',
  direction = 'all',
  offset = 0,
  id?: string,
  search = '',
) {
  const r = await client().rpc('list_debts', {
    p_state: state,
    p_direction: direction,
    p_offset: offset,
    ...(id ? { p_id: id } : {}),
    p_search: search,
  })
  if (r.error) throw new Error(r.error.message)
  return z.array(debtSchema).parse(r.data)
}
export async function loadSummary() {
  const r = await client().rpc('debt_summary')
  if (r.error) throw new Error(r.error.message)
  return summarySchema.parse(r.data)
}
export async function loadUnpaid(offset = 0) {
  const r = await client().rpc('list_unpaid_customers', { p_offset: offset })
  if (r.error) throw new Error(r.error.message)
  return z.array(unpaidSchema).parse(r.data)
}
export async function quoteOpening(p: Json) {
  const r = await client().rpc('quote_opening', { p })
  if (r.error) throw new Error(r.error.message)
  return openingQuoteSchema.parse(r.data)
}
export async function quoteRecord(p: Json) {
  const r = await client().rpc('quote_record_debt', { p })
  if (r.error) throw new Error(r.error.message)
  return recordQuoteSchema.parse(r.data)
}
export async function quoteSettlement(p: Json) {
  const r = await client().rpc('quote_debt_settlement', { p })
  if (r.error) throw new Error(r.error.message)
  return settlementQuoteSchema.parse(r.data)
}
export async function loadDebtHistory(id: string) {
  const db = client()
  const [entries, settlements] = await Promise.all([
    db
      .from('ledger_entries')
      .select(
        'id,account_id,entry_type,amount,amount_try,business_date,note,reverses_id',
      )
      .eq('debt_id', id)
      .order('id'),
    db.from('debt_settlements').select('*').eq('debt_id', id).order('id'),
  ])
  for (const r of [entries, settlements])
    if (r.error) throw new Error(r.error.message)
  return { entries: entries.data!, settlements: settlements.data! }
}
export async function runDebt(attempt: DebtAttempt) {
  assertOnline()
  let r
  try {
    r = await client().rpc('run_debt_action', {
      p_action: attempt.action,
      p: attempt.payload as Json,
      p_request_id: attempt.request_id,
    })
  } catch (e) {
    throw new SaveError(e instanceof Error ? e.message : String(e), true)
  }
  if (r.error)
    throw new SaveError(
      r.error.message,
      !r.error.code || r.error.code === 'SFX_OFFLINE' ||
        r.error.code === '42501' ||
        r.error.code.startsWith('PGRST') ||
        r.error.code.startsWith('08'),
    )
  const parsed = debtResultSchema.safeParse(r.data)
  if (!parsed.success || parsed.data.action !== attempt.action)
    throw new SaveError(
      'Debt confirmation was not received; retry the same request',
      true,
    )
  return parsed.data
}
export async function refreshDebts(qc: QueryClient) {
  await Promise.all(
    ['debts', 'money', 'account-balances', 'reports', 'close', 'orders'].map(
      (k) => qc.invalidateQueries({ queryKey: [k] }),
    ),
  )
}

import { z } from 'zod'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { Json } from '@/lib/db.types'
import { client } from '@/features/menu/menu-api'
import { SaveError } from '@/features/orders/order-api'
import { currencySchema } from '@/features/money/money-model'
import {
  advanceSchema,
  purchaseRowSchema,
  purchaseQuoteSchema,
  changeQuoteSchema,
  logisticsResultSchema,
  type LogisticsAttempt,
} from './purchase-model'
export async function loadAdvances(state = 'active', offset = 0) {
  const r = await client().rpc('list_logistics_advances', {
    p_state: state,
    p_offset: offset,
  })
  if (r.error) throw new Error(r.error.message)
  return z.array(advanceSchema).parse(r.data)
}
export function useActiveAdvances() {
  return useQuery({
    queryKey: ['logistics', 'advances', 'active'],
    queryFn: () => loadAdvances(),
    refetchInterval: 15000,
  })
}
export async function loadPurchases(offset = 0, id?: string) {
  const r = await client().rpc('list_logistics_purchases', {
    p_offset: offset,
    ...(id ? { p_id: id } : {}),
  })
  if (r.error) throw new Error(r.error.message)
  return z.array(purchaseRowSchema).parse(r.data)
}
export async function loadPurchaseItems(id: string) {
  const r = await client()
    .from('purchase_items')
    .select('*')
    .eq('purchase_id', id)
    .order('id')
  if (r.error) throw new Error(r.error.message)
  return r.data
}
export function useLogisticsReference() {
  return useQuery({
    queryKey: ['logistics', 'reference'],
    staleTime: 15000,
    refetchInterval: 15000,
    queryFn: async () => {
      const db = client()
      const [accounts, categories, rates, day, suppliers] = await Promise.all([
        db.from('accounts').select('*').order('sort_order'),
        db.from('expense_categories').select('*').order('sort_order'),
        db
          .from('fx_rates')
          .select('*')
          .order('effective_date', { ascending: false })
          .order('id', { ascending: false }),
        db.rpc('business_date'),
        db
          .from('purchases')
          .select('supplier')
          .order('logged_at', { ascending: false })
          .limit(100),
      ])
      for (const r of [accounts, categories, rates, day, suppliers])
        if (r.error) throw new Error(r.error.message)
      return {
        accounts: accounts.data!.map((a) => ({
          ...a,
          currency: currencySchema.parse(a.currency),
        })),
        categories: categories.data!,
        rates: rates.data!,
        day: z.string().parse(day.data),
        suppliers: [...new Set(suppliers.data!.map((s) => s.supplier))],
      }
    },
  })
}
export async function quotePurchase(p: Json) {
  const r = await client().rpc('quote_purchase', { p })
  if (r.error) throw new Error(r.error.message)
  return purchaseQuoteSchema.parse(r.data)
}
export async function quoteChange(p: Json) {
  const r = await client().rpc('quote_return_change', { p })
  if (r.error) throw new Error(r.error.message)
  return changeQuoteSchema.parse(r.data)
}
export async function runLogistics(attempt: LogisticsAttempt) {
  let r
  try {
    r = await client().rpc('run_logistics_action', {
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
      !r.error.code ||
        r.error.code === '42501' ||
        r.error.code.startsWith('PGRST') ||
        r.error.code.startsWith('08'),
    )
  const parsed = logisticsResultSchema.safeParse(r.data)
  if (!parsed.success || parsed.data.action !== attempt.action)
    throw new SaveError(
      'Logistics confirmation was not received; retry the same request',
      true,
    )
  return parsed.data
}
export async function refreshLogistics(qc: QueryClient) {
  await Promise.all(
    [
      'logistics',
      'money',
      'advances',
      'account-balances',
      'reports',
      'debts',
      'close',
    ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
  )
}

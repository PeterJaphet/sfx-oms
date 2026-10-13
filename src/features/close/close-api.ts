import { assertOnline } from '@/lib/connectivity'
import { z } from 'zod'
import type { QueryClient } from '@tanstack/react-query'
import { client } from '@/features/menu/menu-api'
import { SaveError } from '@/features/orders/order-api'
import {
  closeContextSchema,
  closeQuoteSchema,
  historyCloseSchema,
  savedCloseSchema,
  type CloseAttempt,
} from './close-model'
export async function loadCloseContext(date?: string) {
  const r = await client().rpc('get_close_context', {
    ...(date ? { p_date: date } : {}),
  })
  if (r.error) throw new Error(r.error.message)
  return closeContextSchema.parse(r.data)
}
export async function quoteClose(p: Record<string, string | number>) {
  const r = await client().rpc('quote_close', { p })
  if (r.error) throw new Error(r.error.message)
  return closeQuoteSchema.parse(r.data)
}
export async function loadCloseHistory(offset: number) {
  const r = await client().rpc('list_day_closes', { p_offset: offset })
  if (r.error) throw new Error(r.error.message)
  return z.array(historyCloseSchema).parse(r.data)
}
export async function runClose(attempt: CloseAttempt) {
  assertOnline()
  const r = await client().rpc('run_close', {
    p: attempt.payload,
    p_request_id: attempt.request_id,
  })
  if (r.error)
    throw new SaveError(
      r.error.message,
      !r.error.code || r.error.code === 'SFX_OFFLINE' ||
        r.error.code.startsWith('PGRST') ||
        r.error.code.startsWith('08') ||
        r.error.code === '42501',
    )
  const parsed = savedCloseSchema.safeParse(r.data)
  if (!parsed.success)
    throw new SaveError(
      'Close confirmation was not received; retry the same close',
      true,
    )
  return parsed.data
}
export async function refreshClose(qc: QueryClient) {
  await Promise.all(
    [
      'close',
      'financial-day',
      'account-balances',
      'money',
      'orders',
      'debts',
      'logistics',
      'order-reference',
      'order-quote',
    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  )
}

import { createContext, useContext } from 'react'
import type { Json } from '@/lib/db.types'
import type { MoneyAction, MoneyAttempt } from './money-model'
import type { useMoneyReference, runMoney } from './money-api'
export type MoneyState = {
  reference: ReturnType<typeof useMoneyReference>
  pending: MoneyAttempt | null
  busy: boolean
  error: string | undefined
  last: Awaited<ReturnType<typeof runMoney>> | null
  send: (
    action: MoneyAction,
    payload: Record<string, Json | undefined>,
  ) => Promise<void>
  retry: () => Promise<void>
}
export const MoneyContext = createContext<MoneyState | null>(null)
export function useMoney() {
  const value = useContext(MoneyContext)
  if (!value) throw new Error('MoneyProvider is missing')
  return value
}

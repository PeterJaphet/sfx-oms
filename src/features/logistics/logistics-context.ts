import { createContext, useContext } from 'react'
import type { Json } from '@/lib/db.types'
import type { LogisticsAttempt, LogisticsResult } from './purchase-model'
import type { useLogisticsReference } from './logistics-api'
export type LogisticsState = {
  reference: ReturnType<typeof useLogisticsReference>
  pending: LogisticsAttempt | null
  busy: boolean
  last: LogisticsResult | null
  send: (
    action: LogisticsAttempt['action'],
    payload: Record<string, Json | undefined>,
  ) => Promise<LogisticsResult>
}
export const LogisticsContext = createContext<LogisticsState | null>(null)
export function useLogistics() {
  const value = useContext(LogisticsContext)
  if (!value) throw new Error('LogisticsProvider is missing')
  return value
}

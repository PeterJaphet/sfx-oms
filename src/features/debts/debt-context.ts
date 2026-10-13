import { createContext, useContext } from 'react'
import type { Json } from '@/lib/db.types'
import type { DebtAttempt, DebtResult } from './debt-model'
import type { useDebtReference } from './debt-api'
export type DebtState = {
  reference: ReturnType<typeof useDebtReference>
  pending: DebtAttempt | null
  busy: boolean
  last: DebtResult | null
  send: (
    action: DebtAttempt['action'],
    payload: Record<string, Json | undefined>,
  ) => Promise<DebtResult>
}
export const DebtContext = createContext<DebtState | null>(null)
export function useDebt() {
  const v = useContext(DebtContext)
  if (!v) throw new Error('DebtProvider is missing')
  return v
}

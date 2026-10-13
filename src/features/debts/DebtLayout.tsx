import { assertOnline } from '@/lib/connectivity'
import { useRef, useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { photoId } from '@/features/menu/menu-photos'
import { SaveError } from '@/features/orders/order-api'
import { formatMoney } from '@/lib/format'
import type { Json } from '@/lib/db.types'
import { DebtContext } from './debt-context'
import {
  debtAttemptSchema,
  type DebtAttempt,
  type DebtResult,
} from './debt-model'
import { refreshDebts, runDebt, useDebtReference } from './debt-api'
export default function DebtLayout() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const reference = useDebtReference()
  const key = `sfx-debt-v1:${profile!.id}`
  const lock = useRef(false)
  const [pending, setPending] = useState<DebtAttempt | null>(() => {
    try {
      const saved = sessionStorage.getItem(key)
      return saved ? debtAttemptSchema.parse(JSON.parse(saved)) : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<DebtResult | null>(null)
  async function execute(attempt: DebtAttempt) {
  assertOnline()
    if (lock.current) throw new Error('A Debt request is already saving')
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      sessionStorage.setItem(key, JSON.stringify(attempt))
      setPending(attempt)
      const result = await runDebt(attempt)
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* Confirmed requests can safely be replayed. */
      }
      setPending(null)
      setLast(result)
      toast.dismiss('m7-save-error')
      toast.success('Debt request confirmed', { id: 'm7-save-success' })
      return result
    } catch (e) {
      const failure = e as Error
      setError(failure.message)
      toast.error(failure.message, { id: 'm7-save-error' })
      if (failure instanceof SaveError ? !failure.uncertain : !pending) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* Storage may be unavailable. */
        }
        setPending(null)
      }
      throw e
    } finally {
      try {
        await refreshDebts(qc)
      } finally {
        setBusy(false)
        lock.current = false
      }
    }
  }
  async function send(
    action: DebtAttempt['action'],
    payload: Record<string, Json | undefined>,
  ) {
    if (pending) throw new Error('Confirm the pending Debt request first')
    setLast(null)
    return execute({
      action,
      payload: JSON.parse(JSON.stringify(payload)),
      request_id: photoId(),
    })
  }
  return (
    <DebtContext.Provider value={{ reference, pending, busy, last, send }}>
      {pending ? (
        <div
          role="alert"
          className="mb-4 space-y-3 rounded-xl bg-amber-soft p-4 text-amber-ink"
        >
          <p>
            Debt confirmation pending. Retry the same {pending.action} request
            safely; new debt and setup writes are paused.
          </p>
          {error ? <p className="break-words text-sm">{error}</p> : null}
          <Button requiresOnline
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void execute(pending).catch(() => {})
            }}
          >
            Retry debt confirmation
          </Button>
        </div>
      ) : null}
      {last ? (
        <div
          role="status"
          className="mb-4 space-y-2 rounded-xl bg-ok-soft p-4 text-ok"
        >
          <p>
            {last.action === 'opening'
              ? `Opening recorded · ${formatMoney(last.amount, last.currency)}`
              : last.action === 'record'
                ? `Debt recorded · ${formatMoney(last.amount, last.currency)}`
                : last.action === 'settle'
                  ? 'Settlement confirmed'
                  : 'Debt cancelled'}
          </p>
          {last.action !== 'opening' ? (
            <Button asChild variant="secondary">
              <Link
                to={`/debts?debt=${last.action === 'settle' ? last.debt_id : last.id}`}
              >
                View debt
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      <Outlet />
    </DebtContext.Provider>
  )
}

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
import { LogisticsContext } from './logistics-context'
import {
  logisticsAttemptSchema,
  type LogisticsAttempt,
  type LogisticsResult,
} from './purchase-model'
import {
  refreshLogistics,
  runLogistics,
  useLogisticsReference,
} from './logistics-api'
export default function LogisticsLayout() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const reference = useLogisticsReference()
  const key = `sfx-logistics-v1:${profile!.id}`
  const lock = useRef(false)
  const [pending, setPending] = useState<LogisticsAttempt | null>(() => {
    try {
      const saved = sessionStorage.getItem(key)
      return saved ? logisticsAttemptSchema.parse(JSON.parse(saved)) : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<LogisticsResult | null>(null)
  async function execute(attempt: LogisticsAttempt) {
  assertOnline()
    if (lock.current) throw new Error('A Logistics request is already saving')
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      sessionStorage.setItem(key, JSON.stringify(attempt))
      setPending(attempt)
      const result = await runLogistics(attempt)
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* Confirmed requests can safely be replayed. */
      }
      setPending(null)
      setLast(result)
      toast.dismiss('m6-save-error')
      toast.success(
        result.action === 'purchase'
          ? 'Purchase confirmed'
          : 'Returned change confirmed',
      )
      return result
    } catch (e) {
      const failure = e as Error
      setError(failure.message)
      toast.error(failure.message, { id: 'm6-save-error' })
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
        await refreshLogistics(qc)
      } finally {
        setBusy(false)
        lock.current = false
      }
    }
  }
  async function send(
    action: LogisticsAttempt['action'],
    payload: Record<string, Json | undefined>,
  ) {
    if (pending) throw new Error('Confirm the pending Logistics request first')
    setLast(null)
    return execute({
      action,
      payload: JSON.parse(JSON.stringify(payload)),
      request_id: photoId(),
    })
  }
  return (
    <LogisticsContext.Provider value={{ reference, pending, busy, last, send }}>
      {pending ? (
        <div
          role="alert"
          className="mb-4 space-y-3 rounded-xl bg-amber-soft p-4 text-amber-ink"
        >
          <p>
            Logistics confirmation pending. Retry the same {pending.action}{' '}
            request safely; new purchases and change returns are paused.
          </p>
          {error ? <p className="break-words text-sm">{error}</p> : null}
          <Button requiresOnline
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void execute(pending).catch(() => {})
            }}
          >
            Retry Logistics confirmation
          </Button>
        </div>
      ) : null}
      {last ? (
        <div
          role="status"
          className="mb-4 space-y-2 rounded-xl bg-ok-soft p-4 text-ok"
        >
          <p>
            {last.action === 'purchase' ? 'Purchase saved' : 'Change returned'}{' '}
            · {formatMoney(last.amount, last.currency)} · {last.business_date}
          </p>
          {last.action === 'purchase' ? (
            <Button asChild variant="secondary">
              <Link to={`/purchases?purchase=${last.id}`}>
                View saved purchase
              </Link>
            </Button>
          ) : (
            <p>
              Remaining in advance:{' '}
              {formatMoney(last.remaining_after, last.currency)}
            </p>
          )}
        </div>
      ) : null}
      <Outlet />
    </LogisticsContext.Provider>
  )
}

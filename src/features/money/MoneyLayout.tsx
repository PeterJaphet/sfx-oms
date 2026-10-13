import { useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'
import type { Json } from '@/lib/db.types'
import { photoId } from '@/features/menu/menu-photos'
import { SaveError } from '@/features/orders/order-api'
import { MoneyContext } from './money-context'
import {
  attemptSchema,
  type MoneyAction,
  type MoneyAttempt,
} from './money-model'
import {
  refreshMoney,
  runMoney,
  useMoneyReference,
  usePendingCount,
} from './money-api'

function MoneyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const key = `sfx-money-v1:${profile!.id}`
  const qc = useQueryClient()
  const reference = useMoneyReference()
  const lock = useRef(false)
  const [pending, setPending] = useState<MoneyAttempt | null>(() => {
    try {
      const data = sessionStorage.getItem(key)
      return data ? attemptSchema.parse(JSON.parse(data)) : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<Awaited<ReturnType<typeof runMoney>> | null>(
    null,
  )
  async function execute(attempt: MoneyAttempt) {
    if (lock.current) throw new Error('Money request is already being saved')
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      sessionStorage.setItem(key, JSON.stringify(attempt))
      setPending(attempt)
      const result = await runMoney(attempt)
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* A retained confirmed request is safe to replay. */
      }
      setPending(null)
      setLast(result)
      toast.dismiss('m5-money-error')
      toast.success('Money request confirmed')
    } catch (e) {
      const failure = e as Error
      setError(failure.message)
      toast.error(failure.message, { id: 'm5-money-error' })
      if (failure instanceof SaveError ? !failure.uncertain : !pending) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* Storage may be blocked. */
        }
        setPending(null)
      }
      throw e
    } finally {
      lock.current = false
      setBusy(false)
      await refreshMoney(qc)
    }
  }
  async function send(
    action: MoneyAction,
    payload: Record<string, Json | undefined>,
  ) {
    if (pending)
      throw new Error(
        'Confirm the pending money request before creating another',
      )
    setLast(null)
    await execute({
      action,
      payload: JSON.parse(JSON.stringify(payload)),
      request_id: photoId(),
    })
  }
  return (
    <MoneyContext.Provider
      value={{
        reference,
        pending,
        busy,
        error,
        last,
        send,
        retry: () => (pending ? execute(pending) : Promise.resolve()),
      }}
    >
      {pending ? (
        <div
          role="alert"
          className="mb-4 space-y-3 rounded-xl bg-amber-soft p-4 text-amber-ink"
        >
          <p>
            Money confirmation pending. Retry the same {pending.action} request
            safely; other money writes are paused.
          </p>
          {error ? <p className="break-words text-sm">{error}</p> : null}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void execute(pending).catch(() => {})
            }}
          >
            Retry money confirmation
          </Button>
        </div>
      ) : null}
      {children}
    </MoneyContext.Provider>
  )
}
function MoneyNavigation() {
  const { profile } = useAuth()
  const count = usePendingCount(profile!.role === 'admin')
  const links = [
    ['/money', 'Accounts'],
    ['/money/withdraw', 'Take money out'],
    ['/money/history', 'Withdrawals'],
    ['/money/expenses', 'Expenses'],
    ...(profile!.role === 'admin'
      ? [
          [
            '/money/approvals',
            `Approvals${count.data !== undefined ? ` ${count.data}` : ''}`,
          ],
          ['/money/tools', 'Admin tools'],
        ]
      : []),
  ]
  return (
    <>
      <h1 className="mb-4 text-[26px] font-extrabold sm:text-[34px]">Money</h1>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Money">
        {links.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/money'}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold',
                isActive
                  ? 'border-brand bg-brand text-card'
                  : 'border-line-strong bg-card',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      {count.error ? (
        <p role="alert" className="mb-3 text-sm text-brand-strong">
          {count.error.message}
        </p>
      ) : null}
      <Outlet />
    </>
  )
}
export default function MoneyLayout() {
  return (
    <MoneyProvider>
      <MoneyNavigation />
    </MoneyProvider>
  )
}

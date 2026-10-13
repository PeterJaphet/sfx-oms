import { isOnline, offlineMessage } from '@/lib/connectivity'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FieldError, Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/auth-context'
import { photoId } from '@/features/menu/menu-photos'
import { SaveError } from '@/features/orders/order-api'
import { formatMoney } from '@/lib/format'
import { CashBreakdown, CloseChecks } from './CashBreakdown'
import { CloseHistory } from './CloseHistory'
import {
  loadCloseContext,
  quoteClose,
  refreshClose,
  runClose,
} from './close-api'
import {
  closeAttemptSchema,
  countedSchema,
  differenceLabel,
  type CloseAttempt,
  type SavedClose,
} from './close-model'
export default function ClosePage() {
  const { profile } = useAuth()
  const admin = profile!.role === 'admin'
  const qc = useQueryClient()
  const [target, setTarget] = useState<{
    date: string
    account: number
  } | null>(null)
  const [counted, setCounted] = useState('')
  const [debounced, setDebounced] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<SavedClose | null>(null)
  const lock = useRef(false)
  const key = `sfx-close-v1:${profile!.id}`
  const [pending, setPending] = useState<CloseAttempt | null>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw ? closeAttemptSchema.parse(JSON.parse(raw)) : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(counted), 250)
    return () => clearTimeout(timer)
  }, [counted])
  const context = useQuery({
    queryKey: ['close', 'context', target],
    queryFn: async () => {
      if (!target) return loadCloseContext()
      const r = await quoteClose({
        counted: '0',
        date: target.date,
        account_id: target.account,
      })
      return r
    },
    refetchInterval: 15000,
  })
  const parsed = countedSchema.safeParse(debounced)
  const active = context.data
  const p =
    active && parsed.success
      ? {
          counted: parsed.data,
          date: active.business_date,
          account_id: active.account_id,
        }
      : null
  const quote = useQuery({
    queryKey: ['close', 'quote', p],
    queryFn: () => quoteClose(p!),
    enabled: !!p && !pending && !busy,
    refetchInterval: 15000,
    retry: false,
  })
  const message = quote.error?.message ?? context.error?.message
  useEffect(() => {
    if (message) toast.error(message, { id: 'm8-preview-error' })
  }, [message])
  const locked = busy || !!pending
  const validCount = countedSchema.safeParse(counted)
  async function execute(attempt: CloseAttempt) {
    if (!isOnline()) { setError(offlineMessage); toast.error(offlineMessage); return }
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      sessionStorage.setItem(key, JSON.stringify(attempt))
      setPending(attempt)
      const result = await runClose(attempt)
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* Retained confirmed request is safe to replay. */
      }
      setPending(null)
      setSaved(result)
      setCounted('')
      setDebounced('')
      setNote('')
      toast.dismiss('m8-close-error')
      toast.dismiss('m8-preview-error')
      toast.success('Day close confirmed', { id: 'm8-close-success' })
    } catch (e) {
      const failure = e as Error
      setError(failure.message)
      toast.error(failure.message, { id: 'm8-close-error' })
      if (failure instanceof SaveError && !failure.uncertain) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* Storage may be unavailable. */
        }
        setPending(null)
      }
    } finally {
      try {
        await refreshClose(qc)
      } finally {
        setBusy(false)
        lock.current = false
      }
    }
  }
  function reclose(date: string, account: number) {
    if (locked) return
    setTarget({ date, account })
    setSaved(null)
    setCounted('')
    setDebounced('')
    setNote('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Business day {active?.business_date ?? '…'}
        </p>
        <h1 className="text-[26px] font-extrabold sm:text-[34px]">
          Close the day
        </h1>
        <p className="mt-1 text-sm text-muted">
          Count Cash after the final sale. Financial changes need Admin after
          close until the next 06:00 business day.
        </p>
        {admin ? (
          <Button asChild variant="secondary" className="mt-3">
            <Link to="/money">Back to Money</Link>
          </Button>
        ) : null}
        {target ? (
          <Button
            variant="secondary"
            className="mt-3 ml-2"
            disabled={locked}
            onClick={() => {
              setTarget(null)
              setCounted('')
              setDebounced('')
              setSaved(null)
            }}
          >
            Today’s close
          </Button>
        ) : null}
      </header>
      {pending ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-amber-soft p-4 text-amber-ink"
        >
          <p>
            Close confirmation pending. Retry the same close safely before
            counting again.
          </p>
          {error ? <p className="break-words text-sm">{error}</p> : null}
          <Button requiresOnline
            disabled={busy}
            variant="secondary"
            onClick={() => {
              void execute(pending)
            }}
          >
            Retry close confirmation
          </Button>
        </div>
      ) : null}
      {saved ? (
        <div
          role="status"
          className="space-y-2 rounded-xl bg-ok-soft p-4 text-ok"
        >
          <p className="font-bold">
            Day closed · {saved.business_date} · #{saved.id}
          </p>
          <p>
            Expected{' '}
            {formatMoney(
              saved.expected_amount,
              saved.details?.currency ?? 'TRY',
            )}{' '}
            · counted{' '}
            {formatMoney(
              saved.counted_amount,
              saved.details?.currency ?? 'TRY',
            )}{' '}
            · difference{' '}
            {formatMoney(saved.difference, saved.details?.currency ?? 'TRY')}
          </p>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {context.isPending ? (
            <p role="status">Loading cash reconciliation…</p>
          ) : context.error ? (
            <div role="alert" className="space-y-3">
              <p className="break-words text-brand-strong">
                {context.error.message}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  void context.refetch()
                }}
              >
                Retry reconciliation
              </Button>
            </div>
          ) : (
            <>
              <CashBreakdown data={quote.data ?? context.data} />
              {active?.current_close_id ? (
                <p
                  role="status"
                  className="rounded-xl bg-amber-soft p-4 text-sm text-amber-ink"
                >
                  This day is closed.{' '}
                  {admin
                    ? 'Re-closing preserves the earlier record.'
                    : 'Ask Admin to re-close if the count needs correcting.'}
                </p>
              ) : null}
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (
                    !quote.data ||
                    !p ||
                    locked ||
                    quote.isFetching ||
                    !active?.can_close ||
                    !validCount.success ||
                    counted !== debounced
                  )
                    return
                  setSaved(null)
                  void execute({
                    request_id: photoId(),
                    payload: {
                      ...p,
                      note,
                      quote_token: quote.data.quote_token,
                    },
                  })
                }}
              >
                <label
                  className="block space-y-2 text-sm font-semibold"
                  htmlFor="close-counted"
                >
                  <span>
                    Cash counted (
                    {active?.currency === 'TRY' ? '₺' : active?.currency})
                  </span>
                  <Input
                    id="close-counted"
                    className="h-14 text-2xl font-bold"
                    inputMode="decimal"
                    autoComplete="off"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    disabled={locked || !active?.can_close}
                    aria-invalid={!!counted && !validCount.success}
                    aria-describedby="close-counted-error"
                  />
                </label>
                <FieldError
                  id="close-counted-error"
                  message={
                    counted && !validCount.success
                      ? validCount.error.issues[0]?.message
                      : undefined
                  }
                />
                {quote.error ? (
                  <p
                    role="alert"
                    className="break-words text-sm text-brand-strong"
                  >
                    {quote.error.message}
                  </p>
                ) : quote.data && counted === debounced ? (
                  <div
                    role="status"
                    className={`flex justify-between gap-3 rounded-xl p-4 font-bold ${quote.data.difference < 0 ? 'bg-brand-soft text-brand-deep' : quote.data.difference > 0 ? 'bg-amber-soft text-amber-ink' : 'bg-ok-soft text-ok'}`}
                  >
                    <span>{differenceLabel(quote.data.difference)}</span>
                    <span className="text-xl">
                      {formatMoney(quote.data.difference, quote.data.currency)}
                    </span>
                  </div>
                ) : counted && validCount.success ? (
                  <p role="status" className="text-sm text-muted">
                    Calculating difference…
                  </p>
                ) : null}
                {active ? <CloseChecks data={quote.data ?? active} /> : null}
                <label
                  className="block space-y-2 text-sm font-semibold"
                  htmlFor="close-note"
                >
                  <span>Note on the difference</span>
                  <textarea
                    id="close-note"
                    rows={2}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={locked || !active?.can_close}
                    placeholder="e.g. gave ₺50 change twice on order #009"
                    className="w-full rounded-xl border border-line-strong bg-card p-3 text-base font-normal"
                  />
                </label>
                {error && !pending ? (
                  <p
                    role="alert"
                    className="break-words text-sm text-brand-strong"
                  >
                    {error}
                  </p>
                ) : null}
                <Button requiresOnline
                  className="w-full"
                  type="submit"
                  disabled={
                    locked ||
                    !active?.can_close ||
                    !validCount.success ||
                    counted !== debounced ||
                    !quote.data ||
                    !!quote.error ||
                    quote.isFetching ||
                    context.isFetching
                  }
                >
                  {busy
                    ? 'Saving…'
                    : admin && active?.current_close_id
                      ? 'Re-close day'
                      : 'Close day'}
                </Button>
              </form>
            </>
          )}
        </div>
        <CloseHistory admin={admin} busy={locked} onReclose={reclose} />
      </div>
    </section>
  )
}

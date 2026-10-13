import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { loadCloseHistory } from './close-api'
import { CashBreakdown, CloseChecks } from './CashBreakdown'
export function CloseHistory({
  admin,
  busy,
  onReclose,
}: {
  admin: boolean
  busy: boolean
  onReclose: (date: string, account: number) => void
}) {
  const [offset, setOffset] = useState(0)
  const history = useQuery({
    queryKey: ['close', 'history', offset],
    queryFn: () => loadCloseHistory(offset),
    refetchInterval: 15000,
  })
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Close history</h2>
      {history.isPending ? (
        <p role="status">Loading history…</p>
      ) : history.error ? (
        <div role="alert">
          <p className="break-words text-brand-strong">
            {history.error.message}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void history.refetch()
            }}
          >
            Retry history
          </Button>
        </div>
      ) : history.data.length ? (
        history.data.map((c) => (
          <article
            key={c.id}
            className="space-y-3 rounded-xl border bg-card p-4"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-bold">
                {c.business_date} · {c.account_name}
              </h3>
              <span className="text-xs text-muted">
                #{c.id} · {c.superseded ? 'Earlier close' : 'Current close'}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              {[
                ['Expected', c.expected_amount],
                ['Counted', c.counted_amount],
                ['Difference', c.difference],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-words font-bold">
                    {formatMoney(value, c.currency)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted">
              {c.closed_by_name} ·{' '}
              {new Date(c.closed_at).toLocaleString('en-GB', {
                timeZone: 'Europe/Nicosia',
              })}
            </p>
            <p className="text-sm">
              {c.unpaid_orders} unpaid orders · {c.open_advances} open advances
            </p>
            {c.note ? <p className="break-words text-sm">{c.note}</p> : null}
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
                Saved reconciliation
              </summary>
              {c.details ? (
                <div className="mt-2 space-y-3">
                  <CashBreakdown data={c.details} />
                  <CloseChecks data={c.details} links={false} />
                </div>
              ) : (
                <p className="text-sm text-muted">
                  This earlier close has no stored breakdown. Its recorded
                  totals are preserved above.
                </p>
              )}
            </details>
            {admin && !c.superseded ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => onReclose(c.business_date, c.account_id)}
              >
                Re-close {c.business_date}
              </Button>
            ) : null}
          </article>
        ))
      ) : (
        <p className="text-sm text-muted">No daily closes yet.</p>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={offset === 0 || history.isFetching}
          onClick={() => setOffset((v) => Math.max(0, v - 50))}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={
            history.isFetching || !history.data || history.data.length < 50
          }
          onClick={() => setOffset((v) => v + 50)}
        >
          Next
        </Button>
      </div>
    </section>
  )
}

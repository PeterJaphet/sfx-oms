import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { useAuth } from '@/features/auth/auth-context'
import { useDebt } from './debt-context'
import { loadDebts, loadSummary, loadUnpaid } from './debt-api'
import type { Debt } from './debt-model'
import RecordDebtForm from './RecordDebtForm'
import DebtDetails from './DebtDetails'
export default function DebtsPage() {
  const { profile } = useAuth()
  const workspace = useDebt()
  const [direction, setDirection] = useState('all')
  const [status, setStatus] = useState('open')
  const [search, setSearch] = useState('')
  const [add, setAdd] = useState(false)
  const [selected, setSelected] = useState<Debt | null>(null)
  const [params, setParams] = useSearchParams()
  const id = params.get('debt')
  const activeId = id ?? selected?.id
  const summary = useQuery({
    queryKey: ['debts', 'summary'],
    queryFn: loadSummary,
    refetchInterval: 15000,
  })
  const query = useInfiniteQuery({
    queryKey: ['debts', 'list', status, direction, search],
    initialPageParam: 0,
    refetchInterval: 15000,
    queryFn: ({ pageParam }) =>
      loadDebts(status, direction, pageParam, undefined, search),
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
  })
  const single = useQuery({
    queryKey: ['debts', 'single', activeId],
    enabled: !!activeId,
    refetchInterval: 15000,
    queryFn: () => loadDebts('all', 'all', 0, activeId!),
  })
  const unpaid = useInfiniteQuery({
    queryKey: ['debts', 'unpaid'],
    enabled: direction !== 'we_owe' && status === 'open',
    initialPageParam: 0,
    refetchInterval: 15000,
    queryFn: ({ pageParam }) => loadUnpaid(pageParam),
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
  })
  const rows = query.data?.pages.flat() ?? []
  const current = activeId ? (single.data?.[0] ?? selected) : null
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-[26px] font-extrabold sm:text-[34px]">Debts</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/money">Money</Link>
          </Button>
          {profile!.role === 'admin' ? (
            <>
              <Button asChild variant="secondary">
                <Link to="/setup">Go-live setup</Link>
              </Button>
              <Button
                disabled={workspace.busy || !!workspace.pending}
                onClick={() => setAdd(true)}
              >
                Record debt / loan
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {summary.error ? (
        <p role="alert" className="text-brand-strong">
          {summary.error.message}
        </p>
      ) : summary.data ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-2 rounded-xl bg-brand-soft p-4 text-brand-deep">
            <p className="text-sm font-bold">We owe</p>
            <p className="break-words text-2xl font-bold">
              ≈ {formatMoney(summary.data.we_owe, 'TRY')}
            </p>
            {summary.data.missing_owe_rates ? (
              <p className="text-xs">
                Partial estimate: {summary.data.missing_owe_rates} foreign debts
                need rates.
              </p>
            ) : null}
          </div>
          <div className="min-w-0 space-y-2 rounded-xl bg-ok-soft p-4 text-ok">
            <p className="text-sm font-bold">Owed to us</p>
            <p className="break-words text-2xl font-bold">
              ≈ {formatMoney(summary.data.owed_to_us, 'TRY')}
            </p>
            <p className="text-xs">
              Includes unpaid orders{' '}
              {formatMoney(summary.data.customer_due, 'TRY')}
            </p>
            {summary.data.missing_owed_rates ? (
              <p className="text-xs">
                Partial estimate: {summary.data.missing_owed_rates} foreign
                debts need rates.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p role="status">Loading debt totals…</p>
      )}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Debt direction"
      >
        {[
          ['all', 'All'],
          ['we_owe', 'We owe'],
          ['owed_to_us', 'Owed to us'],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={direction === key ? 'default' : 'secondary'}
            aria-pressed={direction === key}
            onClick={() => setDirection(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="debt-state"
          >
            Status
          </label>
          <select
            id="debt-state"
            className="h-12 w-full rounded-lg border bg-card px-3"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="all">All statuses</option>
            <option value="settled">Settled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="debt-search"
          >
            Search debts
          </label>
          <Input
            id="debt-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {query.error || workspace.reference.error ? (
        <div role="alert">
          <p className="text-brand-strong">
            {(query.error ?? workspace.reference.error)?.message}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch()
              void workspace.reference.refetch()
            }}
          >
            Reload debts
          </Button>
        </div>
      ) : query.isPending || workspace.reference.isPending ? (
        <p role="status">Loading debts…</p>
      ) : rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((d) => (
            <button
              key={d.id}
              className="space-y-2 rounded-xl border bg-card p-4 text-left"
              aria-label={`Open debt ${d.counterparty}`}
              onClick={() => {
                setSelected(d)
                setParams({})
              }}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <strong className="break-words">{d.counterparty}</strong>
                <strong>{formatMoney(d.outstanding, d.currency)}</strong>
              </div>
              <p className="break-words text-sm text-muted">{d.description}</p>
              <p className="text-xs">
                {d.direction === 'we_owe' ? 'We owe' : 'Owed to us'} · {d.state}
                {d.due_date ? ` · due ${d.due_date}` : ''}
              </p>
              {d.is_overdue ? (
                <span className="inline-block rounded-md bg-brand-soft px-2 py-1 text-xs font-bold text-brand-deep">
                  Overdue
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-muted">
          No debts match this view.
        </p>
      )}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage()
          }}
        >
          Load more debts
        </Button>
      ) : null}
      {direction !== 'we_owe' && status === 'open' ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Unpaid customer orders</h2>
          {unpaid.error ? (
            <p role="alert" className="text-brand-strong">
              {unpaid.error.message}
            </p>
          ) : unpaid.isPending ? (
            <p role="status">Loading unpaid orders…</p>
          ) : unpaid.data?.pages.flat().length ? (
            unpaid.data.pages.flat().map((o) => (
              <Link
                key={o.id}
                to={`/orders?date=${o.business_date}&order=${o.id}`}
                className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <span className="break-words font-semibold">
                  #{String(o.daily_number).padStart(3, '0')} ·{' '}
                  {o.customer_name ?? 'Unnamed customer'}
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {o.business_date} · add payment on Orders
                  </span>
                </span>
                <strong className="text-amber-ink">
                  {formatMoney(o.balance_due, 'TRY')} due
                </strong>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted">No unpaid customer orders.</p>
          )}
          {unpaid.hasNextPage ? (
            <Button
              variant="secondary"
              onClick={() => {
                void unpaid.fetchNextPage()
              }}
            >
              Load more unpaid orders
            </Button>
          ) : null}
        </section>
      ) : null}
      {id && single.error ? (
        <p role="alert" className="text-brand-strong">
          {single.error.message}
        </p>
      ) : null}
      {current ? (
        <DebtDetails
          key={current.id}
          debt={current}
          onClose={() => {
            setSelected(null)
            setParams({})
          }}
        />
      ) : null}
      {add ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setAdd(false)
          }}
          title="Record debt or loan"
          description="Admin only. Loans move money; ordinary debts do not."
        >
          <RecordDebtForm onSaved={() => setAdd(false)} />
        </Sheet>
      ) : null}
    </section>
  )
}

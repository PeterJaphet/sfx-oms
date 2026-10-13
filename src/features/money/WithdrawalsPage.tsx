import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { useMoney } from './money-context'
import { loadWithdrawals } from './money-api'
import { typeNames, statusNames } from './money-model'
import { useReceipt } from './receipt-photos'

function ReceiptPreview({ path }: { path: string }) {
  const receipt = useReceipt(path)
  return receipt.error ? (
    <p role="alert" className="text-brand-strong">
      {receipt.error.message}
    </p>
  ) : receipt.isPending ? (
    <p role="status">Loading receipt…</p>
  ) : (
    <a href={receipt.data} target="_blank" rel="noopener noreferrer">
      <img
        className="w-full rounded-xl border"
        src={receipt.data}
        alt="Receipt photo"
      />
    </a>
  )
}
export default function WithdrawalsPage({
  approvals = false,
}: {
  approvals?: boolean
}) {
  const money = useMoney()
  const ref = money.reference
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<
    Awaited<ReturnType<typeof loadWithdrawals>>[number] | null
  >(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const filter = approvals ? 'pending_approval' : status
  const query = useInfiniteQuery({
    queryKey: ['money', 'withdrawals', filter],
    initialPageParam: 0,
    refetchInterval: 15000,
    queryFn: ({ pageParam }) => loadWithdrawals(filter, pageParam),
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
  })
  const rows = query.data?.pages.flat() ?? []
  const current = selected
    ? (rows.find((w) => w.id === selected.id) ?? selected)
    : null
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-extrabold">
        {approvals ? 'Admin approvals' : 'Withdrawals'}
      </h2>
      {!approvals ? (
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="withdraw-status"
          >
            Status
          </label>
          <select
            id="withdraw-status"
            className="h-12 w-full max-w-sm rounded-lg border bg-card px-3"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {Object.entries(statusNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Approval posts the withdrawal at its recorded rate. Pending requests
          have not changed balances.
        </p>
      )}
      {query.error || ref.error ? (
        <div role="alert">
          <p className="text-brand-strong">
            {(query.error ?? ref.error)?.message}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch()
              void ref.refetch()
            }}
          >
            Reload withdrawals
          </Button>
        </div>
      ) : query.isPending || ref.isPending ? (
        <p role="status">Loading withdrawals…</p>
      ) : rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((w) => {
            const account = ref.data!.accounts.find(
              (a) => a.id === w.account_id,
            )
            return (
              <button
                key={w.id}
                className="space-y-2 rounded-xl border bg-card p-4 text-left"
                onClick={() => {
                  setSelected(w)
                  setNote('')
                  setError(undefined)
                }}
                aria-label={`Open withdrawal ${w.purpose}`}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="font-bold">{typeNames[w.kind]}</span>
                  <span className="font-bold">
                    {account
                      ? formatMoney(w.amount, account.currency)
                      : 'Unknown account'}
                  </span>
                </div>
                <p className="break-words">{w.purpose}</p>
                <p className="text-xs text-muted">
                  {w.business_date} · {account?.name} ·{' '}
                  {ref.data!.people.find((p) => p.id === w.requested_by)
                    ?.full_name ?? 'Staff'}
                </p>
                <span
                  className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${w.status === 'pending_approval' ? 'bg-amber-soft text-amber-ink' : w.status === 'approved' ? 'bg-ok-soft text-ok' : 'bg-chip text-muted'}`}
                >
                  {statusNames[w.status]}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-muted">
          {approvals
            ? 'No requests waiting for approval.'
            : 'No withdrawals match this view.'}
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
          Load more withdrawals
        </Button>
      ) : null}
      {current ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
          title={typeNames[current.kind]}
          description={`Business day ${current.business_date} · ${statusNames[current.status]}`}
        >
          <div className="space-y-4">
            <p className="break-words font-semibold">{current.purpose}</p>
            <p>
              Category:{' '}
              {ref.data?.categories.find((c) => c.id === current.category_id)
                ?.name ?? 'Historical / inactive category'}
            </p>
            <p>TRY value: {formatMoney(current.amount_try, 'TRY')}</p>
            {current.kind === 'advance' ? (
              <p>
                Given to:{' '}
                {ref.data?.people.find((p) => p.id === current.recipient_id)
                  ?.full_name ?? 'Historical / inactive staff'}
              </p>
            ) : null}
            {current.decision_note ? (
              <p className="break-words text-sm">
                Decision note: {current.decision_note}
              </p>
            ) : null}
            {current.receipt_path ? (
              <ReceiptPreview path={current.receipt_path} />
            ) : null}
            {approvals && current.status === 'pending_approval' ? (
              <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="approval-note"
                >
                  Decision note (optional)
                </label>
                <textarea
                  id="approval-note"
                  rows={2}
                  value={note}
                  maxLength={1000}
                  disabled={money.busy || !!money.pending}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border bg-card p-3"
                />
                {money.pending ? (
                  <p role="alert" className="text-sm text-amber-ink">
                    A confirmation is pending. Close this sheet and use Retry
                    money confirmation.
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-brand-strong">
                    {error}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  {[false, true].map((approve) => (
                    <Button requiresOnline
                      key={String(approve)}
                      variant={approve ? 'default' : 'secondary'}
                      disabled={money.busy || !!money.pending}
                      onClick={async () => {
                        setError(undefined)
                        try {
                          await money.send('decide', {
                            withdrawal_id: current.id,
                            approve,
                            note,
                          })
                          setSelected(null)
                        } catch (e) {
                          setError((e as Error).message)
                        }
                      }}
                    >
                      {approve ? 'Approve' : 'Reject'}
                    </Button>
                  ))}
                </div>
              </form>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </section>
  )
}

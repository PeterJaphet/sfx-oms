import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { formatRate } from '@/features/orders/order-model'
import { useAuth } from '@/features/auth/auth-context'
import { useMoney } from './money-context'
import { loadAccountEntries } from './money-api'
import { entryNames, type Balance } from './money-model'
import { ReversalForm } from './AdminForms'

function AccountHistory({
  account,
  onClose,
}: {
  account: Balance
  onClose: () => void
}) {
  const { profile } = useAuth()
  const money = useMoney()
  const [reverseId, setReverseId] = useState<number | null>(null)
  const entries = useQuery({
    queryKey: ['money', 'entries', account.id],
    refetchInterval: 15000,
    queryFn: () => loadAccountEntries(account.id),
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={account.name}
      description="Last 20 ledger entries. Saved entries are permanent; Admin corrections post reversals."
    >
      <p className="mb-4 text-2xl font-bold">
        {formatMoney(
          money.reference.data?.balances.find((b) => b.id === account.id)
            ?.balance ?? account.balance,
          account.currency,
        )}
      </p>
      {reverseId !== null ? (
        <>
          <Button
            variant="secondary"
            className="mb-4 w-full"
            onClick={() => setReverseId(null)}
          >
            Back to entries
          </Button>
          <ReversalForm
            entryId={reverseId}
            onSaved={() => setReverseId(null)}
          />
        </>
      ) : entries.error ? (
        <div role="alert" className="space-y-3">
          <p className="text-brand-strong">{entries.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void entries.refetch()
            }}
          >
            Reload entries
          </Button>
        </div>
      ) : entries.isPending ? (
        <p role="status">Loading entries…</p>
      ) : entries.data.length ? (
        <div className="space-y-3">
          {entries.data.map((e) => (
            <article
              key={e.id}
              className="space-y-2 rounded-xl border bg-card p-3"
            >
              <div className="flex justify-between gap-3">
                <strong className="text-sm">
                  {entryNames[e.entry_type] ?? e.entry_type}
                </strong>
                <strong className="shrink-0">
                  {formatMoney(e.amount, account.currency)}
                </strong>
              </div>
              <p className="text-xs text-muted">
                Business day {e.business_date} ·{' '}
                {new Intl.DateTimeFormat('en-GB', {
                  timeZone: 'Europe/Nicosia',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(e.created_at))}{' '}
                · entry #{e.id}
              </p>
              <p className="break-words text-sm">{e.note}</p>
              <p className="text-xs text-muted">
                TRY value {formatMoney(e.amount_try, 'TRY')}
                {account.currency !== 'TRY'
                  ? ` · rate ₺${formatRate(e.rate_to_try)}`
                  : ''}
                {e.isReversed ? ' · Reversed' : ''}
              </p>
              {profile!.role === 'admin' &&
              e.entry_type !== 'reversal' &&
              !e.isReversed ? (
                <Button
                  variant="secondary"
                  size="secondary"
                  className="w-full"
                  disabled={money.busy || !!money.pending}
                  onClick={() => setReverseId(e.id)}
                >
                  Reverse entry #{e.id}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted">No ledger entries.</p>
      )}
    </Sheet>
  )
}
export default function AccountsPage() {
  const money = useMoney()
  const query = money.reference
  const [selected, setSelected] = useState<Balance | null>(null)
  if (query.isPending) return <p role="status">Loading accounts…</p>
  if (query.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-brand-strong">{query.error.message}</p>
        <Button
          onClick={() => {
            void query.refetch()
          }}
        >
          Reload accounts
        </Button>
      </div>
    )
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold">Accounts</h2>
        <Button asChild>
          <Link to="/money/withdraw">Take money out</Link>
        </Button>
      </div>
      <p className="text-sm text-muted">
        Balances come from the ledger. Foreign-currency estimates use the latest
        Admin default.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {query.data.balances.map((a) => (
          <button
            key={a.id}
            className="flex min-h-32 flex-col gap-2 rounded-xl border bg-card p-4 text-left"
            onClick={() => setSelected(a)}
            aria-label={`Open ${a.name} account`}
          >
            <span className="font-bold">{a.name}</span>
            <span className="text-2xl font-bold">
              {formatMoney(a.balance, a.currency)}
            </span>
            {a.currency !== 'TRY' ? (
              <span className="text-sm text-muted">
                {a.balance_try_estimate !== null
                  ? `≈ ${formatMoney(a.balance_try_estimate, 'TRY')}`
                  : 'Rate not set'}
                {query.data.rates.find((r) => r.currency === a.currency)
                  ? ` · ${query.data.rates.find((r) => r.currency === a.currency)!.effective_date}`
                  : ''}
              </span>
            ) : null}
            <span className="text-xs text-muted">View last 20 entries</span>
          </button>
        ))}
      </div>
      {selected ? (
        <AccountHistory
          key={selected.id}
          account={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  )
}

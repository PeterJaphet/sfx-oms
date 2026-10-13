import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { useDebt } from './debt-context'
import { loadSetup, loadDebts } from './debt-api'
import type { SetupAccount } from './debt-model'
import OpeningForm from './OpeningForm'
import RecordDebtForm from './RecordDebtForm'
export default function SetupPage() {
  const state = useDebt()
  const setup = useQuery({
    queryKey: ['debts', 'setup'],
    queryFn: loadSetup,
    refetchInterval: 15000,
  })
  const debts = useQuery({
    queryKey: ['debts', 'setup-debts'],
    queryFn: () => loadDebts('all'),
    refetchInterval: 15000,
  })
  const [account, setAccount] = useState<SetupAccount | null>(null)
  const [add, setAdd] = useState(false)
  if (setup.isPending || state.reference.isPending)
    return <p role="status">Loading go-live setup…</p>
  if (setup.error || state.reference.error)
    return (
      <div role="alert">
        <p className="text-brand-strong">
          {(setup.error ?? state.reference.error)?.message}
        </p>
        <Button
          onClick={() => {
            void setup.refetch()
            void state.reference.refetch()
          }}
        >
          Reload setup
        </Button>
      </div>
    )
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Admin · one time, on go-live day
        </p>
        <h1 className="text-[26px] font-extrabold sm:text-[34px]">
          Start fresh: balances and debts
        </h1>
        <p className="max-w-3xl text-ink-2">
          Enter each account’s opening amount in its own currency, then record
          outstanding debts. Each opening saves separately and is kept
          permanently.
        </p>
        <Link
          to="/debts"
          className="flex min-h-11 items-center font-semibold text-brand-strong"
        >
          Back to Debts
        </Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="text-xl font-bold">1 · Opening balances</h2>
          {setup.data.accounts.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
            >
              <div>
                <p className="font-bold">
                  {a.name} · {a.currency}
                </p>
                <p className="text-xs text-muted">
                  Current ledger balance {formatMoney(a.balance, a.currency)}
                </p>
                {a.opened ? (
                  <p className="text-sm text-ok">
                    Opening recorded:{' '}
                    {formatMoney(a.opening_amount!, a.currency)} ·{' '}
                    {a.opening_date}
                  </p>
                ) : null}
              </div>
              <Button
                variant="secondary"
                disabled={a.opened || state.busy || !!state.pending}
                onClick={() => setAccount(a)}
              >
                {a.opened ? 'Recorded' : `Set ${a.name} opening`}
              </Button>
            </div>
          ))}
          <p className="border-t pt-3 font-bold">
            {setup.data.missing_rates
              ? 'Known current TRY estimate'
              : 'Current total in lira'}
            :{' '}
            {setup.data.balance_try_estimate === null
              ? 'Not available'
              : formatMoney(setup.data.balance_try_estimate, 'TRY')}
          </p>
          {setup.data.missing_rates ? (
            <p className="text-sm text-amber-ink">
              Some foreign estimates need a default rate. Set rates in Money →
              Admin tools.
            </p>
          ) : null}
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="text-xl font-bold">2 · Outstanding debts</h2>
          <p className="text-sm text-muted">
            Opening debts move no money and never count as revenue or expense.
          </p>
          <Button
            className="w-full"
            disabled={!setup.data.complete || state.busy || !!state.pending}
            onClick={() => setAdd(true)}
          >
            Add opening debt
          </Button>
          {!setup.data.complete ? (
            <p className="text-sm text-muted">
              Record every active account’s opening first, including zero
              balances.
            </p>
          ) : null}
          {debts.error ? (
            <p role="alert" className="text-brand-strong">
              {debts.error.message}
            </p>
          ) : (
            debts.data
              ?.filter((d) => d.is_opening)
              .map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"
                >
                  <span className="break-words">
                    {d.counterparty} ·{' '}
                    {d.direction === 'we_owe' ? 'We owe' : 'Owed to us'} ·{' '}
                    {d.state}
                  </span>
                  <strong>{formatMoney(d.outstanding, d.currency)}</strong>
                </div>
              ))
          )}
        </section>
      </div>
      {setup.data.complete ? (
        <div className="space-y-3 rounded-xl bg-ok-soft p-4 text-ok">
          <p>
            All active accounts have opening records. Confirm that every
            outstanding debt has been entered before finishing setup.
          </p>
          <Button asChild>
            <Link to="/dashboard">Finish setup</Link>
          </Button>
        </div>
      ) : null}
      {account ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setAccount(null)
          }}
          title={`${account.name} opening balance`}
          description="An opening can be recorded once. Later corrections are adjustments."
        >
          <OpeningForm account={account} onSaved={() => setAccount(null)} />
        </Sheet>
      ) : null}
      {add ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setAdd(false)
          }}
          title="Add opening debt"
          description="Existing before go-live; no account money moves."
        >
          <RecordDebtForm opening onSaved={() => setAdd(false)} />
        </Sheet>
      ) : null}
    </section>
  )
}

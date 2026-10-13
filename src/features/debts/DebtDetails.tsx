import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { useAuth } from '@/features/auth/auth-context'
import { useDebt } from './debt-context'
import { loadDebtHistory } from './debt-api'
import type { Debt } from './debt-model'
import SettlementForm from './SettlementForm'
import CancelDebtForm from './CancelDebtForm'
export default function DebtDetails({
  debt: d,
  onClose,
}: {
  debt: Debt
  onClose: () => void
}) {
  const { profile } = useAuth()
  const state = useDebt()
  const [mode, setMode] = useState('details')
  const history = useQuery({
    queryKey: ['debts', 'history', d.id],
    refetchInterval: 15000,
    queryFn: () => loadDebtHistory(d.id),
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={d.counterparty}
      description={`${d.direction === 'we_owe' ? 'We owe' : 'Owed to us'} · ${d.state}`}
    >
      <div className="space-y-4">
        {mode !== 'details' ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setMode('details')}
          >
            Back to debt
          </Button>
        ) : null}
        {mode === 'settle' ? (
          <SettlementForm debt={d} onSaved={() => setMode('details')} />
        ) : mode === 'cancel' ? (
          <CancelDebtForm id={d.id} onSaved={() => setMode('details')} />
        ) : (
          <>
            <p className="break-words">{d.description}</p>
            <p className="text-2xl font-bold">
              {formatMoney(d.outstanding, d.currency)} outstanding
            </p>
            <p className="text-sm text-muted">
              Original {formatMoney(d.amount, d.currency)} · settled{' '}
              {formatMoney(d.settled, d.currency)} · {d.business_date}
            </p>
            <p className="text-sm">
              {d.due_date
                ? `Due ${d.due_date}${d.is_overdue ? ' · Overdue' : ''}`
                : 'No due date'}{' '}
              ·{' '}
              {d.is_opening
                ? 'Opening debt'
                : d.source === 'purchase_on_credit'
                  ? 'Supplies on credit'
                  : d.source === 'loan'
                    ? 'Loan'
                    : 'Debt / IOU'}
            </p>
            {d.cancel_reason ? (
              <p className="break-words rounded-xl bg-brand-soft p-3 text-sm text-brand-deep">
                Cancelled: {d.cancel_reason}
              </p>
            ) : null}
            <section className="space-y-2">
              <h3 className="font-bold">Money history</h3>
              {history.error ? (
                <p role="alert" className="text-brand-strong">
                  {history.error.message}
                </p>
              ) : history.isPending ? (
                <p role="status">Loading debt history…</p>
              ) : history.data.entries.length ? (
                history.data.entries.map((e) => {
                  const a = state.reference.data?.accounts.find(
                    (a) => a.id === e.account_id,
                  )
                  const settlement = history.data.settlements.find(
                    (s) => s.ledger_entry_id === e.id,
                  )
                  return (
                    <article
                      key={e.id}
                      className="space-y-1 rounded-xl border p-3 text-sm"
                    >
                      <p>
                        {a?.name ?? 'Historical account'} ·{' '}
                        {a
                          ? formatMoney(e.amount, a.currency)
                          : 'Amount unavailable'}{' '}
                        · {e.entry_type}
                      </p>
                      {settlement ? (
                        <p>
                          Cleared {formatMoney(settlement.covers, d.currency)}{' '}
                          of this debt
                        </p>
                      ) : null}
                      <p className="text-xs text-muted">
                        {e.business_date} · entry #{e.id}
                        {e.reverses_id ? ` · reverses #${e.reverses_id}` : ''}
                      </p>
                      {e.note ? <p className="break-words">{e.note}</p> : null}
                    </article>
                  )
                })
              ) : (
                <p className="text-sm text-muted">
                  No account money moved for this debt.
                </p>
              )}
            </section>
            {d.state === 'open' ? (
              <>
                <Button
                  className="w-full"
                  disabled={state.busy || !!state.pending}
                  onClick={() => setMode('settle')}
                >
                  {d.direction === 'we_owe' ? 'Pay debt' : 'Collect debt'}
                </Button>
                {profile!.role === 'admin' ? (
                  <Button
                    className="w-full"
                    variant="secondary"
                    disabled={state.busy || !!state.pending}
                    onClick={() => setMode('cancel')}
                  >
                    Cancel debt
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  )
}

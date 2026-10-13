import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { formatRate } from '@/features/orders/order-model'
import { useMoney } from './money-context'
import { AdjustmentForm, LimitForm, RateForm, TransferForm } from './AdminForms'
const titles = {
  transfer: 'Transfer money',
  adjust: 'Adjust balance',
  rate: 'Default exchange rates',
  limit: 'Approval settings',
}
export default function AdminToolsPage() {
  const money = useMoney()
  const [mode, setMode] = useState<keyof typeof titles | null>(null)
  const query = money.reference
  if (query.isPending) return <p role="status">Loading Admin tools…</p>
  if (query.error)
    return (
      <div role="alert">
        <p className="text-brand-strong">{query.error.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void query.refetch()
          }}
        >
          Reload tools
        </Button>
      </div>
    )
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-extrabold">Admin money tools</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(titles).map(([id, label]) => (
          <Button
            key={id}
            variant="secondary"
            className="h-16"
            disabled={money.busy || !!money.pending}
            onClick={() => setMode(id as keyof typeof titles)}
          >
            {label}
          </Button>
        ))}
      </div>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h3 className="font-bold">Latest defaults</h3>
        {(['USD', 'NGN'] as const).map((cur) => {
          const rate = query.data.rates.find((r) => r.currency === cur)
          return (
            <p key={cur} className="text-sm">
              {cur}:{' '}
              {rate
                ? `₺${formatRate(rate.rate_to_try)} per unit · ${rate.effective_date}`
                : 'Not set'}
            </p>
          )
        })}
        <p className="text-sm">
          Approval:{' '}
          {query.data.settings.withdrawal_approval_limit_try !== null
            ? `Operations above ${formatMoney(query.data.settings.withdrawal_approval_limit_try, 'TRY')}`
            : 'Disabled'}
        </p>
      </section>
      <p className="text-sm text-muted">
        To reverse an entry, open its account and select the ledger entry.
        Opening balances follow in M7.
      </p>
      {mode ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setMode(null)
          }}
          title={titles[mode]}
          description="Admin only. Changes are recorded with your name and server time."
        >
          {mode === 'transfer' ? (
            <TransferForm onSaved={() => setMode(null)} />
          ) : mode === 'adjust' ? (
            <AdjustmentForm onSaved={() => setMode(null)} />
          ) : mode === 'rate' ? (
            <RateForm onSaved={() => setMode(null)} />
          ) : (
            <LimitForm onSaved={() => setMode(null)} />
          )}
        </Sheet>
      ) : null}
    </section>
  )
}

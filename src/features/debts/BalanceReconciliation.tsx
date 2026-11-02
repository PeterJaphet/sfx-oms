import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { client } from '@/features/menu/menu-api'
import { currencySchema } from '@/features/money/money-model'
import { formatMoney } from '@/lib/format'
import { useDebt } from './debt-context'

const schema = z.object({
  token: z.string(),
  already_applied: z.boolean(),
  create_redot_try: z.boolean(),
  rows: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      currency: currencySchema,
      counted_balance: z.number(),
      counted_at: z.string(),
      balance_before: z.number(),
      ledger_delta: z.number(),
      balance_after: z.number(),
      already_reconciled: z.boolean(),
    }),
  ),
  retire: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      currency: currencySchema,
      balance: z.number(),
      pending: z.number(),
    }),
  ),
})
export function BalanceReconciliation() {
  const state = useDebt()
  const qc = useQueryClient()
  const preview = useQuery({
    queryKey: ['debts', 'balance-reconciliation'],
    retry: false,
    queryFn: async () => {
      const r = await client().rpc('reconcile_go_live_balances', {
        p_apply: false,
      })
      if (r.error) throw new Error(r.error.message)
      return schema.parse(r.data)
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      if (!preview.data || preview.isFetching || preview.isError)
        throw new Error('Wait for the current reconciliation preview')
      const r = await client().rpc('reconcile_go_live_balances', {
        p_apply: true,
        p_token: preview.data.token,
      })
      if (r.error) throw new Error(r.error.message)
      return schema.parse(r.data)
    },
    onSuccess: async () => {
      await Promise.all(
        [
          'debts',
          'money',
          'account-balances',
          'reports',
          'orders',
          'order-reference',
          'board-reference',
          'order-quote',
          'close',
          'financial-day',
          'activity',
          'advances',
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      )
      toast.success('Confirmed balances and active accounts updated')
    },
    onError: (error) => toast.error(error.message),
  })
  const changes =
    preview.data &&
    (preview.data.create_redot_try ||
      preview.data.retire.length > 0 ||
      preview.data.rows.some((r) => !r.already_reconciled))
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-label="Confirmed balance reconciliation"
    >
      <h2 className="text-xl font-bold">Use confirmed balances</h2>
      <p className="text-sm text-muted">
        Saved Go live amounts are the balances when you entered them. Later
        sales and spending are preserved. Corrections are audited balance
        adjustments, with no revenue or expense created.
      </p>
      {preview.isPending ? (
        <p role="status">Loading reconciliation preview…</p>
      ) : null}
      {preview.error ? <p role="alert">{preview.error.message}</p> : null}
      {preview.error ? (
        <Button variant="secondary" onClick={() => void preview.refetch()}>
          Retry balance preview
        </Button>
      ) : null}
      {preview.data ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {preview.data.rows.map((r) => (
              <article key={r.id} className="space-y-2 rounded-xl border p-3">
                <h3 className="font-bold">{r.name}</h3>
                <p className="text-sm">
                  Confirmed: {formatMoney(r.counted_balance, r.currency)} ·{' '}
                  {new Date(r.counted_at).toLocaleString('en-GB', {
                    timeZone: 'Europe/Nicosia',
                  })}
                </p>
                <p className="text-sm">
                  Current: {formatMoney(r.balance_before, r.currency)} →{' '}
                  <strong>{formatMoney(r.balance_after, r.currency)}</strong>
                </p>
                <p className="text-sm text-muted">
                  {r.already_reconciled
                    ? 'Already reconciled; later movements retained.'
                    : `Balance correction: ${formatMoney(r.ledger_delta, r.currency)}`}
                </p>
              </article>
            ))}
          </div>
          {preview.data.retire.map((a) => (
            <p className="text-sm" key={a.id}>
              Remove {a.name} from active accounts (historical balance{' '}
              {formatMoney(a.balance, a.currency)} retained in history).{' '}
              {a.pending
                ? `${a.pending} pending orders, withdrawals or open advances must be resolved first.`
                : ''}
            </p>
          ))}
          {preview.data.create_redot_try ? (
            <p className="text-sm">
              Create RedotPay in TL with no entered balance. Add your confirmed
              TL amount afterward.
            </p>
          ) : null}
          <Button
            requiresOnline
            className="w-full whitespace-normal"
            disabled={
              !changes ||
              preview.isFetching ||
              save.isPending ||
              state.busy ||
              !!state.pending ||
              preview.data.retire.some((a) => a.pending > 0)
            }
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? 'Applying…'
              : changes
                ? 'Apply confirmed balances & account changes'
                : 'Balances and active accounts are up to date'}
          </Button>
          <Button
            variant="secondary"
            disabled={preview.isFetching || save.isPending}
            onClick={() => void preview.refetch()}
          >
            Refresh balance preview
          </Button>
        </>
      ) : null}
      {save.error ? <p role="alert">{save.error.message}</p> : null}
    </section>
  )
}

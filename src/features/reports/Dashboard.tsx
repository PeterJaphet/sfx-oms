import { DailyOrderTotals } from './DailyOrderTotals'
import { SfxAccountTransition } from './SfxAccountTransition'
import { HistoricalRecords } from './HistoricalRecords'
import { toast } from 'sonner'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { formatMoney } from '@/lib/format'
import { loadDashboard } from './report-api'
import { client } from '@/features/menu/menu-api'
import { recipeReportSchema, findDefinition, type Range } from './report-model'
import { ReportTable } from './ReportTable'
const RevenueChart = lazy(() => import('./RevenueChart'))
export default function Dashboard({
  range,
  onReport,
}: {
  range: Range
  onReport: (name: string) => void
}) {
  const { profile } = useAuth()
  const [showProfit, setShowProfit] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const audit = useQuery({
    queryKey: ['reports', 'order-profit-audit', range],
    enabled: showProfit,
    staleTime: 15000,
    queryFn: async () => {
      const r = await client().rpc('order_profit_report', {
        p_from: range.from,
        p_to: range.to,
      })
      if (r.error) throw new Error(r.error.message)
      return recipeReportSchema.parse(r.data)
    },
  })
  const data = useQuery({
    queryKey: ['reports', 'dashboard', range],
    queryFn: () => loadDashboard(range),
    staleTime: 15000,
    refetchInterval: 30000,
    retry: false,
  })
  const message = data.error?.message
  useEffect(() => {
    if (message) toast.error(message, { id: 'm9-dashboard-error' })
  }, [message])
  if (data.isPending) return <p role="status">Loading dashboard…</p>
  if (data.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="break-words text-brand-strong">{data.error.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void data.refetch()
          }}
        >
          Retry dashboard
        </Button>
      </div>
    )
  const d = data.data,
    p = d.recipe_profit,
    s = d.sales.summary
  return (
    <div className="space-y-5">
      {d.sfx_needs_transition ? <SfxAccountTransition /> : null}
      <p className="text-sm text-muted">
        Gross sales {formatMoney(Number(s.gross_sales ?? 0), 'TRY')} − discounts{' '}
        {formatMoney(Number(s.discounts ?? 0), 'TRY')} = net revenue{' '}
        {formatMoney(Number(s.net_revenue ?? 0), 'TRY')}
      </p>
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Key figures"
      >
        {[
          [
            'Net revenue',
            p.revenue,
            `${s.orders ?? 0} orders · average ${s.average_order == null ? '—' : formatMoney(Number(s.average_order), 'TRY')}`,
          ],
          [
            'Est. gross profit',
            p.gross_profit,
            'Revenue less recipe ingredient and packaging costs',
          ],
          [
            'Recipe cost of goods',
            p.cogs,
            'Calculated from saved recipes and recorded quantities',
          ],
          [
            'Est. net profit',
            p.net_profit,
            'After recipe operating costs and allocated fixed overhead',
          ],
        ].map(([label, amount, sub]) => (
          <article
            key={String(label)}
            className={`min-w-0 space-y-2 rounded-xl border p-4 ${label === 'Est. net profit' ? 'bg-brand text-card' : 'bg-card'}`}
          >
            <h2 className="text-sm font-semibold">{String(label)}</h2>
            <p className="break-words text-2xl font-bold sm:text-3xl">
              {amount == null ? '—' : formatMoney(Number(amount), 'TRY')}
            </p>
            <p
              className={`text-xs ${label === 'Est. net profit' ? 'text-card' : 'text-muted'}`}
            >
              {String(sub)}
            </p>
          </article>
        ))}
      </section>
      <p className="text-sm text-muted">
        {range.from} to {range.to} · recipe-based estimates. {p.reconstructed}{' '}
        orders reconstructed using current recipe costs; complete saved
        estimates stay unchanged.
      </p>
      {p.missing_net ? (
        <div className="rounded-xl border border-amber bg-amber-soft p-4 space-y-2">
          <p className="font-semibold">
            {p.missing_net} orders need cost inputs before total net profit can
            be calculated.
          </p>
          <p className="text-sm">
            {p.missing.join(', ') ||
              'Set a valid fixed-overhead allocation in Costing.'}
          </p>
          {profile?.role === 'admin' ? (
            <Button asChild variant="secondary">
              <Link to="/costing">Complete recipe costs</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Suspense fallback={<p role="status">Loading chart…</p>}>
            <RevenueChart rows={d.sales.rows} />
          </Suspense>
          <ReportTable
            data={d.items}
            definition={findDefinition('items')!}
            range={range}
            disabled={data.isFetching}
          />
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => onReport('items')}
          >
            View all items and category totals
          </Button>
          <section className="rounded-xl border bg-card p-4 space-y-2">
            <h2 className="font-semibold">
              Turkey · {d.turkey.quantity} total sold
            </h2>
            <p className="text-sm text-muted">
              {d.turkey.standalone} on its own + {d.turkey.on_plate} on plates ·{' '}
              {range.from} to {range.to}
            </p>
            <details>
              <summary className="min-h-11 cursor-pointer">
                Reconcile Turkey by order
              </summary>
              {d.turkey.rows.map((r, i) => (
                <p className="border-t py-2 text-sm" key={`${r.id}:${i}`}>
                  <Link to={`/orders?date=${r.business_date}&order=${r.id}`}>
                    {r.business_date} #{r.daily_number}
                  </Link>{' '}
                  · {r.quantity} × {r.source} · {r.product_name}
                </p>
              ))}
            </details>
          </section>
          <ReportTable
            data={d.extras}
            definition={findDefinition('extras')!}
            range={range}
            disabled={data.isFetching}
          />
          <Button variant="secondary" onClick={() => onReport('extras')}>
            All extras, including on plates
          </Button>
          <ReportTable
            data={d.expenses}
            definition={findDefinition('expenses')!}
            range={range}
            disabled={data.isFetching}
          />
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => onReport('expenses')}
          >
            View all expense categories
          </Button>
        </div>
        <aside className="min-w-0 space-y-5">
          <DailyOrderTotals />
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-lg font-bold">Needs your attention</h2>
            {profile!.role === 'admin' ? (
              <Button asChild variant="secondary" className="w-full">
                <Link to="/money/approvals">
                  {d.needs.pending_approvals ?? 0} pending approvals
                </Link>
              </Button>
            ) : null}
            {d.needs.close ? (
              <div className="space-y-1 border-t pt-3">
                <p className="font-semibold">
                  Cash difference at close ·{' '}
                  {formatMoney(d.needs.close.difference, 'TRY')}
                </p>
                <p className="break-words text-xs text-muted">
                  {d.needs.close.business_date} · {d.needs.close.note}
                </p>
                <Button asChild variant="secondary" className="mt-2 w-full">
                  <Link to="/close">Review close history</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted">
                No recorded cash differences.
              </p>
            )}
            {d.needs.advances.map((a, i) => (
              <p key={i} className="break-words border-t pt-3 text-sm">
                {a.recipient_name} · {a.purpose} ·{' '}
                {formatMoney(a.remaining, a.currency)} remaining / owed ·{' '}
                {a.age_days} days old
              </p>
            ))}
          </section>
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-lg font-bold">Debts outstanding now</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-brand-soft p-3 text-brand-deep">
                <p className="text-xs">We owe</p>
                <p className="break-words text-xl font-bold">
                  ≈ {formatMoney(d.debts.we_owe, 'TRY')}
                </p>
              </div>
              <div className="rounded-xl bg-ok-soft p-3 text-ok">
                <p className="text-xs">Owed to us</p>
                <p className="break-words text-xl font-bold">
                  ≈ {formatMoney(d.debts.owed_to_us, 'TRY')}
                </p>
              </div>
            </div>
            {d.debts.missing_owe_rates + d.debts.missing_owed_rates > 0 ? (
              <p role="alert" className="text-sm text-amber-ink">
                Some foreign debts have no exchange rate; the estimate excludes
                them.
              </p>
            ) : null}
            <Button asChild variant="secondary" className="w-full">
              <Link to="/debts">View debts</Link>
            </Button>
          </section>
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-lg font-bold">Balances now</h2>
            <p className="text-xs text-muted">
              ≈ {formatMoney(d.balance_try_estimate, 'TRY')} at latest default
              rates
            </p>
            {d.missing_balance_rates ? (
              <p role="alert" className="text-sm text-amber-ink">
                {d.missing_balance_rates} accounts have no rate; the estimate is
                incomplete.
              </p>
            ) : null}
            {d.balances.map((a) => (
              <div
                key={a.id}
                className="flex justify-between gap-3 border-t pt-3 text-sm"
              >
                <span>{a.name}</span>
                <span className="text-right">
                  <span className="block font-bold">
                    {formatMoney(a.balance, a.currency)}
                  </span>
                  {a.currency !== 'TRY' ? (
                    <span className="text-xs text-muted">
                      {a.balance_try_estimate === null
                        ? 'Rate missing'
                        : `≈ ${formatMoney(a.balance_try_estimate, 'TRY')}`}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => onReport('accounts')}
            >
              View period account movements
            </Button>
          </section>
        </aside>
      </div>
      <details
        className="rounded-xl border bg-card p-4"
        onToggle={(e) => setShowProfit(e.currentTarget.open)}
      >
        <summary className="min-h-11 cursor-pointer font-semibold">
          Profit calculation by order
        </summary>
        {showProfit ? (
          <div className="max-h-96 overflow-auto">
            {audit.error ? (
              <p role="alert">{audit.error.message}</p>
            ) : audit.isPending ? (
              <p role="status">Loading order calculations…</p>
            ) : null}
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    'Date / order',
                    'Revenue',
                    'Gross',
                    'Net',
                    'Cost basis',
                  ].map((h) => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.data?.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2">
                      <Link
                        to={`/orders?date=${r.business_date}&order=${r.id}`}
                      >
                        {r.business_date} #{r.daily_number}
                      </Link>
                    </td>
                    <td className="p-2">{formatMoney(r.revenue, 'TRY')}</td>
                    <td className="p-2">
                      {r.gross_profit == null
                        ? '—'
                        : formatMoney(r.gross_profit, 'TRY')}
                    </td>
                    <td className="p-2">
                      {r.net_profit == null
                        ? '—'
                        : formatMoney(r.net_profit, 'TRY')}
                    </td>
                    <td className="p-2">
                      {r.reconstructed ? 'Current recipe' : 'Saved estimate'}
                      {r.missing.length
                        ? ` · Missing: ${r.missing.join(', ')}`
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </details>
      <details className="rounded-xl border bg-card p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Purchase-based P&amp;L · separate accounting view
        </summary>
        <p className="text-sm text-muted">
          Uses recorded purchases and expenses, not recipe consumption. Without
          expense entries, this calculation can equal revenue.
        </p>
        <p className="mt-2">
          Net revenue{' '}
          {formatMoney(Number(d.pnl.summary.net_revenue ?? 0), 'TRY')} ·
          Recorded expenses {formatMoney(d.accounting_expenses, 'TRY')} · Net{' '}
          {formatMoney(Number(d.pnl.summary.net_profit ?? 0), 'TRY')}
        </p>
      </details>
      {profile?.role === 'admin' ? (
        <details
          className="rounded-xl border bg-card p-4"
          onToggle={(e) => setShowHistory(e.currentTarget.open)}
        >
          <summary className="min-h-11 cursor-pointer font-semibold">
            Historical records · reference only
          </summary>
          {showHistory ? <HistoricalRecords /> : null}
        </details>
      ) : null}
    </div>
  )
}

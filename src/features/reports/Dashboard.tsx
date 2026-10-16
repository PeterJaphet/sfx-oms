import { DailyOrderTotals } from './DailyOrderTotals'
import { HistoricalRecords } from './HistoricalRecords'
import { toast } from 'sonner'
import { lazy, Suspense, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { formatMoney } from '@/lib/format'
import { loadDashboard } from './report-api'
import { findDefinition, type Range } from './report-model'
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
  const data = useQuery({
    queryKey: ['reports', 'dashboard', range],
    queryFn: () => loadDashboard(range),
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
    p = d.pnl.summary,
    s = d.sales.summary
  return (
    <div className="space-y-5">
      <DailyOrderTotals />
      {profile?.role === 'admin' ? <HistoricalRecords /> : null}
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
            p.net_revenue ?? 0,
            `${s.orders ?? 0} orders · average ${s.average_order == null ? '—' : formatMoney(Number(s.average_order), 'TRY')}`,
          ],
          [
            'Cost of goods',
            p.cost_of_goods ?? 0,
            `Gross margin ${p.gross_margin == null ? '—' : `${(Number(p.gross_margin) * 100).toFixed(2)}%`}`,
          ],
          [
            'Operational + fixed',
            d.operational_fixed,
            `${formatMoney(Number(p.operational_expenses ?? 0), 'TRY')} operational · ${formatMoney(Number(p.fixed_overheads ?? 0), 'TRY')} fixed`,
          ],
          [
            'Net profit',
            p.net_profit ?? 0,
            `Net margin ${p.net_margin == null ? '—' : `${(Number(p.net_margin) * 100).toFixed(2)}%`}`,
          ],
        ].map(([label, amount, sub]) => (
          <article
            key={String(label)}
            className={`min-w-0 space-y-2 rounded-xl border p-4 ${label === 'Net profit' ? 'bg-brand text-card' : 'bg-card'}`}
          >
            <h2 className="text-sm font-semibold">{String(label)}</h2>
            <p className="break-words text-2xl font-bold sm:text-3xl">
              {formatMoney(Number(amount), 'TRY')}
            </p>
            <p
              className={`text-xs ${label === 'Net profit' ? 'text-card' : 'text-muted'}`}
            >
              {String(sub)}
            </p>
          </article>
        ))}
      </section>
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
    </div>
  )
}

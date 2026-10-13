import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { loadRecentExpenses } from './money-api'
export default function ExpensesPage() {
  const query = useQuery({
    queryKey: ['money', 'expenses'],
    queryFn: loadRecentExpenses,
    refetchInterval: 15000,
  })
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-extrabold">Expenses</h2>
      <p className="text-sm text-muted">
        Last 20 expense entries from the database. Advances appear here only
        when supplies are logged; full reports follow in M9.
      </p>
      {query.error ? (
        <div role="alert">
          <p className="text-brand-strong">{query.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch()
            }}
          >
            Reload expenses
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status">Loading expenses…</p>
      ) : query.data.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {query.data.map((e) => (
            <article
              key={`${e.source}:${e.id}`}
              className="space-y-2 rounded-xl border bg-card p-4"
            >
              <div className="flex justify-between gap-3">
                <strong className="min-w-0 break-words">{e.description}</strong>
                <strong className="shrink-0">
                  {formatMoney(e.amount_try, 'TRY')}
                </strong>
              </div>
              <p className="text-sm text-muted">
                {e.category} · {e.business_date}
              </p>
              <p className="text-xs text-muted">
                {e.kind === 'cogs'
                  ? 'Cost of goods'
                  : e.kind === 'operational'
                    ? 'Operational'
                    : 'Fixed overhead'}{' '}
                ·{' '}
                {e.source === 'direct_expense'
                  ? 'Direct expense'
                  : 'Supply purchase'}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-muted">
          No expenses recorded.
        </p>
      )}
    </section>
  )
}

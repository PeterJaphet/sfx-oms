import { Link } from 'react-router-dom'
import { formatMoney } from '@/lib/format'
import { cashLineNames, type CloseContext } from './close-model'
export function CashBreakdown({ data }: { data: CloseContext }) {
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-label="Expected cash"
    >
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
        {data.account_name} expected in the till
      </h2>
      <div className="flex justify-between gap-3 text-sm">
        <span>Opening float / carried balance</span>
        <span className="shrink-0 font-semibold">
          {formatMoney(data.opening, data.currency)}
        </span>
      </div>
      {data.lines.map((l) => (
        <div key={l.entry_type} className="flex justify-between gap-3 text-sm">
          <span>
            {cashLineNames[l.entry_type] ?? l.entry_type.replaceAll('_', ' ')}
          </span>
          <span
            className={`shrink-0 font-semibold ${l.amount < 0 ? 'text-brand-strong' : ''}`}
          >
            {l.amount > 0 ? '+' : ''}
            {formatMoney(l.amount, data.currency)}
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t pt-3 font-bold">
        <span>Expected</span>
        <span className="text-2xl">
          {formatMoney(data.expected, data.currency)}
        </span>
      </div>
    </section>
  )
}
export function CloseChecks({
  data,
  links = true,
}: {
  data: CloseContext
  links?: boolean
}) {
  return (
    <section className="space-y-3" aria-label="Before you close">
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
        Before you close
      </h2>
      <div
        className={`space-y-2 rounded-xl p-4 ${data.unpaid_orders.length ? 'bg-amber-soft text-amber-ink' : 'bg-ok-soft text-ok'}`}
      >
        <h3 className="font-semibold">
          {data.unpaid_orders.length
            ? `${data.unpaid_orders.length} order${data.unpaid_orders.length === 1 ? '' : 's'} not fully paid`
            : 'All orders paid'}
        </h3>
        {data.unpaid_orders.map((o) => {
          const text = `#${String(o.daily_number).padStart(3, '0')}${o.customer_name ? ` · ${o.customer_name}` : ''} · ${formatMoney(o.balance_due, 'TRY')} due`
          return links ? (
            <Link
              className="flex min-h-11 items-center rounded-lg border border-current p-2 text-sm"
              key={o.id}
              to={`/orders?date=${o.business_date}&order=${o.id}`}
            >
              {text}
            </Link>
          ) : (
            <p key={o.id} className="break-words text-sm">
              {text}
            </p>
          )
        })}
      </div>
      <div
        className={`space-y-2 rounded-xl p-4 ${data.advances.length ? 'bg-amber-soft text-amber-ink' : 'bg-ok-soft text-ok'}`}
      >
        <h3 className="font-semibold">
          {data.advances.length
            ? `${data.advances.length} advance${data.advances.length === 1 ? '' : 's'} to review`
            : 'All advances accounted for'}
        </h3>
        <p className="text-xs">
          Open advances now, including amounts owed to staff.
        </p>
        {data.advances.map((a) => (
          <p key={a.id} className="break-words text-sm">
            {a.recipient_name} · {a.purpose} ·{' '}
            {formatMoney(Math.abs(a.remaining), a.currency)}{' '}
            {a.state === 'owed_to_staff' ? 'owed to staff' : 'to account for'}
          </p>
        ))}
      </div>
    </section>
  )
}

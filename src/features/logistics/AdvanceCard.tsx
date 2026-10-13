import { useFinancialDay } from '@/features/close/financial-day'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { useLogistics } from './logistics-context'
import type { Advance } from './purchase-model'
export default function AdvanceCard({
  advance: a,
  onReturn,
}: {
  advance: Advance
  onReturn: (advance: Advance) => void
}) {
  const state = useLogistics()
  const financial = useFinancialDay()
  return (
    <article
      className="space-y-3 rounded-xl bg-ink p-4 text-card"
      aria-label={`Advance ${a.purpose}`}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="break-words text-sm font-semibold">
          Advance · {a.purpose}
        </h2>
        <span className="text-xs">{a.business_date}</span>
      </div>
      <p className="text-xs">
        {a.recipient_name} · {a.account_name}
        {a.age_days > 3 ? ` · ${a.age_days} days old` : ''}
      </p>
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            ['Given', a.amount],
            ['Spent', a.spent],
            [
              a.remaining < 0 ? 'Owed to staff' : 'You hold',
              Math.abs(a.remaining),
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs">{label}</dt>
            <dd
              className={`break-words text-lg font-bold ${label === 'You hold' || label === 'Owed to staff' ? 'text-amber' : ''}`}
            >
              {formatMoney(value, a.currency)}
            </dd>
          </div>
        ))}
      </dl>
      {a.change_returned !== 0 || a.reimbursed !== 0 ? (
        <p className="text-xs">
          Returned {formatMoney(a.change_returned, a.currency)} · Reimbursed{' '}
          {formatMoney(a.reimbursed, a.currency)}
        </p>
      ) : null}
      {a.state === 'open' ? (
        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="bg-amber text-ink hover:bg-amber-soft">
            <Link to={`/purchases/new?advance=${a.id}`}>Log supplies</Link>
          </Button>
          <Button
            variant="secondary"
            disabled={financial.blocked || state.busy || !!state.pending}
            onClick={() => onReturn(a)}
          >
            Return change
          </Button>
        </div>
      ) : (
        <p className="text-sm font-semibold">
          {a.state === 'accounted'
            ? 'Accounted for'
            : 'Owed to staff; ask Admin to reimburse the overspend.'}
        </p>
      )}
    </article>
  )
}

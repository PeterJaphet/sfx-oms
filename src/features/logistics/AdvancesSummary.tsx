import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { useActiveAdvances } from './logistics-api'
import type { Advance } from './purchase-model'
import AdvanceCard from './AdvanceCard'
import ReturnChange from './ReturnChange'
export default function AdvancesSummary() {
  const { profile } = useAuth()
  const query = useActiveAdvances()
  const [selected, setSelected] = useState<Advance | null>(null)
  const current = selected
    ? (query.data?.find((a) => a.id === selected.id) ?? selected)
    : null
  const own = query.data?.filter((a) => a.recipient_id === profile!.id) ?? []
  return (
    <section className="space-y-3" aria-label="My advances">
      {query.error ? (
        <div role="alert">
          <p className="text-brand-strong">{query.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch()
            }}
          >
            Reload my advances
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status">Loading advances…</p>
      ) : own.length ? (
        <AdvanceCard advance={own[0]} onReturn={setSelected} />
      ) : (
        <p className="text-sm text-muted">No open advances assigned to you.</p>
      )}
      <Link
        to="/advances"
        className="flex min-h-11 items-center font-semibold text-brand-strong"
      >
        {profile!.role === 'admin' ? 'View all advances' : 'View my advances'}
        {own.length > 1 ? ` (${own.length})` : ''}
      </Link>
      {current ? (
        <ReturnChange advance={current} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  )
}

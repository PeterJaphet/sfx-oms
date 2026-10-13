import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { loadAdvances, useActiveAdvances } from './logistics-api'
import type { Advance } from './purchase-model'
import AdvanceCard from './AdvanceCard'
import ReturnChange from './ReturnChange'
export default function AdvancesPage() {
  const { profile } = useAuth()
  const active = useActiveAdvances()
  const [tab, setTab] = useState('active')
  const [selected, setSelected] = useState<Advance | null>(null)
  const accounted = useInfiniteQuery({
    queryKey: ['logistics', 'advances', 'accounted'],
    initialPageParam: 0,
    enabled: tab === 'accounted',
    refetchInterval: 15000,
    queryFn: ({ pageParam }) => loadAdvances('accounted', pageParam),
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
  })
  const current = selected
    ? (active.data?.find((a) => a.id === selected.id) ?? selected)
    : null
  const rows = tab === 'active' ? active.data : accounted.data?.pages.flat()
  const query = tab === 'active' ? active : accounted
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold">
          {profile!.role === 'admin' ? 'Advances' : 'My advances'}
        </h1>
        <Link
          to="/purchases"
          className="flex min-h-11 items-center font-semibold text-brand-strong"
        >
          Purchase history
        </Link>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Advance status"
      >
        {[
          ['active', 'Open / owed to staff'],
          ['accounted', 'Accounted for'],
        ].map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? 'default' : 'secondary'}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
          >
            {label}
          </Button>
        ))}
      </div>
      {query.error ? (
        <div role="alert">
          <p className="text-brand-strong">{query.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch()
            }}
          >
            Reload advances
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status">Loading advances…</p>
      ) : rows?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((a) => (
            <AdvanceCard key={a.id} advance={a} onReturn={setSelected} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-muted">
          {tab === 'active'
            ? 'No open advances.'
            : 'No accounted advances yet.'}
        </p>
      )}
      {tab === 'accounted' && accounted.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={accounted.isFetchingNextPage}
          onClick={() => {
            void accounted.fetchNextPage()
          }}
        >
          Load more advances
        </Button>
      ) : null}
      {current ? (
        <ReturnChange advance={current} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  )
}

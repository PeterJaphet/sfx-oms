import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { client } from './menu-api'

const time = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Nicosia' })
export function PriceHistory({ addonId, variants }: { addonId?: string; variants: { id: string; name: string }[] }) {
  const [page, setPage] = useState(0)
  const history = useQuery({ queryKey: ['price-history', addonId, variants.map(v => v.id), page], queryFn: async () => {
    let request = client().from('price_history').select('*, profiles!price_history_changed_by_fkey(full_name)', { count: 'exact' })
    request = addonId ? request.eq('addon_id', addonId) : request.in('variant_id', variants.map(v => v.id))
    const { data, error, count } = await request.order('changed_at', { ascending: false }).order('id', { ascending: false }).range(page * 25, page * 25 + 24)
    if (error) throw new Error(error.message)
    return { entries: data, count: count ?? 0 }
  } })
  if (history.isPending) return <p role="status">Loading price history…</p>
  if (history.error) return <div role="alert"><p className="mb-3 text-brand-strong">{history.error.message}</p><Button variant="secondary" onClick={() => { void history.refetch() }}>Try again</Button></div>
  return <div className="space-y-3"><p className="text-sm text-muted">Times shown in Cyprus time.</p>{history.data.entries.length === 0 ? <p>No price changes yet.</p> : <ol className="space-y-3">{history.data.entries.map(entry => <li key={entry.id} className="rounded-xl border bg-card p-4">
    <p className="font-semibold">{entry.old_price === null ? 'Initial price' : formatMoney(entry.old_price, 'TRY')} → {formatMoney(entry.new_price, 'TRY')}</p>
    {!addonId ? <p className="mt-1 text-sm text-ink-2">{variants.find(v => v.id === entry.variant_id)?.name ?? 'Variant'}</p> : null}
    <p className="mt-2 text-sm text-muted">{entry.profiles?.full_name ?? 'Initial setup'} · <time dateTime={entry.changed_at}>{time.format(new Date(entry.changed_at))}</time></p>
  </li>)}</ol>}
  <div className="flex items-center justify-between gap-2"><Button variant="secondary" size="secondary" className="text-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm text-muted">Page {page + 1}</span><Button variant="secondary" size="secondary" className="text-sm" disabled={(page + 1) * 25 >= history.data.count} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
}

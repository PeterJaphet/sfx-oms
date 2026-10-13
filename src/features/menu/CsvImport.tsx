import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { client, loadMenu, useMenuSave } from './menu-api'
import { parseMenuCsv, previewImport, sampleCsv, type PreviewRow } from './menu-csv'

export function CsvImport({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const save = useMenuSave(async () => {
    const payload = rows.map(({ category, product, variant, price }) => ({ category, product, variant, price }))
    const { error } = await client().rpc('import_menu_products', { p_rows: payload })
    if (error) throw new Error(error.message)
  }, onSaved)
  return <div className="space-y-4"><p className="text-sm text-ink-2">One row per variant. Required columns: category, product, variant, price. Prices are in lira. Import up to 500 rows.</p>
    <Button asChild variant="secondary" size="secondary" className="text-sm"><a href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`} download="sfx-menu-template.csv">Download template</a></Button>
    <label htmlFor="menu-csv" className="block text-sm font-semibold">Choose CSV file</label><input id="menu-csv" type="file" accept=".csv,text/csv" disabled={loading || save.isPending} className="block min-h-11 w-full min-w-0 rounded-lg border bg-card p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-chip file:p-2" onChange={async event => {
      const file = event.target.files?.[0]; setRows([]); setError(undefined); if (!file) return
      setLoading(true)
      try {
        if (file.size > 1024 * 1024) throw new Error('Choose a CSV smaller than 1 MB')
        const parsed = parseMenuCsv(await file.text())
        setRows(previewImport(parsed, await loadMenu()))
      } catch (e) { const message = (e as Error).message; setError(message); toast.error(message) }
      finally { setLoading(false) }
    }} />
    {loading ? <p role="status">Preparing preview…</p> : null}
    {error || save.error ? <p role="alert" className="break-words text-sm text-brand-strong">{error ?? save.error?.message}</p> : null}
    {rows.length ? <><div className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">Exact category + product + variant matches update the price. Existing inactive items stay inactive. All rows save together.</div><h3 className="font-bold">Preview · {rows.length} rows</h3><ol className="space-y-2">{rows.map((row, index) => <li key={index} className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted">{row.category}</p><p className="break-words font-semibold">{row.product} · {row.variant}</p><p className="mt-1 text-sm">{row.oldPrice !== undefined ? `${formatMoney(row.oldPrice, 'TRY')} → ` : ''}{formatMoney(Number(row.price), 'TRY')}</p><p className="mt-1 text-sm font-semibold text-brand-strong">{row.action}{row.inactive ? ' · stays inactive' : ''}</p>
    </li>)}</ol><Button requiresOnline className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Importing…' : `Import ${rows.length} rows`}</Button></> : null}
  </div>
}

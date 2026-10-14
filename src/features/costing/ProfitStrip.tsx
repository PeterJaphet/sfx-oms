import { formatMoney } from '@/lib/format'
import type { Profit } from './cost-model'
/** Always-visible figures returned by the quote RPC, never calculated locally. */
export function ProfitStrip({profit,updating}:{profit:Profit;updating:boolean}){
 return <section aria-label="Order profit quick view" aria-busy={updating} className="mx-auto max-w-7xl border-b px-4 py-2 sm:px-6">
  <div className="grid grid-cols-3 gap-2">{([['Revenue',profit.revenue],['Est. gross profit',profit.gross_profit],['Est. net profit',profit.net_profit]] as const).map(([label,n])=><div key={label} className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="break-words font-heading text-base font-bold">{n===null?'—':formatMoney(n,'TRY')}</p></div>)}</div>
  {updating||!profit.complete?<p role="status" className="mt-1 text-xs text-amber-ink">{updating?'Updating profit…':'Costing incomplete · see breakdown above'}</p>:null}
 </section>
}

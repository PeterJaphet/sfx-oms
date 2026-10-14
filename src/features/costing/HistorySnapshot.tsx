import { formatMoney } from '@/lib/format'
import { recipeInputs,planInputs } from './cost-model'
export function HistorySnapshot({snapshot}:{snapshot:Record<string,unknown>}){
 const recipe=recipeInputs.safeParse(snapshot.inputs)
 const plan=planInputs.safeParse(snapshot.inputs)
 const rows: [string,string][]=[]
 if(recipe.success){
  const r=recipe.data
  rows.push(...r.ingredients.map(l=>[l.name,formatMoney(l.cost,'TRY')] as [string,string]),['Packaging / batch',formatMoney(r.packaging,'TRY')],['Operational / batch',formatMoney(r.overhead,'TRY')],['Portions / batch',String(r.yield)],['Multiplier',`${r.multiplier}×`],['Round price up to',formatMoney(r.rounding,'TRY')],['Planned batches / week',String(r.planned_batches)])
 }else if(plan.success){
  const p=plan.data
  rows.push(['Monthly rent',formatMoney(p.rent_usd,'USD')],['Monthly payroll',formatMoney(p.payroll_usd,'USD')],['Planning rate',`₺${p.usd_rate} / $1`],...p.weekly_fixed.map(l=>[l.name,formatMoney(l.cost,'TRY')] as [string,string]),['Scenario rates',p.scenarios.join(', ')])
 }
 return <div className="space-y-3 border-t pt-3"><p className="text-xs text-muted">Saved version {String(snapshot.revision??'')}</p><dl className="space-y-2">{rows.map(([k,v],i)=><div className="flex flex-wrap justify-between gap-2 text-sm" key={i}><dt className="min-w-0 max-w-full break-words">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl></div>
}

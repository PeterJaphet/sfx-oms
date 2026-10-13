import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import type { Role } from '@/features/auth/permissions'
import { channelName,itemText,nextAction,orderNumber,paymentLabel,statusNames,typeName,type BoardOrder } from './board-model'

export function PaymentBadge({order}:{order:BoardOrder}){return <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${order.status==='cancelled'?'bg-chip text-muted':order.balance_due>0?'bg-amber-soft text-amber-ink':'bg-ok-soft text-ok'}`}>{paymentLabel(order)}</span>}
export function OrderCard({order,role,busy,onOpen,onAdvance}:{order:BoardOrder;role:Role;busy:boolean;onOpen:()=>void;onAdvance:()=>void}){
 const action=nextAction(order,role)
 return <article className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><button className="flex min-h-11 items-baseline gap-2 text-left" onClick={onOpen} aria-label={`Open order ${orderNumber(order)}`}><span className="font-heading text-[22px] font-extrabold">{orderNumber(order)}</span><span className="text-xs text-muted">{new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Nicosia',hour:'2-digit',minute:'2-digit'}).format(new Date(order.created_at))} · {channelName(order.channel)}</span></button><PaymentBadge order={order}/></div>
  <p className="break-words text-[15px]">{order.items.map(itemText).join(', ')}</p>
  {order.customer_name?<p className="break-words text-sm text-ink-2">{order.customer_name}</p>:null}
  <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-chip px-2 py-1 text-xs font-bold text-ink-2">{typeName(order.order_type)}</span><span className="font-bold">{formatMoney(order.total,'TRY')}</span><span className="text-xs text-muted">{statusNames[order.status]}</span></div>{action?<Button className="bg-ink text-sm hover:bg-ink-2" size="secondary" disabled={busy} onClick={onAdvance}>{action.label}</Button>:<Button size="secondary" variant="secondary" onClick={onOpen}>Details</Button>}</div>
 </article>
}

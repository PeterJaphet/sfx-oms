import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { loadSavedOrder } from './order-api'
import { useOrder } from './order-context'
export function SavedOrder({ id }: { id: string }) {
  const workspace = useOrder()
  const saved = useQuery({ queryKey: ['orders', 'saved', id], queryFn: () => loadSavedOrder(id), staleTime: 15_000 })
  if (saved.isPending) return <p role="status" className="p-4">Loading saved order…</p>
  if (saved.error) return <div role="alert" className="space-y-3 p-4"><p className="text-brand-strong">{saved.error.message}</p><Button onClick={() => { void saved.refetch() }}>Retry confirmation</Button></div>
  const { order, items, payment } = saved.data
  return <section className="space-y-4 p-4 sm:p-6"><p className="text-sm font-semibold text-ok">Order saved</p><h1 className="text-[26px] font-extrabold">Order <span className="text-brand-strong">#{String(order.daily_number).padStart(3, '0')}</span></h1><p className="text-sm text-muted">Business day {order.business_date} · {order.order_type === 'dine_in' ? 'Dine-in' : order.order_type === 'delivery' ? 'Delivery' : 'Pickup'}</p>
    <div className="space-y-3 rounded-xl border bg-card p-4">{items.map(item => <div key={item.id}><div className="flex justify-between gap-3"><p className="break-words font-semibold">{item.quantity} × {item.product_name}</p><span className="shrink-0">{formatMoney(item.line_total, 'TRY')}</span></div><p className="text-sm text-muted">{item.variant_name}</p>{Array.isArray(item.addons) && item.addons.length ? <p className="text-sm text-muted">{item.addons.map(a => typeof a === 'object' && a && 'name' in a ? String(a.name) : '').join(', ')}</p> : null}</div>)}
      {order.discount_amount > 0 ? <p className="text-sm text-muted">Discount {formatMoney(order.discount_amount, 'TRY')} · {order.discount_reason}</p> : null}<div className="flex justify-between border-t pt-3 text-xl font-bold"><span>Total</span><span>{formatMoney(order.total, 'TRY')}</span></div>
    </div><div role="status" className={`rounded-xl p-4 font-bold ${payment.balance_due > 0 ? 'bg-amber-soft text-amber-ink' : 'bg-ok-soft text-ok'}`}><span>{payment.balance_due > 0 ? `${formatMoney(payment.balance_due, 'TRY')} due` : 'Paid'}</span><p className="mt-1 text-sm font-normal">Received {formatMoney(payment.paid_try, 'TRY')}{payment.paid_via ? ` · ${payment.paid_via}` : ''}</p></div>
    {order.customer_name ? <p className="text-sm">Customer: {order.customer_name}</p> : null}{order.delivery_address ? <p className="break-words text-sm">Deliver to: {order.delivery_address}</p> : null}{order.note ? <p className="break-words text-sm">Note: {order.note}</p> : null}
    <Button asChild variant="secondary" className="w-full"><Link to="/orders">View orders</Link></Button>
    <Button asChild className="w-full"><Link to="/order" onClick={workspace.clear}>New order</Link></Button>
  </section>
}

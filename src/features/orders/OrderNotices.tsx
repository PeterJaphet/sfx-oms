import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useOrder } from './order-context'
export function OrderNotices() {
  const order = useOrder()
  return <>{order.storageWarning ? <p role="alert" className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">This browser cannot keep your draft after a reload. Keep this page open until the order is confirmed.</p> : null}
    {order.attempt && !order.saving ? <div role="alert" className="space-y-3 rounded-xl bg-amber-soft p-4 text-amber-ink"><p className="font-semibold">Save confirmation is pending.</p><p className="text-sm">Retry to confirm the same order before starting another.</p><div className="flex flex-wrap gap-2"><Button size="secondary" onClick={() => { void order.retrySave() }}>Retry save</Button><Button asChild variant="secondary" size="secondary"><Link to="/order/pay">Open checkout</Link></Button></div></div> : null}
    {order.error ? <p role="alert" className="break-words text-sm text-brand-strong">{order.error.message}</p> : null}</>
}

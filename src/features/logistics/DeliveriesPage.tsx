import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import {
  changeStatus,
  loadDeliveries,
  refreshOrderData,
} from '@/features/orders/board-api'
import {
  deliveryAge,
  itemText,
  nextAction,
  orderNumber,
  type BoardOrder,
} from '@/features/orders/board-model'
import { PaymentBadge } from '@/features/orders/OrderCard'
import { cn } from '@/lib/utils'
import AdvancesSummary from './AdvancesSummary'

export default function DeliveriesPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('all')
  const query = useQuery({
    queryKey: ['deliveries'],
    queryFn: loadDeliveries,
    refetchInterval: 15000,
  })
  const mutation = useMutation({
    mutationFn: async (o: BoardOrder) => {
      const action = nextAction(o, profile!.role)
      if (action) await changeStatus(o.id, action.status)
    },
    onSettled: () => refreshOrderData(qc),
    onError: (e: Error) => toast.error(e.message),
  })
  const orders = query.data ?? []
  const visible = orders.filter((o) => tab === 'all' || o.status === tab)
  return (
    <section className="space-y-4">
      <h1 className="text-[26px] font-extrabold sm:text-[34px]">
        Ready orders
      </h1>
      <p className="text-sm text-muted">
        Delivery orders · oldest ready first · updates every 15 seconds
      </p>
      <AdvancesSummary />
      <div
        className="flex rounded-xl bg-chip p-1"
        role="group"
        aria-label="Delivery status"
      >
        {[
          ['all', 'All'],
          ['ready', 'Ready'],
          ['picked_up', 'Out'],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold',
              tab === id ? 'bg-card' : 'text-muted',
            )}
          >
            {label}{' '}
            {orders.filter((o) => id === 'all' || o.status === id).length}
          </button>
        ))}
      </div>
      {query.error ? (
        <div role="alert" className="space-y-3">
          <p className="text-brand-strong">{query.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch()
            }}
          >
            Refresh deliveries
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status">Loading deliveries…</p>
      ) : visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((o) => {
            const action = nextAction(o, profile!.role)
            const phone = o.customer_phone?.replace(/[^+\d]/g, '')
            return (
              <article
                key={o.id}
                className="space-y-3 rounded-xl border bg-card p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-heading text-[22px] font-extrabold">
                      {orderNumber(o)}
                    </h2>
                    <span className="text-xs text-muted">{deliveryAge(o)}</span>
                  </div>
                  <PaymentBadge order={o} />
                </div>
                <p className="text-xs text-muted">
                  Business day {o.business_date} · Delivery
                </p>
                <p className="break-words font-semibold">
                  {o.customer_name || 'Customer name not provided'}
                </p>
                <p className="break-words text-ink-2">{o.delivery_address}</p>
                <p className="break-words text-sm text-muted">
                  {o.items.map(itemText).join(', ')}
                </p>
                {o.note ? (
                  <p className="break-words text-sm">Note: {o.note}</p>
                ) : null}
                <div className="flex gap-2">
                  {phone ? (
                    <Button
                      asChild
                      variant="secondary"
                      className="w-13 shrink-0 px-0"
                    >
                      <a
                        href={`tel:${phone}`}
                        aria-label={`Call ${o.customer_name || 'customer'}`}
                      >
                        <Phone className="h-5 w-5" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : (
                    <span className="flex items-center text-xs text-muted">
                      No phone
                    </span>
                  )}
                  {action ? (
                    <Button
                      className={cn(
                        'min-w-0 flex-1',
                        o.status === 'ready' ? 'bg-ink hover:bg-ink-2' : '',
                      )}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(o)}
                    >
                      {action.label}
                    </Button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-5 text-muted">
          No deliveries in this view.
        </p>
      )}
    </section>
  )
}

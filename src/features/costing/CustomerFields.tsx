import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useOrder } from "@/features/orders/order-context";
import { orderTypes } from "@/features/orders/order-model";
export function CustomerFields({ disabled }: { disabled: boolean }) {
  const order = useOrder();
  const d = order.draft.details;
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-xl border bg-card p-3"
      aria-label="Customer and delivery details"
    >
      <legend className="sr-only">Customer and delivery details</legend>
      <div
        className="flex rounded-lg bg-chip p-1"
        role="group"
        aria-label="Order type"
      >
        {orderTypes.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={d.order_type === value}
            onClick={() =>
              order.update((s) => ({
                ...s,
                details: { ...s.details, order_type: value },
              }))
            }
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm font-semibold",
              d.order_type === value ? "bg-card" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="order-customer-name"
            className="mb-2 block text-sm font-semibold"
          >
            Customer name (optional)
          </label>
          <Input
            id="order-customer-name"
            autoComplete="name"
            maxLength={120}
            value={d.customer_name}
            onChange={(e) =>
              order.update((s) => ({
                ...s,
                details: { ...s.details, customer_name: e.target.value },
              }))
            }
          />
        </div>
        <div>
          <label
            htmlFor="order-customer-phone"
            className="mb-2 block text-sm font-semibold"
          >
            Customer phone (optional)
          </label>
          <Input
            id="order-customer-phone"
            type="tel"
            autoComplete="tel"
            maxLength={60}
            value={d.customer_phone}
            onChange={(e) =>
              order.update((s) => ({
                ...s,
                details: { ...s.details, customer_phone: e.target.value },
              }))
            }
          />
        </div>
      </div>
      {d.order_type === "delivery" ? (
        <div>
          <label
            htmlFor="order-delivery-address"
            className="mb-2 block text-sm font-semibold"
          >
            Delivery address (required)
          </label>
          <textarea
            id="order-delivery-address"
            autoComplete="street-address"
            maxLength={1000}
            value={d.delivery_address}
            className="min-h-24 w-full rounded-lg border border-line-strong bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onChange={(e) =>
              order.update((s) => ({
                ...s,
                details: { ...s.details, delivery_address: e.target.value },
              }))
            }
          />
          {!d.delivery_address.trim() ? (
            <p className="text-sm text-amber-ink">
              Enter an address before checkout.
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

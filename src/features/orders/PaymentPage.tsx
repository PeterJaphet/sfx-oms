import { ProfitSummary } from "@/features/costing/ProfitSummary";
import { useFinancialDay } from "@/features/close/financial-day";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { extraText } from "./extra-model";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useOrderReference } from "./order-api";
import { useOrder } from "./order-context";
import { useOrderQuote } from "./order-hooks";
import { channels, detailsSchema, orderTypes } from "./order-model";
import { DiscountForm } from "./OrderForms";
import { OrderNotices } from "./OrderNotices";
import { SavedOrder } from "./SavedOrder";

export default function PaymentPage() {
  const financial = useFinancialDay();
  const order = useOrder(),
    reference = useOrderReference(),
    quote = useOrderQuote();

  const [discount, setDiscount] = useState(false);

  if (order.savedId) return <SavedOrder id={order.savedId} />;
  if (order.draft.items.length === 0) return <Navigate to="/order" replace />;
  const locked = financial.blocked || !!order.attempt || order.saving;
  const detailsValid = detailsSchema.safeParse(order.draft.details).success;
  const selected = order.draft.settlement_account;
  const account = reference.data?.accounts.find((a) => a.id === selected);
  const canSave =
    !locked &&
    detailsValid &&
    !!account &&
    !!quote.data?.cost_token &&
    !quote.isFetching &&
    (quote.data?.total === 0 ||
      account.currency === "TRY" ||
      (/^\d+(\.\d{1,2})?$/.test(order.draft.settlement_amount) &&
        Number(order.draft.settlement_amount) > 0));
  return (
    <section className="pb-[calc(132px+env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3 border-b bg-card p-4">
        <Button asChild variant="secondary" size="secondary" className="px-3">
          <Link to="/order" aria-label="Back to order">
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <p className="text-xs text-muted">
            {channels.find(([v]) => v === order.draft.channel)?.[1]} ·{" "}
            {
              orderTypes.find(
                ([v]) => v === order.draft.details.order_type,
              )?.[1]
            }
          </p>
          <h1 className="text-2xl font-extrabold">Review order</h1>
          <p className="text-xs text-muted">
            Order date {order.draft.order_date || reference.data?.businessDate}
          </p>
        </div>
        <BrandLogo variant="mark" decorative className="ml-auto w-11" />
      </header>
      <div className="space-y-4 p-4 sm:p-6">
        <OrderNotices />
        <section
          className="space-y-3 rounded-xl border bg-card p-4"
          aria-label="Order summary"
        >
          {quote.isPending ? (
            <p role="status">Calculating total…</p>
          ) : quote.error ? (
            <div role="alert" className="space-y-3">
              <p className="text-brand-strong">{quote.error.message}</p>
              <Button
                variant="secondary"
                size="secondary"
                onClick={() => {
                  void quote.refetch();
                }}
              >
                Try again
              </Button>
              <Button asChild variant="secondary" size="secondary">
                <Link to="/order">Review items</Link>
              </Button>
            </div>
          ) : (
            <>
              {quote.data.items.map((item) => (
                <div key={item.position}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="break-words">
                      {item.quantity} × {item.product_name}
                    </span>
                    <span className="shrink-0 font-semibold">
                      {formatMoney(item.line_total, "TRY")}
                    </span>
                  </div>
                  {item.variant_name !== "Regular" || item.addons.length ? (
                    <p className="mt-1 text-xs text-muted">
                      {item.variant_name}
                      {item.addons.length
                        ? ` · ${extraText(item.addons, item.quantity)}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 border-t pt-2">
                <span className="text-sm text-muted">
                  Discount
                  {quote.data.discount_amount
                    ? ` · ${formatMoney(quote.data.discount_amount, "TRY")}`
                    : ""}
                </span>
                <Button
                  variant="secondary"
                  size="secondary"
                  className="px-3 text-sm"
                  disabled={locked}
                  onClick={() => setDiscount(true)}
                >
                  {order.draft.discount.kind === "none"
                    ? "Add discount"
                    : "Edit discount"}
                </Button>
              </div>
              {order.draft.discount.reason ? (
                <p className="text-xs text-muted">
                  {order.draft.discount.reason}
                </p>
              ) : null}
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">Total</span>
                <span className="text-[26px] font-bold">
                  {formatMoney(quote.data.total, "TRY")}
                </span>
              </div>
              {quote.isFetching ? (
                <p role="status" className="text-xs text-muted">
                  Updating total…
                </p>
              ) : null}
            </>
          )}
        </section>
        <section
          className="space-y-2 rounded-xl border bg-card p-3"
          aria-label="Customer details"
        >
          <p className="break-words text-sm">
            Customer: {order.draft.details.customer_name || "Not entered"}
          </p>
          {order.draft.details.customer_phone ? (
            <p className="text-sm">
              Phone: {order.draft.details.customer_phone}
            </p>
          ) : null}
          {order.draft.details.order_type === "delivery" ? (
            <p className="break-words text-sm">
              Deliver to:{" "}
              {order.draft.details.delivery_address || "Address required"}
            </p>
          ) : null}
          <Button asChild variant="secondary">
            <Link to="/order">Edit customer details</Link>
          </Button>
        </section>
        {!detailsValid ? (
          <p role="alert" className="text-sm text-brand-strong">
            Enter a delivery address on the order screen before saving.
          </p>
        ) : null}
        {quote.data?.costing ? (
          <ProfitSummary
            profit={quote.data.costing}
            updating={quote.isFetching}
          />
        ) : null}
        <section aria-label="Pay with" className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
            Pay with
          </h2>
          {reference.isPending ? (
            <p role="status">Loading accounts…</p>
          ) : reference.error ? (
            <div role="alert">
              <p className="text-brand-strong">{reference.error.message}</p>
              <Button
                onClick={() => {
                  void reference.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {reference.data.accounts.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  aria-pressed={selected === a.id}
                  disabled={locked || !quote.data}
                  onClick={() =>
                    order.update((d) => ({
                      ...d,
                      settlement_account: a.id,
                      settlement_amount: "",
                      payments: [],
                    }))
                  }
                  className={cn(
                    "flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border p-1 disabled:opacity-50",
                    selected === a.id
                      ? "border-2 border-brand bg-brand text-card"
                      : "border-line-strong bg-card",
                  )}
                >
                  <span className="break-words text-sm font-bold">
                    {a.name}
                  </span>
                  <span className="text-xs">
                    {a.currency === "TRY"
                      ? "₺"
                      : a.currency === "USD"
                        ? "$"
                        : "₦"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
          Choose where payment will be received. Marking Delivered confirms
          receipt and records the full payment automatically. Accepting the
          order does not record payment.
        </p>
        {account &&
        account.currency !== "TRY" &&
        quote.data &&
        quote.data.total > 0 ? (
          <div className="space-y-2">
            <label htmlFor="settlement-amount" className="block font-semibold">
              Amount to receive ({account.currency})
            </label>
            <Input
              id="settlement-amount"
              inputMode="decimal"
              disabled={locked}
              value={order.draft.settlement_amount}
              onChange={(e) =>
                order.update((d) => ({
                  ...d,
                  settlement_amount: e.target.value,
                }))
              }
            />
            <p className="text-xs text-muted">
              Covers the whole order. The database records the implied exchange
              rate.
            </p>
          </div>
        ) : null}
        {order.draft.order_date &&
        order.draft.order_date !== reference.data?.businessDate ? (
          <p className="text-sm text-amber-ink">
            Earlier order: {order.draft.order_date}. Accept, then mark Delivered
            to record the payment on that business date. Check opening balances
            first to avoid counting old receipts twice.
          </p>
        ) : null}
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl space-y-2 border-t bg-card p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Button
          requiresOnline
          className="w-full"
          disabled={!canSave}
          onClick={() => {
            if (quote.data)
              void order.save(
                quote.data.quote_token,
                true,
                quote.data.cost_token,
              );
          }}
        >
          {order.saving ? "Saving…" : "Accept order"}
        </Button>
      </footer>
      <Sheet
        open={discount}
        onOpenChange={setDiscount}
        title="Discount"
        description="Enter an amount or percentage and a reason."
      >
        <DiscountForm onSaved={() => setDiscount(false)} />
      </Sheet>
    </section>
  );
}

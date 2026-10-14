import { ProfitSummary } from "@/features/costing/ProfitSummary";
import { useFinancialDay } from "@/features/close/financial-day";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { extraText } from "./extra-model";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useOrderReference, quoteOrder } from "./order-api";
import { useOrder } from "./order-context";
import { useOrderQuote } from "./order-hooks";
import {
  channels,
  detailsSchema,
  orderTypes,
  quotePayload,
  type DraftPayment,
} from "./order-model";
import { DiscountForm, PaymentForm } from "./OrderForms";
import { OrderNotices } from "./OrderNotices";
import { SavedOrder } from "./SavedOrder";

export default function PaymentPage() {
  const financial = useFinancialDay();
  const order = useOrder(),
    reference = useOrderReference(),
    quote = useOrderQuote(),
    queries = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [discount, setDiscount] = useState(false);
  const [checking, setChecking] = useState(false);
  if (order.savedId) return <SavedOrder id={order.savedId} />;
  if (order.draft.items.length === 0) return <Navigate to="/order" replace />;
  const locked =
    financial.blocked || !!order.attempt || order.saving || checking;
  const detailsValid = detailsSchema.safeParse(order.draft.details).success;
  const account = reference.data?.accounts.find((a) => a.id === selected);
  const latestRate = account
    ? reference.data?.rates.find(
        (rate) =>
          rate.currency === account.currency &&
          rate.effective_date <= reference.data!.businessDate,
      )
    : undefined;
  async function addPayment(payment: DraftPayment) {
    setChecking(true);
    try {
      const next = {
        ...order.draft,
        payments: [...order.draft.payments, payment],
      };
      const payload = quotePayload(next),
        result = await quoteOrder(payload);
      queries.setQueryData(["order-quote", payload], result);
      toast.dismiss("order-payment-error");
      order.update((d) => ({ ...d, payments: [...d.payments, payment] }));
      setSelected(null);
    } catch (e) {
      toast.error((e as Error).message, { id: "order-payment-error" });
      throw e;
    } finally {
      setChecking(false);
    }
  }
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
          <h1 className="text-2xl font-extrabold">Payment</h1>
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
                  onClick={() => setSelected(a.id)}
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
        {account && quote.data ? (
          <PaymentForm
            key={`${account.id}:${order.draft.payments.length}`}
            account={account}
            due={quote.data.balance_due}
            defaultRate={latestRate}
            onAdd={addPayment}
            disabled={locked}
          />
        ) : null}
        <section className="space-y-2" aria-label="Payments added">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
            Payments
          </h2>
          {order.draft.payments.length === 0 ? (
            <p className="text-sm text-muted">
              No payments added. You can save this order as unpaid.
            </p>
          ) : (
            order.draft.payments.map((payment, index) => {
              const line = quote.data?.payments[index];
              const a = reference.data?.accounts.find(
                (a) => a.id === payment.account_id,
              );
              return (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{a?.name ?? "Payment"}</p>
                    {line && line.currency !== "TRY" ? (
                      <p className="text-xs text-muted">
                        {formatMoney(line.amount, line.currency)}
                      </p>
                    ) : null}
                  </div>
                  <span className="ml-auto shrink-0 font-bold">
                    {formatMoney(line?.amount_try ?? payment.amount_try, "TRY")}
                  </span>
                  <Button
                    variant="secondary"
                    size="secondary"
                    className="px-2 text-xs"
                    disabled={locked}
                    aria-label={`Remove ${a?.name ?? "payment"} payment`}
                    onClick={() =>
                      order.update((d) => ({
                        ...d,
                        payments: d.payments.filter((p) => p.id !== payment.id),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              );
            })
          )}
          {quote.data ? (
            <div
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl p-4 font-bold",
                quote.data.balance_due > 0
                  ? "bg-amber-soft text-amber-ink"
                  : "bg-ok-soft text-ok",
              )}
            >
              <span>{quote.data.balance_due > 0 ? "Still due" : "Paid"}</span>
              <span className="text-lg">
                {formatMoney(quote.data.balance_due, "TRY")}
                {quote.data.balance_due > 0 ? " due" : ""}
              </span>
            </div>
          ) : null}
        </section>
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl space-y-2 border-t bg-card p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {order.draft.payments.length > 0 ? (
          <p className="text-xs text-muted">
            Save as unpaid excludes the payments above.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            requiresOnline
            variant="secondary"
            className="px-2 text-sm"
            disabled={
              locked ||
              !detailsValid ||
              !reference.data ||
              !quote.data ||
              !quote.data.cost_token ||
              quote.isFetching
            }
            onClick={() => {
              if (quote.data)
                void order.save(
                  quote.data.quote_token,
                  true,
                  quote.data.cost_token,
                );
            }}
          >
            Save as unpaid
          </Button>
          <Button
            requiresOnline
            className="px-2 text-sm"
            disabled={
              locked || !reference.data || !quote.data || quote.isFetching
            }
            onClick={() => {
              if (quote.data)
                void order.save(
                  quote.data.quote_token,
                  false,
                  quote.data.cost_token,
                );
            }}
          >
            {order.saving ? "Saving…" : "Send to kitchen"}
          </Button>
        </div>
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

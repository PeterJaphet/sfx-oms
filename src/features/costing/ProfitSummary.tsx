import { formatMoney } from "@/lib/format";
import { percent, type Profit } from "./cost-model";
import { useOrderProfit } from "./cost-api";
export function ProfitSummary({
  profit,
  updating = false,
}: {
  profit: Profit;
  updating?: boolean;
}) {
  const amount = (n: number | null) =>
    n === null ? "—" : formatMoney(n, "TRY");
  return (
    <section
      aria-label="Order profitability"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Order profitability</h2>
        <span role="status" className="text-xs text-muted">
          {profit.saved_at
            ? "Saved estimate"
            : updating
              ? "Updating…"
              : "Recipe estimate"}
        </span>
      </div>
      {profit.cancelled ? (
        <p className="break-words rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">
          Cancelled order. This original estimate is kept for history and
          excluded from profit reports.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
        {[
          ["Revenue", profit.revenue],
          ["Est. gross profit", profit.gross_profit],
          ["Est. net profit", profit.net_profit],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-xs text-muted">{label}</p>
            <p className="break-words text-xl font-bold">
              {amount(value as number | null)}
            </p>
          </div>
        ))}
      </div>
      {!profit.complete ? (
        <div
          role="status"
          className="break-words rounded-lg bg-amber-soft p-3 text-sm text-amber-ink"
        >
          <p className="font-semibold">Costing incomplete</p>
          {profit.missing.length ? (
            <p>
              Missing: {profit.missing.join(", ")}. Ask Admin to enter these
              costs.
            </p>
          ) : null}
          {profit.fixed_ratio === null ? (
            <p>Set a weekly sales plan to allocate fixed overhead.</p>
          ) : null}
        </div>
      ) : null}
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Cost breakdown and assumptions
        </summary>
        <dl className="space-y-2">
          {[
            ["Ingredients + packaging", amount(profit.cogs)],
            ["Recipe overhead", amount(profit.operational)],
            ["Allocated fixed overhead", amount(profit.fixed)],
            ["Gross margin", percent(profit.gross_margin)],
            ["Net margin", percent(profit.net_margin)],
            ["Fixed overhead share", percent(profit.fixed_ratio)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt>{k}</dt>
              <dd className="shrink-0 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-muted">
          Revenue is after discounts, including unpaid orders. Estimates use
          recipe costs and fixed overhead / planned weekly revenue. Actual
          P&amp;L uses recorded expenses.
        </p>
      </details>
    </section>
  );
}
export function SavedProfit({ id }: { id: string }) {
  const q = useOrderProfit(id);
  return q.isPending ? (
    <p role="status" className="text-sm text-muted">
      Loading saved profit…
    </p>
  ) : q.error ? (
    <p role="alert" className="text-sm text-brand-strong">
      {q.error.message}
    </p>
  ) : q.data ? (
    <ProfitSummary profit={q.data} />
  ) : (
    <p className="rounded-xl border bg-card p-3 text-sm text-muted">
      Profit unavailable: no costing snapshot was recorded for this order.
    </p>
  );
}

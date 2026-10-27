import { CalculationReview } from "./CalculationReview";
import { DailyOrderTotals } from "./DailyOrderTotals";
import { SfxAccountTransition } from "./SfxAccountTransition";
import { HistoricalRecords } from "./HistoricalRecords";
import { toast } from "sonner";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { formatMoney } from "@/lib/format";
import { loadDashboard } from "./report-api";
import { client } from "@/features/menu/menu-api";
import { recipeReportSchema, type Range } from "./report-model";
const RevenueChart = lazy(() => import("./RevenueChart"));
export default function Dashboard({
  range,
  onReport,
}: {
  range: Range;
  onReport: (name: string) => void;
}) {
  const { profile } = useAuth();
  const [showProfit, setShowProfit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const audit = useQuery({
    queryKey: ["reports", "order-profit-audit", range],
    enabled: showProfit,
    staleTime: 15000,
    queryFn: async () => {
      const r = await client().rpc("order_profit_report", {
        p_from: range.from,
        p_to: range.to,
      });
      if (r.error) throw new Error(r.error.message);
      return recipeReportSchema.parse(r.data);
    },
  });
  const data = useQuery({
    queryKey: ["reports", "dashboard", range],
    queryFn: () => loadDashboard(range),
    staleTime: 15000,
    refetchInterval: 30000,
    retry: false,
  });
  const message = data.error?.message;
  useEffect(() => {
    if (message) toast.error(message, { id: "m9-dashboard-error" });
  }, [message]);
  if (data.isPending) return <p role="status">Loading dashboard…</p>;
  if (data.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="break-words text-brand-strong">{data.error.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void data.refetch();
          }}
        >
          Retry dashboard
        </Button>
      </div>
    );
  const d = data.data,
    p = d.recipe_profit,
    s = d.sales.summary;
  return (
    <div className="space-y-5">
      {d.sfx_needs_transition ? <SfxAccountTransition /> : null}
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Key figures"
      >
        {[
          [
            "Revenue",
            p.revenue,
            `${s.orders ?? 0} orders · average ${s.average_order == null ? "—" : formatMoney(Number(s.average_order), "TRY")}`,
          ],
          [
            "Est. gross profit",
            p.gross_profit,
            "Revenue less recipe ingredient and packaging costs",
          ],
          [
            "Recipe cost of goods",
            p.cogs,
            "Calculated from saved recipes and recorded quantities",
          ],
          [
            "Est. net profit",
            p.net_profit,
            "Recipe operating costs + fixed allocation deducted",
          ],
        ].map(([label, amount, sub]) => (
          <article
            key={String(label)}
            className={`min-w-0 space-y-3 rounded-xl border p-5 ${label === "Est. net profit" ? "bg-brand text-card" : "bg-card"}`}
          >
            <h2 className="text-sm font-semibold">{String(label)}</h2>
            <p className="break-words text-2xl font-bold sm:text-3xl">
              {amount == null ? "—" : formatMoney(Number(amount), "TRY")}
            </p>
            <p
              className={`text-xs ${label === "Est. net profit" ? "text-card" : "text-muted"}`}
            >
              {String(sub)}
            </p>
          </article>
        ))}
      </section>
      <p className="text-sm text-muted">
        {range.from} to {range.to} · recipe-based estimates. {p.reconstructed}{" "}
        orders reconstructed using current recipe costs; complete saved
        estimates stay unchanged.
      </p>
      {p.missing_net ? (
        <div className="rounded-xl border border-amber bg-amber-soft p-4 space-y-2">
          <p className="font-semibold">
            {p.missing_net} orders need cost inputs before total net profit can
            be calculated.
          </p>
          <p className="text-sm">
            {p.missing.join(", ") ||
              "Set a valid fixed-overhead allocation in Costing."}
          </p>
          {profile?.role === "admin" ? (
            <Button asChild variant="secondary">
              <Link to="/costing">Complete recipe costs</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0 space-y-5">
          <Suspense fallback={<p role="status">Loading chart…</p>}>
            <RevenueChart rows={d.sales.rows} />
          </Suspense>
          <section className="min-w-0 rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Best sellers</h2>
              <button
                className="min-h-11 text-sm font-semibold text-brand-strong underline"
                onClick={() => onReport("items")}
              >
                Full report
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="pb-3">Item</th>
                    <th className="pb-3 text-right">Sold</th>
                    <th className="pb-3 text-right">Sales before discounts</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.rows.slice(0, 5).map((r, i) => (
                    <tr className="border-t" key={i}>
                      <td className="py-3 pr-3">
                        <span className="block font-semibold">
                          {String(r.product_name)}
                        </span>
                        <span className="text-xs text-muted">
                          {String(r.variant_name)}
                        </span>
                      </td>
                      <td className="py-3 text-right">{String(r.quantity)}</td>
                      <td className="py-3 text-right">
                        {formatMoney(Number(r.revenue), "TRY")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.items.rows.length ? (
              <p className="text-sm text-muted">
                No sales recorded in this period.
              </p>
            ) : null}
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          <DailyOrderTotals />
          <section className="rounded-xl border bg-card p-5 space-y-4">
            <h2 className="text-lg font-bold">Recorded expenses</h2>
            <p className="text-3xl font-bold">
              {formatMoney(d.accounting_expenses, "TRY")}
            </p>
            <p className="text-xs text-muted">
              Actual purchases and approved direct expenses in this period.
              Separate from recipe estimates above.
            </p>
            {(
              [
                ["Cost of goods", "cost_of_goods"],
                ["Operational, including payroll", "operational_expenses"],
                ["Fixed overhead", "fixed_overheads"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="flex justify-between gap-3 text-sm">
                <span className="text-muted">{label}</span>
                <strong>
                  {formatMoney(Number(d.pnl.summary[key] ?? 0), "TRY")}
                </strong>
              </div>
            ))}
            <button
              className="min-h-11 text-sm font-semibold text-brand-strong underline"
              onClick={() => onReport("expenses")}
            >
              Expense report
            </button>
          </section>
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="text-lg font-bold">Account balances</h2>
            <p className="text-xs text-muted">
              Current balances · foreign estimates at latest saved rates
            </p>
            {d.balances
              .filter((a) => a.balance !== 0)
              .slice(0, 4)
              .map((a) => (
                <div
                  className="flex justify-between gap-3 border-t pt-3 text-sm"
                  key={a.id}
                >
                  <span>{a.name}</span>
                  <strong>{formatMoney(a.balance, a.currency)}</strong>
                </div>
              ))}
            {d.missing_balance_rates ? (
              <p role="alert" className="text-sm text-amber-ink">
                {d.missing_balance_rates} accounts need an exchange rate.
              </p>
            ) : null}
            <p className="border-t pt-3 text-sm">
              Total estimate{" "}
              <strong className="float-right">
                ≈ {formatMoney(d.balance_try_estimate, "TRY")}
              </strong>
            </p>
            <Link
              to="/money"
              className="flex min-h-11 items-center text-sm font-semibold text-brand-strong underline"
            >
              View all accounts
            </Link>
          </section>
          {Number(d.needs.pending_approvals ?? 0) > 0 ||
          d.needs.close ||
          d.needs.advances.length > 0 ? (
            <section className="rounded-xl border border-amber bg-amber-soft p-5 space-y-3">
              <h2 className="font-bold">Needs attention</h2>
              {profile?.role === "admin" &&
              Number(d.needs.pending_approvals ?? 0) > 0 ? (
                <Link
                  className="flex min-h-11 items-center font-semibold underline"
                  to="/money/approvals"
                >
                  {d.needs.pending_approvals} approvals waiting
                </Link>
              ) : null}
              {d.needs.close ? (
                <Link className="block min-h-11 text-sm underline" to="/close">
                  Cash difference:{" "}
                  {formatMoney(d.needs.close.difference, "TRY")} ·{" "}
                  {d.needs.close.business_date}
                </Link>
              ) : null}
              {d.needs.advances.length ? (
                <Link
                  className="flex min-h-11 items-center text-sm underline"
                  to="/advances"
                >
                  Review {d.needs.advances.length} outstanding advances
                </Link>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
      <details className="rounded-xl border bg-card p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">
          More financial details
        </summary>
        <div className="space-y-3 pt-3">
          <details className="rounded-xl border bg-card p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Sales and financial details
            </summary>
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Gross sales {formatMoney(Number(s.gross_sales ?? 0), "TRY")} −
                discounts {formatMoney(Number(s.discounts ?? 0), "TRY")} =
                revenue {formatMoney(p.revenue, "TRY")}.
              </p>
              <p className="text-sm">
                Recipe gross profit = revenue − ingredient and packaging costs.
                Recipe net profit additionally deducts recipe operating costs
                and allocated fixed overhead. Recorded purchase expenses are a
                separate accounting measure, so they are not deducted again from
                these estimates.
              </p>
              <section className="border-t py-3">
                <h2 className="font-semibold">
                  Turkey · {d.turkey.quantity} total sold
                </h2>
                <p className="text-sm text-muted">
                  {d.turkey.standalone} on its own + {d.turkey.on_plate} on
                  plates
                </p>
                <details>
                  <summary className="min-h-11 cursor-pointer">
                    Reconcile by order
                  </summary>
                  {d.turkey.rows.map((r, i) => (
                    <p className="border-t py-2 text-sm" key={i}>
                      <Link
                        to={`/orders?date=${r.business_date}&order=${r.id}`}
                      >
                        {r.business_date} #{r.daily_number}
                      </Link>{" "}
                      · {r.quantity} × {r.source} · {r.product_name}
                    </p>
                  ))}
                </details>
              </section>
              <p className="text-sm">
                Debts outstanding now: we owe ≈{" "}
                {formatMoney(d.debts.we_owe, "TRY")} · owed to us ≈{" "}
                {formatMoney(d.debts.owed_to_us, "TRY")}.
              </p>
              {d.debts.missing_owe_rates + d.debts.missing_owed_rates > 0 ? (
                <p className="text-sm text-amber-ink">
                  Some debts lack a conversion rate; these estimates are
                  incomplete.
                </p>
              ) : null}
              <button
                className="min-h-11 text-sm font-semibold text-brand-strong underline"
                onClick={() => onReport("extras")}
              >
                View extras report
              </button>
            </div>
          </details>
          {profile?.role === "admin" ? (
            <CalculationReview range={range} />
          ) : null}
          <details
            className="rounded-xl border bg-card p-4"
            onToggle={(e) => setShowProfit(e.currentTarget.open)}
          >
            <summary className="min-h-11 cursor-pointer font-semibold">
              Profit calculation by order
            </summary>
            {showProfit ? (
              <div className="max-h-96 overflow-auto">
                {audit.error ? (
                  <p role="alert">{audit.error.message}</p>
                ) : audit.isPending ? (
                  <p role="status">Loading order calculations…</p>
                ) : null}
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Date / order",
                        "Revenue",
                        "Gross",
                        "Net",
                        "Cost basis",
                      ].map((h) => (
                        <th className="p-2" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.data?.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="p-2">
                          <Link
                            to={`/orders?date=${r.business_date}&order=${r.id}`}
                          >
                            {r.business_date} #{r.daily_number}
                          </Link>
                        </td>
                        <td className="p-2">{formatMoney(r.revenue, "TRY")}</td>
                        <td className="p-2">
                          {r.gross_profit == null
                            ? "—"
                            : formatMoney(r.gross_profit, "TRY")}
                        </td>
                        <td className="p-2">
                          {r.net_profit == null
                            ? "—"
                            : formatMoney(r.net_profit, "TRY")}
                        </td>
                        <td className="p-2">
                          {r.reconstructed
                            ? "Current recipe"
                            : "Saved estimate"}
                          {r.missing.length
                            ? ` · Missing: ${r.missing.join(", ")}`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </details>
          <details className="rounded-xl border bg-card p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Purchase-based P&amp;L · separate accounting view
            </summary>
            <p className="text-sm text-muted">
              Uses recorded purchases and expenses, not recipe consumption.
              Without expense entries, this calculation can equal revenue.
            </p>
            <p className="mt-2">
              Revenue{" "}
              {formatMoney(Number(d.pnl.summary.net_revenue ?? 0), "TRY")} ·
              Recorded expenses {formatMoney(d.accounting_expenses, "TRY")} ·
              Net {formatMoney(Number(d.pnl.summary.net_profit ?? 0), "TRY")}
            </p>
          </details>
          {profile?.role === "admin" ? (
            <details
              className="rounded-xl border bg-card p-4"
              onToggle={(e) => setShowHistory(e.currentTarget.open)}
            >
              <summary className="min-h-11 cursor-pointer font-semibold">
                Historical records · reference only
              </summary>
              {showHistory ? <HistoricalRecords /> : null}
            </details>
          ) : null}
        </div>
      </details>
    </div>
  );
}

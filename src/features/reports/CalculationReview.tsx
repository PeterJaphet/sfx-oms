import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { client } from "@/features/menu/menu-api";
import type { Range } from "./report-model";
const fields = {
  revenue_difference: "Revenue agrees with order totals",
  order_arithmetic_errors: "Order subtotal minus discounts equals total",
  purchase_line_errors: "Purchase lines equal purchase totals",
  purchase_fx_errors: "Recorded purchase conversions reconcile",
  allocation_errors: "Item expenses reconcile to purchase TRY totals",
  completed_payment_errors: "Delivered orders reconcile to recorded payments",
  recipe_gross_difference: "Recipe gross profit reconciles",
  recipe_net_difference: "Recipe net profit reconciles",
};
const schema = z
  .object({ missing_recipe_orders: z.number() })
  .and(z.record(z.string(), z.number().nullable()))
  .refine(
    (v) => Object.keys(fields).every((k) => k in v),
    "The calculation check is incomplete; reload it",
  );
export function CalculationReview({ range }: { range: Range }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["reports", "calculation-review", range],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const r = await client().rpc("review_financial_calculations", {
        p_from: range.from,
        p_to: range.to,
      });
      if (r.error) throw new Error(r.error.message);
      return schema.parse(r.data);
    },
  });
  return (
    <details
      className="rounded-xl border bg-card p-4"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer font-semibold">
        Calculation checks
      </summary>
      {open ? (
        <div className="space-y-3">
          {q.error ? (
            <p role="alert">{q.error.message}</p>
          ) : q.isPending ? (
            <p role="status">Checking recorded values…</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Read-only checks of the selected business dates. A discrepancy
                needs review; records are never silently rewritten.
              </p>
              {Object.entries(fields).map(([k, label]) => (
                <div
                  key={k}
                  className="flex justify-between gap-3 border-t py-2 text-sm"
                >
                  <span>{label}</span>
                  <strong
                    className={q.data[k] === 0 ? "text-ok" : "text-amber-ink"}
                  >
                    {q.data[k] === null
                      ? "Incomplete"
                      : q.data[k] === 0
                        ? "Passed"
                        : `Review: ${q.data[k]}`}
                  </strong>
                </div>
              ))}
              {q.data.missing_recipe_orders ? (
                <p className="text-amber-ink">
                  {q.data.missing_recipe_orders} orders have missing recipe
                  costs. Profit cannot be verified for those orders.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { client } from "@/features/menu/menu-api";
import { formatMoney } from "@/lib/format";

const totalsSchema = z.object({
  business_date: z.string(),
  orders: z.number(),
  revenue: z.number(),
  gross_profit: z.number().nullable(),
  net_profit: z.number().nullable(),
  missing: z.number(),
  reconstructed: z.number().optional(),
});
export function DailyOrderTotals() {
  const qc = useQueryClient();
  const totals = useQuery({
    queryKey: ["reports", "daily-order-profit"],
    queryFn: async () => {
      const r = await client().rpc("daily_order_profit");
      if (r.error) throw new Error(r.error.message);
      return totalsSchema.parse(r.data);
    },
    refetchInterval: 10000,
    retry: false,
  });
  useEffect(() => {
    const db = client();
    const channel = db
      .channel("daily-order-profit")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void qc.invalidateQueries({
            queryKey: ["reports", "daily-order-profit"],
          });
        },
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [qc]);
  if (totals.error)
    return (
      <p
        role="alert"
        className="rounded-xl border bg-card p-3 text-brand-strong"
      >
        {totals.error.message}
      </p>
    );
  const d = totals.data;
  return (
    <section
      className="space-y-2 rounded-xl border bg-card p-3"
      aria-label="Today's order totals"
      aria-live="polite"
    >
      <h2 className="font-semibold">
        Today {d?.business_date} · {d?.orders ?? "…"} orders
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Revenue", d?.revenue],
            ["Est. gross profit", d?.gross_profit],
            ["Est. net profit", d?.net_profit],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-xs text-muted">{label}</p>
            <p className="break-words text-lg font-bold">
              {value == null ? "—" : formatMoney(value, "TRY")}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        {d?.missing ? `${d.missing} orders have incomplete costing. ` : ""}
        Recipe-based estimates; accepted and delivered orders included,
        cancellations excluded.
        {d?.reconstructed
          ? ` ${d.reconstructed} estimates use current recipes.`
          : ""}
      </p>
    </section>
  );
}

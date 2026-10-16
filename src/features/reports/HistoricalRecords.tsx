import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { client } from "@/features/menu/menu-api";
import { formatMoney } from "@/lib/format";
const recordSchema = z.object({
  id: z.string(),
  title: z.string(),
  source_name: z.string(),
  notes: z.string(),
  months: z.array(
    z.object({
      month: z.string(),
      days: z.number(),
      orders: z.number(),
      revenue: z.number(),
    }),
  ),
  payment_mix: z.array(
    z.object({ account: z.string(), amount_try: z.number() }),
  ),
});
export function HistoricalRecords() {
  const query = useQuery({
    queryKey: ["historical-sales-records"],
    queryFn: async () => {
      const r = await client().from("historical_sales_records").select("*");
      if (r.error) throw new Error(r.error.message);
      return z.array(recordSchema).parse(r.data);
    },
  });
  if (query.error)
    return (
      <p role="alert" className="text-brand-strong">
        {query.error.message}
      </p>
    );
  return (
    <section className="space-y-3" aria-label="Historical records">
      <h2 className="text-lg font-bold">Historical records · reference only</h2>
      {query.data?.map((r) => (
        <details key={r.id} className="rounded-xl border bg-card p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            {r.title} · year not stated
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Month</th>
                  <th className="p-2">Days</th>
                  <th className="p-2">Orders</th>
                  <th className="p-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {r.months.map((m) => (
                  <tr key={m.month}>
                    <td className="p-2">{m.month}</td>
                    <td className="p-2">{m.days}</td>
                    <td className="p-2">{m.orders}</td>
                    <td className="p-2">{formatMoney(m.revenue, "TRY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="my-3 text-xs text-muted">Source: {r.source_name}</p>
          <ul className="space-y-1 text-sm">
            {r.payment_mix.map((p) => (
              <li key={p.account}>
                {p.account}: {formatMoney(p.amount_try, "TRY")}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{r.notes}</p>
        </details>
      ))}
    </section>
  );
}

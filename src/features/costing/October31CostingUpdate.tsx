import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { client } from "@/features/menu/menu-api";
import { formatMoney } from "@/lib/format";
import { useCostSave } from "./cost-api";

const schema = z.object({
  token: z.string(),
  already_applied: z.boolean(),
  rows: z.array(
    z.object({
      name: z.string(),
      menu_name: z.string(),
      menu_price: z.number().nullable(),
      new_unit_cogs: z.number().optional(),
      new_unit_overhead: z.number().optional(),
      planning_only: z.boolean().optional(),
      current_unit_cost: z.number().nullable(),
      new_unit_cost: z.number(),
    }),
  ),
});
export function October31CostingUpdate({
  extras = false,
}: {
  extras?: boolean;
}) {
  const date = extras ? "1 November extras" : "31 October costing";
  const rpc = extras
    ? "november_extras_costing_update"
    : "october31_costing_update";
  const [open, setOpen] = useState(false);
  const preview = useQuery({
    queryKey: ["costing", rpc],
    retry: false,
    queryFn: async () => {
      const r = await client().rpc(rpc, {
        p_apply: false,
      });
      if (r.error) throw new Error(r.error.message);
      return schema.parse(r.data);
    },
  });
  const save = useCostSave<void>(
    async () => {
      if (!preview.data || preview.isFetching || preview.isError)
        throw new Error("Wait for the current costing preview");
      const r = await client().rpc(rpc, {
        p_apply: true,
        p_token: preview.data.token,
      });
      if (r.error) throw new Error(r.error.message);
      return schema.parse(r.data);
    },
    () => setOpen(false),
  );
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-label={`${date} update`}
    >
      <h2 className="font-bold">
        {date} {preview.data?.already_applied ? "applied" : "update"}
      </h2>
      <p className="text-sm text-muted">
        {extras
          ? "Corrected Chicken Lap, Egg, Fish, Ponmo, Shaki, Puff-puff, Salad, Swallow and Turkey recipes."
          : "Jollof Rice chicken cost and Chicken Lap recipe (linked to the Chicken extra)."}{" "}
        Existing selling prices stay unchanged.
      </p>
      {extras ? (
        <p className="text-sm text-muted">
          If Puff-puff is not on the menu, its recipe is saved for planning
          only. No selling price is invented.
        </p>
      ) : null}
      {preview.isPending ? <p role="status">Checking recipe update…</p> : null}
      {preview.error ? <p role="alert">{preview.error.message}</p> : null}
      {preview.data ? (
        <p role="status" className="text-sm">
          {preview.data.already_applied
            ? "This update has been applied. Later recipe edits are preserved."
            : "Pending: review and apply to save these recipe updates."}
        </p>
      ) : null}
      <Button
        variant={preview.data?.already_applied ? "secondary" : "default"}
        onClick={() => setOpen(true)}
      >
        Review {date}
      </Button>
      {preview.error ? (
        <Button variant="secondary" onClick={() => void preview.refetch()}>
          Retry {date} check
        </Button>
      ) : null}
      {open ? (
        <Sheet
          open
          title={`${date} update`}
          description="Review recipe costs. No menu prices will change."
          onOpenChange={(v) => {
            if (!v && !save.isPending) setOpen(false);
          }}
        >
          <div className="space-y-4">
            {preview.isPending ? (
              <p role="status">Loading recipe update…</p>
            ) : null}
            {preview.error ? <p role="alert">{preview.error.message}</p> : null}
            {preview.data?.rows.map((r) => (
              <article
                className="space-y-2 rounded-xl border bg-card p-3"
                key={r.menu_name}
              >
                <h2 className="font-semibold">{r.name}</h2>
                <p className="text-sm">
                  Full cost per serving:{" "}
                  {r.current_unit_cost == null
                    ? "Not costed"
                    : formatMoney(r.current_unit_cost, "TRY")}{" "}
                  → <strong>{formatMoney(r.new_unit_cost, "TRY")}</strong>
                </p>
                {r.new_unit_cogs != null && r.new_unit_overhead != null ? (
                  <p className="text-sm">
                    Direct COGS: {formatMoney(r.new_unit_cogs, "TRY")} ·
                    Overhead: {formatMoney(r.new_unit_overhead, "TRY")}
                  </p>
                ) : null}
                <p className="text-sm">
                  {r.menu_price == null
                    ? "Planning only · no menu item or selling price created"
                    : `${r.menu_name} selling price unchanged: ${formatMoney(r.menu_price, "TRY")}`}
                </p>
              </article>
            ))}
            {extras ? (
              <p className="text-sm text-muted">
                Amounts are rounded for display. Full cost uses unrounded COGS
                and overhead.
              </p>
            ) : null}
            <p className="text-sm text-muted">
              Existing planning settings, saved order estimates and financial
              entries stay intact. New recipes start at zero planned batches.
              Incomplete estimates using current recipes can reflect these
              costs.
            </p>
            {save.error ? <p role="alert">{save.error.message}</p> : null}
            <Button
              className="w-full whitespace-normal"
              requiresOnline
              disabled={
                !preview.data ||
                preview.isFetching ||
                preview.isError ||
                save.isPending ||
                preview.data.already_applied
              }
              onClick={() => save.mutate()}
            >
              {save.isPending
                ? "Applying…"
                : preview.data?.already_applied
                  ? `${date} already applied`
                  : `Apply ${date} · keep menu prices`}
            </Button>
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}

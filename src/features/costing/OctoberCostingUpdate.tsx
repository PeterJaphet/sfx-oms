import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      current_unit_cost: z.number().nullable(),
      new_unit_cost: z.number(),
      menu_price: z.number().nullable(),
      new_menu_price: z.number().nullable(),
      needs_new_item: z.boolean(),
    }),
  ),
});
export function OctoberCostingUpdate() {
  const [open, setOpen] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const validPrice =
    /^\d+(\.\d{1,2})?$/.test(newPrice) &&
    Number(newPrice) > 0 &&
    Number(newPrice) <= 9999999999.99;
  const preview = useQuery({
    queryKey: ["costing", "october-update", newPrice],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const r = await client().rpc("october_costing_update", {
        p_apply: false,
        ...(validPrice ? { p_new_price: Number(newPrice) } : {}),
      });
      if (r.error) throw new Error(r.error.message);
      return schema.parse(r.data);
    },
  });
  const save = useCostSave<void>(
    async () => {
      if (!preview.data || preview.isFetching)
        throw new Error("Wait for the current costing preview");
      const r = await client().rpc("october_costing_update", {
        p_apply: true,
        p_token: preview.data.token,
        ...(validPrice ? { p_new_price: Number(newPrice) } : {}),
      });
      if (r.error) throw new Error(r.error.message);
      return schema.parse(r.data);
    },
    () => setOpen(false),
  );
  const needsPrice = preview.data?.rows.some((r) => r.needs_new_item);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Review updated food costing
      </Button>
      {open ? (
        <Sheet
          open
          title="Updated food costing"
          description="30 October workbook: Jollof Rice, Native Rice, Vegetable Soup and SFx Special Shawarma. Existing menu prices stay unchanged."
          onOpenChange={(v) => {
            if (!v && !save.isPending) setOpen(false);
          }}
        >
          <div className="space-y-4">
            <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
              SFx Special Shawarma includes Plantain 30 TL and Maggie 3 TL,
              which the workbook's SUM omits as text. Its full cost is 279.50 TL
              per unit. This update does not apply suggested menu prices.
            </p>
            {preview.isPending ? (
              <p role="status">Loading recipe update…</p>
            ) : null}
            {preview.error ? <p role="alert">{preview.error.message}</p> : null}
            {preview.data?.already_applied ? (
              <p role="status" className="rounded-xl bg-ok-soft p-3 text-ok">
                This workbook update has already been applied. Later recipe
                edits and menu prices have been left intact.
              </p>
            ) : null}
            {preview.data?.rows.map((r) => (
              <article
                className="rounded-xl border bg-card p-3 space-y-2"
                key={r.menu_name}
              >
                <h2 className="font-semibold">{r.menu_name}</h2>
                <p className="text-sm">
                  Full cost per serving:{" "}
                  {r.current_unit_cost == null
                    ? "Not costed"
                    : formatMoney(r.current_unit_cost, "TRY")}{" "}
                  → <strong>{formatMoney(r.new_unit_cost, "TRY")}</strong>
                </p>
                <p className="text-sm">
                  {r.needs_new_item
                    ? "New item selling price"
                    : "Menu price unchanged"}
                  :{" "}
                  {r.menu_price != null
                    ? formatMoney(r.menu_price, "TRY")
                    : r.new_menu_price != null
                      ? formatMoney(r.new_menu_price, "TRY")
                      : "Enter below"}
                </p>
              </article>
            ))}
            {!preview.data?.already_applied ? (
              <div>
                <label
                  htmlFor="new-shawarma-price"
                  className="mb-2 block font-semibold"
                >
                  New SFx Special Shawarma selling price (TL, only if adding it)
                </label>
                <Input
                  id="new-shawarma-price"
                  inputMode="decimal"
                  value={newPrice}
                  disabled={save.isPending}
                  onChange={(e) => setNewPrice(e.target.value)}
                />
                <p className="mt-2 text-sm text-muted">
                  Only used if this item does not exist yet. An existing selling
                  price is preserved.
                </p>
              </div>
            ) : null}
            <p className="text-sm text-muted">
              Existing planning volumes, multipliers and rounding settings stay
              unchanged. The new recipe starts with no planned batches. Saved
              order estimates and financial entries stay intact. Incomplete
              estimates using current recipes can reflect the updated costs.
            </p>
            {save.error ? (
              <p role="alert" className="text-brand-strong">
                {save.error.message}
              </p>
            ) : null}
            <Button
              requiresOnline
              className="w-full"
              disabled={
                !preview.data ||
                preview.isFetching ||
                preview.isError ||
                save.isPending ||
                preview.data.already_applied ||
                (needsPrice && !validPrice)
              }
              onClick={() => save.mutate()}
            >
              {save.isPending
                ? "Applying…"
                : "Apply costing update · keep menu prices"}
            </Button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

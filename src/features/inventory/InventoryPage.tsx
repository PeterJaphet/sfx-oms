import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, FieldError } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-context";
import { client } from "@/features/menu/menu-api";
import { assertOnline } from "@/lib/connectivity";
import { formatMoney } from "@/lib/format";
import { loadPeriods } from "@/features/reports/report-api";
import { useInventory, type InventoryItem } from "./inventory-api";
const editSchema = z.object({
  name: z.string().trim().min(1).max(200),
  item_group: z.string().trim().min(1).max(100),
  default_unit: z.string().trim().max(40),
});
const spendingSchema = z.object({
  total_try: z.number(),
  rows: z.array(
    z.object({
      inventory_item_id: z.string().nullable(),
      name: z.string(),
      item_group: z.string(),
      unit: z.string(),
      quantity: z.number().nullable(),
      amount_try: z.number(),
      purchases: z.number(),
    }),
  ),
});
function Editor({
  item,
  onClose,
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const qc = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: item,
  });
  return (
    <Sheet
      open
      title={item.revision ? "Edit inventory item" : "New inventory item"}
      description="Changes apply to future purchases. Past purchase details stay unchanged."
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (v) => {
          setBusy(true);
          setError("");
          try {
            assertOnline();
            const r = await client().rpc("save_inventory_item", {
              p: {
                ...v,
                id: item.id,
                revision: item.revision,
                is_active: item.is_active,
              },
            });
            if (r.error) throw new Error(r.error.message);
            await qc.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Inventory item saved");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        })}
      >
        <fieldset disabled={busy} className="space-y-4">
          {(["name", "item_group", "default_unit"] as const).map((key, i) => (
            <div key={key}>
              <label
                className="mb-2 block font-semibold"
                htmlFor={"inventory-" + key}
              >
                {
                  [
                    "Item name",
                    "Group",
                    "Default unit (optional: kg, pack, L, pcs)",
                  ][i]
                }
              </label>
              <Input id={"inventory-" + key} {...form.register(key)} />
              <FieldError
                id={key + "-error"}
                message={form.formState.errors[key]?.message}
              />
            </div>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="text-brand-strong">
            {error}
          </p>
        ) : null}
        <Button requiresOnline disabled={busy} className="w-full" type="submit">
          {busy ? "Saving…" : "Save item"}
        </Button>
      </form>
    </Sheet>
  );
}
export default function InventoryPage() {
  const { profile } = useAuth(),
    admin = profile?.role === "admin",
    qc = useQueryClient(),
    catalogue = useInventory();
  const [search, setSearch] = useState(""),
    [group, setGroup] = useState(""),
    [showRemoved, setShowRemoved] = useState(false),
    [editor, setEditor] = useState<InventoryItem | null>(null),
    [remove, setRemove] = useState<InventoryItem | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [dates, setDates] = useState<{ from: string; to: string } | null>(null);
  const periods = useQuery({
    queryKey: ["reports", "periods"],
    queryFn: loadPeriods,
    enabled: admin,
  });
  // Logistics does not have access to report_periods. Its own business date is safe.
  const day = useQuery({
    queryKey: ["inventory", "business-day"],
    queryFn: async () => {
      const r = await client().rpc("business_date");
      if (r.error) throw new Error(r.error.message);
      return z.string().parse(r.data);
    },
    enabled: !admin,
  });
  const range =
    dates ??
    (admin
      ? periods.data?.month
      : day.data
        ? { from: day.data, to: day.data }
        : undefined);
  const spending = useQuery({
    queryKey: ["inventory", "spending", range],
    refetchInterval: 30000,
    enabled: !!range,
    retry: false,
    queryFn: async () => {
      const r = await client().rpc("inventory_expense_report", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (r.error) throw new Error(r.error.message);
      return spendingSchema.parse(r.data);
    },
  });
  const groups = [...new Set(catalogue.data?.map((i) => i.item_group))];
  const rows =
    catalogue.data?.filter(
      (i) =>
        (showRemoved || i.is_active) &&
        (!group || i.item_group === group) &&
        i.name.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">
            Supplies & expenses
          </p>
          <h1 className="text-3xl font-extrabold">Inventory</h1>
          <p className="text-sm text-muted">
            Catalogue and itemised purchasing costs. Stock on hand is not
            tracked.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/purchases/new">Log purchase</Link>
          </Button>
          {admin ? (
            <Button
              onClick={() =>
                setEditor({
                  id: crypto.randomUUID(),
                  name: "",
                  item_group: group,
                  default_unit: "",
                  is_active: true,
                  revision: 0,
                })
              }
            >
              New item
            </Button>
          ) : null}
        </div>
      </header>
      <section className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm font-semibold">
            Search items
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rice, packaging, turkey…"
            />
          </label>
          <label className="text-sm font-semibold">
            Group
            <select
              className="block h-12 max-w-full rounded-xl border bg-card px-3"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          {admin ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showRemoved}
                onChange={(e) => setShowRemoved(e.target.checked)}
              />
              Show removed
            </label>
          ) : null}
        </div>
        {catalogue.isPending ? (
          <p role="status">Loading inventory…</p>
        ) : catalogue.error ? (
          <p role="alert">{catalogue.error.message}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{rows.length} matching items</p>
            <div className="max-h-[28rem] overflow-auto divide-y">
              {rows.map((i) => (
                <article
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                  key={i.id}
                >
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold">
                      {i.name}
                      {!i.is_active ? " · Removed" : ""}
                    </h2>
                    <p className="text-xs text-muted">
                      {i.item_group}
                      {i.default_unit ? ` · ${i.default_unit}` : ""}
                    </p>
                  </div>
                  {admin ? (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="secondary"
                        aria-label={`Edit ${i.name}`}
                        onClick={() => setEditor(i)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="secondary"
                        aria-label={`${i.is_active ? "Delete" : "Restore"} ${i.name}`}
                        onClick={() => {
                          setError("");
                          setRemove(i);
                        }}
                      >
                        {i.is_active ? "Delete" : "Restore"}
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Item expenses</h2>
            <p className="text-sm text-muted">
              {admin ? "All purchases" : "Your purchases"} · reversed purchases
              excluded · TRY at recorded rates
            </p>
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              setDates({
                from: String(d.get("from")),
                to: String(d.get("to")),
              });
            }}
            key={range ? `${range.from}:${range.to}` : "loading"}
          >
            <label className="text-sm">
              From
              <Input
                required
                type="date"
                name="from"
                defaultValue={range?.from}
              />
            </label>
            <label className="text-sm">
              To
              <Input required type="date" name="to" defaultValue={range?.to} />
            </label>
            <Button type="submit" className="self-end" variant="secondary">
              Apply
            </Button>
          </form>
        </div>
        <p className="text-2xl font-bold">
          {spending.data ? formatMoney(spending.data.total_try, "TRY") : "—"}
        </p>
        {spending.error || periods.error || day.error ? (
          <p role="alert">
            {(spending.error || periods.error || day.error)?.message}
          </p>
        ) : null}
        {spending.isPending ? (
          <p role="status">Loading item expenses…</p>
        ) : null}
        <div className="max-w-full overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Item",
                  "Quantity purchased",
                  "Purchases",
                  "Expense (TL)",
                ].map((h) => (
                  <th className="px-2 py-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spending.data?.rows.map((r, i) => (
                <tr className="border-t" key={i}>
                  <td className="p-2">
                    <span className="block font-semibold">{r.name}</span>
                    <span className="text-xs text-muted">{r.item_group}</span>
                  </td>
                  <td className="p-2">
                    {r.quantity ?? "Unknown"} {r.unit}
                  </td>
                  <td className="p-2">{r.purchases}</td>
                  <td className="p-2">{formatMoney(r.amount_try, "TRY")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {spending.data && !spending.data.rows.length ? (
          <p className="text-sm text-muted">
            No purchases recorded in this period. The checklist contained no
            expenses to import.
          </p>
        ) : null}
        <p className="text-xs text-muted">
          Purchase lines only; record payroll and other direct expenses in
          Money. Different units are kept separate. Older unlinked purchase
          lines remain visible without guessing their inventory match.
        </p>
      </section>
      {editor ? <Editor item={editor} onClose={() => setEditor(null)} /> : null}
      {remove ? (
        <Sheet
          open
          title={
            remove.is_active
              ? "Delete inventory item?"
              : "Restore inventory item?"
          }
          description={
            remove.is_active
              ? "This removes the item from future purchase selection. Its expense history is preserved."
              : "The item will become available for future purchases."
          }
          onOpenChange={(v) => {
            if (!v && !busy) setRemove(null);
          }}
        >
          <p className="mb-4 font-semibold">{remove.name}</p>
          {error ? (
            <p role="alert" className="mb-3 text-brand-strong">
              {error}
            </p>
          ) : null}
          <Button
            requiresOnline
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                assertOnline();
                const r = await client().rpc("save_inventory_item", {
                  p: { ...remove, is_active: !remove.is_active },
                });
                if (r.error) throw new Error(r.error.message);
                await qc.invalidateQueries({ queryKey: ["inventory"] });
                setRemove(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Saving…"
              : remove.is_active
                ? "Delete item"
                : "Restore item"}
          </Button>
        </Sheet>
      ) : null}
    </section>
  );
}

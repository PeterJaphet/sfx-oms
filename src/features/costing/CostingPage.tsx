import { HistorySnapshot } from "./HistorySnapshot";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMenu } from "@/features/menu/menu-api";
import { useCosting, useCostSave, loadWorkbook, applyPrice } from "./cost-api";
import {
  numeric,
  percent,
  type Recipe,
  type CostContext,
  type MathValues,
} from "./cost-model";
import { RecipeForm, PlanForm } from "./CostForms";
import { downloadCsv, downloadPdf } from "@/features/reports/report-export";
import type { Report, ReportDefinition } from "@/features/reports/report-model";
import { toast } from "sonner";

const amount = (m: MathValues, key: string) =>
  numeric(m, key) === null ? "—" : formatMoney(numeric(m, key)!, "TRY");
const forecastDefinition: ReportDefinition = {
  name: "costing_forecast",
  title: "Recipe forecast P&L",
  note: "Planning model, not actual P&L. Revenue uses unrounded batch selling prices × planned batches, following the workbook. Live menu prices change only through Apply price.",
  columns: [
    { key: "metric", label: "Metric" },
    {
      key: "amount",
      label: "Amount / margin",
      kind: "money",
      currencyKey: "unit",
    },
  ],
};
function exportForecast(c: CostContext): Report {
  const keys = [
    ["Planned revenue", "revenue", "TRY"],
    ["Ingredients budget", "ingredients", "TRY"],
    ["Direct costs", "cogs", "TRY"],
    ["Gross profit", "gross_profit", "TRY"],
    ["Gross margin", "gross_margin", "ratio"],
    ["Recipe overhead", "overhead", "TRY"],
    ["Fixed weekly overhead", "fixed", "TRY"],
    ["Net profit", "net_profit", "TRY"],
    ["Net margin", "net_margin", "ratio"],
    ["Break-even revenue", "break_even", "TRY"],
  ] as const;
  return {
    report: "costing_forecast",
    scope: "period",
    from: c.from,
    to: c.to,
    business_date: c.business_date,
    generated_at: c.generated_at,
    previous_from: c.from,
    previous_to: c.to,
    summary: {},
    offset: 0,
    total: keys.length,
    rows: keys.map(([metric, key, unit]) => ({
      metric,
      amount: numeric(c.math, key),
      unit,
    })),
  };
}
function WeeklyPlan({
  context,
  onEdit,
  onRecipe,
}: {
  context: CostContext;
  onEdit: () => void;
  onRecipe: (r: Recipe) => void;
}) {
  const m = context.math;
  const [exporting, setExporting] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Edit overheads &amp; rate scenarios
        </Button>
        <Button
          variant="secondary"
          disabled={exporting}
          onClick={() =>
            downloadCsv(exportForecast(context), forecastDefinition)
          }
        >
          Export CSV
        </Button>
        <Button
          variant="secondary"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadPdf(exportForecast(context), forecastDefinition);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Preparing PDF…" : "Export PDF"}
        </Button>
      </div>
      <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
        This is a weekly forecast. Workbook production volumes are starting
        placeholders: edit each recipe’s planned batches to match your business.
        It does not record expenses or change actual P&amp;L.
      </p>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-xl font-bold">Weekly production plan</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-sm">
            <thead>
              <tr className="border-b text-left">
                {[
                  "Recipe",
                  "Batches",
                  "Portions",
                  "Revenue",
                  "Direct costs",
                  "Gross profit",
                  "Overhead",
                  "Ingredients",
                ].map((h) => (
                  <th key={h} className="p-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {context.recipes.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">
                    <button
                      type="button"
                      className="min-h-11 text-left font-semibold text-brand-strong underline"
                      onClick={() => onRecipe(r)}
                    >
                      {r.name}
                    </button>
                    {!r.variant_id && !r.addon_id ? (
                      <p className="text-xs text-muted">
                        Planning only · not on menu
                      </p>
                    ) : null}
                  </td>
                  {[
                    "planned_batches",
                    "planned_units",
                    "weekly_revenue",
                    "weekly_cogs",
                    "weekly_gross_profit",
                    "weekly_overhead",
                    "weekly_ingredients",
                  ].map((key, i) => (
                    <td key={key} className="p-2 text-right">
                      {i < 2 ? numeric(r.math, key) : amount(r.math, key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">
          {numeric(m, "batches")} batches · {numeric(m, "units")} portions. The
          forecast uses multiplier-based batch prices; rounding and current
          published prices can differ.
        </p>
      </section>
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
        <h2 className="break-words text-xl font-bold">Forecast profit &amp; loss</h2>
        <dl className="space-y-2">
          {[
            ["Revenue", "revenue"],
            ["Ingredients + packaging", "cogs"],
            ["Gross profit", "gross_profit"],
            ["Recipe operational costs", "overhead"],
            ["Fixed weekly overheads", "fixed"],
            ["Net profit", "net_profit"],
          ].map(([label, key]) => (
            <div
              key={key}
              className={cn(
                "flex flex-wrap justify-between gap-2",
                key === "net_profit"
                  ? "border-t pt-3 text-lg font-bold"
                  : "text-sm",
              )}
            >
              <dt>{label}</dt>
              <dd className="font-semibold">{amount(m, key)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">
          Gross margin {percent(numeric(m, "gross_margin"))} · Net margin{" "}
          {percent(numeric(m, "net_margin"))}
        </p>
      </section>
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
        <h2 className="break-words text-xl font-bold">Fixed overheads and break-even</h2>
        <dl className="space-y-2">
          {[
            ["Rent per week", "rent_weekly"],
            ["Payroll per week", "payroll_weekly"],
            ["Other weekly fixed costs", "weekly_fixed_other"],
            ["Contribution after batch overhead", "contribution"],
            ["Break-even weekly revenue", "break_even"],
          ].map(([label, key]) => (
            <div
              key={key}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <dt>{label}</dt>
              <dd className="font-semibold">{amount(m, key)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">
          Weeks per month = 52 / 12. Fixed overhead share per order:{" "}
          {percent(numeric(m, "fixed_ratio"))}.
        </p>
        {numeric(m, "break_even") === null ? (
          <p className="text-sm text-amber-ink">
            Break-even is unavailable when contribution is zero or negative.
          </p>
        ) : null}
      </section>
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
        <h2 className="break-words text-xl font-bold">Operational overhead comparison</h2>
        <p className="text-sm text-muted">
          Actual recorded expenses for {context.from}–{context.to}, compared
          with the weekly recipe plan.
        </p>
        <dl className="space-y-2">
          {[
            ["Actual operational spend", context.actual_operational],
            ["Planned overhead recovery", context.recovered_operational],
            [
              "Shortfall (positive = under-recovery)",
              context.operational_shortfall,
            ],
            ["Actual spend / planned batch", context.actual_per_planned_batch],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <dt>{label}</dt>
              <dd className="font-semibold">
                {value === null ? "—" : formatMoney(value as number, "TRY")}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">
          Record actual costs through Money or Purchases. Do not enter them
          again as forecast expenses.
        </p>
      </section>
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
        <h2 className="break-words text-xl font-bold">What if the lira moves?</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr>
                {[
                  "₺ per $1",
                  "Weekly fixed",
                  "Net profit",
                  "Net margin",
                  "Break-even",
                ].map((h) => (
                  <th key={h} className="p-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.isArray(m.scenarios)
                ? m.scenarios.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.rate}</td>
                      <td className="p-2">{amount(r, "fixed")}</td>
                      <td className="p-2">{amount(r, "net_profit")}</td>
                      <td className="p-2">
                        {percent(numeric(r, "net_margin"))}
                      </td>
                      <td className="p-2">{amount(r, "break_even")}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
export default function CostingPage() {
  const [range, setRange] = useState<{ from: string }>();
  const query = useCosting(range?.from);
  const menu = useMenu();
  const [tab, setTab] = useState<"recipes" | "plan" | "history">("recipes");
  const [editor, setEditor] = useState<Recipe | "new" | "plan" | null>(null);
  const [publish, setPublish] = useState<Recipe | null>(null);
  const [search, setSearch] = useState("");
  const load = useCostSave<void>(loadWorkbook, () => {});
  const apply = useCostSave<Recipe>(applyPrice, () => setPublish(null));
  if (query.isPending || menu.isPending)
    return <p role="status">Loading costing…</p>;
  if (query.error || menu.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-brand-strong">
          {query.error?.message ?? menu.error?.message}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            void query.refetch();
            void menu.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  const c = query.data;
  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-[26px] font-extrabold sm:text-[34px]">
          Costing &amp; pricing
        </h1>
        <p className="text-sm text-muted">
          Admin controls recipe costs, multipliers and weekly planning. New
          orders keep their own saved estimates.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/menu">Menu &amp; extras</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/reports">Actual reports</Link>
          </Button>
          <Button
            requiresOnline
            variant="secondary"
            disabled={load.isPending}
            onClick={() => load.mutate()}
          >
            {load.isPending ? "Loading…" : "Load workbook starting values"}
          </Button>
        </div>
      </header>
      <div
        role="group"
        aria-label="Costing sections"
        className="flex rounded-xl bg-chip p-1"
      >
        {(["recipes", "plan", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm font-semibold",
              tab === t ? "bg-card" : "text-muted",
            )}
          >
            {t === "recipes"
              ? "Recipes"
              : t === "plan"
                ? "Weekly plan"
                : "History"}
          </button>
        ))}
      </div>
      {tab === "recipes" ? (
        <>
          <div className="flex gap-2">
            <Input
              id="recipe-search"
              aria-label="Search recipes"
              type="search"
              placeholder="Search recipes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button onClick={() => setEditor("new")}>Add recipe</Button>
          </div>
          {c.recipes.length === 0 ? (
            <p className="rounded-xl border bg-card p-4">
              Load the workbook starting values, or add a recipe. Extras, Chips
              and Congolese Shawarma need costs entered by Admin.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {c.recipes
                .filter((r) =>
                  r.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((r) => (
                  <article
                    key={r.id}
                    className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
                  >
                    <div>
                      <h2 className="break-words text-xl font-bold">{r.name}</h2>
                      <p className="text-xs text-muted">
                        {r.variant_id
                          ? `${menu.data.products.find((p) => p.id === menu.data.variants.find((v) => v.id === r.variant_id)?.product_id)?.name ?? "Dish"} · ${menu.data.variants.find((v) => v.id === r.variant_id)?.name ?? "Variant"}`
                          : r.addon_id
                            ? `Extra: ${menu.data.extras.find((a) => a.id === r.addon_id)?.name ?? "Unavailable"}`
                            : "Planning only · unlinked"}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted">Full cost / portion</dt>
                        <dd className="font-bold">
                          {amount(r.math, "unit_full_cost")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Multiplier / yield</dt>
                        <dd className="font-bold">
                          {r.inputs.multiplier}× / {r.inputs.yield}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Published price</dt>
                        <dd className="font-bold">
                          {r.current_price === null
                            ? "Not linked"
                            : formatMoney(r.current_price, "TRY")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Suggested price</dt>
                        <dd className="font-bold text-brand-strong">
                          {amount(r.math, "suggested_price")}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setEditor(r)}>
                        Edit costing
                      </Button>
                      <Button
                        disabled={r.current_price === null}
                        onClick={() => setPublish(r)}
                      >
                        Apply price
                      </Button>
                    </div>
                  </article>
                ))}
            </div>
          )}
        </>
      ) : tab === "plan" ? (
        <>
          <form
            className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setRange({ from: String(f.get("from")) });
            }}
          >
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="actual-from"
              >
                Compare actual week (Monday)
              </label>
              <Input
                key={c.from}
                id="actual-from"
                name="from"
                type="date"
                required
                defaultValue={c.from}
              />
            </div>
            <Button type="submit" variant="secondary">
              Compare
            </Button>
          </form>
          <WeeklyPlan
            context={c}
            onEdit={() => setEditor("plan")}
            onRecipe={setEditor}
          />
        </>
      ) : (
        <section className="space-y-3">
          <h2 className="break-words text-xl font-bold">Recent costing changes</h2>
          <p className="text-sm text-muted">
            Last 50 changes. Every version is retained in the database.
          </p>
          {c.history.map((h) => (
            <details className="rounded-xl border bg-card p-3" key={h.id}>
              <summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-semibold">
                {String(h.snapshot.name ?? "Weekly plan")} · {h.staff} ·{" "}
                {new Date(h.changed_at).toLocaleString("en-GB", {
                  timeZone: "Europe/Nicosia",
                })}
              </summary>
              <HistorySnapshot snapshot={h.snapshot} />
            </details>
          ))}
          {c.history.length === 0 ? <p>No changes yet.</p> : null}
        </section>
      )}
      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        title={
          editor === "plan"
            ? "Weekly overheads & rate scenarios"
            : editor === "new"
              ? "Add costing recipe"
              : "Edit costing recipe"
        }
        description="Calculations come from the database. Existing orders keep their original costs."
      >
        {editor === "plan" ? (
          <PlanForm
            key={c.plan.revision}
            context={c}
            onSaved={() => setEditor(null)}
          />
        ) : editor ? (
          <RecipeForm
            key={editor === "new" ? "new" : editor.id}
            recipe={editor === "new" ? undefined : editor}
            menu={menu.data}
            onSaved={() => setEditor(null)}
          />
        ) : null}
      </Sheet>
      <Sheet
        open={publish !== null}
        onOpenChange={(open) => {
          if (!open && !apply.isPending) setPublish(null);
        }}
        title="Apply selling price"
        description="Publish this calculated price to the linked menu item. Past orders keep their price."
      >
        {publish ? (
          <div className="space-y-4">
            <p className="font-bold">{publish.name}</p>
            <p>Current: {formatMoney(publish.current_price!, "TRY")}</p>
            <p className="text-xl font-bold text-brand-strong">
              New: {amount(publish.math, "suggested_price")}
            </p>
            <p className="text-sm text-muted">
              The database checks both recipe version and current menu price.
              Extras retain one price on a dish and on their own.
            </p>
            <Button
              requiresOnline
              className="w-full"
              disabled={apply.isPending}
              onClick={() => apply.mutate(publish)}
            >
              {apply.isPending ? "Applying…" : "Apply price"}
            </Button>
          </div>
        ) : null}
      </Sheet>
    </section>
  );
}

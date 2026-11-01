import { October31CostingUpdate } from "./October31CostingUpdate";
import { OctoberCostingUpdate } from "./OctoberCostingUpdate";
import { HistorySnapshot } from "./HistorySnapshot";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMenu } from "@/features/menu/menu-api";
import { useCosting, useCostSave, applyPrice } from "./cost-api";
import { numeric, type Recipe, type MathValues } from "./cost-model";
import { RecipeForm } from "./CostForms";
import { groupRecipes } from "./recipe-groups";

const amount = (m: MathValues, key: string) =>
  numeric(m, key) === null ? "—" : formatMoney(numeric(m, key)!, "TRY");
export default function CostingPage() {
  const query = useCosting();
  const menu = useMenu();
  const [tab, setTab] = useState<"recipes" | "history">("recipes");
  const [editor, setEditor] = useState<Recipe | "new" | null>(null);
  const [publish, setPublish] = useState<Recipe | null>(null);
  const [search, setSearch] = useState("");
  const [updatesOpen, setUpdatesOpen] = useState(false);
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
  const groups = groupRecipes(c.recipes, menu.data, search);
  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-[26px] font-extrabold sm:text-[34px]">
          Costing &amp; pricing
        </h1>
        <p className="text-sm text-muted">
          Manage recipe costs and selling prices by menu category. New orders
          keep their own saved estimates.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/menu">Menu &amp; extras</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/reports">Actual reports</Link>
          </Button>
        </div>
      </header>
      <div
        role="group"
        aria-label="Costing sections"
        className="flex rounded-xl bg-chip p-1"
      >
        {(["recipes", "history"] as const).map((t) => (
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
            {t === "recipes" ? "Recipes" : "History"}
          </button>
        ))}
      </div>
      {tab === "recipes" ? (
        <>
          <details
            className="rounded-xl border bg-card p-4"
            onToggle={(event) => setUpdatesOpen(event.currentTarget.open)}
          >
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">
              Recipe updates · review and apply
            </summary>
            {updatesOpen ? (
              <div className="mt-3 space-y-3">
                <October31CostingUpdate extras />
                <OctoberCostingUpdate />
              </div>
            ) : null}
          </details>
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
              Add a recipe or open Recipe updates to import the latest costing.
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section
                  key={group.key}
                  className="space-y-3"
                  aria-label={group.name}
                >
                  <h2 className="text-xl font-bold">
                    {group.name}{" "}
                    <span className="text-sm font-normal text-muted">
                      ({group.recipes.length})
                    </span>
                  </h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {group.recipes.map((r) => (
                      <article
                        key={r.id}
                        className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
                      >
                        <div>
                          <h3 className="break-words text-xl font-bold">
                            {r.name}
                          </h3>
                          <p className="text-xs text-muted">
                            {r.variant_id
                              ? `${menu.data.products.find((p) => p.id === menu.data.variants.find((v) => v.id === r.variant_id)?.product_id)?.name ?? "Dish"} · ${menu.data.variants.find((v) => v.id === r.variant_id)?.name ?? "Variant"}`
                              : r.addon_id
                                ? `Extra: ${menu.data.extras.find((a) => a.id === r.addon_id)?.name ?? "Unavailable"}`
                                : "Not linked to a menu item"}
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
                          <Button
                            variant="secondary"
                            onClick={() => setEditor(r)}
                          >
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
                </section>
              ))}
              {groups.length === 0 ? (
                <p role="status">No recipes match your search.</p>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <section className="space-y-3">
          <h2 className="break-words text-xl font-bold">
            Recent costing changes
          </h2>
          <p className="text-sm text-muted">
            Last 50 changes. Every version is retained in the database.
          </p>
          {c.history
            .filter((h) => h.entity === "recipe")
            .map((h) => (
              <details className="rounded-xl border bg-card p-3" key={h.id}>
                <summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-semibold">
                  {String(h.snapshot.name ?? "Recipe")} · {h.staff} ·{" "}
                  {new Date(h.changed_at).toLocaleString("en-GB", {
                    timeZone: "Europe/Nicosia",
                  })}
                </summary>
                <HistorySnapshot snapshot={h.snapshot} />
              </details>
            ))}
          {c.history.filter((h) => h.entity === "recipe").length === 0 ? (
            <p>No changes yet.</p>
          ) : null}
        </section>
      )}
      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        title={editor === "new" ? "Add costing recipe" : "Edit costing recipe"}
        description="Calculations come from the database. Existing orders keep their original costs."
      >
        {editor ? (
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

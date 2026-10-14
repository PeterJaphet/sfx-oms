import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input, FieldError } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import type { MenuData } from "@/features/menu/menu-model";
import { useCostPreview, useCostSave, saveRecipe, savePlan } from "./cost-api";
import {
  recipeFormSchema,
  recipePayload,
  planFormSchema,
  planPayload,
  numeric,
  percent,
  type Recipe,
  type RecipeFormValues,
  type PlanFormValues,
  type CostContext,
  type MathValues,
} from "./cost-model";

function MathPreview({
  math,
  kind,
}: {
  math: MathValues;
  kind: "recipe" | "plan";
}) {
  const entries =
    kind === "recipe"
      ? [
          ["Ingredients", "ingredients"],
          ["Direct batch cost", "cogs"],
          ["Full batch cost", "full_cost"],
          ["Batch selling price", "selling_batch"],
        ["Gross profit / batch", "gross_profit_batch"],
        ["Contribution after overhead / batch", "contribution_batch"],
          ["Direct cost / portion", "unit_cogs"],
          ["Full cost / portion", "unit_full_cost"],
          ["Calculated price / portion", "price_per_unit"],
          ["Suggested menu price", "suggested_price"],
          ["Gross profit / portion", "gross_profit_per_unit"],
        ]
      : [
          ["Planned revenue", "revenue"],
          ["Direct costs", "cogs"],
          ["Gross profit", "gross_profit"],
          ["Batch overhead", "overhead"],
          ["Weekly fixed overhead", "fixed"],
          ["Net profit", "net_profit"],
          ["Break-even revenue", "break_even"],
        ];
  return (
    <dl className="space-y-2 rounded-xl border bg-ground p-3">
      {entries.map(([label, key]) => (
        <div className="flex flex-wrap justify-between gap-2 text-sm" key={key}>
          <dt>{label}</dt>
          <dd className="font-bold">
            {numeric(math, key) === null
              ? "—"
              : formatMoney(numeric(math, key)!, "TRY")}
          </dd>
        </div>
      ))}
      <div className="flex justify-between gap-2 text-sm">
        <dt>Gross margin</dt>
        <dd className="font-semibold">
          {percent(numeric(math, "gross_margin"))}
        </dd>
      </div>
    </dl>
  );
}
export function RecipeForm({
  recipe,
  menu,
  onSaved,
}: {
  recipe?: Recipe;
  menu: MenuData;
  onSaved: () => void;
}) {
  const inputs = recipe?.inputs;
  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    mode: "onChange",
    defaultValues: {
      name: recipe?.name ?? "",
      target: recipe?.variant_id
        ? `v:${recipe.variant_id}`
        : recipe?.addon_id
          ? `a:${recipe.addon_id}`
          : "",
      ingredients: inputs?.ingredients.map((l) => ({
        name: l.name,
        cost: String(l.cost),
      })) ?? [{ name: "", cost: "" }],
      packaging: String(inputs?.packaging ?? 0),
      overhead: String(inputs?.overhead ?? 0),
      yield: String(inputs?.yield ?? 1),
      multiplier: String(inputs?.multiplier ?? 2),
      rounding: String(inputs?.rounding ?? 10),
      planned_batches: String(inputs?.planned_batches ?? 0),
    },
  });
  const lines = useFieldArray({ control: form.control, name: "ingredients" });
  const watched = form.watch();
  const parsed = recipeFormSchema.safeParse(watched);
  const payload = parsed.success
    ? recipePayload(parsed.data, recipe)
    : undefined;
  const preview = useCostPreview("recipe", payload?.inputs);
  const save = useCostSave<RecipeFormValues>(
    (v) => saveRecipe(recipePayload(v, recipe)),
    onSaved,
  );
  const select =
    "min-h-11 w-full rounded-lg border border-line-strong bg-card p-3 text-base";
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
    >
      <fieldset disabled={save.isPending} className="space-y-4">
        <div>
          <label
            htmlFor="recipe-name"
            className="mb-2 block text-sm font-semibold"
          >
            Recipe name
          </label>
          <Input id="recipe-name" {...form.register("name")} />
          <FieldError
            id="recipe-name-error"
            message={form.formState.errors.name?.message}
          />
        </div>
        <div>
          <label
            htmlFor="recipe-target"
            className="mb-2 block text-sm font-semibold"
          >
            Menu item this recipe costs
          </label>
          <select
            id="recipe-target"
            className={select}
            {...form.register("target")}
          >
            <option value="">Unlinked planning recipe</option>
            <optgroup label="Dish variants">
              {menu.variants
                .filter(
                  (v) =>
                    !menu.products.find((p) => p.id === v.product_id)?.addon_id,
                )
                .map((v) => (
                  <option key={v.id} value={`v:${v.id}`}>
                    {menu.products.find((p) => p.id === v.product_id)?.name} ·{" "}
                    {v.name}
                    {!v.is_active ? " (inactive)" : ""}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Extras (shared with standalone item)">
              {menu.extras.map((a) => (
                <option key={a.id} value={`a:${a.id}`}>
                  {a.name}
                  {!a.is_active ? " (inactive)" : ""}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="mt-1 text-xs text-muted">
            Each variant needs its own costing. An extra uses one recipe for
            both ways of selling it.
          </p>
        </div>
        <section className="space-y-3">
          <h3 className="font-bold">Ingredient costs per batch (₺)</h3>
          {lines.fields.map((l, i) => (
            <div key={l.id} className="space-y-2 rounded-lg border p-3">
              <label
                className="block text-sm font-semibold"
                htmlFor={`ingredient-name-${i}`}
              >
                Ingredient {i + 1}
              </label>
              <Input
                id={`ingredient-name-${i}`}
                {...form.register(`ingredients.${i}.name`)}
              />
              <FieldError
                id={`ingredient-name-error-${i}`}
                message={form.formState.errors.ingredients?.[i]?.name?.message}
              />
              <label
                className="block text-sm font-semibold"
                htmlFor={`ingredient-cost-${i}`}
              >
                Batch cost (₺)
              </label>
              <Input
                id={`ingredient-cost-${i}`}
                inputMode="decimal"
                {...form.register(`ingredients.${i}.cost`)}
              />
              <FieldError
                id={`ingredient-cost-error-${i}`}
                message={form.formState.errors.ingredients?.[i]?.cost?.message}
              />
              <Button
                variant="secondary"
                size="secondary"
                disabled={lines.fields.length === 1}
                onClick={() => lines.remove(i)}
              >
                Remove ingredient {i + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            className="w-full"
            disabled={lines.fields.length >= 100}
            onClick={() => lines.append({ name: "", cost: "" })}
          >
            Add ingredient
          </Button>
        </section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["packaging", "Packaging per batch (₺)"],
              ["overhead", "Operational cost per batch (₺)"],
              ["yield", "Portions per batch"],
              ["multiplier", "Price multiplier"],
              ["rounding", "Round price up to (₺)"],
              ["planned_batches", "Planned batches per week"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label
                htmlFor={`recipe-${key}`}
                className="mb-2 block text-sm font-semibold"
              >
                {label}
              </label>
              <Input
                id={`recipe-${key}`}
                inputMode={key === "yield" ? "numeric" : "decimal"}
                {...form.register(key)}
              />
              <FieldError
                id={`recipe-${key}-error`}
                message={form.formState.errors[key]?.message}
              />
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">
          Suggested price = (ingredients + packaging + overhead) × multiplier ÷
          portions, rounded up. Saving costs does not publish a menu price.
        </p>
        {preview.error ? (
          <p role="alert" className="text-sm text-brand-strong">
            {preview.error.message}
          </p>
        ) : preview.data && preview.valid ? (
          <div aria-busy={preview.updating}>
            <p role="status" className="mb-2 text-xs text-muted">
              {preview.updating
                ? "Updating database preview…"
                : "Database calculation"}
            </p>
            <MathPreview kind="recipe" math={preview.data} />
          </div>
        ) : (
          <p className="text-sm text-muted">
            Fill the required inputs to calculate.
          </p>
        )}
        <Button
          requiresOnline
          className="w-full"
          type="submit"
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save costing"}
        </Button>
      </fieldset>
    </form>
  );
}
export function PlanForm({
  context,
  onSaved,
}: {
  context: CostContext;
  onSaved: () => void;
}) {
  const p = context.plan.inputs;
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    mode: "onChange",
    defaultValues: {
      rent_usd: String(p.rent_usd),
      payroll_usd: String(p.payroll_usd),
      usd_rate: String(p.usd_rate),
      weekly_fixed: p.weekly_fixed.map((l) => ({
        name: l.name,
        cost: String(l.cost),
      })),
      scenarios: p.scenarios.map((rate) => ({ rate: String(rate) })),
    },
  });
  const fixed = useFieldArray({ control: form.control, name: "weekly_fixed" });
  const scenarios = useFieldArray({ control: form.control, name: "scenarios" });
  const parsed = planFormSchema.safeParse(form.watch());
  const payload = parsed.success ? planPayload(parsed.data) : undefined;
  const preview = useCostPreview("plan", payload);
  const save = useCostSave<PlanFormValues>(
    (v) => savePlan(planPayload(v), context.plan.revision),
    onSaved,
  );
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
    >
      <fieldset disabled={save.isPending} className="space-y-4">
        {(
          [
            ["rent_usd", "Rent per month ($)"],
            ["payroll_usd", "Payroll per month ($)"],
            ["usd_rate", "Planning rate (₺ per $1)"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label
              htmlFor={`plan-${key}`}
              className="mb-2 block text-sm font-semibold"
            >
              {label}
            </label>
            <Input
              id={`plan-${key}`}
              inputMode="decimal"
              {...form.register(key)}
            />
            <FieldError
              id={`plan-${key}-error`}
              message={form.formState.errors[key]?.message}
            />
          </div>
        ))}
        <p className="text-sm text-muted">
          Monthly dollar costs × planning rate ÷ (52 / 12) = weekly cost. This
          planning rate does not change payment rates.
        </p>
        <h3 className="font-bold">Other fixed costs per week (₺)</h3>
        {fixed.fields.map((l, i) => (
          <div key={l.id} className="space-y-2 rounded-lg border p-3">
            <label
              htmlFor={`fixed-name-${i}`}
              className="block text-sm font-semibold"
            >
              Cost name {i + 1}
            </label>
            <Input
              id={`fixed-name-${i}`}
              {...form.register(`weekly_fixed.${i}.name`)}
            />
            <FieldError
              id={`fixed-name-error-${i}`}
              message={form.formState.errors.weekly_fixed?.[i]?.name?.message}
            />
            <label
              htmlFor={`fixed-cost-${i}`}
              className="block text-sm font-semibold"
            >
              Weekly cost (₺)
            </label>
            <Input
              id={`fixed-cost-${i}`}
              inputMode="decimal"
              {...form.register(`weekly_fixed.${i}.cost`)}
            />
            <FieldError
              id={`fixed-cost-error-${i}`}
              message={form.formState.errors.weekly_fixed?.[i]?.cost?.message}
            />
            <Button variant="secondary" onClick={() => fixed.remove(i)}>
              Remove fixed cost {i + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          className="w-full"
          disabled={fixed.fields.length >= 100}
          onClick={() => fixed.append({ name: "", cost: "" })}
        >
          Add fixed cost
        </Button>
        <p className="rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">
          Keep electricity, water, gas, transport and cleaning in recipe
          overhead. Do not count the same cost here too.
        </p>
        <h3 className="font-bold">Exchange-rate scenarios (₺ per $1)</h3>
        {scenarios.fields.map((s, i) => (
          <div key={s.id} className="space-y-2">
            <label
              htmlFor={`scenario-${i}`}
              className="block text-sm font-semibold"
            >
              Scenario {i + 1}
            </label>
            <div className="flex gap-2">
              <Input
                id={`scenario-${i}`}
                inputMode="decimal"
                {...form.register(`scenarios.${i}.rate`)}
              />
              <Button
                variant="secondary"
                disabled={scenarios.fields.length === 1}
                onClick={() => scenarios.remove(i)}
                aria-label={`Remove scenario ${i + 1}`}
              >
                Remove
              </Button>
            </div>
            <FieldError
              id={`scenario-error-${i}`}
              message={form.formState.errors.scenarios?.[i]?.rate?.message}
            />
          </div>
        ))}
        <Button
          variant="secondary"
          className="w-full"
          disabled={scenarios.fields.length >= 10}
          onClick={() => scenarios.append({ rate: "" })}
        >
          Add rate scenario
        </Button>
        {preview.error ? (
          <p role="alert" className="text-sm text-brand-strong">
            {preview.error.message}
          </p>
        ) : preview.data && preview.valid ? (
          <div aria-busy={preview.updating}>
            <p role="status" className="mb-2 text-xs text-muted">
              {preview.updating
                ? "Updating database preview…"
                : "Database calculation"}
            </p>
            <MathPreview math={preview.data} kind="plan" />
          </div>
        ) : null}
        <Button
          requiresOnline
          type="submit"
          className="w-full"
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save weekly plan"}
        </Button>
      </fieldset>
    </form>
  );
}

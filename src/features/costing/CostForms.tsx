import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input, FieldError } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import type { MenuData } from "@/features/menu/menu-model";
import { useCostPreview, useCostSave, saveRecipe } from "./cost-api";
import {
  recipeFormSchema,
  recipePayload,
  numeric,
  percent,
  type Recipe,
  type RecipeFormValues,
  type MathValues,
} from "./cost-model";

function MathPreview({ math }: { math: MathValues }) {
  const entries = [
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
            <option value="">Not linked to a menu item</option>
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
            <MathPreview math={preview.data} />
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

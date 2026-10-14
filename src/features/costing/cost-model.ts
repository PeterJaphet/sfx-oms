import { z } from "zod";
export const costLine = z.object({
  name: z.string().trim().min(1).max(120),
  cost: z.number().finite().nonnegative(),
});
export const recipeInputs = z.object({
  ingredients: z.array(costLine).min(1).max(100),
  packaging: z.number(),
  overhead: z.number(),
  yield: z.number().int().positive(),
  multiplier: z.number().positive(),
  rounding: z.number().positive(),
  planned_batches: z.number().nonnegative(),
});
export const planInputs = z.object({
  rent_usd: z.number(),
  payroll_usd: z.number(),
  usd_rate: z.number().positive(),
  weekly_fixed: z.array(costLine),
  scenarios: z.array(z.number().positive()).min(1).max(10),
});
export const mathSchema = z.record(
  z.string(),
  z.union([
    z.number().finite(),
    z.null(),
    z.array(z.record(z.string(), z.number().nullable())),
  ]),
);
export type MathValues = z.infer<typeof mathSchema>;
export const recipeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  variant_id: z.string().nullable(),
  addon_id: z.string().nullable(),
  inputs: recipeInputs,
  revision: z.number(),
  updated_at: z.string(),
  current_price: z.number().nullable(),
  math: mathSchema,
});
export const contextSchema = z.object({
  recipes: z.array(recipeSchema),
  plan: z.object({ inputs: planInputs, revision: z.number() }),
  math: mathSchema,
  generated_at: z.string(),
  business_date: z.iso.date(),
  from: z.iso.date(),
  to: z.iso.date(),
  actual_operational: z.number(),
  recovered_operational: z.number(),
  operational_shortfall: z.number(),
  actual_per_planned_batch: z.number().nullable(),
  history: z.array(
    z.object({
      id: z.number(),
      entity: z.string(),
      entity_id: z.string(),
      changed_at: z.string(),
      staff: z.string(),
      snapshot: z.record(z.string(), z.unknown()),
    }),
  ),
});
export const profitSchema = z.object({
  revenue: z.number(),
  cogs: z.number().nullable(),
  gross_profit: z.number().nullable(),
  operational: z.number().nullable(),
  fixed: z.number().nullable(),
  net_profit: z.number().nullable(),
  gross_margin: z.number().nullable(),
  net_margin: z.number().nullable(),
  complete: z.boolean(),
  missing: z.array(z.string()),
  fixed_ratio: z.number().nullable(),
  planned_revenue: z.number(),
  weekly_fixed: z.number(),
  cancelled: z.boolean().optional(),
  saved_at: z.string().optional(),
});
export type Recipe = z.infer<typeof recipeSchema>;
export type CostContext = z.infer<typeof contextSchema>;
export type Profit = z.infer<typeof profitSchema>;
export type RecipeInputs = z.infer<typeof recipeInputs>;
export type PlanInputs = z.infer<typeof planInputs>;
const decimal = (scale = 2, min = 0, max = 9999999999.99) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(scale === 0 ? `^\\d+$` : `^\\d+(\\.\\d{1,${scale}})?$`),
      `Use at most ${scale} decimals`,
    )
    .refine(
      (v) => Number(v) >= min && Number(v) <= max,
      "Enter a value within the allowed range",
    );
const lineForm = z.object({
  name: z.string().trim().min(1, "Enter a cost name").max(120),
  cost: decimal(),
});
export const recipeFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a recipe name").max(120),
  target: z.string(),
  ingredients: z.array(lineForm).min(1).max(100),
  packaging: decimal(),
  overhead: decimal(),
  yield: decimal(0, 1, 9999),
  multiplier: decimal(6, 0.000001, 1000),
  rounding: decimal(2, 0.01, 1000),
  planned_batches: decimal(2, 0, 999999),
});
export type RecipeFormValues = z.infer<typeof recipeFormSchema>;
export function recipePayload(v: RecipeFormValues, existing?: Recipe) {
  const values = recipeFormSchema.parse(v);
  const { name, target, ingredients, ...numbers } = values;
  return {
    ...(existing ? { id: existing.id, revision: existing.revision } : {}),
    name,
    variant_id: target.startsWith("v:") ? target.slice(2) : null,
    addon_id: target.startsWith("a:") ? target.slice(2) : null,
    inputs: {
      ingredients: ingredients.map((l) => ({ ...l, cost: Number(l.cost) })),
      ...Object.fromEntries(
        Object.entries(numbers).map(([k, n]) => [k, Number(n)]),
      ),
    },
  };
}
export const planFormSchema = z.object({
  rent_usd: decimal(),
  payroll_usd: decimal(),
  usd_rate: decimal(6, 0.000001, 999999),
  weekly_fixed: z.array(lineForm).max(100),
  scenarios: z
    .array(z.object({ rate: decimal(6, 0.000001, 999999) }))
    .min(1)
    .max(10),
});
export type PlanFormValues = z.infer<typeof planFormSchema>;
export function planPayload(v: PlanFormValues): PlanInputs {
  const p = planFormSchema.parse(v);
  return {
    rent_usd: Number(p.rent_usd),
    payroll_usd: Number(p.payroll_usd),
    usd_rate: Number(p.usd_rate),
    weekly_fixed: p.weekly_fixed.map((l) => ({ ...l, cost: Number(l.cost) })),
    scenarios: p.scenarios.map((s) => Number(s.rate)),
  };
}
export function numeric(m: MathValues, key: string): number | null {
  const v = m[key];
  return typeof v === "number" ? v : null;
}
export function percent(n: number | null) {
  return n === null
    ? "—"
    : `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n * 100)}%`;
}

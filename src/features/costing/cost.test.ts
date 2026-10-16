import { describe, it, expect } from "vitest";
import {
  recipeFormSchema,
  recipePayload,
  planFormSchema,
  planPayload,
  profitSchema,
  type RecipeFormValues,
} from "./cost-model";
import {
  emptyDraft,
  savePayload,
  workspaceSchema,
  detailsSchema,
} from "@/features/orders/order-model";
const recipe: RecipeFormValues = {
  name: "Soup",
  target: "v:00000000-0000-4000-8000-000000000001",
  ingredients: [{ name: "Spinach", cost: "70.25" }],
  packaging: "100",
  overhead: "0",
  yield: "4",
  multiplier: "2.15",
  rounding: "10",
  planned_batches: "5",
};
describe("costing inputs and server boundaries", () => {
  it("sends numeric inputs and selected IDs without deriving totals or selling prices", () => {
    const p = recipePayload(recipe);
    expect(p.variant_id).toBe(recipe.target.slice(2));
    expect(p.addon_id).toBe(null);
    expect(p.inputs).toEqual({
      ingredients: [{ name: "Spinach", cost: 70.25 }],
      packaging: 100,
      overhead: 0,
      yield: 4,
      multiplier: 2.15,
      rounding: 10,
      planned_batches: 5,
    });
    expect(p).not.toHaveProperty("selling_price");
    expect(p.inputs).not.toHaveProperty("gross_profit");
  });
  it.each(["0", "1.5", "-1", "1e2", "Infinity", ""])(
    "rejects invalid batch yield %s",
    (yieldValue) =>
      expect(
        recipeFormSchema.safeParse({ ...recipe, yield: yieldValue }).success,
      ).toBe(false),
  );
  it.each(["10tl", "-1", "1.001", "NaN", ""])(
    "rejects invalid input cost %s",
    (cost) =>
      expect(
        recipeFormSchema.safeParse({
          ...recipe,
          ingredients: [{ name: "Oil", cost }],
        }).success,
      ).toBe(false),
  );
  it("keeps a genuine zero cost and a fractional planned batch", () =>
    expect(
      recipePayload({
        ...recipe,
        ingredients: [{ name: "Included ingredient", cost: "0" }],
        planned_batches: "0.25",
      }).inputs,
    ).toMatchObject({
      ingredients: [{ name: "Included ingredient", cost: 0 }],
      planned_batches: 0.25,
    }));
  it("links an extra once for plate and standalone pricing", () =>
    expect(recipePayload({ ...recipe, target: "a:extra" })).toMatchObject({
      variant_id: null,
      addon_id: "extra",
    }));
  it("requires explicit ingredient costs", () =>
    expect(
      recipeFormSchema.safeParse({ ...recipe, ingredients: [] }).success,
    ).toBe(false));
  it("rejects invalid planning rates and missing scenarios", () => {
    const base = {
      rent_usd: "550",
      payroll_usd: "700",
      usd_rate: "47.9",
      weekly_fixed: [{ name: "Phone", cost: "0" }],
      scenarios: [{ rate: "44" }],
    };
    expect(planPayload(base)).toEqual({
      rent_usd: 550,
      payroll_usd: 700,
      usd_rate: 47.9,
      weekly_fixed: [{ name: "Phone", cost: 0 }],
      scenarios: [44],
    });
    expect(planFormSchema.safeParse({ ...base, usd_rate: "0" }).success).toBe(
      false,
    );
    expect(planFormSchema.safeParse({ ...base, scenarios: [] }).success).toBe(
      false,
    );
  });
  it("preserves unavailable profits instead of coercing to zero", () => {
    const p = profitSchema.parse({
      revenue: 800,
      cogs: null,
      gross_profit: null,
      operational: null,
      fixed: 50,
      net_profit: null,
      gross_margin: null,
      net_margin: null,
      complete: false,
      missing: ["Swallow"],
      fixed_ratio: 0.1,
      planned_revenue: 10000,
      weekly_fixed: 1000,
    });
    expect(p.net_profit).toBe(null);
    expect(p.missing).toEqual(["Swallow"]);
  });
});
describe("visible customer fields and saved request compatibility", () => {
  it("restores an unfinished delivery draft without losing its items", () => {
    const draft = emptyDraft(); draft.details.order_type = "pickup";
    draft.details.order_type = "delivery";
    draft.items = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        product_id: "dish",
        variant_id: "variant",
        quantity: 2,
        addon_ids: [],
        extras: [],
        note: "",
      },
    ];
    const restored = workspaceSchema.parse(
      JSON.parse(JSON.stringify({ draft, attempt: null, savedId: null })),
    );
    expect(restored.draft.items[0].quantity).toBe(2);
    expect(detailsSchema.safeParse(restored.draft.details).success).toBe(false);
    expect(() => savePayload(restored.draft, "quote")).toThrow();
  });
  it("includes a cost token only for the new save protocol, preserving old pending payloads", () => {
    const d = emptyDraft(); d.details.order_type = "pickup";
    expect(savePayload(d, "price")).not.toHaveProperty("cost_token");
    expect(savePayload(d, "price", false, "profit")).toHaveProperty(
      "cost_token",
      "profit",
    );
    const attempt = { unpaid: false, payload: savePayload(d, "legacy-price") };
    expect(
      workspaceSchema.parse({ draft: d, savedId: null, attempt }).attempt,
    ).toEqual(attempt);
  });
  it("saves trimmed name and phone, and removes an irrelevant address", () => {
    const d = emptyDraft(); d.details.order_type = "pickup";
    d.details.customer_name = " Peter ";
    d.details.customer_phone = " +9050000 ";
    d.details.delivery_address = "Old delivery";
    expect(savePayload(d, "quote")).toMatchObject({
      customer_name: "Peter",
      customer_phone: "+9050000",
      delivery_address: "",
    });
  });
});

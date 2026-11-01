import type { MenuData } from "@/features/menu/menu-model";
import type { Recipe } from "./cost-model";

export function groupRecipes(recipes: Recipe[], menu: MenuData, search = "") {
  const categories = [...menu.categories].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  );
  const groups = categories.map((c) => ({
    key: String(c.id),
    name: c.name,
    recipes: [] as Recipe[],
  }));
  const extras = groups.find((g) => g.name.toLowerCase() === "extras") ?? {
    key: "extras",
    name: "Extras",
    recipes: [] as Recipe[],
  };
  if (!groups.includes(extras)) groups.push(extras);
  const unlinked = {
    key: "unlinked",
    name: "Not linked to menu",
    recipes: [] as Recipe[],
  };
  groups.push(unlinked);
  const variants = new Map(menu.variants.map((v) => [v.id, v]));
  const productOrder = new Map(menu.products.map((p, index) => [p.id, index]));
  const products = new Map(menu.products.map((p) => [p.id, p]));
  const addons = new Map(menu.extras.map((a) => [a.id, a]));
  const needle = search.trim().toLowerCase();
  for (const recipe of recipes) {
    const variant = recipe.variant_id
      ? variants.get(recipe.variant_id)
      : undefined;
    const product = variant ? products.get(variant.product_id) : undefined;
    const extra = recipe.addon_id ? addons.get(recipe.addon_id) : undefined;
    const group =
      recipe.addon_id || product?.addon_id
        ? extras
        : (groups.find((g) => g.key === String(product?.category_id)) ??
          unlinked);
    if (
      ![
        recipe.name,
        product?.name,
        variant?.name,
        extra?.name,
        group.name,
      ].some((name) => name?.toLowerCase().includes(needle))
    )
      continue;
    group.recipes.push(recipe);
  }
  const order = (r: Recipe) => {
    const variant = r.variant_id ? variants.get(r.variant_id) : undefined;
    const product = variant ? products.get(variant.product_id) : undefined;
    return [
      product ? (productOrder.get(product.id) ?? 0) : 0,
      variant?.sort_order ?? 0,
    ];
  };
  for (const group of groups)
    group.recipes.sort(
      (a, b) =>
        order(a)[0] - order(b)[0] ||
        order(a)[1] - order(b)[1] ||
        a.name.localeCompare(b.name),
    );
  return groups.filter((g) => g.recipes.length > 0);
}

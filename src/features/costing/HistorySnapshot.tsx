import { formatMoney } from "@/lib/format";
import { recipeInputs } from "./cost-model";
export function HistorySnapshot({
  snapshot,
}: {
  snapshot: Record<string, unknown>;
}) {
  const recipe = recipeInputs.safeParse(snapshot.inputs);
  const rows: [string, string][] = [];
  if (recipe.success) {
    const r = recipe.data;
    rows.push(
      ...r.ingredients.map(
        (l) => [l.name, formatMoney(l.cost, "TRY")] as [string, string],
      ),
      ["Packaging / batch", formatMoney(r.packaging, "TRY")],
      ["Operational / batch", formatMoney(r.overhead, "TRY")],
      ["Portions / batch", String(r.yield)],
      ["Multiplier", `${r.multiplier}×`],
      ["Round price up to", formatMoney(r.rounding, "TRY")],
    );
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted">
        Saved version {String(snapshot.revision ?? "")}
      </p>
      <dl className="space-y-2">
        {rows.map(([k, v], i) => (
          <div className="flex flex-wrap justify-between gap-2 text-sm" key={i}>
            <dt className="min-w-0 max-w-full break-words">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

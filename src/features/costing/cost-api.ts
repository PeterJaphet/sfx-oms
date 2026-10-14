import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Json } from "@/lib/db.types";
import { client } from "@/features/menu/menu-api";
import { assertOnline } from "@/lib/connectivity";
import {
  contextSchema,
  mathSchema,
  profitSchema,
  type Recipe,
} from "./cost-model";
export function useCosting(from?: string, to?: string) {
  return useQuery({
    queryKey: ["costing", from, to],
    queryFn: async () => {
      const { data, error } = await client().rpc("get_costing", {
        ...(from ? { p_from: from } : {}),
        ...(to ? { p_to: to } : {}),
      });
      if (error) throw new Error(error.message);
      return contextSchema.parse(data);
    },
    staleTime: 15000,
  });
}
export function useCostPreview(
  kind: "recipe" | "plan",
  payload: Json | undefined,
) {
  const serialized = payload ? JSON.stringify(payload) : null;
  const [debounced, setDebounced] = useState(serialized);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(serialized), 350);
    return () => window.clearTimeout(id);
  }, [serialized]);
  const query = useQuery({
    queryKey: ["cost-preview", kind, debounced],
    enabled: debounced !== null,
    queryFn: async () => {
      const { data, error } = await client().rpc(
        kind === "recipe" ? "preview_cost_recipe" : "preview_cost_plan",
        { p: JSON.parse(debounced!) },
      );
      if (error) throw new Error(error.message);
      return mathSchema.parse(data);
    },
    retry: false,
    staleTime: 15000,
  });
  return {
    ...query,
    updating: serialized !== debounced || query.isFetching,
    valid: serialized !== null,
  };
}
export function useCostSave<T>(
  action: (values: T) => Promise<unknown>,
  onSaved: () => void,
) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      assertOnline();
      return action(v);
    },
    onSuccess: async () => {
      await Promise.all(
        [
          "costing",
          "cost-preview",
          "order-quote",
          "menu",
          "price-history",
          "activity",
          "reports",
        ].map((key) => queries.invalidateQueries({ queryKey: [key] })),
      );
      onSaved();
      toast.success("Costing saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export async function saveRecipe(p: Json) {
  const r = await client().rpc("save_cost_recipe", { p });
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
export async function savePlan(p: Json, revision: number) {
  const r = await client().rpc("save_cost_plan", { p, p_revision: revision });
  if (r.error) throw new Error(r.error.message);
}
export async function loadWorkbook() {
  const r = await client().rpc("load_costing_workbook");
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
export async function applyPrice(r: Recipe) {
  const result = await client().rpc("apply_cost_price", {
    p_recipe: r.id,
    p_revision: r.revision,
    p_price: r.current_price!,
  });
  if (result.error) throw new Error(result.error.message);
}
export function useOrderProfit(id: string) {
  return useQuery({
    queryKey: ["order-profit", id],
    queryFn: async () => {
      const r = await client().rpc("get_order_cost", { p_order: id });
      if (r.error) throw new Error(r.error.message);
      return r.data === null ? null : profitSchema.parse(r.data);
    },
    refetchInterval: 15000,
  });
}

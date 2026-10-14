import { extraSnapshotSchema } from "./extra-model";
import { assertOnline } from "@/lib/connectivity";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { Json } from "@/lib/db.types";
import { client } from "@/features/menu/menu-api";
import { accountSchema, quoteSchema } from "./order-model";

export async function quoteOrder(payload: Json) {
  const { data, error } = await client().rpc("quote_costed_order", {
    p_order: payload,
  });
  if (error) throw new Error(error.message);
  return quoteSchema.parse(data);
}
export class SaveError extends Error {
  constructor(
    message: string,
    public readonly uncertain: boolean,
  ) {
    super(message);
  }
}
export async function createOrder(payload: Json) {
  assertOnline();
  const { data, error } = await client().rpc(
    typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload) &&
      "cost_token" in payload
      ? "create_costed_order"
      : "create_order",
    { p_order: payload },
  );
  if (error)
    throw new SaveError(
      error.message,
      !error.code ||
        error.code === "SFX_OFFLINE" ||
        error.code.startsWith("PGRST") ||
        error.code.startsWith("08"),
    );
  if (!data?.id)
    throw new SaveError(
      "Order confirmation was not received; retry the same save",
      true,
    );
  return data;
}
export function useOrderReference() {
  return useQuery({
    queryKey: ["order-reference"],
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const db = client();
      const [accounts, rates, day, privacy] = await Promise.all([
        db
          .from("accounts")
          .select("id,name,currency")
          .eq("is_active", true)
          .order("sort_order"),
        db
          .from("fx_rates")
          .select("*")
          .order("effective_date", { ascending: false })
          .order("id", { ascending: false }),
        db.rpc("business_date"),
        db.from("orders").select("client_request_hash").limit(0),
      ]);
      for (const result of [accounts, rates, day, privacy])
        if (result.error) throw new Error(result.error.message);
      return {
        accounts: z.array(accountSchema).parse(accounts.data),
        rates: rates.data!,
        businessDate: day.data!,
      };
    },
  });
}
export async function loadSavedOrder(id: string) {
  const db = client();
  const [order, payment, items] = await Promise.all([
    db.from("orders").select("*").eq("id", id).single(),
    db.from("v_order_payments").select("*").eq("id", id).single(),
    db.from("order_items").select("*").eq("order_id", id).order("id"),
  ]);
  for (const result of [order, payment, items])
    if (result.error) throw new Error(result.error.message);
  const paid = payment.data!.paid_try,
    due = payment.data!.balance_due;
  if (paid === null || due === null)
    throw new Error("Saved payment confirmation is missing");
  return {
    order: order.data!,
    payment: { ...payment.data!, paid_try: paid, balance_due: due },
    items: items.data!.map((item) => {
      if (item.charged_total === null)
        throw new Error("Saved item total is missing");
      return {
        ...item,
        line_total: item.charged_total,
        addons: z.array(extraSnapshotSchema).parse(item.addons),
      };
    }),
  };
}

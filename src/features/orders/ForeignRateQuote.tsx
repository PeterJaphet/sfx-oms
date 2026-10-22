import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { client } from "@/features/menu/menu-api";
import { useOrder } from "./order-context";
import { quotePayload } from "./order-model";

export function ForeignRateQuote({
  account,
  disabled,
}: {
  account: number;
  disabled: boolean;
}) {
  const order = useOrder();
  const payload = quotePayload(order.draft);
  const quote = useQuery({
    queryKey: ["money", "foreign-order-amount", account, payload],
    retry: false,
    refetchInterval: 15000,
    queryFn: async () => {
      const result = await client().rpc("quote_foreign_order_amount", {
        p_order: payload,
        p_account: account,
      });
      if (result.error) throw new Error(result.error.message);
      return z
        .object({
          amount: z.string(),
          currency: z.string(),
          rate_to_try: z.string(),
          effective_date: z.string(),
        })
        .parse(result.data);
    },
  });
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      {quote.data ? (
        <>
          <p className="text-sm">
            Saved rate ({quote.data.effective_date}): 1 {quote.data.currency} ={" "}
            {quote.data.rate_to_try} TL.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || quote.isFetching || quote.isError}
            onClick={() =>
              order.update((d) => ({
                ...d,
                settlement_amount: quote.data!.amount,
              }))
            }
          >
            Use saved rate · {quote.data.amount} {quote.data.currency}
          </Button>
          <p className="text-xs text-muted">
            Any markup is already included in the saved rate. Confirm the amount
            before accepting.
          </p>
        </>
      ) : null}
      {quote.isPending ? <p role="status">Loading saved rate…</p> : null}
      {quote.error ? (
        <p role="alert" className="text-sm text-brand-strong">
          {quote.error.message}
        </p>
      ) : null}
    </div>
  );
}

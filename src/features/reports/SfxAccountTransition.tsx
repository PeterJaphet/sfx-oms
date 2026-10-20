import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { client } from "@/features/menu/menu-api";
import { Button } from "@/components/ui/button";
const previewSchema = z.object({
  ready: z.boolean(),
  historical_entries: z.number().optional(),
  recorded_currency: z.string().optional(),
  recorded_balance: z.number().optional(),
  recorded_try_value: z.number().optional(),
  pending_orders: z.number().optional(),
});
export function SfxAccountTransition() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(
    null,
  );
  const change = useMutation({
    mutationFn: async (apply: boolean) => {
      const r = await client().rpc("prepare_sfx_try_account", {
        p_apply: apply,
      });
      if (r.error) throw new Error(r.error.message);
      return { result: previewSchema.parse(r.data), apply };
    },
    onSuccess: async ({ result, apply }) => {
      setPreview(result);
      if (apply) {
        await Promise.all(
          ["reports", "order-reference", "account-balances", "setup"].map(
            (key) => qc.invalidateQueries({ queryKey: [key] }),
          ),
        );
        toast.success("SFx TL account is ready");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="rounded-xl border border-amber bg-amber-soft p-4 space-y-3">
      <h2 className="font-semibold">SFx receives TL</h2>
      <p className="text-sm">
        The old SFx account was configured in USD. Create a TL account for new
        payments while retaining the original records for reconciliation.
      </p>
      {preview && !preview.ready ? (
        <p className="text-sm">
          {preview.historical_entries} historical entries ·{" "}
          {preview.pending_orders} pending orders. Recorded balance:{" "}
          {preview.recorded_balance} {preview.recorded_currency}; recorded TRY
          value: {preview.recorded_try_value}. These figures are not a
          conversion or a confirmed opening balance.
        </p>
      ) : null}
      <Button
        requiresOnline
        variant="secondary"
        disabled={change.isPending}
        onClick={() => change.mutate(!!preview)}
      >
        {preview ? "Create SFx TL account" : "Review SFx transition"}
      </Button>
    </section>
  );
}

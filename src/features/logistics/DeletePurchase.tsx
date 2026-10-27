import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assertOnline } from "@/lib/connectivity";
import { client } from "@/features/menu/menu-api";
import { refreshLogistics } from "./logistics-api";
import type { PurchaseRow } from "./purchase-model";
import { formatMoney } from "@/lib/format";

export function DeletePurchase({
  purchase,
  onDeleted,
}: {
  purchase: PurchaseRow;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const deletion = useMutation({
    mutationFn: async () => {
      assertOnline();
      const r = await client().rpc("reverse_purchase", {
        p_purchase: purchase.id,
        p_reason: reason.trim(),
      });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: async () => {
      await refreshLogistics(qc);
      toast.success("Purchase deleted; expense and funding records updated");
      onDeleted();
    },
  });
  if (!confirm)
    return (
      <Button
        className="w-full"
        variant="secondary"
        onClick={() => setConfirm(true)}
      >
        Delete purchase
      </Button>
    );
  return (
    <section className="space-y-3 rounded-xl border border-brand bg-brand-soft p-4">
      <h2 className="text-lg font-bold">Delete this purchase?</h2>
      <p className="text-sm">
        {purchase.supplier} · {formatMoney(purchase.amount, purchase.currency)}.
        It will be excluded from expenses and inventory purchase totals.
      </p>
      <p className="text-sm">
        {purchase.funding === "account"
          ? "The recorded account balance will be restored."
          : purchase.funding === "advance"
            ? "The amount will be restored to the advance’s unspent balance."
            : "The unpaid supplier debt will be cancelled. Purchases with supplier payments need those payments reversed first."}{" "}
        The original purchase, items and receipt remain in deleted history.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length >= 3 && !deletion.isPending)
            deletion.mutate();
        }}
      >
        <label className="block font-semibold" htmlFor="delete-purchase-reason">
          Reason for deletion
        </label>
        <Input
          id="delete-purchase-reason"
          value={reason}
          minLength={3}
          maxLength={1000}
          required
          disabled={deletion.isPending}
          onChange={(e) => setReason(e.target.value)}
        />
        {deletion.error ? (
          <p role="alert" className="break-words text-brand-strong">
            {deletion.error.message} You can retry this deletion safely.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            requiresOnline
            type="submit"
            disabled={deletion.isPending || reason.trim().length < 3}
          >
            {deletion.isPending ? "Deleting…" : "Confirm delete purchase"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={deletion.isPending}
            onClick={() => setConfirm(false)}
          >
            Keep purchase
          </Button>
        </div>
      </form>
    </section>
  );
}

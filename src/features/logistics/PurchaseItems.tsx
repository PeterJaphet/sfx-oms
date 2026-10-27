import { useInventory } from "@/features/inventory/inventory-api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { itemSchema } from "./purchase-model";
export type PurchaseItem = z.infer<typeof itemSchema>;
export default function PurchaseItems({
  item,
  editing = !!item,
  onSave,
  onClose,
}: {
  item?: PurchaseItem;
  editing?: boolean;
  onSave: (item: PurchaseItem) => void;
  onClose: () => void;
}) {
  const catalogue = useInventory();
  const form = useForm<PurchaseItem>({
    resolver: zodResolver(itemSchema),
    defaultValues: item ?? {
      description: "",
      quantity: "1",
      unit: "pcs",
      amount: "",
    },
  });
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? "Edit item" : "Add item"}
      description="Enter the total line amount, not a unit price. The database totals all lines."
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(onSave)}>
        <div>
          <label
            className="mb-2 block font-semibold"
            htmlFor="purchase-inventory"
          >
            Inventory item
          </label>
          <select
            id="purchase-inventory"
            className="h-12 w-full rounded-xl border bg-card px-3"
            value={form.watch("inventory_item_id") ?? ""}
            onChange={(e) => {
              const selected = catalogue.data?.find(
                (i) => i.id === e.target.value,
              );
              form.setValue("inventory_item_id", selected?.id);
              if (selected) {
                form.setValue("description", selected.name);
                form.setValue("unit", selected.default_unit);
              }
            }}
          >
            <option value="">
              Select inventory item or enter another description
            </option>
            {catalogue.data
              ?.filter((i) => i.is_active)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.item_group} · {i.name}
                </option>
              ))}
          </select>
          {catalogue.error ? (
            <p role="alert">{catalogue.error.message}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted">
            Select a checklist item to track its expenses. Enter actual
            quantity, unit and total line amount.
          </p>
        </div>
        {(
          [
            ["description", "Description"],
            ["quantity", "Quantity"],
            ["unit", "Unit (kg, pcs, pack, L)"],
            ["amount", "Line amount"],
          ] as const
        ).map(([name, label]) => (
          <div key={name}>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor={`purchase-item-${name}`}
            >
              {label}
            </label>
            <Input
              id={`purchase-item-${name}`}
              inputMode={
                name === "amount" || name === "quantity" ? "decimal" : "text"
              }
              aria-describedby={`purchase-item-${name}-error`}
              readOnly={
                name === "description" && !!form.watch("inventory_item_id")
              }
              {...form.register(name)}
            />
            <FieldError
              id={`purchase-item-${name}-error`}
              message={form.formState.errors[name]?.message}
            />
          </div>
        ))}
        <Button type="submit" className="w-full">
          Save item
        </Button>
      </form>
    </Sheet>
  );
}

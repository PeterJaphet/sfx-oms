import { Button } from "@/components/ui/button";
import { useInventory, type InventoryItem } from "./inventory-api";

export function InventorySelect({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (item: InventoryItem | undefined) => void;
  disabled?: boolean;
}) {
  const catalogue = useInventory();
  const active = catalogue.data?.filter((i) => i.is_active) ?? [];
  const groups = [...new Set(active.map((i) => i.item_group))];
  return (
    <div className="space-y-2">
      <select
        id={id}
        className="h-12 w-full rounded-xl border border-line-strong bg-card px-3"
        value={value}
        disabled={disabled || catalogue.isPending || !!catalogue.error}
        onChange={(e) => onChange(active.find((i) => i.id === e.target.value))}
      >
        <option value="">
          {catalogue.isPending
            ? "Loading inventory…"
            : "Select an inventory item…"}
        </option>
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {active
              .filter((i) => i.item_group === group)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {catalogue.error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{catalogue.error.message}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void catalogue.refetch();
            }}
          >
            Reload inventory
          </Button>
        </div>
      ) : null}
      {catalogue.data && !active.length ? (
        <p className="text-sm text-muted">
          No active inventory items. Ask Admin to add items in Inventory.
        </p>
      ) : null}
    </div>
  );
}

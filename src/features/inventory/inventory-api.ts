import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { client } from "@/features/menu/menu-api";
export const inventorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  item_group: z.string(),
  default_unit: z.string(),
  is_active: z.boolean(),
  revision: z.number(),
});
export type InventoryItem = z.infer<typeof inventorySchema>;
export function useInventory() {
  return useQuery({
    queryKey: ["inventory", "catalogue"],
    queryFn: async () => {
      // Read through RPC to keep the generated table contract independent of stale clients.
      const r = await client().rpc("list_inventory_items");
      if (r.error) throw new Error(r.error.message);
      return z.array(inventorySchema).parse(r.data);
    },
    staleTime: 15000,
  });
}

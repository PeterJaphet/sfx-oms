import { createContext, useContext } from "react";
import type { Draft, Workspace } from "./order-model";
export type OrderState = Workspace & {
  update: (change: (draft: Draft) => Draft) => void;
  clear: () => void;
  save: (token: string, unpaid: boolean, costToken?: string) => Promise<void>;
  retrySave: () => Promise<void>;
  saving: boolean;
  error: Error | null;
  storageWarning: boolean;
};
export const OrderContext = createContext<OrderState | null>(null);
export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) throw new Error("Order workspace is missing");
  return context;
}

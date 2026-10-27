import type { Database } from "@/lib/db.types";
export type Role = Database["public"]["Enums"]["user_role"];
export const roleNames: Record<Role, string> = {
  operations: "Operations",
  logistics: "Logistics",
  admin: "Admin",
};
export const homeRoutes: Record<Role, string> = {
  operations: "/order",
  logistics: "/deliveries",
  admin: "/dashboard",
};
export const pages = [
  {
    path: "/inventory",
    label: "Inventory",
    icon: "supplies",
    roles: ["admin", "logistics"],
  },
  { path: "/costing", label: "Costing", icon: "supplies", roles: ["admin"] },
  {
    path: "/order",
    label: "New order",
    icon: "plus",
    roles: ["operations", "admin"],
  },
  {
    path: "/order/pay",
    label: "Payment",
    icon: "money",
    roles: ["operations", "admin"],
  },
  {
    path: "/orders",
    label: "Orders",
    icon: "orders",
    roles: ["operations", "admin"],
  },
  {
    path: "/money",
    label: "Money",
    icon: "money",
    roles: ["operations", "admin"],
  },
  {
    path: "/money/withdraw",
    label: "Take money out",
    icon: "money",
    roles: ["operations", "admin"],
  },
  {
    path: "/money/history",
    label: "Withdrawals",
    icon: "money",
    roles: ["operations", "admin"],
  },
  {
    path: "/money/expenses",
    label: "Expenses",
    icon: "money",
    roles: ["operations", "admin"],
  },
  {
    path: "/money/approvals",
    label: "Approvals",
    icon: "money",
    roles: ["admin"],
  },
  {
    path: "/money/tools",
    label: "Admin tools",
    icon: "money",
    roles: ["admin"],
  },
  {
    path: "/close",
    label: "Close day",
    icon: "close",
    roles: ["operations", "admin"],
  },
  {
    path: "/reports",
    label: "Reports",
    icon: "reports",
    roles: ["operations", "admin"],
  },
  {
    path: "/deliveries",
    label: "Deliveries",
    icon: "deliveries",
    roles: ["logistics", "admin"],
  },
  {
    path: "/purchases",
    label: "Purchases",
    icon: "supplies",
    roles: ["logistics", "admin"],
  },
  {
    path: "/purchases/new",
    label: "Log supplies",
    icon: "supplies",
    roles: ["logistics", "admin"],
  },
  {
    path: "/advances",
    label: "My advances",
    icon: "money",
    roles: ["logistics", "admin"],
  },
  {
    path: "/debts",
    label: "Debts",
    icon: "money",
    roles: ["operations", "admin"],
  },
  { path: "/setup", label: "Go-live setup", icon: "money", roles: ["admin"] },
  { path: "/dashboard", label: "Dashboard", icon: "reports", roles: ["admin"] },
  { path: "/staff", label: "Staff", icon: "staff", roles: ["admin"] },
  {
    path: "/menu",
    label: "Menu",
    icon: "supplies",
    roles: ["operations", "admin"],
  },
] as const;

const navPaths: Record<Role, readonly string[]> = {
  operations: ["/order", "/orders", "/money", "/close", "/reports"],
  logistics: ["/deliveries", "/purchases/new", "/advances"],
  admin: ["/dashboard", "/order", "/orders", "/money", "/staff"],
};
export function navigationFor(role: Role) {
  return navPaths[role].map(
    (path) => pages.find((page) => page.path === path)!,
  );
}
export function canVisit(role: Role, path: string): boolean {
  const page = pages.find((page) => page.path === path);
  return page ? (page.roles as readonly string[]).includes(role) : false;
}
export function sessionIsExpired(expiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || now >= expiry;
}

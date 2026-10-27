import { BrandLogo } from "./BrandLogo";
import { homeRoutes } from "@/features/auth/permissions";
import { useFinancialDay } from "@/features/close/financial-day";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  Clock,
  Plus,
  ReceiptText,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "@/features/auth/auth-context";
import {
  pages,
  canVisit,
  navigationFor,
  roleNames,
} from "@/features/auth/permissions";
import { cn } from "@/lib/utils";

const icons = {
  plus: Plus,
  orders: ClipboardList,
  money: Wallet,
  close: Clock,
  reports: BarChart3,
  deliveries: Truck,
  supplies: ReceiptText,
  staff: Users,
};
export function AppShell() {
  const financial = useFinancialDay();
  const path = useLocation().pathname;
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const checkout = path === "/order/pay" && canVisit(profile.role, path);
  const navigation = navigationFor(profile.role);
  return (
    <div
      className={cn(
        "min-h-svh",
        profile.role === "admin" &&
          !checkout &&
          "admin-workspace lg:pl-[248px]",
        !checkout && "pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-0",
      )}
    >
      {profile.role === "admin" && !checkout ? (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r bg-card lg:flex">
          <div className="border-b px-6 py-6">
            <NavLink to="/dashboard" aria-label="SFx Burger dashboard">
              <BrandLogo decorative className="w-40" />
            </NavLink>
            <p className="mt-3 text-xs uppercase tracking-widest text-muted">
              Business workspace
            </p>
          </div>
          <nav
            aria-label="Admin workspace"
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {[
              {
                label: "Overview",
                paths: [
                  "/dashboard",
                  "/order",
                  "/orders",
                  "/reports",
                  "/close",
                ],
              },
              {
                label: "Business",
                paths: [
                  "/money",
                  "/debts",
                  "/purchases",
                  "/inventory",
                  "/deliveries",
                  "/advances",
                ],
              },
              {
                label: "Manage",
                paths: ["/menu", "/costing", "/staff", "/setup"],
              },
            ].map((group) => (
              <div className="mb-6" key={group.label}>
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
                  {group.label}
                </p>
                {group.paths.map((route) => {
                  const page = pages.find((p) => p.path === route);
                  if (!page || !canVisit(profile.role, route)) return null;
                  const Icon = icons[page.icon];
                  return (
                    <NavLink
                      key={route}
                      to={route}
                      className={({ isActive }) =>
                        cn(
                          "mb-1 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold",
                          isActive
                            ? "bg-brand-soft text-brand-deep"
                            : "text-ink-2 hover:bg-ground",
                        )
                      }
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      {page.label}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="border-t px-6 py-4">
            <p className="font-semibold">{profile.full_name}</p>
            <p className="text-xs text-muted">Administrator · SFx Burger</p>
          </div>
        </aside>
      ) : null}
      {!checkout ? (
        <header
          className={cn(
            "border-b bg-card",
            profile.role === "admin"
              ? "border-t-4 border-t-brand lg:border-t-0"
              : "border-t-4 border-t-brand",
          )}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <NavLink
                to={homeRoutes[profile.role]}
                aria-label="SFx Burger home"
                className={cn(
                  "flex min-h-11 shrink-0 items-center justify-center rounded-lg",
                  profile.role === "admin" && "lg:hidden",
                )}
              >
                <BrandLogo
                  variant="mark"
                  decorative
                  className="w-11 sm:hidden"
                />
                <BrandLogo decorative className="hidden w-[220px] sm:block" />
              </NavLink>
              <div
                className={cn(
                  "min-w-0 sm:border-l sm:pl-4",
                  profile.role === "admin" && "lg:border-l-0 lg:pl-0",
                )}
              >
                <p className="truncate font-heading text-lg font-bold sm:text-xl">
                  {profile.role === "admin"
                    ? (pages.find((p) => p.path === path)?.label ??
                      "SFx Burger OMS")
                    : "SFx Burger OMS"}
                </p>
                <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
                  <span className="truncate">{profile.full_name}</span>
                  <span className="shrink-0">· {roleNames[profile.role]}</span>
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="secondary"
              className="shrink-0 px-3 text-sm"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
          </div>
          {profile.role === "admin" || canVisit(profile.role, "/menu") ? (
            <details
              className={cn(
                "mx-auto max-w-7xl px-4 pb-2 sm:px-6",
                profile.role === "admin" && "lg:hidden",
              )}
              key={path}
            >
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-strong">
                Workspace tools ▾
              </summary>
              <nav
                aria-label="Workspace tools"
                className="grid grid-cols-2 gap-2 pb-3"
              >
                {[
                  "/inventory",
                  "/purchases",
                  "/deliveries",
                  "/costing",
                  "/menu",
                  "/reports",
                  "/money/tools",
                  "/debts",
                  "/setup",
                ]
                  .filter((route) => canVisit(profile.role, route))
                  .map((route) => (
                    <NavLink
                      key={route}
                      className="flex min-h-11 items-center rounded-lg border bg-card px-3 text-sm font-semibold"
                      to={route}
                    >
                      {pages.find((p) => p.path === route)?.label}
                    </NavLink>
                  ))}
              </nav>
            </details>
          ) : null}
          <nav
            aria-label="Main"
            className={cn(
              "mx-auto hidden max-w-7xl flex-wrap gap-1 px-6 pb-3 sm:flex",
              profile.role === "admin" && "lg:hidden",
            )}
          >
            {navigation.map((page) => (
              <NavLink
                key={page.path}
                to={page.path}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center rounded-lg px-4 font-heading text-sm font-semibold",
                    isActive ||
                      (page.path === "/money" &&
                        ["/debts", "/setup"].includes(path))
                      ? "bg-brand-soft text-brand-deep"
                      : "text-ink-2 hover:bg-chip",
                  )
                }
              >
                {page.label}
              </NavLink>
            ))}
          </nav>
        </header>
      ) : null}
      <main
        className={
          checkout
            ? "mx-auto max-w-3xl"
            : "mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6"
        }
      >
        {financial.data?.closed ? (
          <div
            role="status"
            className="mb-4 rounded-xl bg-amber-soft p-4 text-sm text-amber-ink"
          >
            Business day {financial.data.business_date} is closed.{" "}
            {profile.role === "admin"
              ? "Your financial changes will be logged."
              : "Financial changes need Admin until the next 06:00 business day."}{" "}
            Delivery status updates can continue.
          </div>
        ) : financial.error ? (
          <div
            role="alert"
            className="mb-4 space-y-2 rounded-xl bg-amber-soft p-4 text-sm text-amber-ink"
          >
            <p className="break-words">{financial.error.message}</p>
            <Button
              variant="secondary"
              onClick={() => {
                void financial.refetch();
              }}
            >
              Retry day status
            </Button>
          </div>
        ) : null}
        <Outlet />
      </main>
      {!checkout ? (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {navigation.map((page) => {
            const Icon = icons[page.icon];
            return (
              <NavLink
                key={page.path}
                to={page.path}
                className={({ isActive }) =>
                  cn(
                    "flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-center text-xs",
                    isActive ||
                      (page.path === "/money" &&
                        ["/debts", "/setup"].includes(path))
                      ? "border-t-2 border-brand bg-brand-soft font-bold text-brand-deep"
                      : "font-medium text-muted",
                  )
                }
              >
                <Icon aria-hidden="true" className="h-[22px] w-[22px]" />
                <span>{page.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

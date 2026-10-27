import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-context";
import { LoginPage } from "@/features/auth/LoginPage";
import { RouteGuard } from "@/features/auth/RouteGuard";
import { homeRoutes, pages } from "@/features/auth/permissions";
const InventoryPage = lazy(() => import("@/features/inventory/InventoryPage"));
const StaffPage = lazy(() =>
  import("@/features/admin/StaffPage").then((module) => ({
    default: module.StaffPage,
  })),
);

const OrderLayout = lazy(() => import("@/features/orders/OrderLayout"));
const NewOrderPage = lazy(() => import("@/features/orders/NewOrderPage"));
const PaymentPage = lazy(() => import("@/features/orders/PaymentPage"));
const OrdersPage = lazy(() => import("@/features/orders/OrdersPage"));
const DeliveriesPage = lazy(
  () => import("@/features/logistics/DeliveriesPage"),
);
const LogisticsLayout = lazy(
  () => import("@/features/logistics/LogisticsLayout"),
);
const NewPurchasePage = lazy(
  () => import("@/features/logistics/NewPurchasePage"),
);
const AdvancesPage = lazy(() => import("@/features/logistics/AdvancesPage"));
const PurchasesPage = lazy(() => import("@/features/logistics/PurchasesPage"));
const MoneyLayout = lazy(() => import("@/features/money/MoneyLayout"));
const AccountsPage = lazy(() => import("@/features/money/AccountsPage"));
const WithdrawPage = lazy(() => import("@/features/money/WithdrawPage"));
const WithdrawalsPage = lazy(() => import("@/features/money/WithdrawalsPage"));
const AdminToolsPage = lazy(() => import("@/features/money/AdminToolsPage"));
const ExpensesPage = lazy(() => import("@/features/money/ExpensesPage"));
const DebtLayout = lazy(() => import("@/features/debts/DebtLayout"));
const DebtsPage = lazy(() => import("@/features/debts/DebtsPage"));
const SetupPage = lazy(() => import("@/features/debts/SetupPage"));
const ReportsPage = lazy(() => import("@/features/reports/ReportsPage"));
const ClosePage = lazy(() => import("@/features/close/ClosePage"));
const CostingPage = lazy(() => import("@/features/costing/CostingPage"));
const MenuPage = lazy(() => import("@/features/menu/MenuPage"));

function Home() {
  const { profile } = useAuth();
  return profile ? <Navigate to={homeRoutes[profile.role]} replace /> : null;
}
function Placeholder({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-[26px] font-extrabold sm:text-[34px]">{title}</h1>
      <Card>
        <CardContent className="p-4">
          <p className="text-ink-2">{title} is coming soon.</p>
        </CardContent>
      </Card>
    </section>
  );
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RouteGuard>
            <AppShell />
          </RouteGuard>
        }
      >
        <Route path="/" element={<Home />} />
        <Route
          path="/order"
          element={
            <RouteGuard path="/order">
              <Suspense fallback={<p role="status">Loading order…</p>}>
                <OrderLayout />
              </Suspense>
            </RouteGuard>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<p role="status">Loading menu…</p>}>
                <NewOrderPage />
              </Suspense>
            }
          />
          <Route
            path="pay"
            element={
              <RouteGuard path="/order/pay">
                <Suspense fallback={<p role="status">Loading payment…</p>}>
                  <PaymentPage />
                </Suspense>
              </RouteGuard>
            }
          />
        </Route>
        <Route
          path="/money"
          element={
            <RouteGuard path="/money">
              <Suspense fallback={<p role="status">Loading money…</p>}>
                <MoneyLayout />
              </Suspense>
            </RouteGuard>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<p role="status">Loading accounts…</p>}>
                <AccountsPage />
              </Suspense>
            }
          />
          <Route
            path="withdraw"
            element={
              <RouteGuard path="/money/withdraw">
                <Suspense fallback={<p role="status">Loading withdrawal…</p>}>
                  <WithdrawPage />
                </Suspense>
              </RouteGuard>
            }
          />
          <Route
            path="history"
            element={
              <RouteGuard path="/money/history">
                <Suspense fallback={<p role="status">Loading withdrawals…</p>}>
                  <WithdrawalsPage />
                </Suspense>
              </RouteGuard>
            }
          />
          <Route
            path="expenses"
            element={
              <RouteGuard path="/money/expenses">
                <Suspense fallback={<p role="status">Loading expenses…</p>}>
                  <ExpensesPage />
                </Suspense>
              </RouteGuard>
            }
          />
          <Route
            path="approvals"
            element={
              <RouteGuard path="/money/approvals">
                <Suspense fallback={<p role="status">Loading approvals…</p>}>
                  <WithdrawalsPage approvals />
                </Suspense>
              </RouteGuard>
            }
          />
          <Route
            path="tools"
            element={
              <RouteGuard path="/money/tools">
                <Suspense fallback={<p role="status">Loading tools…</p>}>
                  <AdminToolsPage />
                </Suspense>
              </RouteGuard>
            }
          />
        </Route>
        <Route
          element={
            <RouteGuard path="/purchases/new">
              <Suspense fallback={<p role="status">Loading Logistics…</p>}>
                <LogisticsLayout />
              </Suspense>
            </RouteGuard>
          }
        >
          <Route
            path="/deliveries"
            element={
              <Suspense fallback={<p role="status">Loading deliveries…</p>}>
                <DeliveriesPage />
              </Suspense>
            }
          />
          <Route
            path="/purchases/new"
            element={
              <Suspense fallback={<p role="status">Loading purchase…</p>}>
                <NewPurchasePage />
              </Suspense>
            }
          />
          <Route
            path="/purchases"
            element={
              <Suspense fallback={<p role="status">Loading purchases…</p>}>
                <PurchasesPage />
              </Suspense>
            }
          />
          <Route
            path="/advances"
            element={
              <Suspense fallback={<p role="status">Loading advances…</p>}>
                <AdvancesPage />
              </Suspense>
            }
          />
        </Route>
        <Route
          element={
            <RouteGuard path="/debts">
              <Suspense fallback={<p role="status">Loading debts…</p>}>
                <DebtLayout />
              </Suspense>
            </RouteGuard>
          }
        >
          <Route
            path="/debts"
            element={
              <Suspense fallback={<p role="status">Loading debts…</p>}>
                <DebtsPage />
              </Suspense>
            }
          />
          <Route
            path="/setup"
            element={
              <RouteGuard path="/setup">
                <Suspense fallback={<p role="status">Loading setup…</p>}>
                  <SetupPage />
                </Suspense>
              </RouteGuard>
            }
          />
        </Route>
        {pages
          .filter(
            (page) =>
              !page.path.startsWith("/money") &&
              !["/debts", "/setup"].includes(page.path) &&
              !page.path.startsWith("/purchases") &&
              !["/advances", "/deliveries"].includes(page.path) &&
              page.path !== "/order" &&
              page.path !== "/order/pay",
          )
          .map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                <RouteGuard path={page.path}>
                  {page.path === "/orders" ? (
                    <Suspense fallback={<p role="status">Loading orders…</p>}>
                      <OrdersPage />
                    </Suspense>
                  ) : ["/dashboard", "/reports"].includes(page.path) ? (
                    <Suspense fallback={<p role="status">Loading reports…</p>}>
                      <ReportsPage />
                    </Suspense>
                  ) : page.path === "/close" ? (
                    <Suspense fallback={<p role="status">Loading close…</p>}>
                      <ClosePage />
                    </Suspense>
                  ) : page.path === "/staff" ? (
                    <Suspense fallback={<p role="status">Loading staff…</p>}>
                      <StaffPage />
                    </Suspense>
                  ) : page.path === "/costing" ? (
                    <Suspense fallback={<p role="status">Loading costing…</p>}>
                      <CostingPage />
                    </Suspense>
                  ) : page.path === "/inventory" ? (
                    <Suspense
                      fallback={<p role="status">Loading inventory…</p>}
                    >
                      <InventoryPage />
                    </Suspense>
                  ) : page.path === "/menu" ? (
                    <Suspense fallback={<p role="status">Loading menu…</p>}>
                      <MenuPage />
                    </Suspense>
                  ) : (
                    <Placeholder title={page.label} />
                  )}
                </RouteGuard>
              }
            />
          ))}
        <Route
          path="*"
          element={
            <section>
              <h1 className="text-[26px] font-extrabold">Page not found</h1>
              <p className="mt-2 text-ink-2">
                Choose a page from your navigation.
              </p>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}

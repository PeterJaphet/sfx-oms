import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { LoginPage } from '@/features/auth/LoginPage'
import { RouteGuard } from '@/features/auth/RouteGuard'
import { homeRoutes, pages } from '@/features/auth/permissions'
import { StaffPage } from '@/features/admin/StaffPage'

const OrderLayout = lazy(() => import('@/features/orders/OrderLayout'))
const NewOrderPage = lazy(() => import('@/features/orders/NewOrderPage'))
const PaymentPage = lazy(() => import('@/features/orders/PaymentPage'))
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage'))
const DeliveriesPage = lazy(() => import('@/features/logistics/DeliveriesPage'))
const MoneyLayout = lazy(() => import('@/features/money/MoneyLayout'))
const AccountsPage = lazy(() => import('@/features/money/AccountsPage'))
const WithdrawPage = lazy(() => import('@/features/money/WithdrawPage'))
const WithdrawalsPage = lazy(() => import('@/features/money/WithdrawalsPage'))
const AdminToolsPage = lazy(() => import('@/features/money/AdminToolsPage'))
const ExpensesPage = lazy(() => import('@/features/money/ExpensesPage'))
const MenuPage = lazy(() => import('@/features/menu/MenuPage'))

function Home() {
  const { profile } = useAuth()
  return profile ? <Navigate to={homeRoutes[profile.role]} replace /> : null
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
  )
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
        {pages
          .filter(
            (page) =>
              !page.path.startsWith('/money') &&
              page.path !== '/order' &&
              page.path !== '/order/pay',
          )
          .map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                <RouteGuard path={page.path}>
                  {page.path === '/orders' ? (
                    <Suspense fallback={<p role="status">Loading orders…</p>}>
                      <OrdersPage />
                    </Suspense>
                  ) : page.path === '/deliveries' ? (
                    <Suspense
                      fallback={<p role="status">Loading deliveries…</p>}
                    >
                      <DeliveriesPage />
                    </Suspense>
                  ) : page.path === '/staff' ? (
                    <StaffPage />
                  ) : page.path === '/menu' ? (
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
  )
}

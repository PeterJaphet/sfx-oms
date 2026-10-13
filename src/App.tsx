import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { LoginPage } from '@/features/auth/LoginPage'
import { RouteGuard } from '@/features/auth/RouteGuard'
import { homeRoutes, pages } from '@/features/auth/permissions'
import { StaffPage } from '@/features/admin/StaffPage'

function Home() {
  const { profile } = useAuth()
  return profile ? <Navigate to={homeRoutes[profile.role]} replace /> : null
}
function Placeholder({ title }: { title: string }) {
  return <section className="flex flex-col gap-4"><h1 className="text-[26px] font-extrabold sm:text-[34px]">{title}</h1><Card><CardContent className="p-4"><p className="text-ink-2">{title} is coming soon.</p></CardContent></Card></section>
}
export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RouteGuard><AppShell /></RouteGuard>}>
      <Route path="/" element={<Home />} />
      {pages.map(page => <Route key={page.path} path={page.path} element={<RouteGuard path={page.path}>{page.path === '/staff' ? <StaffPage /> : <Placeholder title={page.label} />}</RouteGuard>} />)}
      <Route path="/money/withdraw" element={<Navigate to="/money" replace />} />
      <Route path="*" element={<section><h1 className="text-[26px] font-extrabold">Page not found</h1><p className="mt-2 text-ink-2">Choose a page from your navigation.</p></section>} />
    </Route>
  </Routes>
}

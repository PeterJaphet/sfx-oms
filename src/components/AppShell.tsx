import { useFinancialDay } from '@/features/close/financial-day'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, ClipboardList, Clock, Plus, ReceiptText, Truck, Users, Wallet } from 'lucide-react'
import { Button } from './ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { canVisit, navigationFor, roleNames } from '@/features/auth/permissions'
import { cn } from '@/lib/utils'

const icons = { plus: Plus, orders: ClipboardList, money: Wallet, close: Clock, reports: BarChart3, deliveries: Truck, supplies: ReceiptText, staff: Users }
export function AppShell() {
  const financial = useFinancialDay()
  const path = useLocation().pathname
  const { profile, signOut } = useAuth()
  if (!profile) return null
  const checkout = path === '/order/pay' && canVisit(profile.role, path)
  const navigation = navigationFor(profile.role)
  return <div className={cn('min-h-svh', !checkout && 'pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-0')}>
    {!checkout ? <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand font-heading font-extrabold text-card">SFx</span>
          <div className="min-w-0"><p className="truncate font-heading text-base font-extrabold sm:text-lg">SFx Burger OMS</p><p className="truncate text-xs text-muted">{profile.full_name} · {roleNames[profile.role]}</p></div>
        </div>
        <div className="flex shrink-0 gap-2">{profile.role === 'admin' ? <Button asChild variant="secondary" size="secondary" className="px-3 text-sm"><NavLink to="/deliveries">Deliveries</NavLink></Button> : null}{canVisit(profile.role, '/menu') ? <Button asChild variant="secondary" size="secondary" className="px-3 text-sm"><NavLink to="/menu">Menu</NavLink></Button> : null}<Button variant="secondary" size="secondary" className="shrink-0 px-3 text-sm" onClick={() => { void signOut() }}>Sign out</Button></div>
      </div>
      <nav aria-label="Main" className="mx-auto hidden max-w-7xl gap-1 px-6 pb-3 sm:flex">
        {navigation.map(page => <NavLink key={page.path} to={page.path} className={({ isActive }) => cn('flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold', (isActive || (page.path === '/money' && ['/debts','/setup'].includes(path))) ? 'bg-brand-soft text-brand-deep' : 'text-ink-2 hover:bg-chip')}>{page.label}</NavLink>)}
      </nav>
    </header> : null}
    <main className={checkout ? 'mx-auto max-w-3xl' : 'mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6'}>{financial.data?.closed?<div role="status" className="mb-4 rounded-xl bg-amber-soft p-4 text-sm text-amber-ink">Business day {financial.data.business_date} is closed. {profile.role==='admin'?'Your financial changes will be logged.':'Financial changes need Admin until the next 06:00 business day.'} Delivery status updates can continue.</div>:financial.error?<div role="alert" className="mb-4 space-y-2 rounded-xl bg-amber-soft p-4 text-sm text-amber-ink"><p className="break-words">{financial.error.message}</p><Button variant="secondary" onClick={()=>{void financial.refetch()}}>Retry day status</Button></div>:null}<Outlet /></main>
    {!checkout ? <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden">
      {navigation.map(page => {
        const Icon = icons[page.icon]
        return <NavLink key={page.path} to={page.path} className={({ isActive }) => cn('flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-center text-xs', (isActive || (page.path === '/money' && ['/debts','/setup'].includes(path))) ? 'font-bold text-brand-strong' : 'font-medium text-muted')}><Icon aria-hidden="true" className="h-[22px] w-[22px]" /><span>{page.label}</span></NavLink>
      })}
    </nav> : null}
  </div>
}

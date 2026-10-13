import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from './auth-context'
import { canVisit } from './permissions'

export function RouteGuard({ children, path }: { children: ReactNode; path?: string }) {
  const auth = useAuth()
  if (auth.loading || auth.signingIn) return <p role="status" className="p-6 text-muted">Loading your account…</p>
  if (!auth.session) return <Navigate to="/login" replace />
  if (auth.error) return <div role="alert" className="flex flex-col gap-3 p-6"><p>{auth.error.message}</p><Button onClick={auth.retry}>Try again</Button></div>
  if (!auth.profile) return <Navigate to="/login" replace />
  if (path && !canVisit(auth.profile.role, path)) return <section><h1 className="font-heading text-[26px] font-extrabold">Not available for your role</h1><p className="mt-2 text-ink-2">Choose a page from your navigation.</p></section>
  return children
}

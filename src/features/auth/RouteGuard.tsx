import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { useAuth } from './auth-context'
import { canVisit } from './permissions'

export function RouteGuard({ children, path }: { children: ReactNode; path?: string }) {
  const auth = useAuth()
  if (auth.loading || auth.signingIn) return <main className="mx-auto flex min-h-[60svh] max-w-sm flex-col items-center justify-center gap-5 p-6"><BrandLogo /><p role="status" className="text-muted">Loading your account…</p></main>
  if (!auth.session) return <Navigate to="/login" replace />
  if (auth.error) return <main className="mx-auto flex min-h-[60svh] max-w-sm flex-col items-center justify-center gap-5 p-6"><BrandLogo /><div role="alert" className="flex w-full flex-col gap-4 rounded-card border bg-card p-5"><p>{auth.error.message}</p><Button onClick={auth.retry}>Try again</Button></div></main>
  if (!auth.profile) return <Navigate to="/login" replace />
  if (path && !canVisit(auth.profile.role, path)) return <section><h1 className="font-heading text-[26px] font-extrabold">Not available for your role</h1><p className="mt-2 text-ink-2">Choose a page from your navigation.</p></section>
  return children
}

import { assertOnline } from '@/lib/connectivity'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { staffEmail } from '@/lib/phone'
import { AuthContext, type SessionProfile } from './auth-context'
import { sessionIsExpired } from './permissions'

class SessionRejected extends Error {}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase) { setBooting(false); return }
    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) toast.error(error.message)
      setSession(data.session)
      setBooting(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (event === 'SIGNED_OUT') queryClient.clear()
      if (event === 'TOKEN_REFRESHED') void queryClient.invalidateQueries({ queryKey: ['auth-profile'] })
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [queryClient])

  const profileQuery = useQuery<SessionProfile>({
    queryKey: ['auth-profile', session?.user.id],
    enabled: !!session && !signingIn && !booting,
    queryFn: async () => {
      if (!supabase) throw new Error('Sign-in is not configured yet')
      const { data, error } = await supabase.rpc('get_session_profile')
      if (error) {
        if (error.code === '42501') throw new SessionRejected(error.message)
        throw new Error(error.message)
      }
      if (!data?.[0]) throw new SessionRejected('Staff profile not found; ask Admin')
      return data[0]
    },
    retry: (count, error) => !(error instanceof SessionRejected) && count < 1,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  })

  const signOut = useCallback(async () => {
    setSession(null)
    queryClient.clear()
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) toast.error(error.message)
    }
  }, [queryClient])

  useEffect(() => {
    if (profileQuery.error instanceof SessionRejected && session) {
      toast.error(profileQuery.error.message)
      void signOut()
    }
  }, [profileQuery.error, session, signOut])

  const expiresAt = profileQuery.data?.expires_at
  useEffect(() => {
    if (!expiresAt || !session) return
    const checkExpiry = () => {
      if (sessionIsExpired(expiresAt)) {
        toast.error('Your 12-hour session has ended. Sign in again.')
        void signOut()
      }
    }
    const timer = window.setTimeout(checkExpiry, Math.max(0, Date.parse(expiresAt) - Date.now()))
    window.addEventListener('focus', checkExpiry)
    document.addEventListener('visibilitychange', checkExpiry)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', checkExpiry)
      document.removeEventListener('visibilitychange', checkExpiry)
    }
  }, [expiresAt, session, signOut])

  async function signIn(phone: string, pin: string) {
  assertOnline()
    if (!supabase) throw new Error('Sign-in is not configured yet')
    setSigningIn(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: staffEmail(phone), password: pin })
      if (error) throw new Error(error.message)
      const result = await supabase.rpc('record_login')
      if (result.error || !result.data?.[0]) {
        await signOut()
        throw new Error(result.error?.message ?? 'Staff profile not found; ask Admin')
      }
      queryClient.setQueryData(['auth-profile', data.user.id], result.data[0])
    } finally { setSigningIn(false) }
  }

  return <AuthContext.Provider value={{
    session, profile: session ? (profileQuery.data ?? null) : null,
    loading: booting || (!!session && !signingIn && profileQuery.isPending),
    signingIn, error: profileQuery.error, retry: () => { void profileQuery.refetch() }, signIn, signOut,
  }}>{children}</AuthContext.Provider>
}

import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '@/lib/db.types'

export type SessionProfile = Database['public']['Functions']['get_session_profile']['Returns'][number]
export type AuthState = {
  session: Session | null
  profile: SessionProfile | null
  loading: boolean
  signingIn: boolean
  error: Error | null
  retry: () => void
  signIn: (phone: string, pin: string) => Promise<void>
  signOut: () => Promise<void>
}
export const AuthContext = createContext<AuthState | null>(null)
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is missing')
  return auth
}

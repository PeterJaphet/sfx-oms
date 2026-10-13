import { createClient } from '@supabase/supabase-js'
import type { Database } from './db.types'
import { createGuardedFetch } from './connectivity'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

// M0's brand page can render before the project's local .env is configured.
// Callers must handle missing configuration before starting an auth or data request.
export const supabase = url && anonKey ? createClient<Database>(url, anonKey, { global: { fetch: createGuardedFetch() } }) : null

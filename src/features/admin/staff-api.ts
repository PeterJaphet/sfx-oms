import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/db.types'

export type Staff = Database['public']['Tables']['profiles']['Row']
export type StaffAction =
  | { name: string; phone: string; pin: string; role: Staff['role'] }
  | { action: 'role'; id: string; role: Staff['role'] }
  | { action: 'pin'; id: string; pin: string }
  | { action: 'deactivate'; id: string }

export async function saveStaff(values: StaffAction) {
  if (!supabase) throw new Error('Sign-in is not configured yet')
  const functionName = 'action' in values ? 'admin-manage-user' : 'admin-create-user'
  const { data, error } = await supabase.functions.invoke(functionName, { body: values })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = await error.context.json().catch(() => null) as { error?: string } | null
      if (response?.error) throw new Error(response.error)
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data
}

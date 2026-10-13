import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.89.0'
import { parseCreateStaff, parseManageStaff } from './validation.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
class HttpError extends Error { constructor(message: string, readonly status: number) { super(message) } }
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } })
}
function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new HttpError('Staff management is not configured', 500)
  return value
}
async function requireAdmin(request: Request) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) throw new HttpError('Sign in first', 401)
  const url = requiredEnv('SUPABASE_URL')
  const caller = createClient(url, requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await caller.auth.getUser(token)
  if (error || !data.user) throw new HttpError(error?.message ?? 'Sign in first', 401)
  const profile = await caller.rpc('get_session_profile')
  if (profile.error) throw new HttpError(profile.error.message, 403)
  if (profile.data?.[0]?.role !== 'admin') throw new HttpError('Not allowed for your role', 403)
  // Decode only after getUser has verified the token. Never trust body-supplied actor ids.
  const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  if (typeof claims.session_id !== 'string') throw new HttpError('Sign in again', 401)
  const service = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return { caller, service, actor: data.user.id, session: claims.session_id as string }
}

async function findAuthUser(service: SupabaseClient, email: string) {
  // Recovery for an Auth user created during a previously interrupted profile save.
  // Existing staff are never overwritten by this path.
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    const user = data.users.find(user => user.email === email)
    if (user) return user
    if (data.users.length < 1000) return null
  }
}

export async function handleStaff(request: Request, mode: 'create' | 'manage'): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return response({ error: 'Use POST' }, 405)
  try {
    const admin = await requireAdmin(request)
    const body = await request.json().catch(() => { throw new HttpError('Invalid staff request', 400) })
    if (mode === 'create') {
      const staff = parseCreateStaff(body)
      let user = await findAuthUser(admin.service, staff.email)
      if (user) {
        const existing = await admin.service.from('profiles').select('id').eq('id', user.id).maybeSingle()
        if (existing.error) throw new Error(existing.error.message)
        if (existing.data) throw new HttpError('A staff member already uses this phone number', 409)
        const reset = await admin.service.auth.admin.updateUserById(user.id, { password: staff.pin, user_metadata: { full_name: staff.name } })
        if (reset.error) throw new Error(reset.error.message)
      } else {
        const created = await admin.service.auth.admin.createUser({ email: staff.email, password: staff.pin, email_confirm: true, user_metadata: { full_name: staff.name } })
        if (created.error) throw new Error(created.error.message)
        user = created.data.user
      }
      if (!user) throw new Error('Auth user was not created')
      // Caller-scoped insert preserves the existing admin-only RLS and audit actor.
      const saved = await admin.caller.from('profiles').insert({ id: user.id, full_name: staff.name, phone: staff.phone, role: staff.role }).select().single()
      if (saved.error) throw new Error(saved.error.message)
      return response({ staff: saved.data }, 201)
    }

    const action = parseManageStaff(body)
    const target = await admin.caller.from('profiles').select('*').eq('id', action.id).single()
    if (target.error) throw new Error(target.error.message)
    if (action.action === 'role') {
      const saved = await admin.caller.from('profiles').update({ role: action.role }).eq('id', action.id).select().single()
      if (saved.error) throw new Error(saved.error.message)
      return response({ staff: saved.data })
    }
    if (action.action === 'pin') {
      const changed = await admin.service.auth.admin.updateUserById(action.id, { password: action.pin })
      if (changed.error) throw new Error(changed.error.message)
      const audit = await admin.service.rpc('audit_staff_pin_reset', { p_actor: admin.actor, p_session: admin.session, p_target: action.id })
      if (audit.error) throw new Error(audit.error.message)
      return response({ ok: true })
    }
    // Deny app access in the database first, even if Auth's ban call is interrupted.
    const saved = await admin.caller.from('profiles').update({ is_active: false }).eq('id', action.id).select().single()
    if (saved.error) throw new Error(saved.error.message)
    const banned = await admin.service.auth.admin.updateUserById(action.id, { ban_duration: '876000h' })
    if (banned.error) throw new Error(banned.error.message)
    return response({ staff: saved.data })
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Staff request failed' }, error instanceof HttpError ? error.status : 400)
  }
}

import { handleStaff } from './staff-handler.ts'

const adminId = '00000000-0000-0000-0000-00000000000a'
const targetId = '00000000-0000-0000-0000-00000000000b'
const jwt = `${btoa('{}')}.${btoa(JSON.stringify({ sub: adminId, session_id: adminId }))}.test`
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }) }

async function fixture(run: (calls: { path: string; body: Record<string, unknown> | null }[]) => Promise<void>, options: { role?: string; expired?: boolean; invalid?: boolean; auditFails?: boolean } = {}) {
  const originalFetch = globalThis.fetch
  const names = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']
  const originals = names.map(name => Deno.env.get(name))
  Deno.env.set(names[0], 'http://127.0.0.1:54400')
  Deno.env.set(names[1], 'fake-public-test-value')
  Deno.env.set(names[2], 'fake-server-test-value')
  const calls: { path: string; body: Record<string, unknown> | null }[] = []
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const path = url.pathname
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    calls.push({ path, body })
    if (path === '/auth/v1/user') return Promise.resolve(options.invalid ? json({ msg: 'Invalid JWT' }, 401) : json({ id: adminId, email: 'admin@staff.sfxburger.app' }))
    if (path === '/rest/v1/rpc/get_session_profile') return Promise.resolve(options.expired ? json({ code: '42501', message: 'Session expired or staff account inactive; sign in again' },403) : json([{ id: adminId, role: options.role ?? 'admin' }]))
    if (path === '/auth/v1/admin/users' && (!init?.method || init.method === 'GET')) return Promise.resolve(json({ users: [] }))
    if (path === '/auth/v1/admin/users') return Promise.resolve(json({ id: targetId, email: body.email }))
    if (path === '/auth/v1/admin/users/' + targetId) return Promise.resolve(json({ id: targetId }))
    if (path === '/rest/v1/profiles') return Promise.resolve(json({ id: targetId, full_name: 'Staff', role: 'operations', is_active: true }))
    if (path === '/rest/v1/rpc/audit_staff_pin_reset') return Promise.resolve(options.auditFails ? json({ code: '42501', message: 'Audit refused' },403) : json(null))
    return Promise.reject(new Error('Unexpected test request: '+path))
  }
  try { await run(calls) } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => { if (originals[index] === undefined) Deno.env.delete(name); else Deno.env.set(name, originals[index]!) })
  }
}
function request(body: unknown, token = jwt) {
  return new Request('http://example.test', { method: 'POST', headers: { Authorization: 'Bearer '+token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

Deno.test('anonymous caller is rejected before clients or privileged calls', async () => {
  const result = await handleStaff(new Request('http://example.test', { method: 'POST' }), 'create')
  assert(result.status === 401, 'anonymous request accepted')
})
Deno.test('invalid user token never reaches admin APIs', async () => {
  await fixture(async calls => {
    const result = await handleStaff(request({}), 'create')
    assert(result.status === 401, 'invalid token accepted')
    assert(!calls.some(call => call.path.includes('/admin/')), 'privileged call before verification')
  }, { invalid: true })
})
Deno.test('non-admin and expired callers cannot reach privileged Auth APIs', async () => {
  for (const options of [{ role: 'operations' }, { role: 'logistics' }, { expired: true }]) {
    await fixture(async calls => {
      const result = await handleStaff(request({}), 'create')
      assert(result.status === 403, 'non-admin or expired session accepted')
      assert(!calls.some(call => call.path.includes('/admin/')), 'privileged call before authorization')
    }, options)
  }
})
Deno.test('verified Admin creates Auth user and caller-scoped profile without forwarding PIN', async () => {
  await fixture(async calls => {
    const result = await handleStaff(request({ name: 'Staff', phone: '+905000000000', pin: '123456', role: 'operations', actor: targetId }), 'create')
    assert(result.status === 201, 'creation failed: '+await result.text())
    const profile = calls.find(call => call.path === '/rest/v1/profiles')?.body
    assert(profile?.id === targetId, 'wrong profile id')
    assert(!('pin' in profile) && !('password' in profile) && !('actor' in profile), 'sensitive/untrusted fields forwarded')
  })
})
Deno.test('PIN-reset audit uses the verified actor and contains no PIN', async () => {
  await fixture(async calls => {
    const result = await handleStaff(request({ action: 'pin', id: targetId, pin: '123456', actor: targetId }), 'manage')
    assert(result.status === 200, 'PIN reset failed')
    const audit = calls.find(call => call.path.endsWith('/audit_staff_pin_reset'))?.body
    assert(audit?.p_actor === adminId && audit.p_session === adminId, 'audit trusts body-supplied actor')
    assert(!('pin' in audit) && !('password' in audit), 'PIN leaked into audit')
  })
})
Deno.test('audit failure is surfaced instead of silently reporting successful PIN reset', async () => {
  await fixture(async () => {
    const result = await handleStaff(request({ action: 'pin', id: targetId, pin: '123456' }), 'manage')
    assert(result.status !== 200, 'audit error silently ignored')
    const body = await result.json()
    assert(body.error === 'Audit refused', 'database message replaced')
  }, { auditFails: true })
})

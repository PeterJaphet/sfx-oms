import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MutationObserver,
  QueryClient,
  onlineManager,
} from '@tanstack/react-query'
import {
  assertOnline,
  checkConnection,
  createGuardedFetch,
  getActiveWrites,
  isOnline,
  isWriteRequest,
  OfflineError,
} from './connectivity'
import { hasPendingConfirmation, updateBlockedReason } from './pwa-safety'
const base = 'https://example.supabase.co'
function storage(records: Record<string, string>) {
  const keys = Object.keys(records)
  return {
    length: keys.length,
    key: (i: number) => keys[i],
    getItem: (key: string) => records[key] ?? null,
  }
}
afterEach(async () => {
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('fetch', async () => new Response('{}'))
  await checkConnection(base, 'public-anon')
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
})
describe('connectivity at the Supabase request boundary', () => {
  it('blocks RPCs, direct updates, Edge Functions and uploads before dispatch when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const network = vi.fn<typeof fetch>()
    const guarded = createGuardedFetch(network)
    for (const [path, method] of [
      ['/rest/v1/rpc/create_order', 'POST'],
      ['/rest/v1/product_categories', 'PATCH'],
      ['/functions/v1/admin-create-user', 'POST'],
      ['/storage/v1/object/receipts/example.jpg', 'POST'],
    ]) {
      const r = await guarded(base + path, { method })
      expect(r.status).toBe(503)
      expect((await r.json()).code).toBe('SFX_OFFLINE')
    }
    expect(network).not.toHaveBeenCalled()
    expect(() => assertOnline()).toThrow(OfflineError)
    expect(getActiveWrites()).toBe(0)
  })
  it('passes the original online request and response through unchanged', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const response = new Response(
      JSON.stringify({ code: 'P0001', message: 'Not enough money' }),
      { status: 400 },
    )
    const network = vi.fn(async () => response)
    const input = new Request(base + '/rest/v1/rpc/create_order', {
      method: 'POST',
      body: '{"original":true}',
    })
    expect(await createGuardedFetch(network)(input)).toBe(response)
    expect(network).toHaveBeenCalledExactlyOnceWith(input, undefined)
    expect(isOnline()).toBe(true)
    expect(getActiveWrites()).toBe(0)
  })
  it('counts in-flight writes so updates cannot reload their tab', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    let finish!: (value: Response) => void
    const pending = createGuardedFetch(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )(`${base}/rest/v1/rpc/run_money_action`, { method: 'POST' })
    expect(getActiveWrites()).toBe(1)
    expect(updateBlockedReason(true, getActiveWrites(), storage({}))).toContain(
      'saving',
    )
    finish(new Response('{}'))
    await pending
    expect(getActiveWrites()).toBe(0)
  })
  it('does not replay a request whose response was lost, and stops later writes until recovery', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const network = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))
    const guarded = createGuardedFetch(network)
    await expect(
      guarded(`${base}/rest/v1/rpc/create_order`, { method: 'POST' }),
    ).rejects.toThrow('Failed to fetch')
    expect(isOnline()).toBe(false)
    const blocked = await guarded(`${base}/rest/v1/rpc/create_order`, {
      method: 'POST',
    })
    expect(blocked.status).toBe(503)
    expect(network).toHaveBeenCalledTimes(1)
    const health = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', health)
    expect(await checkConnection(base, 'public-anon')).toBe(true)
    expect(isOnline()).toBe(true)
    expect(network).toHaveBeenCalledTimes(1)
    expect(health.mock.calls[0][0]).toBe(base + '/auth/v1/health')
  })
  it('does not probe while the browser is offline or unblock on a failed health check', async () => {
    const health = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', health)
    vi.stubGlobal('navigator', { onLine: false })
    expect(await checkConnection(base, 'public-anon')).toBe(false)
    expect(health).not.toHaveBeenCalled()
    vi.stubGlobal('navigator', { onLine: true })
    await expect(
      createGuardedFetch(async () => {
        throw new TypeError('No internet')
      })(base + '/rest/v1/accounts'),
    ).rejects.toThrow()
    expect(await checkConnection(base, 'public-anon')).toBe(false)
    expect(isOnline()).toBe(false)
  })
  it('does not mistake an intentional abort for a disconnected browser', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const aborted = Object.assign(new Error('Cancelled'), {
      name: 'AbortError',
    })
    await expect(
      createGuardedFetch(async () => {
        throw aborted
      })(base + '/rest/v1/accounts'),
    ).rejects.toThrow('Cancelled')
    expect(isOnline()).toBe(true)
  })
  it('treats new RPC names as writes, while known report/quote RPCs are reads', () => {
    for (const name of [
      'create_order',
      'run_close',
      'run_debt_action',
      'future_money_action',
    ])
      expect(
        isWriteRequest(base + '/rest/v1/rpc/' + name, { method: 'POST' }),
      ).toBe(true)
    for (const name of [
      'quote_order',
      'get_report',
      'get_dashboard',
      'get_session_profile',
    ])
      expect(
        isWriteRequest(base + '/rest/v1/rpc/' + name, { method: 'POST' }),
      ).toBe(false)
    expect(isWriteRequest(base + '/rest/v1/accounts')).toBe(false)
  })
  it('fails an offline mutation immediately instead of queueing it to save after reconnect', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    onlineManager.setOnline(false)
    const query = new QueryClient({
      defaultOptions: { mutations: { networkMode: 'always', retry: false } },
    })
    const write = vi.fn(async () => {
      assertOnline()
    })
    const observer = new MutationObserver(query, { mutationFn: write })
    await expect(observer.mutate()).rejects.toThrow(OfflineError)
    expect(observer.getCurrentResult().isPaused).toBe(false)
    onlineManager.setOnline(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(write).toHaveBeenCalledTimes(1)
    query.clear()
  })
})
describe('update protection for persisted confirmations', () => {
  it.each(['money', 'payment', 'debt', 'logistics', 'close'])(
    'keeps an uncertain %s request until it is confirmed',
    (area) => {
      const s = storage({
        [`sfx-${area}-v1:user`]: '{"request_id":"same-request"}',
      })
      expect(hasPendingConfirmation(s)).toBe(true)
      expect(updateBlockedReason(true, 0, s)).toContain('Retry')
    },
  )
  it('preserves an uncertain order, but permits an update with a saved draft only', () => {
    expect(
      hasPendingConfirmation(
        storage({ 'sfx-order-v1:user': '{"attempt":{"payload":{}}}' }),
      ),
    ).toBe(true)
    expect(
      updateBlockedReason(
        true,
        0,
        storage({
          'sfx-order-v1:user': '{"attempt":null,"draft":{"items":[1]}}',
        }),
      ),
    ).toBeNull()
  })
  it('refuses reload if browser recovery records cannot be read', () => {
    expect(
      updateBlockedReason(
        true,
        0,
        storage({ 'sfx-order-v1:user': 'invalid json' }),
      ),
    ).toContain('storage')
    expect(
      updateBlockedReason(true, 0, {
        length: 1,
        key: () => {
          throw new Error('Blocked')
        },
        getItem: () => null,
      }),
    ).toContain('storage')
  })
  it('does not treat installation preferences or cleared requests as pending writes', () => {
    expect(
      hasPendingConfirmation(
        storage({ 'sfx-install-dismissed-v1': 'yes', 'sfx-money-v1:user': '' }),
      ),
    ).toBe(false)
    expect(updateBlockedReason(false, 0, storage({}))).toContain('Reconnect')
  })
})

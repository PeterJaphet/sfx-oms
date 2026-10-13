import { isOnline, offlineMessage } from '@/lib/connectivity'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { OrderContext } from './order-context'
import { emptyDraft, savePayload, workspaceSchema, type Workspace } from './order-model'
import { createOrder, SaveError } from './order-api'

export function OrderProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const key = `sfx-order-v1:${userId}`
  const [storageWarning, setStorageWarning] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    try { const stored = sessionStorage.getItem(key); if (stored) { const parsed = workspaceSchema.safeParse(JSON.parse(stored)); if (parsed.success) return parsed.data } } catch { /* Optional local draft storage may be blocked. */ }
    return { draft: emptyDraft(), attempt: null, savedId: null }
  })
  const state = useRef(workspace)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<Error | null>(null)
  const queries = useQueryClient()
  const store = useCallback((next: Workspace) => {
    state.current = next; setWorkspace(next)
    try { sessionStorage.setItem(key, JSON.stringify(next)) } catch { setStorageWarning(true) }
  }, [key])
  const submit = useCallback(async (attempt: NonNullable<Workspace['attempt']>) => {
    if (!isOnline()) { setError(new Error(offlineMessage)); toast.error(offlineMessage); return }
    if (savingRef.current) return
    savingRef.current = true; setSaving(true); setError(null)
    store({ ...state.current, attempt })
    try {
      const order = await createOrder(attempt.payload)
      store({ draft: emptyDraft(), attempt: null, savedId: order.id })
      await Promise.all(['orders', 'order-payments', 'balances', 'activity', 'reports'].map(key => queries.invalidateQueries({ queryKey: [key] })))
      for (const id of ['order-save-error', 'order-payment-error', 'order-quote-error']) toast.dismiss(id)
      toast.success(`Order #${String(order.daily_number).padStart(3, '0')} saved`)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e)); setError(err); toast.error(err.message, { id: 'order-save-error' })
      // A database exception confirms rollback. A missing response can mean the order saved.
      if (e instanceof SaveError && !e.uncertain) { store({ ...state.current, attempt: null }); void queries.invalidateQueries({ queryKey: ['order-quote'] }) }
    } finally { savingRef.current = false; setSaving(false) }
  }, [queries, store])
  return <OrderContext.Provider value={{ ...workspace, saving, error, storageWarning,
    update: change => { if (!state.current.attempt && !savingRef.current) { setError(null); store({ ...state.current, draft: change(state.current.draft), savedId: null }) } },
    clear: () => { if (!state.current.attempt && !savingRef.current) { setError(null); store({ draft: emptyDraft(), attempt: null, savedId: null }) } },
    save: (token, unpaid) => submit(state.current.attempt ?? { payload: savePayload(state.current.draft, token, unpaid), unpaid }),
    retrySave: () => state.current.attempt ? submit(state.current.attempt) : Promise.resolve(),
  }}>{children}</OrderContext.Provider>
}

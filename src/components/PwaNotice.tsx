import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { useOnline, useActiveWrites } from '@/lib/use-online'
import { isOnline, getActiveWrites } from '@/lib/connectivity'
import { updateBlockedReason } from '@/lib/pwa-safety'
import { countAppTabs } from '@/lib/pwa-tabs'
export function PwaNotice() {
  const online = useOnline()
  const writes = useActiveWrites()
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>()
  const requestedReload = useRef(false)
  const [controlledUpdate, setControlledUpdate] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh: () => {
      setDismissed(false)
      setControlledUpdate(false)
    },
    onNeedReload: () => {
      setControlledUpdate(true)
      setDismissed(false)
    },
    onRegisteredSW: (_url, value) => setRegistration(value),
    onRegisterError: () =>
      toast.error(
        'App installation could not be prepared. Reopen the app when connected.',
      ),
  })
  useEffect(() => {
    if (!registration) return
    const check = () => {
      if (isOnline()) void registration.update().catch(() => {})
    }
    const timer = window.setInterval(check, 60 * 60 * 1000)
    window.addEventListener('online', check)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', check)
      window.removeEventListener('focus', check)
    }
  }, [registration])
  useEffect(() => {
    if (!controlledUpdate || !requestedReload.current) return
    requestedReload.current = false
    let reason: string | null
    try {
      reason = updateBlockedReason(
        isOnline(),
        getActiveWrites(),
        sessionStorage,
      )
    } catch {
      reason = 'Finish your work before updating this tab.'
    }
    if (reason) toast.error(reason)
    else window.location.reload()
  }, [controlledUpdate])
  if ((!needRefresh && !controlledUpdate) || dismissed) return null
  return (
    <section
      role="status"
      aria-label="App update"
      className="border-b bg-brand-soft px-4 py-3 text-brand-deep"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">An app update is ready</p>
          <p className="text-sm">
            Finish or cancel your open forms before updating. Updating reloads
            this tab; unsaved form entries will be cleared.
          </p>
        </div>
        <Button
          requiresOnline
          size="secondary"
          className="text-sm"
          disabled={!online || writes > 0 || updating}
          onClick={async () => {
            let reason: string | null
            try {
              reason = updateBlockedReason(
                isOnline(),
                getActiveWrites(),
                sessionStorage,
              )
            } catch {
              reason =
                'Browser storage cannot be checked. Finish your work before updating.'
            }
            if (reason) {
              toast.error(reason)
              return
            }
            setUpdating(true)
            try {
              if (!registration?.active)
                throw new Error(
                  'The app update is not ready. Reopen this tab when connected.',
                )
              if ((await countAppTabs(registration.active)) > 1)
                throw new Error(
                  'Finish your work and close other SFx Burger tabs before updating this tab.',
                )
              const blocked = updateBlockedReason(
                isOnline(),
                getActiveWrites(),
                sessionStorage,
              )
              if (blocked) throw new Error(blocked)
              if (controlledUpdate) window.location.reload()
              else {
                requestedReload.current = true
                await updateServiceWorker(true)
              }
            } catch (e) {
              requestedReload.current = false
              toast.error((e as Error).message)
            } finally {
              setUpdating(false)
            }
          }}
        >
          {updating ? 'Updating…' : 'Update app'}
        </Button>
        <Button
          variant="secondary"
          size="secondary"
          className="text-sm"
          onClick={() => {
            setNeedRefresh(false)
            setDismissed(true)
          }}
        >
          Later
        </Button>
      </div>
    </section>
  )
}

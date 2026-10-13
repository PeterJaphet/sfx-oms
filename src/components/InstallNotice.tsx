import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Sheet } from './ui/sheet'
interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
export function InstallNotice() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [help, setHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('sfx-install-dismissed-v1') === 'yes'
    } catch {
      return false
    }
  })
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  )
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    const complete = () => {
      setInstalled(true)
      setPrompt(null)
      setHelp(false)
    }
    const display = window.matchMedia('(display-mode: standalone)')
    const changed = () =>
      setInstalled(
        display.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      )
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', complete)
    display.addEventListener('change', changed)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', complete)
      display.removeEventListener('change', changed)
    }
  }, [])
  if (installed || hidden || !window.isSecureContext) return null
  async function install() {
    if (!prompt) {
      setHelp(true)
      return
    }
    setBusy(true)
    try {
      await prompt.prompt()
      await prompt.userChoice
      setPrompt(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section aria-label="Install app" className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <img
            src="/icons/pwa-192.png"
            alt=""
            width="44"
            height="44"
            className="h-11 w-11 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">SFx Burger on your home screen</p>
            <p className="text-xs text-muted">
              Open your order and money app in one tap.
            </p>
          </div>
          <Button
            requiresOnline
            size="secondary"
            className="text-sm"
            disabled={busy}
            onClick={() => {
              void install()
            }}
          >
            {prompt ? 'Install app' : 'How to install'}
          </Button>
          <Button
            variant="secondary"
            size="secondary"
            className="text-sm"
            onClick={() => {
              setHidden(true)
              try {
                sessionStorage.setItem('sfx-install-dismissed-v1', 'yes')
              } catch {
                /* Dismiss for this visit. */
              }
            }}
          >
            Later
          </Button>
        </div>
      </section>
      <Sheet
        open={help}
        onOpenChange={setHelp}
        title="Install SFx Burger"
        description="Use the app from your phone’s home screen."
      >
        <ol className="space-y-4 text-sm">
          <li>
            <strong>iPhone:</strong> open this site in Safari, tap Share, then
            Add to Home Screen. If offered, keep Open as Web App enabled.
          </li>
          <li>
            <strong>Android:</strong> open this site in Chrome, tap the menu,
            then Install app or Add to Home screen.
          </li>
          <li>
            <strong>Computer:</strong> use your browser’s install icon or app
            menu when available.
          </li>
        </ol>
        <p className="mt-4 text-sm text-muted">
          Keep an internet connection for signing in and saving. Installing the
          app does not enable offline orders.
        </p>
      </Sheet>
    </>
  )
}

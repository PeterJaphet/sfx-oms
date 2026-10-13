import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { Button } from './ui/button'
import { checkConnection } from '@/lib/connectivity'
import { useOnline } from '@/lib/use-online'
export function ConnectionNotice({ compact = false }: { compact?: boolean }) {
  const online = useOnline()
  const [checking, setChecking] = useState(false)
  const queries = useQueryClient()
  useEffect(() => {
    if (online || compact) return
    const timer = window.setInterval(() => {
      void checkConnection(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    }, 10000)
    return () => window.clearInterval(timer)
  }, [online, compact])
  useEffect(() => {
    if (online && !compact) void queries.invalidateQueries()
  }, [online, compact, queries])
  if (online) return null
  return (
    <section
      role="alert"
      aria-label="Connection status"
      className={
        compact
          ? 'mb-4 rounded-xl bg-amber-soft p-3 text-amber-ink'
          : 'border-b border-line-strong bg-amber-soft px-4 py-3 text-amber-ink'
      }
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-3">
        <WifiOff aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {navigator.onLine === false
              ? 'You are offline'
              : 'Connection interrupted'}
          </p>
          <p className="text-sm">
            Saving and uploads are paused. Keep this tab open and reconnect
            before saving. Displayed figures may be out of date.
          </p>
        </div>
        <Button
          variant="secondary"
          size="secondary"
          className="text-sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true)
            try {
              await checkConnection(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
              )
            } finally {
              setChecking(false)
            }
          }}
        >
          {checking ? 'Checking…' : 'Check connection'}
        </Button>
      </div>
    </section>
  )
}

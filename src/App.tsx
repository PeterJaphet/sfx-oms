import { Navigate, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney, type Currency } from '@/lib/format'

const samples: { currency: Currency; name: string; amount: number; fraction: number }[] = [
  { currency: 'TRY', name: 'Turkish lira', amount: 1220, fraction: 1220.5 },
  { currency: 'USD', name: 'US dollars', amount: 85, fraction: 85.5 },
  { currency: 'NGN', name: 'Nigerian naira', amount: 15000, fraction: 15000.5 },
]

function ProjectSetup() {
  return (
    <div className="min-h-svh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand font-heading text-base font-extrabold text-card">SFx</span>
          <span className="font-heading text-lg font-extrabold">SFx Burger OMS</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Project setup</p>
          <h1 className="text-[26px] font-extrabold leading-tight sm:text-[34px]">Orders and money,<br />in one place.</h1>
          <p className="text-ink-2">The starting point for SFx Burger’s order and money app.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>SFx Burger</CardTitle>
            <CardDescription>Built for the team in Famagusta.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-ink-2">Order taking, deliveries and daily money records will come together here.</p>
            <Button asChild>
              <a href="#amounts">View amount display</a>
            </Button>
          </CardContent>
        </Card>

        <Card id="amounts" className="scroll-mt-4">
          <CardHeader>
            <CardTitle>Amount display</CardTitle>
            <CardDescription>Examples of the three account currencies.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-line">
              {samples.map(({ currency, name, amount, fraction }) => (
                <div key={currency} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <dt className="text-sm font-medium text-ink-2">{name}</dt>
                  <dd className="text-right tabular-nums">
                    <p className="text-xl font-bold">{formatMoney(amount, currency)}</p>
                    <p className="text-sm text-muted">{formatMoney(fraction, currency)}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <p className="rounded-lg bg-amber-soft px-4 py-3 text-sm text-amber-ink">Whole amounts stay simple. Fractions show two decimal places.</p>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectSetup />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

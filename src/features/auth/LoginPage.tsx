import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, FieldError } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { isStaffPhone } from '@/lib/phone'
import { useAuth } from './auth-context'
import { homeRoutes } from './permissions'

const schema = z.object({
  phone: z.string().refine(isStaffPhone, 'Enter a phone number with its country code'),
  pin: z.string().regex(/^\d{6}$/, 'Enter your six-digit PIN'),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const auth = useAuth()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { phone: '', pin: '' } })
  if (auth.profile && !auth.signingIn) return <Navigate to={homeRoutes[auth.profile.role]} replace />
  async function submit(values: Values) {
    try { await auth.signIn(values.phone, values.pin); form.reset() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Sign-in failed') }
  }
  return <main className="flex min-h-svh flex-col items-center justify-center px-4 py-8">
    <div className="mb-6 flex items-center gap-3">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand font-heading text-lg font-extrabold text-card">SFx</span>
      <span className="font-heading text-xl font-extrabold">SFx Burger OMS</span>
    </div>
    <Card className="w-full max-w-sm">
      <CardHeader><CardTitle className="text-[26px]">Sign in</CardTitle><p className="text-sm text-muted">Use your phone number and six-digit PIN.</p></CardHeader>
      <CardContent>
        {!supabase ? <p role="alert" className="mb-4 rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">Sign-in is not configured yet. Ask Admin to finish setup.</p> : null}
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div><label htmlFor="phone" className="mb-1.5 block text-sm font-semibold">Phone number</label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="username" placeholder="+90 5xx xxx xxxx" aria-invalid={!!form.formState.errors.phone} aria-describedby="phone-help phone-error" {...form.register('phone')} />
            <p id="phone-help" className="mt-1 text-xs text-muted">Include your country code.</p><FieldError id="phone-error" message={form.formState.errors.phone?.message} /></div>
          <div><label htmlFor="pin" className="mb-1.5 block text-sm font-semibold">PIN</label>
            <Input id="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} aria-invalid={!!form.formState.errors.pin} aria-describedby="pin-error" {...form.register('pin')} />
            <FieldError id="pin-error" message={form.formState.errors.pin?.message} /></div>
          <Button type="submit" disabled={!supabase || form.formState.isSubmitting || auth.loading}>{form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </CardContent>
    </Card>
    <p className="mt-4 text-xs text-muted">Your session lasts 12 hours.</p>
  </main>
}

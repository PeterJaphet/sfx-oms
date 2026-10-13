import { useFinancialDay } from '@/features/close/financial-day'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { FieldError, Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { useLogistics } from './logistics-context'
import { quoteChange } from './logistics-api'
import { changeSchema, type Advance } from './purchase-model'
export default function ReturnChange({
  advance,
  onClose,
}: {
  advance: Advance
  onClose: () => void
}) {
  const state = useLogistics()
  const financial = useFinancialDay()
  const ref = state.reference
  const accounts =
    ref.data?.accounts.filter(
      (a) => a.is_active && a.currency === advance.currency,
    ) ?? []
  const [error, setError] = useState<string>()
  const form = useForm<z.infer<typeof changeSchema>>({
    resolver: zodResolver(changeSchema),
    defaultValues: {
      advance_id: advance.id,
      account_id: String(
        accounts.find((a) => a.id === advance.account_id)?.id ??
          accounts[0]?.id ??
          '',
      ),
      amount: '',
    },
  })
  const parsed = changeSchema.safeParse(form.watch())
  const payload = parsed.success
    ? {
        advance_id: parsed.data.advance_id,
        account_id: Number(parsed.data.account_id),
        amount: parsed.data.amount,
      }
    : null
  const preview = useQuery({
    queryKey: ['logistics', 'change-quote', payload],
    enabled: !!payload && !state.pending && !state.busy,
    retry: false,
    refetchInterval: 15000,
    queryFn: () => quoteChange(payload!),
  })
  useEffect(() => {
    if (preview.error)
      toast.error(preview.error.message, { id: 'm6-change-error' })
    else if (preview.data) toast.dismiss('m6-change-error')
  }, [preview.error, preview.data])
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Return change"
      description={advance.purpose}
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (v) => {
          setError(undefined)
          if (!preview.data || preview.isFetching) {
            setError('Wait for the updated advance preview')
            return
          }
          try {
            await state.send('change', {
              advance_id: v.advance_id,
              account_id: Number(v.account_id),
              amount: v.amount,
              quote_token: preview.data.quote_token,
            })
            onClose()
          } catch (e) {
            setError((e as Error).message)
          }
        })}
      >
        <p className="text-sm text-muted">
          You hold {formatMoney(advance.remaining, advance.currency)}. Change
          must return to an account in {advance.currency}; the advance keeps its
          recorded rate.
        </p>
        {ref.error ? (
          <p role="alert" className="text-brand-strong">
            {ref.error.message}
          </p>
        ) : null}
        <fieldset
          disabled={financial.blocked || state.busy || !!state.pending}
          className="space-y-4"
        >
          <div>
            <label
              className="mb-2 block font-semibold"
              htmlFor="change-account"
            >
              Return to account
            </label>
            <select
              id="change-account"
              className="h-12 w-full rounded-lg border bg-card px-3"
              {...form.register('account_id')}
            >
              <option value="">Choose account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <FieldError
              id="change-account-error"
              message={form.formState.errors.account_id?.message}
            />
          </div>
          <div>
            <label className="mb-2 block font-semibold" htmlFor="change-amount">
              Amount ({advance.currency})
            </label>
            <Input
              id="change-amount"
              inputMode="decimal"
              {...form.register('amount')}
            />
            <FieldError
              id="change-amount-error"
              message={form.formState.errors.amount?.message}
            />
          </div>
        </fieldset>
        {preview.isFetching && payload ? (
          <p role="status">Checking change…</p>
        ) : preview.data ? (
          <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
            Left in advance after returning:{' '}
            {formatMoney(preview.data.remaining_after, preview.data.currency)}
          </p>
        ) : null}
        {preview.error ? (
          <p role="alert" className="break-words text-brand-strong">
            {preview.error.message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="break-words text-brand-strong">
            {error}
          </p>
        ) : null}
        {state.pending ? (
          <p role="alert" className="text-sm text-amber-ink">
            Confirmation pending. Close this sheet and use Retry Logistics
            confirmation.
          </p>
        ) : null}
        <Button requiresOnline
          className="w-full"
          type="submit"
          disabled={
            financial.blocked ||
            state.busy ||
            !!state.pending ||
            !preview.data ||
            preview.isFetching ||
            !!preview.error ||
            !!ref.error
          }
        >
          {state.busy ? 'Returning…' : 'Confirm return'}
        </Button>
      </form>
    </Sheet>
  )
}

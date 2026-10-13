import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, FieldError } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { useDebt } from './debt-context'
import { quoteOpening } from './debt-api'
import { openingSchema, type SetupAccount } from './debt-model'
export default function OpeningForm({
  account,
  onSaved,
}: {
  account: SetupAccount
  onSaved: () => void
}) {
  const state = useDebt()
  const [error, setError] = useState<string>()
  const form = useForm<z.infer<typeof openingSchema>>({
    resolver: zodResolver(openingSchema),
    defaultValues: {
      amount: '',
      reason: 'Opening balance at go-live',
      rate: '',
    },
  })
  const valid = openingSchema.safeParse(form.watch())
  const payload = valid.success
    ? {
        account_id: account.id,
        amount: valid.data.amount,
        reason: valid.data.reason,
        ...(valid.data.rate ? { rate: valid.data.rate } : {}),
      }
    : null
  const quote = useQuery({
    queryKey: ['debts', 'opening-quote', payload],
    enabled: !!payload && !state.pending && !state.busy,
    retry: false,
    refetchInterval: 15000,
    queryFn: () => quoteOpening(payload!),
  })
  useEffect(() => {
    if (quote.error)
      toast.error(quote.error.message, { id: 'm7-opening-preview' })
    else if (quote.data) toast.dismiss('m7-opening-preview')
  }, [quote.error, quote.data])
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(undefined)
        if (!quote.data || quote.isFetching) {
          setError('Wait for the updated opening preview')
          return
        }
        try {
          await state.send('opening', {
            account_id: account.id,
            amount: v.amount,
            reason: v.reason,
            ...(quote.data.rate_to_try !== null
              ? { rate: String(quote.data.rate_to_try) }
              : {}),
            quote_token: quote.data.quote_token,
          })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      <p className="text-sm text-muted">
        Each account takes one opening. Zero marks setup complete without a
        ledger entry. Later corrections use Admin adjustments.
      </p>
      <fieldset disabled={state.busy || !!state.pending} className="space-y-4">
        {(
          [
            ['amount', `Opening amount (${account.currency})`],
            ['reason', 'Reason'],
          ] as const
        ).map(([name, label]) => (
          <div key={name}>
            <label
              className="mb-2 block font-semibold"
              htmlFor={`opening-${name}`}
            >
              {label}
            </label>
            <Input
              id={`opening-${name}`}
              inputMode={name === 'amount' ? 'decimal' : 'text'}
              {...form.register(name)}
            />
            <FieldError
              id={`opening-${name}-error`}
              message={form.formState.errors[name]?.message}
            />
          </div>
        ))}
        {account.currency !== 'TRY' ? (
          <div>
            <label className="mb-2 block font-semibold" htmlFor="opening-rate">
              Rate to lira (optional)
            </label>
            <Input
              id="opening-rate"
              inputMode="decimal"
              placeholder="Latest Admin default"
              {...form.register('rate')}
            />
            <FieldError
              id="opening-rate-error"
              message={form.formState.errors.rate?.message}
            />
          </div>
        ) : null}
      </fieldset>
      {quote.data ? (
        <div className="space-y-2 rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
          <p>
            Existing ledger balance:{' '}
            {formatMoney(quote.data.balance_before, account.currency)}
          </p>
          <p>
            After opening:{' '}
            <strong>
              {formatMoney(quote.data.balance_after, account.currency)}
            </strong>
          </p>
          <p>Opening TRY value: {formatMoney(quote.data.amount_try, 'TRY')}</p>
          {quote.data.balance_before !== 0 ? (
            <p>
              Existing entries are retained. The opening amount is added to this
              balance; review test adjustments and payments before go-live.
            </p>
          ) : null}
        </div>
      ) : null}
      {quote.error || error ? (
        <p role="alert" className="break-words text-brand-strong">
          {error ?? quote.error?.message}
        </p>
      ) : null}
      {state.pending ? (
        <p role="alert" className="text-sm text-amber-ink">
          Close this form and retry the pending opening confirmation.
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={
          state.busy ||
          !!state.pending ||
          !quote.data ||
          quote.isFetching ||
          !!quote.error
        }
      >
        {state.busy ? 'Saving…' : 'Save opening balance'}
      </Button>
    </form>
  )
}

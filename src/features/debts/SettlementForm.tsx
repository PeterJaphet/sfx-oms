import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, FieldError } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { formatRate } from '@/features/orders/order-model'
import { useDebt } from './debt-context'
import { quoteSettlement } from './debt-api'
import { settlementSchema, type Debt } from './debt-model'
export default function SettlementForm({
  debt,
  onSaved,
}: {
  debt: Debt
  onSaved: () => void
}) {
  const state = useDebt()
  const ref = state.reference
  const form = useForm<z.infer<typeof settlementSchema>>({
    resolver: zodResolver(settlementSchema),
    defaultValues: {
      account_id: String(
        ref.data?.accounts.find((a) => a.currency === debt.currency)?.id ??
          ref.data?.accounts[0]?.id ??
          '',
      ),
      amount: '',
      covers: '',
      note: '',
    },
  })
  const values = form.watch()
  const acct = ref.data?.accounts.find(
    (a) => String(a.id) === values.account_id,
  )
  const different = !!acct && acct.currency !== debt.currency
  const parsed = settlementSchema.safeParse(values)
  const payload = parsed.success
    ? {
        debt_id: debt.id,
        account_id: Number(parsed.data.account_id),
        amount: parsed.data.amount,
        ...(different && parsed.data.covers
          ? { covers: parsed.data.covers }
          : {}),
        note: parsed.data.note,
      }
    : null
  const quote = useQuery({
    queryKey: ['debts', 'settlement-quote', payload],
    enabled: !!payload && !state.pending && !state.busy,
    retry: false,
    refetchInterval: 15000,
    queryFn: () => quoteSettlement(payload!),
  })
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (quote.error)
      toast.error(quote.error.message, { id: 'm7-settlement-preview' })
    else if (quote.data) toast.dismiss('m7-settlement-preview')
  }, [quote.error, quote.data])
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async () => {
        setError(undefined)
        if (!quote.data || quote.isFetching || !payload) {
          setError('Wait for the updated settlement preview')
          return
        }
        try {
          await state.send('settle', {
            ...payload,
            quote_token: quote.data.quote_token,
          })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      <p className="text-sm text-muted">
        {debt.direction === 'we_owe'
          ? 'Pay what we owe'
          : 'Collect what is owed to us'}{' '}
        · {formatMoney(debt.outstanding, debt.currency)} outstanding. This moves
        money without changing profit.
      </p>
      {ref.error ? (
        <p role="alert" className="text-brand-strong">
          {ref.error.message}
        </p>
      ) : null}
      <fieldset disabled={state.busy || !!state.pending} className="space-y-4">
        <div>
          <label className="mb-2 block font-semibold" htmlFor="settle-account">
            Payment account
          </label>
          <select
            id="settle-account"
            className="h-12 w-full rounded-lg border bg-card px-3"
            {...form.register('account_id')}
          >
            {ref.data?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block font-semibold" htmlFor="settle-amount">
            Amount moved ({acct?.currency})
          </label>
          <Input
            id="settle-amount"
            inputMode="decimal"
            {...form.register('amount')}
          />
          <FieldError
            id="settle-amount-error"
            message={form.formState.errors.amount?.message}
          />
        </div>
        {different ? (
          <div>
            <label className="mb-2 block font-semibold" htmlFor="settle-covers">
              Debt cleared ({debt.currency})
            </label>
            <Input
              id="settle-covers"
              inputMode="decimal"
              {...form.register('covers')}
            />
            <FieldError
              id="settle-covers-error"
              message={form.formState.errors.covers?.message}
            />
          </div>
        ) : null}
        <div>
          <label className="mb-2 block font-semibold" htmlFor="settle-note">
            Note (optional)
          </label>
          <Input id="settle-note" {...form.register('note')} />
        </div>
      </fieldset>
      {quote.data ? (
        <div className="space-y-2 rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
          <p>
            Debt remaining after:{' '}
            {formatMoney(quote.data.outstanding_after, debt.currency)}
          </p>
          <p>
            Account balance after:{' '}
            {formatMoney(quote.data.balance_after, quote.data.currency)}
          </p>
          {quote.data.currency !== 'TRY' ? (
            <p>
              TRY value: {formatMoney(quote.data.amount_try, 'TRY')} · rate ₺
              {formatRate(quote.data.rate_to_try)}
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
          Close details and retry the pending debt confirmation.
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
          !!quote.error ||
          !!ref.error
        }
      >
        {state.busy
          ? 'Saving…'
          : debt.direction === 'we_owe'
            ? 'Pay debt'
            : 'Collect debt'}
      </Button>
    </form>
  )
}

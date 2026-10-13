import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, FieldError } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { formatRate } from '@/features/orders/order-model'
import { useDebt } from './debt-context'
import { quoteRecord } from './debt-api'
import { recordSchema, recordPayload, type RecordValues } from './debt-model'
export default function RecordDebtForm({
  opening = false,
  onSaved,
}: {
  opening?: boolean
  onSaved: () => void
}) {
  const state = useDebt()
  const ref = state.reference
  const [error, setError] = useState<string>()
  const form = useForm<RecordValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: {
      kind: 'manual',
      direction: 'we_owe',
      counterparty: '',
      description: '',
      currency: 'TRY',
      amount: '',
      due_date: '',
      account_id: '1',
      rate: '',
    },
  })
  const values = form.watch()
  const valid = recordSchema.safeParse(values)
  const payload = valid.success ? recordPayload(valid.data, opening) : null
  const preview = useQuery({
    queryKey: ['debts', 'record-quote', payload],
    enabled: !!payload && !state.pending && !state.busy,
    retry: false,
    refetchInterval: 15000,
    queryFn: () => quoteRecord(payload!),
  })
  const accounts =
    ref.data?.accounts.filter((a) => a.currency === values.currency) ?? []
  const rate = ref.data?.rates.find((r) => r.currency === values.currency)
  useEffect(() => {
    if (preview.error)
      toast.error(preview.error.message, { id: 'm7-record-preview' })
    else if (preview.data) toast.dismiss('m7-record-preview')
  }, [preview.error, preview.data])
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(undefined)
        if (!preview.data || preview.isFetching) {
          setError('Wait for the updated debt preview')
          return
        }
        try {
          await state.send('record', {
            ...recordPayload(v, opening),
            ...(!opening && v.kind === 'loan'
              ? { rate: String(preview.data.rate_to_try) }
              : {}),
            quote_token: preview.data.quote_token,
          })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      {ref.error ? (
        <p role="alert" className="text-brand-strong">
          {ref.error.message}
        </p>
      ) : null}
      <fieldset disabled={state.busy || !!state.pending} className="space-y-4">
        {!opening ? (
          <div>
            <label className="mb-2 block font-semibold" htmlFor="debt-kind">
              Record type
            </label>
            <select
              id="debt-kind"
              className="h-12 w-full rounded-lg border bg-card px-3"
              {...form.register('kind')}
            >
              <option value="manual">Debt / IOU (no money moves)</option>
              <option value="loan">Loan (money moves)</option>
            </select>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Opening debts move no money and do not count as revenue or expense.
          </p>
        )}
        <div>
          <label className="mb-2 block font-semibold" htmlFor="debt-direction">
            Direction
          </label>
          <select
            id="debt-direction"
            className="h-12 w-full rounded-lg border bg-card px-3"
            {...form.register('direction')}
          >
            <option value="we_owe">
              We owe
              {!opening && values.kind === 'loan'
                ? ' · money into the business'
                : ''}
            </option>
            <option value="owed_to_us">
              Owed to us
              {!opening && values.kind === 'loan' ? ' · money lent out' : ''}
            </option>
          </select>
        </div>
        {(
          [
            ['counterparty', 'Who'],
            ['description', 'What for'],
          ] as const
        ).map(([name, label]) => (
          <div key={name}>
            <label
              className="mb-2 block font-semibold"
              htmlFor={`debt-${name}`}
            >
              {label}
            </label>
            <Input id={`debt-${name}`} {...form.register(name)} />
            <FieldError
              id={`debt-${name}-error`}
              message={form.formState.errors[name]?.message}
            />
          </div>
        ))}
        <div>
          <label className="mb-2 block font-semibold" htmlFor="debt-currency">
            Currency
          </label>
          <select
            id="debt-currency"
            className="h-12 w-full rounded-lg border bg-card px-3"
            value={values.currency}
            onChange={(e) => {
              const cur = e.target.value as RecordValues['currency']
              form.setValue('currency', cur)
              form.setValue(
                'account_id',
                String(
                  ref.data?.accounts.find((a) => a.currency === cur)?.id ?? '',
                ),
              )
              form.setValue('rate', '')
            }}
          >
            <option value="TRY">TRY · ₺</option>
            <option value="USD">USD · $</option>
            <option value="NGN">NGN · ₦</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block font-semibold" htmlFor="debt-amount">
            Amount ({values.currency})
          </label>
          <Input
            id="debt-amount"
            inputMode="decimal"
            {...form.register('amount')}
          />
          <FieldError
            id="debt-amount-error"
            message={form.formState.errors.amount?.message}
          />
        </div>
        <div>
          <label className="mb-2 block font-semibold" htmlFor="debt-due">
            Due date (optional)
          </label>
          <Input id="debt-due" type="date" {...form.register('due_date')} />
          <FieldError
            id="debt-due-error"
            message={form.formState.errors.due_date?.message}
          />
        </div>
        {!opening && values.kind === 'loan' ? (
          <>
            <div>
              <label
                className="mb-2 block font-semibold"
                htmlFor="debt-account"
              >
                Money account
              </label>
              <select
                id="debt-account"
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
                id="debt-account-error"
                message={form.formState.errors.account_id?.message}
              />
            </div>
            {values.currency !== 'TRY' ? (
              <div>
                <label className="mb-2 block font-semibold" htmlFor="debt-rate">
                  Rate to lira
                </label>
                <Input
                  id="debt-rate"
                  inputMode="decimal"
                  placeholder="Latest Admin default"
                  {...form.register('rate')}
                />
                <FieldError
                  id="debt-rate-error"
                  message={form.formState.errors.rate?.message}
                />
                <p className="mt-2 text-xs text-muted">
                  Latest:{' '}
                  {rate
                    ? `₺${formatRate(rate.rate_to_try)} · ${rate.effective_date}`
                    : 'Not set'}
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </fieldset>
      {preview.data ? (
        <div className="space-y-2 rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
          <p>
            {opening ? 'Opening debt' : 'Debt'}:{' '}
            {formatMoney(preview.data.amount, preview.data.currency)} · TRY
            estimate{' '}
            {preview.data.amount_try === null
              ? 'rate not set'
              : formatMoney(preview.data.amount_try, 'TRY')}
          </p>
          <p>
            {preview.data.moves_money
              ? `Account balance after: ${formatMoney(preview.data.balance_after!, preview.data.currency)}`
              : 'No account money moves.'}
          </p>
        </div>
      ) : null}
      {preview.error || error ? (
        <p role="alert" className="break-words text-brand-strong">
          {error ?? preview.error?.message}
        </p>
      ) : null}
      {state.pending ? (
        <p role="alert" className="text-sm text-amber-ink">
          Close this form and retry the pending debt confirmation.
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={
          state.busy ||
          !!state.pending ||
          !preview.data ||
          preview.isFetching ||
          !!preview.error ||
          !!ref.error
        }
      >
        {state.busy ? 'Saving…' : opening ? 'Save opening debt' : 'Record debt'}
      </Button>
    </form>
  )
}

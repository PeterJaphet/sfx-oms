import { useFinancialDay } from '@/features/close/financial-day'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FieldError, Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/auth-context'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatRate } from '@/features/orders/order-model'
import { validatePhoto } from '@/features/menu/menu-photos'
import { quoteWithdrawal } from './money-api'
import { useMoney } from './money-context'
import {
  withdrawalPayload,
  withdrawalSchema,
  type WithdrawalValues,
  typeNames,
} from './money-model'
import { uploadReceipt } from './receipt-photos'

export default function WithdrawPage() {
  const { profile } = useAuth()
  const money = useMoney()
  const financial = useFinancialDay()
  const reference = money.reference
  const form = useForm<WithdrawalValues>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      kind: 'advance',
      account_id: '1',
      amount: '',
      purpose: '',
      category_id: '',
      recipient_id: '',
      rate: '',
    },
  })
  const values = form.watch()
  const parsed = withdrawalSchema.safeParse(values)
  const payload = parsed.success ? withdrawalPayload(parsed.data) : null
  const quote = useQuery({
    queryKey: ['money', 'withdrawal-quote', payload],
    enabled: !!payload && !money.pending,
    refetchInterval: 15000,
    retry: false,
    queryFn: () => quoteWithdrawal(payload!),
  })
  const [file, setFile] = useState<File>()
  const [receiptPath, setReceiptPath] = useState<string>()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const account = reference.data?.accounts.find(
    (a) => String(a.id) === values.account_id,
  )
  const balance = reference.data?.balances.find((a) => a.id === account?.id)
  const rate = reference.data?.rates.find(
    (r) => r.currency === account?.currency,
  )
  const locked = financial.blocked || money.busy || !!money.pending || uploading
  useEffect(() => {
    if (quote.error)
      toast.error(quote.error.message, { id: 'm5-preview-error' })
    else if (quote.data) toast.dismiss('m5-preview-error')
  }, [quote.error, quote.data])
  if (reference.isPending) return <p role="status">Loading withdrawal form…</p>
  if (reference.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-brand-strong">{reference.error.message}</p>
        <Button
          onClick={() => {
            void reference.refetch()
          }}
        >
          Retry
        </Button>
      </div>
    )
  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="text-2xl font-extrabold">Take money out</h2>
      {saved ? (
        <div role="status" className="rounded-xl bg-ok-soft p-4 text-ok">
          Withdrawal recorded. See its current status in Withdrawals; balances
          below are refreshed from the database.
        </div>
      ) : null}
      {money.pending ? (
        <div
          role="alert"
          className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink"
        >
          Confirmation is pending. Use Retry money confirmation above before
          submitting anything else.
        </div>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (submitted) => {
          setError(undefined)
          setSaved(false)
          if (!quote.data || quote.isFetching) {
            setError('Wait for the current balance preview')
            return
          }
          const confirmed = quote.data
          let path = receiptPath
          try {
            if (file && !path) {
              setUploading(true)
              path = await uploadReceipt(
                file,
                profile!.id,
                confirmed.business_date,
              )
              setReceiptPath(path)
            }
            await money.send('withdraw', {
              ...withdrawalPayload(submitted),
              rate: String(confirmed.rate_to_try),
              quote_token: confirmed.quote_token,
              ...(path ? { receipt_path: path } : {}),
            })
            setSaved(true)
            form.reset({ ...submitted, amount: '', purpose: '' })
            setFile(undefined)
            setReceiptPath(undefined)
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setUploading(false)
          }
        })}
      >
        <fieldset disabled={locked} className="space-y-4">
          <div
            className="grid grid-cols-2 rounded-xl bg-chip p-1"
            role="group"
            aria-label="Withdrawal type"
          >
            {(['advance', 'direct_expense'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={values.kind === kind}
                className={cn(
                  'min-h-11 rounded-lg px-2 text-sm font-semibold',
                  values.kind === kind ? 'bg-card' : 'text-muted',
                )}
                onClick={() => form.setValue('kind', kind)}
              >
                {typeNames[kind]}
              </button>
            ))}
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">From account</legend>
            <div className="space-y-2">
              {reference.data.accounts
                .filter((a) => a.is_active)
                .map((a) => {
                  const b = reference.data.balances.find((b) => b.id === a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={String(a.id) === values.account_id}
                      className={cn(
                        'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 text-left',
                        String(a.id) === values.account_id
                          ? 'border-2 border-brand'
                          : 'border-line-strong',
                      )}
                      onClick={() => {
                        form.setValue('account_id', String(a.id))
                        form.setValue(
                          'rate',
                          a.currency === 'TRY'
                            ? ''
                            : String(
                                reference.data.rates.find(
                                  (r) => r.currency === a.currency,
                                )?.rate_to_try ?? '',
                              ),
                        )
                      }}
                    >
                      <span className="font-bold">{a.name}</span>
                      <span className="font-semibold">
                        {b
                          ? formatMoney(b.balance, a.currency)
                          : 'Balance unavailable'}
                      </span>
                    </button>
                  )
                })}
            </div>
            <FieldError
              id="withdraw-account-error"
              message={form.formState.errors.account_id?.message}
            />
          </fieldset>
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="withdraw-amount"
            >
              Amount (
              {account?.currency === 'USD'
                ? '$'
                : account?.currency === 'NGN'
                  ? '₦'
                  : '₺'}
              )
            </label>
            <Input
              id="withdraw-amount"
              className="h-14 text-2xl font-bold"
              inputMode="decimal"
              aria-invalid={!!form.formState.errors.amount}
              aria-describedby="withdraw-amount-error"
              {...form.register('amount')}
            />
            <FieldError
              id="withdraw-amount-error"
              message={form.formState.errors.amount?.message}
            />
          </div>
          {account?.currency !== 'TRY' ? (
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="withdraw-rate"
              >
                Rate to lira (₺ per {account?.currency === 'USD' ? '$' : '₦'})
              </label>
              <Input
                id="withdraw-rate"
                inputMode="decimal"
                placeholder="Use latest Admin default"
                aria-describedby="withdraw-rate-error"
                {...form.register('rate')}
              />
              <FieldError
                id="withdraw-rate-error"
                message={form.formState.errors.rate?.message}
              />
              <p className="mt-2 text-xs text-muted">
                Latest default:{' '}
                {rate
                  ? `₺${formatRate(rate.rate_to_try)} · ${rate.effective_date}`
                  : 'Not set'}
                . Confirm the rate for this withdrawal.
              </p>
            </div>
          ) : null}
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="withdraw-purpose"
            >
              What is it for?
            </label>
            <textarea
              id="withdraw-purpose"
              rows={2}
              className="w-full rounded-xl border border-line-strong bg-card p-3"
              aria-describedby="withdraw-purpose-error"
              {...form.register('purpose')}
            />
            <FieldError
              id="withdraw-purpose-error"
              message={form.formState.errors.purpose?.message}
            />
          </div>
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="withdraw-category"
            >
              Category
            </label>
            <select
              id="withdraw-category"
              className="h-12 w-full rounded-lg border border-line-strong bg-card px-3"
              aria-describedby="withdraw-category-error"
              {...form.register('category_id')}
            >
              <option value="">Choose category</option>
              {reference.data.categories
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <FieldError
              id="withdraw-category-error"
              message={form.formState.errors.category_id?.message}
            />
          </div>
          {values.kind === 'advance' ? (
            <div>
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="withdraw-recipient"
              >
                Given to
              </label>
              <select
                id="withdraw-recipient"
                className="h-12 w-full rounded-lg border border-line-strong bg-card px-3"
                aria-describedby="withdraw-recipient-error"
                {...form.register('recipient_id')}
              >
                <option value="">Choose staff member</option>
                {reference.data.people
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
              </select>
              <FieldError
                id="withdraw-recipient-error"
                message={form.formState.errors.recipient_id?.message}
              />
            </div>
          ) : null}
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="withdraw-receipt"
            >
              Photo of receipt (optional)
            </label>
            <Input
              id="withdraw-receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const next = e.target.files?.[0]
                if (next) {
                  try {
                    validatePhoto(next)
                    setFile(next)
                    setReceiptPath(undefined)
                    setError(undefined)
                  } catch (err) {
                    const message = (err as Error).message
                    setError(message)
                    setFile(undefined)
                    setReceiptPath(undefined)
                    toast.error(message)
                    e.target.value = ''
                  }
                }
              }}
            />
            {file ? (
              <p className="mt-2 break-words text-xs text-muted">
                Selected: {file.name}
              </p>
            ) : null}
          </div>
        </fieldset>
        {quote.isFetching && payload ? (
          <p role="status" className="text-sm text-muted">
            Checking balance…
          </p>
        ) : null}
        {quote.error ? (
          <p role="alert" className="text-brand-strong">
            {quote.error.message}
          </p>
        ) : quote.data ? (
          <div className="space-y-2 rounded-xl bg-amber-soft p-4 text-sm text-amber-ink">
            <p>
              {quote.data.needs_approval
                ? 'Waiting for Admin: balance stays'
                : 'Balance after withdrawal:'}{' '}
              <strong>
                {formatMoney(quote.data.balance_after, quote.data.currency)}
              </strong>
            </p>
            {quote.data.needs_approval ? (
              <p>
                If approved:{' '}
                {formatMoney(
                  quote.data.balance_if_approved,
                  quote.data.currency,
                )}
              </p>
            ) : null}
            {quote.data.currency !== 'TRY' ? (
              <p>
                TRY value: {formatMoney(quote.data.amount_try, 'TRY')} · rate ₺
                {formatRate(quote.data.rate_to_try)}
              </p>
            ) : null}
            {values.kind === 'advance' ? (
              <p>
                The recipient logs supplies and returns change. This becomes an
                expense only when supplies are logged.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Complete the details to see the server balance preview.
          </p>
        )}
        {error ? (
          <p role="alert" className="break-words text-brand-strong">
            {error}
          </p>
        ) : null}
        <Button requiresOnline
          className="w-full"
          type="submit"
          disabled={locked || !quote.data || quote.isFetching || !!quote.error}
        >
          {uploading
            ? 'Uploading receipt…'
            : money.busy
              ? 'Saving…'
              : quote.data?.needs_approval
                ? 'Request approval'
                : quote.data
                  ? `Take out ${formatMoney(quote.data.amount, quote.data.currency)}`
                  : 'Take money out'}
        </Button>
      </form>
      {balance ? (
        <p className="text-sm text-muted">
          Current {balance.name} balance:{' '}
          {formatMoney(balance.balance, balance.currency)}
        </p>
      ) : null}
    </section>
  )
}

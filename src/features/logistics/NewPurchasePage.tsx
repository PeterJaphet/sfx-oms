import { useFinancialDay } from '@/features/close/financial-day'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
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
import { uploadReceipt } from '@/features/money/receipt-photos'
import { useLogistics } from './logistics-context'
import { quotePurchase, useActiveAdvances } from './logistics-api'
import {
  purchaseSchema,
  purchasePayload,
  type PurchaseValues,
} from './purchase-model'
import PurchaseItems, { type PurchaseItem } from './PurchaseItems'
export default function NewPurchasePage() {
  const { profile } = useAuth()
  const state = useLogistics()
  const financial = useFinancialDay()
  const ref = state.reference
  const advances = useActiveAdvances()
  const [params] = useSearchParams()
  const form = useForm<PurchaseValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      funding: 'advance',
      advance_id: params.get('advance') ?? '',
      account_id: '1',
      supplier: '',
      category_id: '',
      rate: '',
      due_date: '',
      note: '',
      items: [],
    },
  })
  const lines = useFieldArray({ control: form.control, name: 'items' })
  const values = form.watch()
  const valid = purchaseSchema.safeParse(values)
  const payload = valid.success ? purchasePayload(valid.data) : null
  const preview = useQuery({
    queryKey: ['logistics', 'purchase-quote', payload],
    enabled: !!payload && !state.pending && !state.busy,
    retry: false,
    refetchInterval: 15000,
    queryFn: () => quotePurchase(payload!),
  })
  const [editor, setEditor] = useState<{
    index: number
    item?: PurchaseItem
  } | null>(null)
  const [file, setFile] = useState<File>()
  const [path, setPath] = useState<string>()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string>()
  const locked = financial.blocked || state.busy || !!state.pending || uploading
  const selected = advances.data?.find((a) => a.id === values.advance_id)
  const account = ref.data?.accounts.find(
    (a) => String(a.id) === values.account_id,
  )
  const currency =
    values.funding === 'credit'
      ? 'TRY'
      : values.funding === 'advance'
        ? selected?.currency
        : account?.currency
  const defaultRate = ref.data?.rates.find((r) => r.currency === currency)
  useEffect(() => {
    if (preview.error)
      toast.error(preview.error.message, { id: 'm6-preview-error' })
    else if (preview.data) toast.dismiss('m6-preview-error')
  }, [preview.error, preview.data])
  if (ref.isPending) return <p role="status">Loading purchase form…</p>
  if (ref.error)
    return (
      <div role="alert">
        <p className="text-brand-strong">{ref.error.message}</p>
        <Button
          onClick={() => {
            void ref.refetch()
          }}
        >
          Retry purchase form
        </Button>
      </div>
    )
  return (
    <section className="mx-auto max-w-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold">Log supplies bought</h1>
        <Link
          className="flex min-h-11 items-center font-semibold text-brand-strong"
          to="/purchases"
        >
          Purchase history
        </Link>
      </div>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (v) => {
          setError(undefined)
          if (!preview.data || preview.isFetching) {
            setError('Wait for the current funding preview')
            return
          }
          const confirmed = preview.data
          let receipt = path
          try {
            if (file && !receipt) {
              setUploading(true)
              receipt = await uploadReceipt(
                file,
                profile!.id,
                confirmed.business_date,
              )
              setPath(receipt)
            }
            await state.send('purchase', {
              ...purchasePayload(v),
              ...(v.funding === 'account'
                ? { rate: String(confirmed.rate_to_try) }
                : {}),
              quote_token: confirmed.quote_token,
              ...(receipt ? { receipt_path: receipt } : {}),
            })
            form.reset({ ...v, items: [], note: '' })
            setFile(undefined)
            setPath(undefined)
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setUploading(false)
          }
        })}
      >
        <fieldset disabled={locked} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Paid with</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [
                    'advance',
                    profile!.role === 'admin' ? 'An advance' : 'My advance',
                  ],
                  ['account', 'From an account'],
                  ['credit', 'On credit'],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={values.funding === id}
                  className={cn(
                    'min-h-12 rounded-xl border bg-card p-3 text-left font-semibold',
                    id === 'advance' ? 'col-span-2' : '',
                    values.funding === id
                      ? 'border-2 border-brand'
                      : 'border-line-strong',
                  )}
                  onClick={() => form.setValue('funding', id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {values.funding === 'advance' ? (
            <div>
              <label
                className="mb-2 block font-semibold"
                htmlFor="purchase-advance"
              >
                Open advance
              </label>
              {advances.error ? (
                <div role="alert">
                  <p className="text-brand-strong">{advances.error.message}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void advances.refetch()
                    }}
                  >
                    Reload advances
                  </Button>
                </div>
              ) : (
                <>
                  <select
                    id="purchase-advance"
                    className="h-12 w-full rounded-xl border bg-card px-3"
                    {...form.register('advance_id')}
                  >
                    <option value="">Choose an advance</option>
                    {advances.data
                      ?.filter((a) => a.state === 'open')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.purpose} · {formatMoney(a.remaining, a.currency)}{' '}
                          left
                          {profile!.role === 'admin'
                            ? ` · ${a.recipient_name}`
                            : ''}
                        </option>
                      ))}
                  </select>
                  {!advances.isPending &&
                  !advances.data?.some((a) => a.state === 'open') ? (
                    <p className="mt-2 text-sm text-muted">
                      No open advances. Choose an account or credit instead.
                    </p>
                  ) : null}
                </>
              )}
              <FieldError
                id="purchase-advance-error"
                message={form.formState.errors.advance_id?.message}
              />
            </div>
          ) : values.funding === 'account' ? (
            <div>
              <label
                className="mb-2 block font-semibold"
                htmlFor="purchase-account"
              >
                Account
              </label>
              <select
                id="purchase-account"
                className="h-12 w-full rounded-xl border bg-card px-3"
                value={values.account_id}
                onChange={(e) => {
                  form.setValue('account_id', e.target.value)
                  const a = ref.data.accounts.find(
                    (a) => String(a.id) === e.target.value,
                  )
                  form.setValue(
                    'rate',
                    a?.currency === 'TRY'
                      ? ''
                      : String(
                          ref.data.rates.find((r) => r.currency === a?.currency)
                            ?.rate_to_try ?? '',
                        ),
                  )
                }}
              >
                {ref.data.accounts
                  .filter((a) => a.is_active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
              {currency !== 'TRY' ? (
                <div className="mt-3">
                  <label
                    className="mb-2 block text-sm font-semibold"
                    htmlFor="purchase-rate"
                  >
                    Rate to lira
                  </label>
                  <Input
                    id="purchase-rate"
                    inputMode="decimal"
                    placeholder="Latest Admin default"
                    {...form.register('rate')}
                  />
                  <FieldError
                    id="purchase-rate-error"
                    message={form.formState.errors.rate?.message}
                  />
                  <p className="mt-2 text-xs text-muted">
                    Latest default:{' '}
                    {defaultRate
                      ? `₺${formatRate(defaultRate.rate_to_try)} · ${defaultRate.effective_date}`
                      : 'Not set'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted">
                Credit purchases are in lira and create a debt to the supplier.
                No money leaves an account.
              </p>
              <label
                className="mb-2 mt-3 block text-sm font-semibold"
                htmlFor="purchase-due"
              >
                Due date (optional)
              </label>
              <Input
                id="purchase-due"
                type="date"
                {...form.register('due_date')}
              />
              <FieldError
                id="purchase-due-error"
                message={form.formState.errors.due_date?.message}
              />
            </div>
          )}
          <div>
            <label
              className="mb-2 block font-semibold"
              htmlFor="purchase-supplier"
            >
              Supplier
            </label>
            <Input
              id="purchase-supplier"
              list="purchase-supplier-options"
              {...form.register('supplier')}
            />
            <datalist id="purchase-supplier-options">
              {ref.data.suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <FieldError
              id="purchase-supplier-error"
              message={form.formState.errors.supplier?.message}
            />
          </div>
          <fieldset>
            <legend className="mb-2 font-semibold">Category</legend>
            <div className="flex flex-wrap gap-2">
              {ref.data.categories
                .filter((c) => c.is_active)
                .map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    aria-pressed={values.category_id === String(c.id)}
                    className={cn(
                      'min-h-11 rounded-full border px-3 text-sm font-semibold',
                      values.category_id === String(c.id)
                        ? 'border-ink bg-ink text-card'
                        : 'border-line-strong bg-card',
                    )}
                    onClick={() => form.setValue('category_id', String(c.id))}
                  >
                    {c.name}
                  </button>
                ))}
            </div>
            <FieldError
              id="purchase-category-error"
              message={form.formState.errors.category_id?.message}
            />
          </fieldset>
          <section aria-label="Items" className="space-y-2">
            <h2 className="font-semibold">
              Items ({lines.fields.length}) ·{' '}
              {currency ?? 'choose funding currency'}
            </h2>
            {lines.fields.map((line, i) => (
              <article
                key={line.id}
                className="space-y-3 rounded-xl border bg-card p-3"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {values.items[i].description}
                    </p>
                    <p className="text-sm text-muted">
                      {values.items[i].quantity} {values.items[i].unit}
                    </p>
                  </div>
                  <strong>
                    {currency
                      ? formatMoney(values.items[i].amount, currency)
                      : values.items[i].amount}
                  </strong>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="secondary"
                    variant="secondary"
                    onClick={() =>
                      setEditor({ index: i, item: values.items[i] })
                    }
                    aria-label={`Edit item ${i + 1}`}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="secondary"
                    variant="secondary"
                    onClick={() => lines.remove(i)}
                    aria-label={`Remove draft item ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              </article>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="w-full border-dashed"
              disabled={lines.fields.length >= 50}
              onClick={() => setEditor({ index: lines.fields.length })}
            >
              + Add item
            </Button>
            <FieldError
              id="purchase-items-error"
              message={form.formState.errors.items?.message}
            />
          </section>
          <div>
            <label className="mb-2 block font-semibold" htmlFor="purchase-note">
              Note (optional)
            </label>
            <Input id="purchase-note" {...form.register('note')} />
            <FieldError
              id="purchase-note-error"
              message={form.formState.errors.note?.message}
            />
          </div>
          <div>
            <label
              className="mb-2 block font-semibold"
              htmlFor="purchase-receipt"
            >
              Photo of receipt (optional)
            </label>
            <Input
              id="purchase-receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const chosen = e.target.files?.[0]
                if (chosen) {
                  try {
                    validatePhoto(chosen)
                    setFile(chosen)
                    setPath(undefined)
                    setError(undefined)
                  } catch (e2) {
                    setFile(undefined)
                    setPath(undefined)
                    setError((e2 as Error).message)
                    toast.error((e2 as Error).message)
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
        <div className="sticky bottom-16 z-10 space-y-3 rounded-xl border bg-card p-4 sm:bottom-0">
          {preview.isFetching && payload ? (
            <p role="status" className="text-sm text-muted">
              Checking purchase totals…
            </p>
          ) : preview.data ? (
            <div className="space-y-1 text-sm">
              <p className="font-bold">
                Total {formatMoney(preview.data.amount, preview.data.currency)}
                {preview.data.currency !== 'TRY'
                  ? ` · ${formatMoney(preview.data.amount_try, 'TRY')} · rate ₺${formatRate(preview.data.rate_to_try)}`
                  : ''}
              </p>
              {preview.data.remaining_after !== null ? (
                <p>
                  {preview.data.owed_to_staff > 0
                    ? `Owed to staff after this: ${formatMoney(preview.data.owed_to_staff, preview.data.currency)}`
                    : `${preview.data.funding === 'advance' ? 'Left in advance' : 'Account balance'} after this: ${formatMoney(preview.data.remaining_after, preview.data.currency)}`}
                </p>
              ) : (
                <p>Supplier debt: {formatMoney(preview.data.amount, 'TRY')}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Choose funding, supplier and category, then add items to see the
              server total.
            </p>
          )}
          <Button
            className="w-full"
            type="submit"
            disabled={
              locked || !preview.data || preview.isFetching || !!preview.error
            }
          >
            {uploading
              ? 'Uploading receipt…'
              : state.busy
                ? 'Saving…'
                : preview.data
                  ? `Save purchase · ${formatMoney(preview.data.amount, preview.data.currency)}`
                  : 'Save purchase'}
          </Button>
        </div>
      </form>
      {editor ? (
        <PurchaseItems
          item={editor.item}
          onClose={() => setEditor(null)}
          onSave={(item) => {
            if (editor.item) lines.update(editor.index, item)
            else lines.append(item)
            setEditor(null)
          }}
        />
      ) : null}
    </section>
  )
}

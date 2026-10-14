import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input, FieldError } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { photoId } from '@/features/menu/menu-photos'
import type { Extra, Product, Variant } from '@/features/menu/menu-model'
import { ExtraQuantityPicker } from './ExtraQuantityPicker'
import { extraSelectionSchema } from './extra-model'
import { getDraftExtras } from './order-model'
import { useOrder } from './order-context'
import { detailsSchema, discountSchema, orderTypes, type Details, type DraftItem, type DraftPayment, type PaymentAccount, formatRate, impliedRate, inputAmount, amountSchema } from './order-model'

export function DetailsForm({ onSaved }: { onSaved: () => void }) {
  const order = useOrder()
  const form = useForm<Details>({ resolver: zodResolver(detailsSchema), defaultValues: order.draft.details })
  return <form className="space-y-4" onSubmit={form.handleSubmit(details => { order.update(d => ({ ...d, details })); onSaved() })}>
    <div className="flex rounded-xl bg-chip p-1" role="group" aria-label="Order type">{orderTypes.map(([type, label]) => <button key={type} type="button" aria-pressed={form.watch('order_type') === type} className={cn('min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold', form.watch('order_type') === type ? 'bg-card' : 'text-muted')} onClick={() => form.setValue('order_type', type)}>{label}</button>)}</div>
    <label className="block text-sm font-semibold" htmlFor="customer-name">Customer name (optional)</label><Input id="customer-name" autoComplete="name" {...form.register('customer_name')} /><FieldError id="customer-name-error" message={form.formState.errors.customer_name?.message} />
    <label className="block text-sm font-semibold" htmlFor="customer-phone">Customer phone (optional)</label><Input id="customer-phone" type="tel" autoComplete="tel" {...form.register('customer_phone')} /><FieldError id="customer-phone-error" message={form.formState.errors.customer_phone?.message} />
    {form.watch('order_type') === 'delivery' ? <div><label className="mb-2 block text-sm font-semibold" htmlFor="delivery-address">Delivery address</label><textarea id="delivery-address" className="min-h-24 w-full rounded-lg border border-line-strong bg-card p-3" aria-invalid={!!form.formState.errors.delivery_address} aria-describedby="address-error" {...form.register('delivery_address')} /><FieldError id="address-error" message={form.formState.errors.delivery_address?.message} /></div> : null}
    <label className="block text-sm font-semibold" htmlFor="order-note">Order note (optional)</label><textarea id="order-note" className="min-h-24 w-full rounded-lg border border-line-strong bg-card p-3" {...form.register('note')} /><FieldError id="note-error" message={form.formState.errors.note?.message} />
    <Button type="submit" className="w-full">Save details</Button>
  </form>
}
export function DiscountForm({ onSaved }: { onSaved: () => void }) {
  const order = useOrder()
  const form = useForm<z.infer<typeof discountSchema>>({ resolver: zodResolver(discountSchema), defaultValues: { kind: order.draft.discount.kind === 'percent' ? 'percent' : 'amount', value: order.draft.discount.value, reason: order.draft.discount.reason } })
  return <form className="space-y-4" onSubmit={form.handleSubmit(discount => { order.update(d => ({ ...d, discount })); onSaved() })}>
    <div className="flex rounded-xl bg-chip p-1" role="group" aria-label="Discount type">{(['amount', 'percent'] as const).map(kind => <button key={kind} type="button" aria-pressed={form.watch('kind') === kind} className={cn('min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold', form.watch('kind') === kind ? 'bg-card' : 'text-muted')} onClick={() => form.setValue('kind', kind)}>{kind === 'amount' ? 'Amount (₺)' : 'Percent (%)'}</button>)}</div>
    <div><label className="mb-2 block text-sm font-semibold" htmlFor="discount-value">{form.watch('kind') === 'percent' ? 'Discount (%)' : 'Discount (₺)'}</label><Input id="discount-value" inputMode="decimal" aria-invalid={!!form.formState.errors.value} aria-describedby="discount-value-error" {...form.register('value')} /><FieldError id="discount-value-error" message={form.formState.errors.value?.message} /></div>
    <div><label className="mb-2 block text-sm font-semibold" htmlFor="discount-reason">Reason</label><Input id="discount-reason" aria-invalid={!!form.formState.errors.reason} aria-describedby="discount-reason-error" {...form.register('reason')} /><FieldError id="discount-reason-error" message={form.formState.errors.reason?.message} /></div>
    <Button type="submit" className="w-full">Apply discount</Button>{order.draft.discount.kind !== 'none' ? <Button className="w-full" variant="secondary" onClick={() => { order.update(d => ({ ...d, discount: { kind: 'none', value: '', reason: '' } })); onSaved() }}>Remove discount</Button> : null}
  </form>
}
const selectionSchema = z.object({ variant_id: z.string().min(1, 'Choose a variant'), quantity: z.number().int().min(1, 'Enter at least 1').max(999, 'Use at most 999'), extras: z.array(extraSelectionSchema), note: z.string().trim().max(500) })
export function ItemForm({ product, variants, extras, item, onSaved }: { product: Product; variants: Variant[]; extras: Extra[]; item?: DraftItem; onSaved: (item: DraftItem) => void }) {
  const selected = item ? getDraftExtras(item) : []
  // Keep field indices tied to the same extra if the menu refreshes while this sheet is open.
  const [choices] = useState(() => [...extras, ...selected.filter(e => !extras.some(a => a.id === e.addon_id)).map(e => ({ id: e.addon_id, name: 'Unavailable extra', price: undefined }))])
  const form = useForm<z.infer<typeof selectionSchema>>({ resolver: zodResolver(selectionSchema), defaultValues: { variant_id: item?.variant_id ?? variants[0]?.id ?? '', quantity: item?.quantity ?? 1, extras: choices.map(extra => ({ addon_id: extra.id, quantity: selected.find(e => e.addon_id === extra.id)?.quantity ?? 0 })), note: item?.note ?? '' } })
  return <form className="space-y-4" onSubmit={form.handleSubmit(values => onSaved({ ...values, extras: values.extras.filter(e => e.quantity > 0), addon_ids: [], id: item?.id ?? photoId(), product_id: product.id }))}>
    <fieldset><legend className="mb-2 text-sm font-semibold">Variant</legend>{variants.map(v => <label key={v.id} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"><span className="flex items-center gap-3"><input className="h-5 w-5 accent-brand" type="radio" value={v.id} {...form.register('variant_id')} />{v.name}</span><span className="font-semibold">{formatMoney(v.price, 'TRY')}</span></label>)}<FieldError id="variant-error" message={form.formState.errors.variant_id?.message} /></fieldset>
    {choices.length ? <fieldset><legend className="mb-1 text-sm font-semibold">Extras</legend><p className="text-xs text-muted">Extra quantities are totals for this item line. Changing dish quantity keeps these counts.</p>{choices.map((extra, index) => <ExtraQuantityPicker key={extra.id} id={extra.id} name={extras.find(a => a.id === extra.id)?.name ?? `${extra.name} (unavailable)`} price={extras.find(a => a.id === extra.id)?.price} quantity={form.watch(`extras.${index}.quantity`)} error={form.formState.errors.extras?.[index]?.quantity?.message} onChange={quantity => form.setValue(`extras.${index}.quantity`, quantity, { shouldValidate: true, shouldDirty: true })} />)}</fieldset> : null}
    <div><label className="mb-2 block text-sm font-semibold" htmlFor="item-quantity">Dish quantity</label><div className="flex items-center gap-3"><Button variant="secondary" size="secondary" aria-label="Decrease quantity" disabled={form.watch('quantity') <= 1} onClick={() => form.setValue('quantity', Math.max(1, (form.getValues('quantity') || 1) - 1))}>−</Button><Input className="w-24 text-center" id="item-quantity" type="number" inputMode="numeric" min={1} max={999} aria-invalid={!!form.formState.errors.quantity} aria-describedby="quantity-error" {...form.register('quantity', { valueAsNumber: true })} /><Button variant="secondary" size="secondary" aria-label="Increase quantity" disabled={form.watch('quantity') >= 999} onClick={() => form.setValue('quantity', (form.getValues('quantity') || 0) + 1)}>+</Button></div><FieldError id="quantity-error" message={form.formState.errors.quantity?.message} /></div>
    <label className="block text-sm font-semibold" htmlFor="item-note">Item note (optional)</label><Input id="item-note" {...form.register('note')} /><FieldError id="item-note-error" message={form.formState.errors.note?.message} />
    <Button type="submit" className="w-full">{item ? 'Update item' : 'Add to order'}</Button>
  </form>
}
export function PaymentForm({ account, due, defaultRate, onAdd, disabled }: { account: PaymentAccount; due: number; defaultRate?: { rate_to_try: number; effective_date: string }; onAdd: (payment: DraftPayment) => Promise<void>; disabled: boolean }) {
  const schema = z.object({ amount_try: amountSchema, amount: z.string() }).superRefine((values, ctx) => { if (account.currency !== 'TRY' && !amountSchema.safeParse(values.amount).success) ctx.addIssue({ code: 'custom', path: ['amount'], message: `Enter the amount received in ${account.currency}` }) })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { amount_try: due > 0 ? inputAmount(due) : '', amount: '' } })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string>()
  const rate = impliedRate(form.watch('amount_try'), form.watch('amount'))
  const symbol = account.currency === 'USD' ? '$' : '₦'
  return <form className="space-y-3 rounded-xl border-2 border-brand bg-card p-4" aria-label={`${account.name} payment`} onSubmit={form.handleSubmit(async values => {
    setAdding(true); setError(undefined)
    try { await onAdd({ id: photoId(), account_id: account.id, amount_try: values.amount_try, ...(account.currency !== 'TRY' ? { amount: amountSchema.parse(values.amount) } : {}) }) }
    catch (e) { setError((e as Error).message) } finally { setAdding(false) }
  })}>
    <h2 className="font-bold">{account.name} payment</h2><fieldset disabled={disabled || adding} className="space-y-3"><div className={cn('grid gap-3', account.currency !== 'TRY' ? 'grid-cols-2' : '')}>
      <div><label className="mb-2 block text-sm font-semibold" htmlFor="payment-covers">{account.currency === 'TRY' ? 'Amount (₺)' : 'Covers (₺)'}</label><Input id="payment-covers" inputMode="decimal" aria-invalid={!!form.formState.errors.amount_try} aria-describedby="covers-error" {...form.register('amount_try')} /><FieldError id="covers-error" message={form.formState.errors.amount_try?.message} /></div>
      {account.currency !== 'TRY' ? <div><label className="mb-2 block text-sm font-semibold" htmlFor="payment-received">Received ({symbol})</label><Input id="payment-received" inputMode="decimal" aria-invalid={!!form.formState.errors.amount} aria-describedby="received-error" {...form.register('amount')} /><FieldError id="received-error" message={form.formState.errors.amount?.message} /></div> : null}
    </div>{account.currency !== 'TRY' ? <p className="text-sm text-muted">Rate used: {rate ? `${symbol}1 = ₺${formatRate(rate)}` : 'Enter both amounts'}<br />Latest default: {defaultRate ? `${symbol}1 = ₺${formatRate(defaultRate.rate_to_try)} · ${defaultRate.effective_date}` : 'Not set'}</p> : null}<Button requiresOnline className="w-full bg-ink hover:bg-ink-2" type="submit">{adding ? 'Checking…' : 'Add payment'}</Button></fieldset>{error ? <p role="alert" className="text-sm text-brand-strong">{error}</p> : null}
  </form>
}

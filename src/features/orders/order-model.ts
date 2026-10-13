import { z } from 'zod'
import { photoId } from '@/features/menu/menu-photos'

export const channels = [['walk_in', 'Walk-in'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['phone', 'Phone'], ['delivery_app', 'Delivery app'], ['event', 'Event']] as const
export const orderTypes = [['pickup', 'Pickup'], ['delivery', 'Delivery'], ['dine_in', 'Dine-in']] as const
const moneyText = /^\d+(\.\d{1,2})?$|^\d{1,3}(,\d{3})+(\.\d{1,2})?$/
export const amountSchema = z.string().trim().regex(moneyText, 'Enter an amount with at most 2 decimals').transform(v => v.replaceAll(',', '')).refine(v => Number(v) > 0 && Number(v) <= 999999999999.99, 'Enter an amount greater than 0')
export const detailsSchema = z.object({ order_type: z.enum(['pickup', 'delivery', 'dine_in']), customer_name: z.string().trim().max(120), customer_phone: z.string().trim().max(60), delivery_address: z.string().trim().max(1000), note: z.string().trim().max(1000) }).superRefine((v, ctx) => {
  if (v.order_type === 'delivery' && !v.delivery_address) ctx.addIssue({ code: 'custom', path: ['delivery_address'], message: 'Enter a delivery address' })
})
export const discountSchema = z.object({ kind: z.enum(['amount', 'percent']), value: amountSchema, reason: z.string().trim().min(1, 'Enter a discount reason').max(300) }).superRefine((v, ctx) => {
  if (v.kind === 'percent' && Number(v.value) > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a percent between 0 and 100' })
})
export const itemSchema = z.object({ id: z.string().uuid(), product_id: z.string(), variant_id: z.string(), quantity: z.number().int().min(1, 'Enter at least 1').max(999, 'Use at most 999'), addon_ids: z.array(z.string()), note: z.string().max(500) })
export const paymentSchema = z.object({ id: z.string().uuid(), account_id: z.number().int(), amount_try: amountSchema, amount: amountSchema.optional() })
export const draftSchema = z.object({
  request_id: z.string().uuid(), channel: z.enum(['walk_in', 'whatsapp', 'instagram', 'phone', 'delivery_app', 'event']),
  details: detailsSchema, items: z.array(itemSchema), payments: z.array(paymentSchema),
  discount: z.object({ kind: z.enum(['none', 'amount', 'percent']), value: z.string(), reason: z.string() }),
})
export type Draft = z.infer<typeof draftSchema>
export type DraftItem = z.infer<typeof itemSchema>
export type DraftPayment = z.infer<typeof paymentSchema>
export type Details = z.infer<typeof detailsSchema>
export const workspaceSchema = z.object({ draft: draftSchema, savedId: z.string().uuid().nullable(), attempt: z.object({ payload: z.record(z.string(), z.json()), unpaid: z.boolean() }).nullable() })
export type Workspace = z.infer<typeof workspaceSchema>
export function emptyDraft(): Draft {
  return { request_id: photoId(), channel: 'walk_in', details: { order_type: 'pickup', customer_name: '', customer_phone: '', delivery_address: '', note: '' }, items: [], payments: [], discount: { kind: 'none', value: '', reason: '' } }
}
export function quotePayload(draft: Draft, unpaid = false): Record<string, z.infer<ReturnType<typeof z.json>>> {
  return { items: draft.items.map(({ variant_id, quantity, addon_ids, note }) => ({ variant_id, quantity, addon_ids, note })),
    payments: unpaid ? [] : draft.payments.map(({ account_id, amount_try, amount }) => ({ account_id, amount_try, ...(amount ? { amount } : {}) })),
    ...(draft.discount.kind === 'percent' ? { discount_percent: draft.discount.value, discount_reason: draft.discount.reason } : draft.discount.kind === 'amount' ? { discount_amount: draft.discount.value, discount_reason: draft.discount.reason } : {}) }
}
export function savePayload(draft: Draft, token: string, unpaid = false): Record<string, z.infer<ReturnType<typeof z.json>>> {
  return { ...quotePayload(draft, unpaid), ...draft.details, delivery_address: draft.details.order_type === 'delivery' ? draft.details.delivery_address : '', channel: draft.channel, client_request_id: draft.request_id, quote_token: token }
}
export function addDraftItem(items: DraftItem[], next: DraftItem) {
  const match = items.find(item => item.variant_id === next.variant_id && item.note === next.note && JSON.stringify([...item.addon_ids].sort()) === JSON.stringify([...next.addon_ids].sort()))
  return match && match.quantity + next.quantity <= 999 ? items.map(item => item.id === match.id ? { ...item, quantity: item.quantity + next.quantity } : item) : [...items, next]
}
const quoteItem = z.object({ position: z.number(), variant_id: z.string(), product_id: z.string(), product_name: z.string(), variant_name: z.string(), category_name: z.string(), unit_price: z.number(), quantity: z.number(), line_total: z.number(), note: z.string().nullable(), addons: z.array(z.object({ addon_id: z.string(), name: z.string(), price: z.number() })) })
export const quoteSchema = z.object({ business_date: z.string(), quote_token: z.string(), items: z.array(quoteItem), subtotal: z.number(), discount_amount: z.number(), total: z.number(), paid_try: z.number(), balance_due: z.number(), payments: z.array(z.object({ account_id: z.number(), account_name: z.string(), currency: z.enum(['TRY', 'USD', 'NGN']), amount: z.number(), amount_try: z.number(), rate_to_try: z.number() })) })
export type Quote = z.infer<typeof quoteSchema>
export const accountSchema = z.object({ id: z.number(), name: z.string(), currency: z.enum(['TRY', 'USD', 'NGN']) })
export type PaymentAccount = z.infer<typeof accountSchema>
/** Exchange rate guidance only. No derived value is sent for saving. */
export function impliedRate(covers: string, received: string): number | null {
  const c = amountSchema.safeParse(covers), r = amountSchema.safeParse(received)
  return c.success && r.success ? Number(c.data) / Number(r.data) : null
}
export function formatRate(rate: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: Number.isInteger(rate) ? 0 : 2, maximumFractionDigits: 6 }).format(rate) }
export function inputAmount(amount: number) { return Number.isInteger(amount) ? String(amount) : amount.toFixed(2) }

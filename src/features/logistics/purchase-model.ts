import { z } from 'zod'
import { amountSchema } from '@/features/orders/order-model'
import { currencySchema, rateSchema } from '@/features/money/money-model'
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Use at most 3 decimals')
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 999999999.999,
    'Enter a positive quantity',
  )
export const lineAmountSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\d+(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)$/,
    'Use at most 2 decimals',
  )
  .transform((v) => v.replaceAll(',', ''))
  .refine(
    (v) => Number(v) >= 0 && Number(v) <= 999999999999.99,
    'Enter a non-negative amount',
  )
export const itemSchema = z
  .object({
    inventory_item_id: z.string().uuid().optional(),
    description: z.string().trim().min(1, "Describe this item").max(200),
    quantity: quantitySchema,
    unit: z.string().trim().max(40),
    amount: lineAmountSchema,
  })
  .superRefine((v, c) => {
    if (v.inventory_item_id && !v.unit.trim())
      c.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Enter the purchase unit for this inventory item",
      });
  });
export const purchaseSchema = z
  .object({
    funding: z.enum(['advance', 'account', 'credit']),
    advance_id: z.string(),
    account_id: z.string(),
    supplier: z.string().trim().min(2, 'Enter the supplier name').max(200),
    category_id: z.string().min(1, 'Choose a category'),
    rate: z.string(),
    due_date: z.string(),
    note: z.string().trim().max(1000),
    items: z
      .array(itemSchema)
      .min(1, 'Add an item')
      .max(50, 'Maximum 50 items'),
  })
  .superRefine((v, c) => {
    if (
      v.funding === 'advance' &&
      !z.string().uuid().safeParse(v.advance_id).success
    )
      c.addIssue({
        code: 'custom',
        path: ['advance_id'],
        message: 'Choose an open advance',
      })
    if (v.funding === 'account' && !v.account_id)
      c.addIssue({
        code: 'custom',
        path: ['account_id'],
        message: 'Choose an account',
      })
    if (
      v.funding === 'account' &&
      v.rate &&
      !rateSchema.safeParse(v.rate).success
    )
      c.addIssue({
        code: 'custom',
        path: ['rate'],
        message: 'Enter a positive rate with at most 6 decimals',
      })
    if (
      v.funding === 'credit' &&
      v.due_date &&
      !z.iso.date().safeParse(v.due_date).success
    )
      c.addIssue({
        code: 'custom',
        path: ['due_date'],
        message: 'Choose a valid due date',
      })
  })
export type PurchaseValues = z.infer<typeof purchaseSchema>
export function purchasePayload(v: PurchaseValues) {
  return {
    supplier: v.supplier,
    category_id: Number(v.category_id),
    items: v.items,
    note: v.note,
    ...(v.funding === 'advance'
      ? { advance_id: v.advance_id }
      : v.funding === 'credit'
        ? { on_credit: true, ...(v.due_date ? { due_date: v.due_date } : {}) }
        : {
            account_id: Number(v.account_id),
            ...(v.rate ? { rate: v.rate } : {}),
          }),
  }
}
export const advanceSchema = z.object({
  id: z.string(),
  business_date: z.string(),
  account_id: z.number(),
  account_name: z.string(),
  currency: currencySchema,
  recipient_id: z.string(),
  recipient_name: z.string(),
  purpose: z.string(),
  amount: z.number(),
  rate_to_try: z.number(),
  spent: z.number(),
  change_returned: z.number(),
  reimbursed: z.number(),
  remaining: z.number(),
  state: z.enum(['open', 'owed_to_staff', 'accounted']),
  age_days: z.number(),
})
export type Advance = z.infer<typeof advanceSchema>
export const purchaseRowSchema = z.object({
  id: z.string(),
  supplier: z.string(),
  category_name: z.string(),
  currency: currencySchema,
  amount: z.number(),
  rate_to_try: z.number(),
  amount_try: z.number(),
  business_date: z.string(),
  logged_at: z.string(),
  staff_name: z.string(),
  funding: z.enum(['advance', 'account', 'credit']),
  account_name: z.string().nullable(),
  advance_id: z.string().nullable(),
  account_id: z.number().nullable(),
  debt_id: z.string().nullable(),
  due_date: z.string().nullable(),
  receipt_path: z.string().nullable(),
  note: z.string().nullable(),
  is_reversed: z.boolean(),
})
export type PurchaseRow = z.infer<typeof purchaseRowSchema>
export const purchaseQuoteSchema = z.object({
  funding: z.enum(['advance', 'account', 'credit']),
  business_date: z.string(),
  currency: currencySchema,
  amount: z.number(),
  rate_to_try: z.number(),
  amount_try: z.number(),
  remaining_before: z.number().nullable(),
  remaining_after: z.number().nullable(),
  owed_to_staff: z.number(),
  quote_token: z.string(),
})
export const changeSchema = z.object({
  advance_id: z.string().uuid(),
  account_id: z.string().min(1, 'Choose an account'),
  amount: amountSchema,
})
export const changeQuoteSchema = z.object({
  business_date: z.string(),
  currency: currencySchema,
  amount: z.number(),
  rate_to_try: z.number(),
  amount_try: z.number(),
  remaining_before: z.number(),
  remaining_after: z.number(),
  quote_token: z.string(),
})
export const logisticsAttemptSchema = z.object({
  action: z.enum(['purchase', 'change']),
  request_id: z.string().uuid(),
  payload: z.record(z.string(), z.json()),
})
export type LogisticsAttempt = z.infer<typeof logisticsAttemptSchema>
export const logisticsResultSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('purchase'),
    id: z.string().uuid(),
    business_date: z.string(),
    currency: currencySchema,
    amount: z.number(),
    amount_try: z.number(),
    debt_id: z.string().nullable(),
  }),
  z.object({
    action: z.literal('change'),
    id: z.number().positive(),
    business_date: z.string(),
    currency: currencySchema,
    amount: z.number(),
    remaining_after: z.number(),
  }),
])
export type LogisticsResult = z.infer<typeof logisticsResultSchema>
export const fundingNames = {
  advance: 'Advance',
  account: 'From an account',
  credit: 'On credit',
}

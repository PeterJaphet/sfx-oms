import { z } from 'zod'
import { amountSchema } from '@/features/orders/order-model'
import { currencySchema, rateSchema } from '@/features/money/money-model'
export const openingAmountSchema = z
  .string()
  .trim()
  .regex(
    /^-?(?:\d+(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)$/,
    'Use at most 2 decimals',
  )
  .transform((v) => v.replaceAll(',', ''))
  .refine((v) => Math.abs(Number(v)) <= 999999999999.99, 'Enter a valid amount')
export const openingSchema = z
  .object({
    amount: openingAmountSchema,
    reason: z.string().trim().min(3, 'Enter a reason').max(1000),
    rate: z.string(),
  })
  .refine((v) => !v.rate || rateSchema.safeParse(v.rate).success, {
    path: ['rate'],
    message: 'Enter a positive rate with at most 6 decimals',
  })
export const recordSchema = z
  .object({
    kind: z.enum(['manual', 'loan']),
    direction: z.enum(['we_owe', 'owed_to_us']),
    counterparty: z
      .string()
      .trim()
      .min(2, 'Enter who the debt is with')
      .max(200),
    description: z.string().trim().min(3, 'Describe the debt').max(1000),
    currency: currencySchema,
    amount: amountSchema,
    due_date: z.string(),
    account_id: z.string(),
    rate: z.string(),
  })
  .superRefine((v, c) => {
    if (v.due_date && !z.iso.date().safeParse(v.due_date).success)
      c.addIssue({
        code: 'custom',
        path: ['due_date'],
        message: 'Choose a valid due date',
      })
    if (v.kind === 'loan' && !v.account_id)
      c.addIssue({
        code: 'custom',
        path: ['account_id'],
        message: 'Choose an account',
      })
    if (v.kind === 'loan' && v.rate && !rateSchema.safeParse(v.rate).success)
      c.addIssue({
        code: 'custom',
        path: ['rate'],
        message: 'Enter a positive rate with at most 6 decimals',
      })
  })
export type RecordValues = z.infer<typeof recordSchema>
export function recordPayload(v: RecordValues, opening = false) {
  return {
    direction: v.direction,
    counterparty: v.counterparty,
    description: v.description,
    currency: v.currency,
    amount: v.amount,
    opening,
    ...(v.due_date ? { due_date: v.due_date } : {}),
    ...(!opening && v.kind === 'loan'
      ? {
          account_id: Number(v.account_id),
          ...(v.rate ? { rate: v.rate } : {}),
        }
      : {}),
  }
}
export const settlementSchema = z
  .object({
    account_id: z.string().min(1, 'Choose an account'),
    amount: amountSchema,
    covers: z.string(),
    note: z.string().trim().max(1000),
  })
  .refine((v) => !v.covers || amountSchema.safeParse(v.covers).success, {
    path: ['covers'],
    message: 'Enter a positive amount with at most 2 decimals',
  })
export const debtSchema = z.object({
  id: z.string(),
  direction: z.enum(['we_owe', 'owed_to_us']),
  counterparty: z.string(),
  description: z.string(),
  currency: currencySchema,
  amount: z.number(),
  settled: z.number(),
  outstanding: z.number(),
  outstanding_try_estimate: z.number().nullable(),
  due_date: z.string().nullable(),
  is_opening: z.boolean(),
  source: z.string(),
  business_date: z.string(),
  state: z.enum(['open', 'settled', 'cancelled']),
  is_overdue: z.boolean(),
  cancel_reason: z.string().nullable(),
})
export type Debt = z.infer<typeof debtSchema>
export const setupAccountSchema = z.object({
  id: z.number(),
  name: z.string(),
  currency: currencySchema,
  balance: z.number(),
  balance_try_estimate: z.number().nullable(),
  opened: z.boolean(),
  opening_amount: z.number().nullable(),
  opening_date: z.string().nullable(),
})
export type SetupAccount = z.infer<typeof setupAccountSchema>
export const setupSchema = z.object({
  business_date: z.string(),
  accounts: z.array(setupAccountSchema),
  balance_try_estimate: z.number().nullable(),
  missing_rates: z.number(),
  complete: z.boolean(),
})
export const openingQuoteSchema = z.object({
  business_date: z.string(),
  currency: currencySchema,
  amount: z.number(),
  amount_try: z.number(),
  rate_to_try: z.number().nullable(),
  balance_before: z.number(),
  balance_after: z.number(),
  quote_token: z.string(),
})
export const recordQuoteSchema = z.object({
  business_date: z.string(),
  currency: currencySchema,
  amount: z.number(),
  amount_try: z.number().nullable(),
  rate_to_try: z.number().nullable(),
  moves_money: z.boolean(),
  balance_before: z.number().nullable(),
  balance_after: z.number().nullable(),
  quote_token: z.string(),
})
export const settlementQuoteSchema = z.object({
  business_date: z.string(),
  direction: z.enum(['we_owe', 'owed_to_us']),
  currency: currencySchema,
  debt_currency: currencySchema,
  amount: z.number(),
  covers: z.number(),
  amount_try: z.number(),
  rate_to_try: z.number(),
  outstanding_before: z.number(),
  outstanding_after: z.number(),
  balance_before: z.number(),
  balance_after: z.number(),
  quote_token: z.string(),
})
export const summarySchema = z.object({
  we_owe: z.number(),
  owed_to_us: z.number(),
  debt_owed_to_us: z.number(),
  customer_due: z.number(),
  missing_owe_rates: z.number(),
  missing_owed_rates: z.number(),
})
export const unpaidSchema = z.object({
  id: z.string(),
  business_date: z.string(),
  daily_number: z.number(),
  customer_name: z.string().nullable(),
  customer_phone: z.string().nullable(),
  total: z.number(),
  paid_try: z.number(),
  balance_due: z.number(),
})
export const debtAttemptSchema = z.object({
  action: z.enum(['opening', 'record', 'settle', 'cancel']),
  request_id: z.string().uuid(),
  payload: z.record(z.string(), z.json()),
})
export type DebtAttempt = z.infer<typeof debtAttemptSchema>
export const debtResultSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('opening'),
    account_id: z.number(),
    amount: z.number(),
    currency: currencySchema,
  }),
  z.object({
    action: z.literal('record'),
    id: z.string().uuid(),
    amount: z.number(),
    currency: currencySchema,
  }),
  z.object({
    action: z.literal('settle'),
    id: z.number().positive(),
    debt_id: z.string().uuid(),
    outstanding_after: z.number(),
    currency: currencySchema,
  }),
  z.object({ action: z.literal('cancel'), id: z.string().uuid() }),
])
export type DebtResult = z.infer<typeof debtResultSchema>

import { z } from 'zod'
import { amountSchema } from '@/features/orders/order-model'
export const currencySchema = z.enum(['TRY', 'USD', 'NGN'])
export const rateSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Enter a rate with at most 6 decimals')
  .refine(
    (v) => Number(v) > 0 && Number(v) < 1_000_000_000_000,
    'Enter a positive rate',
  )
export const signedAmountSchema = z
  .string()
  .trim()
  .regex(
    /^-?(?:\d+(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)$/,
    'Enter an amount with at most 2 decimals',
  )
  .transform((v) => v.replaceAll(',', ''))
  .refine(
    (v) => Number(v) !== 0 && Math.abs(Number(v)) <= 999999999999.99,
    'Enter a non-zero amount',
  )
export const withdrawalSchema = z
  .object({
    kind: z.enum(['advance', 'direct_expense']),
    account_id: z.string().min(1, 'Choose an account'),
    amount: amountSchema,
    purpose: z
      .string()
      .trim()
      .min(3, 'Enter a purpose of at least 3 characters')
      .max(1000),
    category_id: z.string().min(1, 'Choose a category'),
    recipient_id: z.string(),
    rate: z.string(),
  })
  .superRefine((v, ctx) => {
    if (
      v.kind === 'advance' &&
      !z.string().uuid().safeParse(v.recipient_id).success
    )
      ctx.addIssue({
        code: 'custom',
        path: ['recipient_id'],
        message: 'Choose a recipient',
      })
    if (v.rate && !rateSchema.safeParse(v.rate).success)
      ctx.addIssue({
        code: 'custom',
        path: ['rate'],
        message: 'Enter a positive rate with at most 6 decimals',
      })
  })
export type WithdrawalValues = z.infer<typeof withdrawalSchema>
export const actions = z.enum([
  'withdraw',
  'decide',
  'transfer',
  'adjust',
  'reverse',
  'rate',
  'limit',
])
export type MoneyAction = z.infer<typeof actions>
export const attemptSchema = z.object({
  action: actions,
  request_id: z.string().uuid(),
  payload: z.record(z.string(), z.json()),
})
export type MoneyAttempt = z.infer<typeof attemptSchema>
export function withdrawalPayload(v: WithdrawalValues) {
  return {
    kind: v.kind,
    account_id: Number(v.account_id),
    amount: v.amount,
    purpose: v.purpose,
    category_id: Number(v.category_id),
    ...(v.kind === 'advance' ? { recipient_id: v.recipient_id } : {}),
    ...(v.rate ? { rate: v.rate } : {}),
  }
}
export const balanceSchema = z.object({
  id: z.number(),
  name: z.string(),
  currency: currencySchema,
  balance: z.number(),
  balance_try_estimate: z.number().nullable(),
})
export type Balance = z.infer<typeof balanceSchema>
export const withdrawalQuoteSchema = z.object({
  business_date: z.string(),
  quote_token: z.string(),
  currency: currencySchema,
  account_name: z.string(),
  amount: z.number(),
  amount_try: z.number(),
  rate_to_try: z.number(),
  balance_before: z.number(),
  balance_after: z.number(),
  balance_if_approved: z.number(),
  needs_approval: z.boolean(),
})
export const transferSchema = z
  .object({
    from_account: z.string().min(1, 'Choose source'),
    to_account: z.string().min(1, 'Choose destination'),
    amount_from: amountSchema,
    amount_to: amountSchema,
    note: z.string().trim().max(1000),
  })
  .refine((v) => v.from_account !== v.to_account, {
    path: ['to_account'],
    message: 'Choose two different accounts',
  })
export const adjustmentSchema = z
  .object({
    account_id: z.string().min(1, 'Choose an account'),
    amount: signedAmountSchema,
    reason: z
      .string()
      .trim()
      .min(3, 'Enter a reason of at least 3 characters')
      .max(1000),
    rate: z.string(),
  })
  .refine((v) => !v.rate || rateSchema.safeParse(v.rate).success, {
    path: ['rate'],
    message: 'Enter a positive rate with at most 6 decimals',
  })
export const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Enter a reason of at least 3 characters')
    .max(1000),
})
export const typeNames = {
  advance: 'Advance for supplies',
  direct_expense: 'Direct expense',
}
export const statusNames = {
  pending_approval: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  reversed: 'Reversed',
}
export const entryNames: Record<string, string> = {
  order_payment: 'Order payment',
  refund: 'Refund',
  advance: 'Advance',
  advance_topup: 'Advance reimbursement',
  direct_expense: 'Direct expense',
  purchase_direct: 'Supply purchase',
  change_returned: 'Change returned',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  opening_balance: 'Opening balance',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
  debt_out: 'Debt payment / loan given',
  debt_in: 'Debt collection / loan received',
}

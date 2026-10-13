import { z } from 'zod'
import { currencySchema } from '@/features/money/money-model'
export const countedSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\d+(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)$/,
    'Enter 0 or more with at most 2 decimals',
  )
  .transform((v) => v.replaceAll(',', ''))
  .refine((v) => Number(v) <= 999999999999.99, 'Enter a valid counted amount')
export const closeContextSchema = z.object({
  business_date: z.iso.date(),
  current_business_date: z.iso.date(),
  account_id: z.number().int(),
  account_name: z.string(),
  currency: currencySchema,
  opening: z.number().finite(),
  expected: z.number().finite(),
  can_close: z.boolean(),
  current_close_id: z.number().nullable(),
  lines: z.array(
    z.object({ entry_type: z.string(), amount: z.number().finite() }),
  ),
  unpaid_orders: z.array(
    z.object({
      id: z.uuid(),
      business_date: z.iso.date(),
      daily_number: z.number(),
      customer_name: z.string().nullable(),
      balance_due: z.number().finite(),
    }),
  ),
  advances: z.array(
    z.object({
      id: z.uuid(),
      business_date: z.iso.date(),
      recipient_name: z.string(),
      purpose: z.string(),
      remaining: z.number().finite(),
      state: z.enum(['open', 'owed_to_staff']),
      currency: currencySchema,
    }),
  ),
})
export const closeQuoteSchema = closeContextSchema.extend({
  counted: z.number().finite(),
  difference: z.number().finite(),
  quote_token: z.string().length(64),
})
export const savedCloseSchema = z.object({
  id: z.number().int(),
  business_date: z.iso.date(),
  account_id: z.number(),
  expected_amount: z.number().finite(),
  counted_amount: z.number().finite(),
  difference: z.number().finite(),
  unpaid_orders: z.number(),
  open_advances: z.number(),
  note: z.string().nullable(),
  closed_by: z.uuid(),
  closed_at: z.string(),
  superseded: z.boolean(),
  details: closeContextSchema
    .extend({ counted: z.number(), difference: z.number() })
    .nullable(),
})
export const historyCloseSchema = savedCloseSchema.extend({
  account_name: z.string(),
  currency: currencySchema,
  closed_by_name: z.string(),
})
export const closeAttemptSchema = z.object({
  request_id: z.uuid(),
  payload: z.object({
    counted: countedSchema,
    date: z.iso.date(),
    account_id: z.number().int(),
    note: z.string().max(1000),
    quote_token: z.string().length(64),
  }),
})
export type CloseAttempt = z.infer<typeof closeAttemptSchema>
export type CloseContext = z.infer<typeof closeContextSchema>
export type SavedClose = z.infer<typeof savedCloseSchema>
export const cashLineNames: Record<string, string> = {
  order_payment: 'Cash payments',
  refund: 'Cash refunds',
  advance: 'Advances taken out',
  advance_topup: 'Advance reimbursements',
  direct_expense: 'Cash expenses',
  purchase_direct: 'Supplies paid from Cash',
  change_returned: 'Change returned',
  transfer_out: 'Transfers out',
  transfer_in: 'Transfers in',
  opening_balance: 'Opening balance entered today',
  adjustment: 'Adjustments',
  reversal: 'Reversals',
  debt_out: 'Debt payments / loans given',
  debt_in: 'Debt collections / loans received',
}
export function differenceLabel(n: number) {
  return n < 0 ? 'Short' : n > 0 ? 'Over' : 'Balanced'
}

export function financialWritesBlocked(
  role: string | undefined,
  closed: boolean | undefined,
  error: boolean,
) {
  return role !== 'admin' && (closed !== false || error)
}

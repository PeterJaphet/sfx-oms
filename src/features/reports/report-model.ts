import { z } from 'zod'
import { formatMoney, type Currency } from '@/lib/format'
export const rangeSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((v) => v.from <= v.to, 'Choose a valid date range')
export type Range = z.infer<typeof rangeSchema>
export const periodsSchema = z.object({
  business_date: z.iso.date(),
  today: rangeSchema,
  week: rangeSchema,
  last_week: rangeSchema,
  month: rangeSchema,
})
export const rowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
)
export const reportSchema = z.object({
  report: z.string(),
  scope: z.enum(['period', 'current']).default('period'),
  from: z.iso.date(),
  to: z.iso.date(),
  business_date: z.iso.date(),
  generated_at: z.string(),
  previous_from: z.iso.date(),
  previous_to: z.iso.date(),
  summary: z.record(z.string(), z.unknown()),
  rows: z.array(rowSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
})
export type Report = z.infer<typeof reportSchema>
export type ReportRow = z.infer<typeof rowSchema>
export type Column = {
  key: string
  label: string
  kind?: 'money' | 'number' | 'ratio' | 'boolean' | 'date' | 'time'
  currencyKey?: string
}
export type ReportDefinition = {
  name: string
  title: string
  note: string
  columns: Column[]
  current?: boolean
}
const c = (
  key: string,
  label: string,
  kind?: Column['kind'],
  currencyKey?: string,
): Column => ({ key, label, kind, currencyKey })
const money = (key: string, label: string, currencyKey?: string) =>
  c(key, label, 'money', currencyKey)
const qty = (key: string, label: string) => c(key, label, 'number')
const date = c('business_date', 'Business date', 'date')
const expCols = [
  date,
  c('description', 'Supplier / purpose'),
  c('category', 'Category'),
  c('kind', 'Kind'),
  c('staff', 'Staff'),
  money('amount_try', 'Cost (TRY)'),
]
const advanceCols = [
  date,
  c('recipient_name', 'Staff'),
  c('purpose', 'Purpose'),
  c('currency', 'Currency'),
  money('amount', 'Given', 'currency'),
  money('spent', 'Spent', 'currency'),
  money('change_returned', 'Returned', 'currency'),
  money('remaining', 'Remaining / owed', 'currency'),
  c('state', 'State'),
  qty('age_days', 'Age (days)'),
]
export const definitions: ReportDefinition[] = [
  {
    name: 'sales',
    title: 'Sales summary',
    note: 'Paid and unpaid sales; cancelled orders excluded. Average order value is calculated by the database.',
    columns: [
      date,
      qty('orders', 'Orders'),
      qty('cancelled_orders', 'Cancelled'),
      money('gross_sales', 'Gross sales'),
      money('discounts', 'Discounts'),
      money('net_revenue', 'Revenue'),
      money('average_order', 'Average order'),
    ],
  },
  {
    name: 'pnl',
    title: 'Purchase-based P&L',
    note: 'Accounting view of purchases and recorded expenses, not recipe consumption. For recipe-based gross and net estimates, use Overview. Advances, debt money and transfers do not affect profit.',
    columns: [
      c('metric', 'Metric'),
      money('amount', 'Amount / margin', 'unit'),
    ],
  },
  {
    name: 'items',
    title: 'Items sold',
    note: 'Prices at sale. Extras on plates are included in the item revenue. Previous figures cover the same number of days immediately before this period.',
    columns: [
      c('product_name', 'Item'),
      c('variant_name', 'Variant'),
      c('category_name', 'Category'),
      qty('quantity', 'Sold'),
      money('revenue', 'Revenue before order discounts'),
      qty('previous_quantity', 'Previous sold'),
      money('previous_revenue', 'Previous revenue'),
    ],
  },
  {
    name: 'item_categories',
    title: 'Items by category',
    note: 'Category totals from the same item price snapshots, before order discounts.',
    columns: [
      c('category_name', 'Category'),
      qty('quantity', 'Sold'),
      money('revenue', 'Revenue before order discounts'),
    ],
  },
  {
    name: 'extras',
    title: 'Extras sold',
    note: 'On a plate and sold on their own, counted together and separately. Do not add extras revenue again to total item revenue.',
    columns: [
      c('extra_name', 'Extra'),
      qty('on_plate', 'On a plate'),
      qty('standalone', 'On its own'),
      qty('quantity', 'Total sold'),
      money('revenue', 'Revenue before order discounts'),
    ],
  },
  {
    name: 'payments',
    title: 'Payments by account',
    note: 'Money collected, net of refunds/reversals, by payment business date. This differs from sales recorded when orders were placed.',
    columns: [
      c('account', 'Account'),
      c('currency', 'Currency'),
      money('amount', 'Net received', 'currency'),
      money('amount_try', 'TRY value at recorded rates'),
    ],
  },
  ...[
    ['channels', 'Sales by channel', 'channel', 'Channel'],
    ['types', 'Sales by order type', 'order_type', 'Order type'],
    ['hours', 'Sales by hour', 'hour', 'Hour (Nicosia)'],
    ['weekdays', 'Sales by weekday', 'weekday', 'Business weekday'],
  ].map(([name, title, key, label]) => ({
    name,
    title,
    note: 'Order-time sales from uncancelled orders. Late-night orders stay on their recorded business date.',
    columns: [
      c(key, label),
      qty('orders', 'Orders'),
      money('net_revenue', 'Revenue'),
    ],
  })),
  {
    name: 'expenses',
    title: 'Expenses by category',
    note: 'Actual purchases and approved direct expenses; reversed entries excluded.',
    columns: [
      c('category', 'Category'),
      c('kind', 'Kind'),
      qty('entries', 'Entries'),
      money('amount_try', 'Cost (TRY)'),
    ],
  },
  {
    name: 'suppliers',
    title: 'Expenses by supplier',
    note: 'Supply purchases only; direct expense purposes are not supplier names.',
    columns: [
      c('supplier', 'Supplier'),
      qty('purchases', 'Purchases'),
      money('amount_try', 'Cost (TRY)'),
    ],
  },
  {
    name: 'expense_staff',
    title: 'Expenses by staff',
    note: 'Who logged the purchase or requested the direct expense.',
    columns: [
      c('staff', 'Staff'),
      qty('entries', 'Entries'),
      money('amount_try', 'Cost (TRY)'),
    ],
  },
  {
    name: 'expense_details',
    title: 'Expense entries',
    note: 'Underlying entries from the expense view for this period.',
    columns: expCols,
  },
  {
    name: 'accounts',
    title: 'Account movements',
    note: 'Opening is before the selected range; In, Out and Closing use the ledger in each account’s currency. Includes inactive historical accounts.',
    columns: [
      c('name', 'Account'),
      c('currency', 'Currency'),
      c('is_active', 'Active', 'boolean'),
      money('opening', 'Opening', 'currency'),
      money('money_in', 'In', 'currency'),
      money('money_out', 'Out', 'currency'),
      money('closing', 'Closing', 'currency'),
    ],
  },
  {
    name: 'debts',
    title: 'Debts outstanding now',
    current: true,
    note: 'Current open debts, independent of the selected period. TRY estimates use the latest default rates; missing rates remain unavailable. Customer balances are in a separate report.',
    columns: [
      c('direction', 'Direction'),
      c('counterparty', 'Who'),
      c('description', 'What for'),
      c('currency', 'Currency'),
      money('outstanding', 'Outstanding now', 'currency'),
      money('outstanding_try_estimate', 'TRY estimate now'),
      c('due_date', 'Due date', 'date'),
      c('is_overdue', 'Overdue', 'boolean'),
    ],
  },
  {
    name: 'unpaid',
    title: 'Customer balances due now',
    current: true,
    note: 'Every uncancelled customer order with a balance still due, including earlier business dates. Current amounts, independent of the selected period.',
    columns: [
      date,
      qty('daily_number', 'Order number'),
      c('customer_name', 'Customer'),
      money('total', 'Order total'),
      money('paid_try', 'Paid'),
      money('balance_due', 'Due now (TRY)'),
    ],
  },
  {
    name: 'advances',
    title: 'Advances outstanding now',
    current: true,
    note: 'Current open advances and amounts owed to staff, independent of the selected period. Negative remaining means staff are owed; amounts stay in the advance currency.',
    columns: advanceCols,
  },
  {
    name: 'closes',
    title: 'Daily closes',
    note: 'Includes earlier closes preserved when Admin re-closes a day.',
    columns: [
      date,
      c('account', 'Account'),
      money('expected_amount', 'Expected'),
      money('counted_amount', 'Counted'),
      money('difference', 'Difference'),
      c('superseded', 'Earlier close', 'boolean'),
      c('staff', 'Staff'),
      c('note', 'Note'),
    ],
  },
  {
    name: 'logistics_purchases',
    title: 'Logistics purchases',
    note: 'Purchases logged during the selected business dates.',
    columns: expCols,
  },
  {
    name: 'logistics_advances',
    title: 'Advances given in period',
    note: 'Advances created during the selected dates, with their current accounting state.',
    columns: advanceCols,
  },
  {
    name: 'deliveries',
    title: 'Logistics deliveries',
    note: 'Orders picked up for delivery; business date is the order date. Times shown in Europe/Nicosia. Delivery duration runs from pickup to completion.',
    columns: [
      date,
      qty('daily_number', 'Order number'),
      c('staff', 'Staff'),
      c('status', 'Status'),
      c('ready_at', 'Ready', 'time'),
      c('picked_up_at', 'Picked up', 'time'),
      c('completed_at', 'Delivered', 'time'),
      qty('waiting_minutes', 'Wait (minutes)'),
      qty('delivery_minutes', 'Delivery (minutes)'),
    ],
  },
]
export const periods = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['last_week', 'Last week'],
  ['month', 'This month'],
  ['custom', 'Custom'],
] as const
export const dashboardSchema = z.object({
  sales: reportSchema,
  pnl: reportSchema,
  items: reportSchema,
  expenses: reportSchema,
  operational_fixed: z.number().finite(),
  balances: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      currency: z.enum(['TRY', 'USD', 'NGN']),
      balance: z.number().finite(),
      balance_try_estimate: z.number().finite().nullable(),
    }),
  ),
  balance_try_estimate: z.number().finite(),
  missing_balance_rates: z.number(),
  debts: z.object({
    we_owe: z.number(),
    owed_to_us: z.number(),
    missing_owe_rates: z.number(),
    missing_owed_rates: z.number(),
  }),
  needs: z.object({
    pending_approvals: z.number().optional(),
    close: z
      .object({
        business_date: z.iso.date(),
        difference: z.number(),
        note: z.string().nullable(),
      })
      .nullable(),
    advances: z.array(
      z.object({
        recipient_name: z.string(),
        purpose: z.string(),
        remaining: z.number(),
        currency: z.enum(['TRY', 'USD', 'NGN']),
        age_days: z.number(),
      }),
    ),
  }),
})
const labels: Record<string, string> = {
  walk_in: 'Walk-in',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  phone: 'Phone',
  delivery_app: 'Delivery app',
  event: 'Event',
  pickup: 'Pickup',
  delivery: 'Delivery',
  dine_in: 'Dine-in',
  cogs: 'Cost of goods',
  operational: 'Operational',
  fixed: 'Fixed',
  we_owe: 'We owe',
  owed_to_us: 'Owed to us',
  open: 'Open',
  owed_to_staff: 'Owed to staff',
  accounted: 'Accounted',
  pending_approval: 'Pending approval',
}
export function displayCell(row: ReportRow, column: Column): string {
  const v = row[column.key]
  if (v === null || v === undefined) return '—'
  if (column.kind === 'money') {
    const cur = column.currencyKey ? row[column.currencyKey] : 'TRY'
    if (cur === 'ratio')
      return `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(Number(v) * 100)}%`
    if (!['TRY', 'USD', 'NGN'].includes(String(cur)))
      throw new Error('Report currency is unavailable')
    return formatMoney(String(v), cur as Currency)
  }
  if (column.kind === 'boolean') return v ? 'Yes' : 'No'
  if (column.kind === 'number')
    return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(
      Number(v),
    )
  if (column.kind === 'time')
    return new Date(String(v)).toLocaleString('en-GB', {
      timeZone: 'Europe/Nicosia',
    })
  if (column.key === 'weekday')
    return (
      [
        '',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ][Number(v)] ?? String(v)
    )
  if (column.key === 'hour') return `${String(v).padStart(2, '0')}:00`
  return labels[String(v)] ?? String(v)
}
export function findDefinition(name: string) {
  return definitions.find((d) => d.name === name)
}

export const recipeReportSchema = z.object({
  revenue: z.number(),
  cogs: z.number().nullable(),
  gross_profit: z.number().nullable(),
  net_profit: z.number().nullable(),
  operational: z.number().nullable(),
  fixed: z.number().nullable(),
  orders: z.number(),
  missing: z.array(z.string()),
  missing_gross: z.number(),
  missing_net: z.number(),
  reconstructed: z.number(),
  rows: z
    .array(
      z.object({
        id: z.string(),
        business_date: z.string(),
        daily_number: z.number(),
        revenue: z.number(),
        gross_profit: z.number().nullable(),
        net_profit: z.number().nullable(),
        reconstructed: z.boolean(),
        missing: z.array(z.string()),
      }),
    )
    .default([]),
})
export const workspaceSchema = dashboardSchema.extend({
  accounting_expenses: z.number(),
  recipe_profit: recipeReportSchema,
  extras: reportSchema,
  sfx_needs_transition: z.boolean().optional(),
  turkey: z.object({
    quantity: z.number(),
    standalone: z.number(),
    on_plate: z.number(),
    rows: z.array(
      z.object({
        id: z.string(),
        business_date: z.string(),
        daily_number: z.number(),
        product_name: z.string(),
        source: z.string(),
        quantity: z.number(),
      }),
    ),
  }),
})

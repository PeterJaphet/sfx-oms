import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { client } from '@/features/menu/menu-api'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FieldError, Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { useMoney } from './money-context'
import {
  adjustmentSchema,
  transferSchema,
  rateSchema,
  reasonSchema,
} from './money-model'
import { amountSchema, formatRate } from '@/features/orders/order-model'

function FormNotice({ error }: { error?: string }) {
  const money = useMoney()
  return (
    <>
      {money.pending ? (
        <p
          role="alert"
          className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink"
        >
          Confirmation pending. Close this form and use Retry money confirmation
          on the Money page.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="break-words text-brand-strong">
          {error}
        </p>
      ) : null}
    </>
  )
}
const selectClass =
  'h-12 w-full rounded-lg border border-line-strong bg-card px-3'
export function TransferForm({ onSaved }: { onSaved: () => void }) {
  const money = useMoney()
  const data = money.reference.data!
  const [error, setError] = useState<string>()
  const form = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_account: '1',
      to_account: '2',
      amount_from: '',
      amount_to: '',
      note: '',
    },
  })
  const from = data.accounts.find(
    (a) => String(a.id) === form.watch('from_account'),
  )
  const to = data.accounts.find(
    (a) => String(a.id) === form.watch('to_account'),
  )
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(undefined)
        try {
          await money.send('transfer', {
            ...v,
            from_account: Number(v.from_account),
            to_account: Number(v.to_account),
          })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      <p className="text-sm text-muted">
        Enter what leaves the source and what arrives in the destination, each
        in its own currency. Same-currency amounts must match. The database
        records the rates and moves both sides together.
      </p>
      <fieldset disabled={money.busy || !!money.pending} className="space-y-4">
        {(['from_account', 'to_account'] as const).map((name) => (
          <div key={name}>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor={`transfer-${name}`}
            >
              {name === 'from_account' ? 'From account' : 'To account'}
            </label>
            <select
              id={`transfer-${name}`}
              className={selectClass}
              aria-describedby={`transfer-${name}-error`}
              {...form.register(name)}
            >
              {data.accounts
                .filter((a) => a.is_active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
            </select>
            <FieldError
              id={`transfer-${name}-error`}
              message={form.formState.errors[name]?.message}
            />
          </div>
        ))}
        {(
          [
            ['amount_from', from, 'Amount sent'],
            ['amount_to', to, 'Amount received'],
          ] as const
        ).map(([name, account, label]) => (
          <div key={name}>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor={`transfer-${name}`}
            >
              {label} ({account?.currency})
            </label>
            <Input
              id={`transfer-${name}`}
              inputMode="decimal"
              aria-describedby={`transfer-${name}-error`}
              {...form.register(name)}
            />
            <FieldError
              id={`transfer-${name}-error`}
              message={form.formState.errors[name]?.message}
            />
          </div>
        ))}
        <label className="block text-sm font-semibold" htmlFor="transfer-note">
          Note (optional)
        </label>
        <Input id="transfer-note" {...form.register('note')} />
        <FieldError
          id="transfer-note-error"
          message={form.formState.errors.note?.message}
        />
      </fieldset>
      {from && data.balances.find((b) => b.id === from.id) ? (
        <p className="text-sm text-muted">
          Current source balance:{' '}
          {formatMoney(
            data.balances.find((b) => b.id === from.id)!.balance,
            from.currency,
          )}
          {from.currency !== 'TRY'
            ? ` · source rate ${data.rates.find((r) => r.currency === from.currency) ? `₺${formatRate(data.rates.find((r) => r.currency === from.currency)!.rate_to_try)}` : 'not set'}`
            : ''}
        </p>
      ) : null}
      <FormNotice error={error} />
      <Button requiresOnline
        className="w-full"
        type="submit"
        disabled={money.busy || !!money.pending}
      >
        Transfer money
      </Button>
    </form>
  )
}
export function AdjustmentForm({ onSaved }: { onSaved: () => void }) {
  const money = useMoney()
  const data = money.reference.data!
  const [error, setError] = useState<string>()
  const form = useForm<z.infer<typeof adjustmentSchema>>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { account_id: '1', amount: '', reason: '', rate: '' },
  })
  const account = data.accounts.find(
    (a) => String(a.id) === form.watch('account_id'),
  )
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(undefined)
        try {
          await money.send('adjust', {
            ...v,
            account_id: Number(v.account_id),
            rate: v.rate || undefined,
          })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      <p className="text-sm text-muted">
        Positive adds money; negative subtracts it. Every adjustment needs a
        reason. Opening balances are entered during M7 go-live setup.
      </p>
      <fieldset disabled={money.busy || !!money.pending} className="space-y-4">
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="adjust-account"
          >
            Account
          </label>
          <select
            id="adjust-account"
            className={selectClass}
            {...form.register('account_id')}
          >
            {data.accounts
              .filter((a) => a.is_active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="adjust-amount"
          >
            Adjustment amount ({account?.currency})
          </label>
          <Input
            id="adjust-amount"
            inputMode="text"
            aria-describedby="adjust-amount-error"
            {...form.register('amount')}
          />
          <FieldError
            id="adjust-amount-error"
            message={form.formState.errors.amount?.message}
          />
        </div>
        {account?.currency !== 'TRY' ? (
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="adjust-rate"
            >
              Rate to lira (optional)
            </label>
            <Input
              id="adjust-rate"
              placeholder="Use latest Admin default"
              inputMode="decimal"
              {...form.register('rate')}
            />
            <FieldError
              id="adjust-rate-error"
              message={form.formState.errors.rate?.message}
            />
          </div>
        ) : null}
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="adjust-reason"
          >
            Reason
          </label>
          <Input
            id="adjust-reason"
            aria-describedby="adjust-reason-error"
            {...form.register('reason')}
          />
          <FieldError
            id="adjust-reason-error"
            message={form.formState.errors.reason?.message}
          />
        </div>
      </fieldset>
      <FormNotice error={error} />
      <Button requiresOnline
        className="w-full"
        type="submit"
        disabled={money.busy || !!money.pending}
      >
        Post adjustment
      </Button>
    </form>
  )
}
export function ReversalForm({
  entryId,
  onSaved,
}: {
  entryId: number
  onSaved: () => void
}) {
  const money = useMoney()
  const [error, setError] = useState<string>()
  const form = useForm<z.infer<typeof reasonSchema>>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: '' },
  })
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(undefined)
        try {
          await money.send('reverse', { entry_id: entryId, ...v })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      <p className="rounded-xl bg-amber-soft p-4 text-sm text-amber-ink">
        This posts an opposite entry for ledger entry #{entryId}; the original
        stays in history. For a transfer, review both account entries because
        this reverses only the selected entry.
      </p>
      <div>
        <label
          className="mb-2 block text-sm font-semibold"
          htmlFor="reversal-reason"
        >
          Reason
        </label>
        <Input
          id="reversal-reason"
          disabled={money.busy || !!money.pending}
          aria-describedby="reversal-error"
          {...form.register('reason')}
        />
        <FieldError
          id="reversal-error"
          message={form.formState.errors.reason?.message}
        />
      </div>
      <FormNotice error={error} />
      <Button requiresOnline
        className="w-full"
        type="submit"
        disabled={money.busy || !!money.pending}
      >
        Reverse entry
      </Button>
    </form>
  )
}
const defaultRateSchema = z.object({
  currency: z.enum(["USD", "NGN"]),
  rate: rateSchema,
});
export function RateForm({ onSaved }: { onSaved: () => void }) {
  const money = useMoney();
  const data = money.reference.data!;
  const [error, setError] = useState<string>();
  const [direction, setDirection] = useState<"try_per_unit" | "units_per_try">(
    "try_per_unit",
  );
  const form = useForm<z.infer<typeof defaultRateSchema>>({
    resolver: zodResolver(defaultRateSchema),
    defaultValues: { currency: "USD", rate: "" },
  });
  const currency = form.watch("currency");
  const rate = form.watch("rate");
  const valid = rateSchema.safeParse(rate).success;
  const quote = useQuery({
    queryKey: ["money", "markup-preview", currency, rate, direction],
    enabled: valid,
    retry: false,
    queryFn: async () => {
      const result = await client().rpc("quote_marked_up_rate", {
        p_currency: currency,
        p_source_rate: Number(rate),
        p_direction: direction,
      });
      if (result.error) throw new Error(result.error.message);
      return z
        .object({ rate_to_try: z.string(), customer_units_per_try: z.string() })
        .parse(result.data);
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        if (!quote.data || quote.isFetching || quote.isError) return;
        setError(undefined);
        try {
          await money.send("rate", {
            currency: v.currency,
            rate: quote.data.rate_to_try,
            source_rate: v.rate,
            source_direction: direction,
            source_url: "https://www.sfxchange.co/rate",
            markup_percent: 2,
          });
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        }
      })}
    >
      <p className="text-sm text-muted">
        Set Naira → TL or USD → TL for business day {data.day}. Existing orders
        and ledger entries keep their saved conversion.
      </p>
      <a
        className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline"
        href="https://www.sfxchange.co/rate"
        target="_blank"
        rel="noreferrer"
      >
        Open SFXchange rates
      </a>
      <p className="text-sm text-muted">
        Enter the conversion rate shown by SFXchange for exchanging the
        customer's currency into TL. Rates are entered manually; they are not
        automatically refreshed.
      </p>
      <fieldset disabled={money.busy || !!money.pending} className="space-y-4">
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="rate-currency"
          >
            Customer pays in
          </label>
          <select
            id="rate-currency"
            className={selectClass}
            value={currency}
            onChange={(e) => {
              form.setValue("currency", e.target.value as "USD" | "NGN");
              form.setValue("rate", "");
            }}
          >
            <option value="USD">USD · $ → TL</option>
            <option value="NGN">Naira · ₦ → TL</option>
          </select>
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="rate-direction"
          >
            SFXchange rate is quoted as
          </label>
          <select
            id="rate-direction"
            className={selectClass}
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as typeof direction);
              form.setValue("rate", "");
            }}
          >
            <option value="try_per_unit">TL per 1 {currency}</option>
            <option value="units_per_try">{currency} per 1 TL</option>
          </select>
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-semibold"
            htmlFor="default-rate"
          >
            SFXchange source rate (
            {direction === "try_per_unit"
              ? `TL per 1 ${currency}`
              : `${currency} per 1 TL`}
            )
          </label>
          <Input
            id="default-rate"
            inputMode="decimal"
            aria-describedby="rate-error"
            {...form.register("rate")}
          />
          <FieldError
            id="rate-error"
            message={form.formState.errors.rate?.message}
          />
        </div>
      </fieldset>
      <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
        2% markup: customers pay 2% more {currency} for the same TL bill. The
        markup is already included in the saved rate.
      </p>
      {quote.data && valid ? (
        <p
          role="status"
          className="rounded-xl border border-line p-3 font-semibold"
        >
          Customer rate: 1 TL = {quote.data.customer_units_per_try} {currency}
          <br />
          Saved default: 1 {currency} = {quote.data.rate_to_try} TL
        </p>
      ) : null}
      {quote.error ? (
        <p role="alert" className="text-brand-strong">
          {quote.error.message}
        </p>
      ) : null}
      <FormNotice error={error} />
      <Button
        requiresOnline
        className="w-full"
        type="submit"
        disabled={
          money.busy ||
          !!money.pending ||
          !valid ||
          !quote.data ||
          quote.isFetching ||
          quote.isError
        }
      >
        Save rate with 2% markup
      </Button>
    </form>
  );
}
const limitSchema = z
  .object({ enabled: z.boolean(), limit: z.string() })
  .superRefine((v, ctx) => {
    if (v.enabled && !amountSchema.safeParse(v.limit).success)
      ctx.addIssue({
        code: 'custom',
        path: ['limit'],
        message: 'Enter a positive approval limit with at most 2 decimals',
      })
  })
export function LimitForm({ onSaved }: { onSaved: () => void }) {
  const money = useMoney()
  const limit = money.reference.data!.settings.withdrawal_approval_limit_try
  const [error, setError] = useState<string>()
  const form = useForm<z.infer<typeof limitSchema>>({
    resolver: zodResolver(limitSchema),
    defaultValues: { enabled: limit !== null, limit: String(limit ?? '') },
  })
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(undefined)
        try {
          await money.send('limit', {
            limit: v.enabled ? amountSchema.parse(v.limit) : null,
          })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      <fieldset disabled={money.busy || !!money.pending} className="space-y-4">
        <label className="flex min-h-11 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand"
            {...form.register('enabled')}
          />
          Require approval above a limit
        </label>
        {form.watch('enabled') ? (
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="approval-limit"
            >
              Approval limit (₺)
            </label>
            <Input
              id="approval-limit"
              inputMode="decimal"
              aria-describedby="approval-limit-error"
              {...form.register('limit')}
            />
            <FieldError
              id="approval-limit-error"
              message={form.formState.errors.limit?.message}
            />
            <p className="mt-2 text-sm text-muted">
              Operations withdrawals above this TRY value wait for Admin. Admin
              withdrawals are immediate.
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-amber-soft p-4 text-sm text-amber-ink">
            Approval is disabled: Operations withdrawals can be posted
            immediately, subject to the account balance.
          </p>
        )}
      </fieldset>
      <FormNotice error={error} />
      <Button requiresOnline
        className="w-full"
        type="submit"
        disabled={money.busy || !!money.pending}
      >
        Save approval settings
      </Button>
    </form>
  )
}

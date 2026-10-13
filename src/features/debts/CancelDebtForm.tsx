import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { reasonSchema } from '@/features/money/money-model'
import { Button } from '@/components/ui/button'
import { Input, FieldError } from '@/components/ui/input'
import { useDebt } from './debt-context'
export default function CancelDebtForm({
  id,
  onSaved,
}: {
  id: string
  onSaved: () => void
}) {
  const state = useDebt()
  const [error, setError] = useState<string>()
  const form = useForm({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: '' },
  })
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(undefined)
        try {
          await state.send('cancel', { debt_id: id, reason: v.reason })
          onSaved()
        } catch (e) {
          setError((e as Error).message)
        }
      })}
    >
      <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">
        Cancellation writes off the debt. Earlier payments, account balances and
        expenses stay recorded; this does not refund a loan.
      </p>
      <label className="block font-semibold" htmlFor="cancel-debt-reason">
        Reason
      </label>
      <Input
        id="cancel-debt-reason"
        disabled={state.busy || !!state.pending}
        {...form.register('reason')}
      />
      <FieldError
        id="cancel-debt-error"
        message={form.formState.errors.reason?.message}
      />
      {error ? (
        <p role="alert" className="text-brand-strong">
          {error}
        </p>
      ) : null}
      <Button
        className="w-full"
        type="submit"
        disabled={state.busy || !!state.pending}
      >
        Cancel debt
      </Button>
    </form>
  )
}

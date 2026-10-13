import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { FieldError, Input } from '@/components/ui/input'
import { itemSchema } from './purchase-model'
export type PurchaseItem = z.infer<typeof itemSchema>
export default function PurchaseItems({
  item,
  onSave,
  onClose,
}: {
  item?: PurchaseItem
  onSave: (item: PurchaseItem) => void
  onClose: () => void
}) {
  const form = useForm<PurchaseItem>({
    resolver: zodResolver(itemSchema),
    defaultValues: item ?? {
      description: '',
      quantity: '1',
      unit: 'pcs',
      amount: '',
    },
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={item ? 'Edit item' : 'Add item'}
      description="Enter the total line amount, not a unit price. The database totals all lines."
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(onSave)}>
        {(
          [
            ['description', 'Description'],
            ['quantity', 'Quantity'],
            ['unit', 'Unit (kg, pcs, pack, L)'],
            ['amount', 'Line amount'],
          ] as const
        ).map(([name, label]) => (
          <div key={name}>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor={`purchase-item-${name}`}
            >
              {label}
            </label>
            <Input
              id={`purchase-item-${name}`}
              inputMode={
                name === 'amount' || name === 'quantity' ? 'decimal' : 'text'
              }
              aria-describedby={`purchase-item-${name}-error`}
              {...form.register(name)}
            />
            <FieldError
              id={`purchase-item-${name}-error`}
              message={form.formState.errors[name]?.message}
            />
          </div>
        ))}
        <Button type="submit" className="w-full">
          Save item
        </Button>
      </form>
    </Sheet>
  )
}

import { Button } from '@/components/ui/button'
import { FieldError, Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'

export function ExtraQuantityPicker({ id, name, price, quantity, error, onChange }: {
  id: string; name: string; price?: number; quantity: number; error?: string; onChange: (quantity: number) => void
}) {
  const inputId = `extra-${id}`, errorId = `${inputId}-error`
  return <div className="border-b py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex-1"><label htmlFor={inputId} className="block break-words text-sm font-semibold">{name}</label>{price !== undefined ? <p className="text-xs text-muted">{formatMoney(price, 'TRY')} each</p> : <p className="text-xs text-brand-strong">Remove this unavailable extra to continue.</p>}</div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="secondary" size="secondary" className="w-11 px-0" aria-label={`Decrease ${name} quantity`} disabled={quantity <= 0} onClick={() => onChange(Number.isFinite(quantity) ? Math.max(0, quantity - 1) : 0)}>−</Button>
        <Input id={inputId} aria-label={`${name} quantity`} className="w-16 px-1 text-center" type="number" inputMode="numeric" min={0} max={999} step={1} value={Number.isFinite(quantity) ? quantity : ''} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
        <Button variant="secondary" size="secondary" className="w-11 px-0" aria-label={`Increase ${name} quantity`} disabled={quantity >= 999 || price === undefined} onClick={() => onChange(Number.isFinite(quantity) ? quantity + 1 : 1)}>+</Button>
      </div>
    </div><FieldError id={errorId} message={error} />
  </div>
}

import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('h-12 w-full rounded-lg border border-line-strong bg-card px-3 text-base text-ink placeholder:text-muted disabled:opacity-50 aria-[invalid=true]:border-brand-strong', className)} {...props} />
))
Input.displayName = 'Input'
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="mt-1 text-sm text-brand-strong">{message}</p> : null
}

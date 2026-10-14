import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { useOnline } from '@/lib/use-online'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-heading text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-strong disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand text-card hover:bg-brand-strong hover:text-card',
        secondary: 'border border-line-strong bg-card text-ink hover:bg-chip hover:text-ink',
      },
      size: { default: 'h-[52px] px-5', secondary: 'h-11 px-4' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  requiresOnline?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, requiresOnline = false, type, disabled, ...props }, ref) => {
    const online = useOnline()
    const Component = asChild ? Slot : 'button'
    return <Component className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || (requiresOnline && !online)} type={asChild ? undefined : (type ?? 'button')} {...props} />
  },
)
Button.displayName = 'Button'

export { Button }

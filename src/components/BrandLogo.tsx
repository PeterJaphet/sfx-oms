import { cn } from '@/lib/utils'

/** The supplied logo artwork, fitted proportionally; the mark uses its original burger paths. */
export function BrandLogo({ variant = 'primary', decorative = false, className }: {
  variant?: 'primary' | 'white' | 'black' | 'mark'; decorative?: boolean; className?: string
}) {
  const mark = variant === 'mark'
  return <img src={mark ? '/brand/burger-mark.svg' : `/brand/logo-${variant}.svg`} alt={decorative ? '' : 'SFx Burger'}
    width={mark ? 124 : 263} height={mark ? 88 : 107} draggable={false}
    className={cn('block h-auto shrink-0 object-contain', mark ? 'w-11' : 'w-56', className)} />
}

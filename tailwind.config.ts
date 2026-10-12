import type { Config } from 'tailwindcss'

const color = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: color('brand'), strong: color('brand-strong'), deep: color('brand-deep'), soft: color('brand-soft') },
        amber: { DEFAULT: color('amber'), soft: color('amber-soft'), ink: color('amber-ink') },
        ink: { DEFAULT: color('ink'), 2: color('ink-2') },
        muted: color('muted'), 'muted-foreground': color('muted'),
        line: { DEFAULT: color('line'), strong: color('line-strong') },
        chip: color('chip'), ground: color('ground'), card: color('card'),
        ok: { DEFAULT: color('ok'), soft: color('ok-soft') },
        'chart-operational': color('chart-operational'),
        background: color('ground'), foreground: color('ink'),
        primary: { DEFAULT: color('brand'), foreground: color('card') },
        secondary: { DEFAULT: color('chip'), foreground: color('ink') },
        accent: { DEFAULT: color('amber-soft'), foreground: color('amber-ink') },
        destructive: { DEFAULT: color('brand-strong'), foreground: color('card') },
        border: color('line'), input: color('line-strong'), ring: color('brand-strong'),
        'card-foreground': color('ink'), popover: { DEFAULT: color('card'), foreground: color('ink') },
      },
      fontFamily: { sans: ['Archivo', 'system-ui', 'sans-serif'], heading: ['Bricolage Grotesque', 'Archivo', 'sans-serif'] },
      borderRadius: { lg: '12px', md: '10px', sm: '6px', card: '16px' },
    },
  },
  plugins: [],
} satisfies Config

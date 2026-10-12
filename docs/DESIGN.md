# SFx Burger OMS — design reference

The approved screens are in `docs/screens/` (and on the shared design canvas). Match their layout,
wording and colours. They use a custom HTML format: read them for structure, copy and inline styles;
build the real screens with Tailwind + shadcn/ui.

## Colour tokens

Set these once in `tailwind.config` / CSS variables and use the names, never raw hex in components.

| Token | Hex | Use |
| --- | --- | --- |
| `brand` | #D7263D | Primary buttons, active tab, highlighted card border, brand mark |
| `brand-strong` | #B01E31 | Links, red text on white |
| `brand-deep` | #8C1727 | Text on `brand-soft` (shortages, "we owe") |
| `brand-soft` | #FBE3E6 | Shortage and debt backgrounds |
| `amber` | #F4A300 | Accent on dark cards, chart bars |
| `amber-soft` | #FFF1D1 | Warnings: unpaid, needs rate, approval info |
| `amber-ink` | #7A4B00 | Text on `amber-soft` |
| `ink` | #1C1615 | Main text, dark buttons |
| `ink-2` | #4A403C | Secondary text |
| `muted` | #6B605C | Captions, labels |
| `line` | #EDE6E1 | Card borders, dividers |
| `line-strong` | #E2D8D2 | Input borders |
| `chip` | #F3EDE9 | Segmented control background |
| `ground` | #FBF7F4 | Page background |
| `card` | #FFFFFF | Cards, inputs, bars |
| `ok` / `ok-soft` | #1F6B45 / #E3F3EA | Paid, settled, "owed to us" |
| `chart-operational` | #C98500 | Operational costs in charts |

## Type

- Headings, order numbers, wordmark: **Bricolage Grotesque** 700/800 (Google Fonts).
- Everything else: **Archivo** 400/500/600/700.
- Sizes: page title 26 px (phone) / 34 px (desktop); card title 18–20 px; body 15–16 px; captions 12–13 px;
  key amounts 22–30 px bold. Section labels: 12–13 px, uppercase, 0.08em letter-spacing, `muted`.

## Shape and spacing

- Radius: cards 14–16 px, buttons and inputs 10–12 px, chips 18–20 px (pill), badges 6 px.
- Heights: primary buttons 52 px, secondary 44–48 px, inputs 44–56 px, bottom nav 64 px.
- Phone screens: 16 px side padding, 10–16 px gaps. Desktop: max width 1280 px, 24 px padding, 20 px gaps.
- No shadows or gradients; borders separate surfaces.

## Components seen across screens

- **Bottom nav** (phone, per role): Operations — New order, Orders, Money, Close day, Reports.
  Logistics — Deliveries, Log supplies, My advances. Active item `brand`, others `muted`.
- **Chip row**: channel and category filters; selected = filled (`ink` for channel, `brand` for category).
- **Segmented control**: status tabs, period tabs, type toggles (`chip` background, white selected segment).
- **Product card**: 2-column grid, category caption, name, price, red quantity badge when in cart,
  2 px `brand` border when selected. Rice & Soup cards note "+ extras".
- **Sticky action bar**: total on the left, primary button on the right.
- **Status badges**: Paid (`ok`), Unpaid / ₺x due (`amber`), Short / We owe (`brand-soft`).
- **Dark advance card** (logistics): `ink` background, Given / Spent / You hold, amber "Log supplies" button.
- **KPI cards** (admin): white cards, the net profit card filled `brand`.

## Screen map

| Route | Role | Design file | PRD |
| --- | --- | --- | --- |
| `/order` | Operations, Admin | `Main.dc.html` | O-1, O-2, P-3 |
| `/order/pay` | Operations, Admin | `Checkout.dc.html` | O-3, O-4 |
| `/orders` | Operations, Admin | `Orders.dc.html` | O-5, O-6 |
| `/money/withdraw` | Operations, Admin | `Withdraw.dc.html` | M-2 |
| `/close` | Operations, Admin | `DailyClose.dc.html` | C-1 to C-4 |
| `/deliveries` | Logistics, Admin | `Deliveries.dc.html` | L-1 to L-3 |
| `/purchases/new` | Logistics, Admin | `LogPurchase.dc.html` | L-4, L-5 |
| `/dashboard` | Admin (Operations read-only) | `Dashboard.dc.html` | R-1 to R-3 |
| `/setup` and `/debts` | Admin | `Setup.dc.html` | D-1 to D-7 |

Screens without a design yet (menu editor, accounts, approvals, staff, activity log, reports detail,
settings): follow the same components and ask before inventing new patterns.

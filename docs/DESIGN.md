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
| `ink` | #2C2C2C | Main text, dark buttons |
| `ink-2` | #5B4C40 | Secondary text |
| `muted` | #645B50 | Captions, labels |
| `line` | #EBE2D4 | Card borders, dividers |
| `line-strong` | #9B8976 | Input borders |
| `chip` | #F3E9DA | Segmented control background |
| `ground` | #FFF7EB | Page background |
| `card` | #FFFFFF | Cards, inputs, bars |
| `ok` / `ok-soft` | #1F6B45 / #E3F3EA | Paid, settled, "owed to us" |
| `chart-operational` | #C98500 | Operational costs in charts |

## Type

- Headings, order numbers, wordmark: **League Spartan** 600/700/800 (bundled locally).
- Body copy: **Antic** 400 (bundled locally). Controls, labels and emphasis use League Spartan 500–800, rather than synthesizing bold Antic. League Spartan also supplies the currency and Turkish glyphs missing from Antic.
- Sizes: page title 26 px (phone) / 34 px (desktop); card title 18–20 px; body 16 px; secondary copy 15 px; captions 13 px;
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


## M12 extra quantity adjustment

Use `screens/ExtraQuantities.dc.html` as the supporting item-sheet reference, with the existing brand components.
Replace the extras checkboxes with a named extra, price per unit and minus / numeric input / plus controls.
Start each extra at 0; included extras have independent total counts. Show “Extra quantities are totals for this
item line. Changing dish quantity keeps these counts.” Label the main control “Dish quantity”. Buttons are at
least 44px; inputs have labels, numeric keyboards and inline whole-number validation (0–999).
Use “4 × Swallow” in the cart, checkout, saved confirmation, order details, delivery card and receipt.
Read full charged line totals from the database. Historical snapshots display their original total extra counts.


## M13 brand refresh (approved 14 October 2026)

The supplied SFx Burger Mini Brand Identity Design and vector logos are the brand source.
The user resolved the guide's contradictory Poppins/purple references: use League Spartan,
Antic and the primary red/cream/charcoal palette. These rules supersede the older typography
and neutral colours in the original screen references; their workflows and layout remain the reference.

- Use the supplied primary wordmark on login, desktop header, confirmations and PDF reports.
- Use its original burger symbol in the phone header, checkout and install icons. Never redraw,
  recolour, distort or add shadows to the logo. SVG adaptations fit its viewport or isolate
  the existing symbol; original source SVGs are kept in `public/brand/source/`.
- Primary red `#D7263D`, soft cream `#FFF7EB`, charcoal `#2C2C2C`, amber `#F4A300`.
  Green and brown from the logo remain secondary. Dark semantic shades preserve text contrast.
- White cards, warm borders and restrained red active states; no gradients or shadows.
- The phone header keeps sign-out accessible, with Menu/Deliveries tools in a separate wrapping row.
  The bottom navigation preserves the existing role routes and adds a visible selected background.
- Local WOFF2 fonts are preloaded and precached with the brand assets. PDF fonts are local too.
  PDFs use League Spartan for non-ASCII cells to preserve ₺, ₦ and Turkish account names; Archivo remains a fallback for existing special characters absent from the brand faces.
- See `screens/BrandRefresh.dc.html` for the shared login/header/card/form reference.


## M14 costing and profit

Use screens/Costing.dc.html and OrderProfit.dc.html with the M13 brand components. Costing is an Admin workspace tool, also linked from Menu and Reports. Recipes / Weekly plan / History are 44px controls. Recipe cards show full cost per portion, multiplier/yield, published and suggested prices. Edit in a labelled sheet; show database previews and an explicit Apply price sheet. Ingredient rows and weekly fixed costs support additions/removal in the unsaved form; saved records and their history have no delete path.

Weekly plan uses contained horizontally scrolling tables, totals/cards and separate sections for fixed overhead, break-even, actual comparison and FX scenarios. Clearly identify forecast prices and placeholder volumes. History shows saved costs, versions, author and time, not raw database identifiers. PDF/CSV forecasts use the shared brand exporter.

New order shows customer name/phone and pickup/delivery/dine-in inline; delivery reveals the required address. Show a responsive three-metric profitability card as items are added: Revenue / Est. gross profit / Est. net profit. Use a clear Updating state; Costing incomplete names missing items and an unavailable net allocation. Cost breakdown explains the assumptions. Keep a compact three-metric version in the fixed order action bar so profit remains visible while scrolling the menu; allow sufficient bottom padding. The same full card appears on checkout, confirmation and internal details. Receipts and Logistics omit costs and profits. Offline blocks all writes; partial customer drafts persist without weakening save validation.


## M15 WhatsApp reports

`docs/screens/WhatsApp.dc.html` is the approved supporting design for Admin `/whatsapp`: sender/schedule card, labelled recipient fields, consent and daily/weekly controls, recipient cards with edit/test actions and delivery history. Use League Spartan/Antic and shared brand components. Keep 44px touch targets, wrap number/status labels at 360px and distinguish Accepted by Meta from Delivered and Delivery uncertain. Operations and Logistics do not have this route/tool.

# M18 exchange-rate review

Owner reported successful application of migration 016 on 22 October 2026.
Frontend release authorized; deployment is verified separately.

## Use

Admin: Money → Admin tools → Default exchange rates. Open the SFXchange link,
choose the customer's currency and the direction of the source quote, and enter
that quote. Preview and save. The fixed markup makes the customer pay 2% more
foreign currency for the same TL bill, before six-decimal rate and two-decimal
payment rounding. For example, a source quote of 51 TL/USD saves 50 TL/USD.
A source quote of 100 NGN/TL saves approximately 0.009804 TL/NGN.

SFXchange's page uses a signed API. This implementation uses manually entered
quotes from that page; it does not copy signing credentials or automatically
refresh rates. Choose the rate for exchanging the customer's currency into TL;
do not enter a USD/NGN cross-rate in the TL rate field.

At checkout choose a USD or NGN account and click “Use saved rate” to fill the
amount using the database's order total. The card shows the default's date.
Confirm the amount before accepting. Historical orders can retain their actual
foreign amounts using the existing editable field. Existing accepted orders are
not repriced; delivery posts their previously accepted settlement.

## Validation

- Typecheck, lint and production build passed.
- 314 unit tests passed; all 731 local database checks passed.
- Local browser with real local SQL: USD preview and save; inverse NGN preview;
  widths 360, 390, 430 and 1280 without horizontal page overflow.
- Local checkout: 400 TL order at 50 TL/USD fills 8.00 USD, then accepts with an
  immutable USD settlement. No hosted Supabase requests were made.
- Existing build warnings: main bundle above 500 kB and Zod annotation warnings.

## Release

The owner must apply `supabase/migrations/016_exchange_rate_markup.sql` in the
Supabase SQL editor, then report success before frontend deployment. This follows
the owner's restriction against agent execution on hosted Supabase. The migration
only adds two guarded preview functions. It does not set a live rate, mutate old
settlements or post any payment. After release, Admin enters the actual current
SFXchange source quotes and saves each currency's rate.

# 30 October costing update

Local checks passed: typecheck, lint, 316 unit tests, all 830 database checks and build.
SQL-backed browser import verified all old prices unchanged, the new 279.50 TL cost,
repeat-application protection and four phone/desktop widths. Owner reported successful application of migration 019. Frontend release is
authorised; Admin application of the recipe update is still pending.

Source: SFx_Burger_Menu_Costing_and_PL EDITTED NEW.xlsx. The extracted inputs, source
ranges and original file SHA-256 are in `docs/data/costing-update-2026-10-30.json`.
The source spreadsheet was read only and has not been modified.

| Recipe | Ingredients per batch | Packaging | Recipe overhead | Servings | Full cost per serving |
| --- | ---: | ---: | ---: | ---: | ---: |
| Jollof Rice | 1437 TL | 100 TL | 0 TL | 12 | 128.083333… TL |
| Native Rice (Village Rice) | 1292 TL | 100 TL | 0 TL | 7 | 198.857142… TL |
| Vegetable Soup | 678 TL | 100 TL | 0 TL | 5 | 155.60 TL |
| SFx Special Shawarma | 1018 TL | 100 TL | 0 TL | 4 | 279.50 TL |

The Special's Plantain B182 = "30tl" and Maggie B190 = "3tl" are text, excluded
from SUM(B180:B197). Counting both gives ingredients 1018 instead of 985; full batch
cost 1118 instead of 1085; cost per unit 279.50 instead of 271.25. Its calculated
suggestion would be 560 TL after rounding, rather than the sheet's 550 TL. Neither
suggestion is automatically published. Owner confirmed 550 TL for the new item. The Admin review prefills that price;
if the item already exists, its current price stays unchanged.

Only the three requested existing recipes and the Special are imported. Other
recipes, including previously corrected Classic Shawarma, are left alone. Stale
Menu Summary notes and missing Special forecast rows are not authoritative inputs.

Existing planned quantities, multipliers, rounding and fixed-cost plan inputs are
preserved. The new recipe starts at zero planned batches. Forecast totals naturally
recompute from changed costs/yields. Existing complete saved order estimates remain
immutable; previously authorised current-recipe reconstructions can change. No
payments, inventory expenses or balances are posted by the import.

## Review and apply

1. Owner runs `supabase/migrations/019_october_costing_update.sql` in Supabase SQL
   Editor and reports success. It only installs the guarded importer/receipt table;
   no live recipe/menu data is changed by running the migration.
2. Release the frontend, then sign in as Admin → Costing → Review updated food costing.
3. Review the four costs and existing published prices. If Special is missing, enter
   the confirmed 550 TL selling price (prefilled). If it exists, its selling price is preserved.
4. Apply costing update · keep menu prices. This saves four audited recipe versions,
   adding the Special menu item only if missing, and records a single import receipt.
   Do not use Apply price; that is a separate existing menu-price action.
5. Check a new quote for each item. Existing orders retain their snapshots. Repeat
   application is disabled and cannot overwrite any later recipe edits.

No hosted database records were read or written by the agent.

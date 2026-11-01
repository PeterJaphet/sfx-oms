# Latest dish costing — owner approved

Source: `SFx_Burger_Menu_Costing_and_PL EDITTED NEW (2).xlsx`.
Source inputs/ranges and SHA256: `data/costing-dishes-2026-11-01.json`.
The source workbook was read only. Owner explicitly approved the additional dish
changes after the extras review. No selling prices are derived from suggestions.

| Recipe | Ingredients | Packaging | Overhead | Yield | Full cost / portion |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native Rice (Village Rice) | 1417 | 200 | 0 | 7 | 231 |
| Jollof Rice | 1687 | 360 | 0 | 12 | 170.583333… |
| Vegetable Soup | 678 | 115 | 0 | 5 | 158.60 |
| SFx Special Shawarma | 1038 | 100 | 0 | 4 | 284.50 |

Special's added condensed milk costs 20 per batch. The text-labelled Plantain 30tl
and Maggie 3tl still need normalization; Excel's SUM omits them. Keep those 33 TL.
Its corrected full batch cost is 1138, not the cached formula result. Zinger Burger
moves down one row but its inputs do not change.

## Release steps

1. Owner installs migrations 020 and 021 if not already installed, then
   `supabase/migrations/022_november_dishes_costing.sql`. No hosted execution by agent.
   Installing migrations never applies the recipe imports.
2. After owner confirms success, release the frontend from `codex/october31-costing`.
3. Admin → Costing → Recipes. Review/apply **1 November extras** and **1 November
   dish costing**. These two current imports can be applied in either order and
   do not require applying the older October imports.
4. Confirm costs on the recipe cards. Existing prices stay unchanged. Special is
   created at confirmed 550 TL only if absent; any existing Special price is kept.
   Puff-puff remains planning only if absent from the menu.

Two guarded receipts prevent duplicate application or overwriting later edits.
Older 30/31 October imports are blocked if still pending after latest dish import;
previously applied ones return their receipt without changing data. Existing plan
inputs, recipe settings, saved order snapshots and ledger entries remain intact.
Incomplete current-recipe reconstructions can reflect new costs. Actual expenses
are not posted by recipe imports.

This approval supersedes the additional-dish scope question in the extras review.

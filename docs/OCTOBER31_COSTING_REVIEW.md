# 31 October recipe update

Source: `SFx_Burger_Menu_Costing_and_PL EDITTED NEW (1).xlsx`.
SHA256: `69a8e016a71eef0e422a3d1e41e517d0bd5becef3273af6241966d04df72b9c4`.
Extracted source inputs: `data/costing-update-2026-10-31.json`.
Source workbook was read only and remains untouched.

| Recipe | Source | Ingredients | Packaging | Overhead | Yield | Full cost / portion |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Jollof Rice | Rice & Soup A67:B97 | 2037 | 100 | 0 | 12 | 178.083333… |
| Chicken Lap | Extras A1:B26 | 774 | 120 | 80 | 4 | 243.50 |

Jollof's only changed cell is B82 (Chicken 100 → 700). Chicken Lap links to the
existing Chicken extra; no duplicate extra or new selling price is created.
Chicken Lap direct cost is 223.50 and overhead 20 per portion. Zinger Burger's
appended Fast Food A215:B245 block matches the existing source costing.

The other eight Extras blocks all repeat Zinger Burger's ingredients, including
chicken and burger bread. Egg, Fish, Ponmo, Shaki, Puff-puff, Salad, Swallow and
Turkey are withheld pending the owner's clarification. The existing Turkey cost
and all other unrelated recipes are preserved.

## Release and application

1. Owner runs `supabase/migrations/020_october31_costing_update.sql` in Supabase
   SQL Editor after migration 019. Installation does not apply recipe changes.
2. After owner confirms success, release the frontend. No hosted execution by agent.
3. Admin → Costing → Recipes. If the 30 October update is pending, review/apply it
   first. Then Review 31 October costing → Apply 31 October update · keep menu prices.
4. Check both updated recipes. Existing selling prices and saved complete order
   estimates remain intact. Current-recipe reconstructions may reflect new costs.
5. The immutable import receipt makes repeats safe and preserves later recipe edits.

All values are TRY. Existing multipliers, rounding, planned volumes and fixed-cost
plan stay intact. New Chicken Lap planned batches start at zero. No payment,
purchase, balance or actual P&L entry is created by the import.

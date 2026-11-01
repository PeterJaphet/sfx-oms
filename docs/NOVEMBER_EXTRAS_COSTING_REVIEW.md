# Corrected extras costing — 1 November

Source: `SFx_Burger_Menu_Costing_and_PL EDITTED NEW (2).xlsx`, Extras sheet.
Source inputs and SHA256: `data/costing-update-2026-11-01.json`.
Workbook read only, not modified. Totals independently summed from numeric inputs;
no reliance on cached formula results or suggested selling prices.

| Recipe | Source range | Ingredients | Packaging | Overhead | Yield | Direct COGS/portion | Full cost/portion |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chicken Lap | A1:B26 | 862 | 0 | 80 | 11 | 78.363636… | 85.636363… |
| Egg | A29:B46 | 200 | 0 | 80 | 30 | 6.666666… | 9.333333… |
| Fish | A49:B72 | 350 | 0 | 80 | 6 | 58.333333… | 71.666666… |
| Ponmo | A75:B94 | 220 | 0 | 80 | 8 | 27.50 | 37.50 |
| Shaki | A97:B116 | 220 | 0 | 80 | 8 | 27.50 | 37.50 |
| Puff-puff | A118:B140 | 593 | 120 | 80 | 50 | 14.26 | 15.86 |
| Salad | A142:B165 | 210 | 50 | 80 | 10 | 26 | 34 |
| Swallow | A167:B184 | 100 | 20 | 80 | 10 | 12 | 20 |
| Turkey | A186:B211 | 628 | 0 | 80 | 3 | 209.333333… | 236 |

Both Fish salt rows are preserved. Packaging zero is an explicit supplied zero.
Turkey's new recipe supersedes the earlier owner estimate. Chicken Lap links to
Chicken. Existing recipe names/links/settings are retained. New planned batches
are zero. Absent Puff-puff is saved unlinked for planning; no selling price/menu
item is created. If an extra or single standalone variant exists, link it.

## Owner release steps

1. Run migration 020 if not already installed, then
   `supabase/migrations/021_november_extras_costing.sql`. Installation alone never
   changes recipe data. No hosted database execution by the agent.
2. Confirm success, then release the tested frontend.
3. If the pending 31 October Jollof update is still wanted, apply the 30 October
   update if needed and then the 31 October update before applying newer extras.
4. Admin → Costing → Recipes → Review 1 November extras → Apply 1 November extras
   · keep menu prices. Review direct COGS/overhead and unchanged selling prices.
5. Verify the recipe cards. Retry is safe and cannot overwrite later edits.

Applying extras first deliberately blocks a still-unapplied older 31 October import
from overwriting corrected Chicken Lap costs. All existing prices, complete saved
order estimates and financial entries remain intact. Current-recipe reconstructions
can reflect new costs. This import does not post actual expenses.

The file also changes Native/Jollof chicken and packaging, Vegetable Soup packaging,
and adds condensed milk to Special Shawarma. These changes are outside this extras
import, pending the owner's answer about including them. Existing recipes stay as
saved; a prior unapplied update is not evidence of current hosted recipe values.

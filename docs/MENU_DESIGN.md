# M2 menu layouts

Approved scope: user requested the missing designs needed for M2, following DESIGN.md.

- Entry: Menu button in the header for Operations and Admin. Existing bottom navigation stays as approved in M1.
- Menu & extras: Products / Extras / Categories segmented control, Search menu, category chips, Add and Import CSV actions. Cards use the existing two-column phone product grid and expand at desktop widths.
- Product: category caption, optional photo, name, Active / Inactive badge, variant prices, allowed-extra count, Edit and Price history. Standalone extras appear only in Extras.
- Extras: one card and one price per extra; price applies both on a dish and alone. Allowed dishes are listed; edit in a sheet.
- Product sheet: name, category, description, active checkbox, variant cards with prices and active checkboxes, allowed extras, optional upload, Save product.
- Extra sheet: name, shared price, active checkbox, allowed dishes, optional upload, Save extra.
- Category sheet: name, integer sort order, active checkbox, Save category.
- History sheet: old → new price, variant where relevant, staff name, Cyprus timestamp; paged 25 entries at a time. Initial seed prices show Initial setup.
- CSV sheet: template, file selector, validation, complete row preview, Add category/product/variant or Update price, retained inactive state, explicit Import action. Required columns category,product,variant,price. Exact case-sensitive matches update prices.
- Photos: private uploads, JPG/PNG/WebP; up to 15 MB input resized to 1600px maximum and under 5 MB stored. Replacement and Remove photo keep original objects.

Use brand tokens, Archivo/Bricolage, 44px minimum controls, white bordered cards on ground, no shadows or gradients. All sheets support 360–430px widths and desktop. Errors retain database messages. Empty/loading/error states are part of each layout.

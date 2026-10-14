# Locally bundled brand fonts

Antic Regular is used for body copy. League Spartan variable (100–900) is used for headings,
controls, emphasis and the currency/Turkish characters missing from Antic. All UI font files
are served locally and included in the PWA cache.

PDFs use Antic Regular and static League Spartan Regular/Bold. Non-ASCII table cells use
League Spartan so ₺, ₦ and Turkish account names stay readable. Archivo is retained as a PDF fallback for the 92 existing special glyphs absent from both brand faces
(such as Greek symbols, arrows and superscripts), and for already installed clients during the update.

Sources: Google's official font repository:
- https://github.com/google/fonts/tree/main/ofl/antic
- https://github.com/google/fonts/tree/main/ofl/leaguespartan

Both fonts use the SIL Open Font License 1.1; licenses are bundled beside the fonts.
WOFF2 files are losslessly compressed from those TTFs; static League Spartan instances
are generated at weights 400 and 700 without changing any glyphs.

Legacy Archivo source: https://github.com/Omnibus-Type/Archivo/blob/master/fonts/ttf/Archivo-Regular.ttf
Legacy license: Archivo-OFL.txt.

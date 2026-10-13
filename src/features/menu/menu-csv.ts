import Papa from 'papaparse'
import { priceSchema, type MenuData } from './menu-model'

export type ImportRow = { category: string; product: string; variant: string; price: string }
export type PreviewRow = ImportRow & { action: string; oldPrice?: number; inactive: boolean }
export function parseMenuCsv(text: string): ImportRow[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' })
  if (parsed.errors.length) throw new Error(`CSV: ${parsed.errors[0].message}`)
  const [headers, ...rows] = parsed.data
  const required = ['category', 'product', 'variant', 'price'] as const
  if (!headers || headers.length !== 4 || required.some(key => headers.filter(h => h.trim().toLowerCase() === key).length !== 1)) throw new Error('Use exactly these columns: category, product, variant, price')
  if (rows.length < 1 || rows.length > 500) throw new Error('Import between 1 and 500 rows')
  const seen = new Set<string>()
  return rows.map((cells, index) => {
    if (cells.length !== 4) throw new Error(`Row ${index + 2}: expected 4 columns`)
    const row = Object.fromEntries(required.map(key => [key, cells[headers.findIndex(h => h.trim().toLowerCase() === key)].trim()])) as ImportRow
    if (required.slice(0, 3).some(key => !row[key] || row[key].length > 120)) throw new Error(`Row ${index + 2}: enter names of 1–120 characters`)
    if (!priceSchema.safeParse(row.price).success) throw new Error(`Row ${index + 2}: enter a price with at most 2 decimals`)
    const key = JSON.stringify([row.category, row.product, row.variant])
    if (seen.has(key)) throw new Error(`Row ${index + 2}: duplicate category, product and variant`)
    seen.add(key)
    return row
  })
}
export function previewImport(rows: ImportRow[], menu: MenuData): PreviewRow[] {
  return rows.map(row => {
    const category = menu.categories.find(c => c.name === row.category)
    const product = menu.products.find(p => p.category_id === category?.id && p.name === row.product)
    if (product?.addon_id || menu.products.some(p => p.category_id === category?.id && p.addon_id)) throw new Error('Edit standalone extras in Extras; CSV imports dishes only')
    const variant = menu.variants.find(v => v.product_id === product?.id && v.name === row.variant)
    const action = variant ? (Number(row.price) === variant.price ? 'No price change' : 'Update price') : product ? 'Add variant' : category ? 'Add product' : 'Add category + product'
    return { ...row, action, oldPrice: variant?.price, inactive: category?.is_active === false || product?.is_active === false || variant?.is_active === false }
  })
}
export const sampleCsv = 'category,product,variant,price\nBurgers,BBQ Burger,Regular,400\nBurgers,BBQ Burger,Double,550\n'

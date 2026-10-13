import { z } from 'zod'
import type { Database } from '@/lib/db.types'

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Product = Row<'products'>
export type Variant = Row<'product_variants'>
export type Extra = Row<'addons'>
export type Category = Row<'product_categories'>
export type MenuData = { products: Product[]; variants: Variant[]; extras: Extra[]; categories: Category[]; links: Row<'product_addons'>[] }
export const priceSchema = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Enter a price with at most 2 decimals').refine(value => Number(value) <= 9999999999.99, 'Price is too large')
const name = z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters')
export const productSchema = z.object({
  name, category_id: z.string().min(1, 'Choose a category'), description: z.string().trim().max(1000), is_active: z.boolean(),
  variants: z.array(z.object({ id: z.string().optional(), name, price: priceSchema, is_active: z.boolean() })).min(1, 'Add at least one variant'),
  addon_ids: z.array(z.string()),
}).superRefine((data, context) => {
  const seen = new Set<string>()
  data.variants.forEach((variant, index) => {
    if (seen.has(variant.name)) context.addIssue({ code: 'custom', path: ['variants', index, 'name'], message: 'Variant names must be unique' })
    seen.add(variant.name)
  })
})
export const extraSchema = z.object({ name, price: priceSchema, is_active: z.boolean(), product_ids: z.array(z.string()) })
export const categorySchema = z.object({ name, sort_order: z.string().regex(/^-?\d+$/, 'Enter a whole number').refine(v => Math.abs(Number(v)) <= 2147483647, 'Sort order is too large'), is_active: z.boolean() })
export type ProductFormValues = z.infer<typeof productSchema>
export type ExtraFormValues = z.infer<typeof extraSchema>
export type CategoryFormValues = z.infer<typeof categorySchema>

export function activeMenu(data: MenuData) {
  const categories = new Set(data.categories.filter(c => c.is_active).map(c => c.id))
  const products = data.products.filter(p => p.is_active && categories.has(p.category_id))
  const ids = new Set(products.map(p => p.id))
  const extras = data.extras.filter(a => a.is_active)
  const extraIds = new Set(extras.map(a => a.id))
  return { ...data, products, variants: data.variants.filter(v => v.is_active && ids.has(v.product_id)), extras,
    categories: data.categories.filter(c => c.is_active), links: data.links.filter(l => l.is_active && ids.has(l.product_id) && extraIds.has(l.addon_id)) }
}

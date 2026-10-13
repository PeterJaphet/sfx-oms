import { describe, expect, it } from 'vitest'
import { parseMenuCsv, previewImport } from './menu-csv'
import { activeMenu, priceSchema, productSchema, type MenuData } from './menu-model'
import { photoId, validatePhoto } from './menu-photos'

const menu: MenuData = {
  categories: [{ id: 1, name: 'Burgers', is_active: true, sort_order: 1 }, { id: 2, name: 'Extras', is_active: true, sort_order: 2 }, { id: 3, name: 'Hidden', is_active: false, sort_order: 3 }],
  products: [
    { id: 'dish', name: 'Burger', category_id: 1, addon_id: null, is_active: true, description: null, photo_path: null, created_at: '', created_by: null },
    { id: 'fish', name: 'Fish', category_id: 2, addon_id: 'extra', is_active: true, description: null, photo_path: null, created_at: '', created_by: null },
    { id: 'hidden', name: 'Hidden dish', category_id: 3, addon_id: null, is_active: true, description: null, photo_path: null, created_at: '', created_by: null },
  ],
  variants: [{ id: 'regular', name: 'Regular', product_id: 'dish', price: 400, is_active: false, sort_order: 1 }, { id: 'large', name: 'Large', product_id: 'dish', price: 500, is_active: true, sort_order: 2 }, { id: 'hidden-v', name: 'Regular', product_id: 'hidden', price: 100, is_active: true, sort_order: 1 }],
  extras: [{ id: 'extra', name: 'Fish', price: 180, is_active: true }, { id: 'inactive', name: 'Egg', price: 50, is_active: false }],
  links: [{ product_id: 'dish', addon_id: 'extra', is_active: false }, { product_id: 'dish', addon_id: 'inactive', is_active: true }, { product_id: 'hidden', addon_id: 'extra', is_active: true }],
}
describe('CSV import', () => {
  it('supports BOM, reordered headers, quoted commas and multiline names', () => {
    expect(parseMenuCsv('\uFEFFPRICE,variant,product,category\r\n12.50,Regular,"Rice, beans\nand chicken",Rice\r\n')[0]).toEqual({ category: 'Rice', product: 'Rice, beans\nand chicken', variant: 'Regular', price: '12.50' })
  })
  it('ignores empty lines and trims cells', () => expect(parseMenuCsv('category,product,variant,price\n\n Burgers , Burger , Regular , 400 \n')).toHaveLength(1))
  it.each([
    ['category,product,price\nBurgers,Burger,400', 'columns'],
    ['category,product,variant,price\nBurgers,Burger,Regular,400,extra', '4 columns'],
    ['category,product,variant,price\n,Burger,Regular,400', 'names'],
    ['category,product,variant,price\nBurgers,Burger,Regular,12.555', '2 decimals'],
    ['category,product,variant,price\nBurgers,Burger,Regular,-1', '2 decimals'],
    ['category,product,variant,price\nBurgers,Burger,Regular,1e3', '2 decimals'],
    ['category,product,variant,price\nBurgers,Burger,Regular,10000000000', '2 decimals'],
    ['category,product,variant,price\nBurgers,Burger,Regular,400\nBurgers,Burger,Regular,420', 'duplicate'],
    ['category,product,variant,price', '1 and 500'],
    ['category,product,variant,price\nBurgers,"Broken,Regular,400', 'CSV:'],
  ])('rejects invalid data: %s', (csv, error) => expect(() => parseMenuCsv(csv)).toThrow(error))
  it('limits imports to 500 rows', () => expect(() => parseMenuCsv('category,product,variant,price\n' + Array.from({ length: 501 }, (_, i) => `Burgers,Burger ${i},Regular,1`).join('\n'))).toThrow('500'))
  it('previews price updates and retains inactive state', () => {
    expect(previewImport([{ category: 'Burgers', product: 'Burger', variant: 'Regular', price: '450' }], menu)[0]).toMatchObject({ action: 'Update price', oldPrice: 400, inactive: true })
  })
  it('distinguishes no change, new variant, new product and new category', () => {
    const rows = [{ category: 'Burgers', product: 'Burger', variant: 'Large', price: '500' }, { category: 'Burgers', product: 'Burger', variant: 'Double', price: '600' }, { category: 'Burgers', product: 'New', variant: 'Regular', price: '300' }, { category: 'New', product: 'New', variant: 'Regular', price: '300' }]
    expect(previewImport(rows, menu).map(r => r.action)).toEqual(['No price change', 'Add variant', 'Add product', 'Add category + product'])
  })
  it('rejects independent extra prices in CSV', () => expect(() => previewImport([{ category: 'Extras', product: 'Fish', variant: 'Regular', price: '200' }], menu)).toThrow('standalone extras'))
})
describe('active menu and validation', () => {
  it('filters inactive categories, variants, extras and soft-disabled links', () => {
    const active = activeMenu(menu)
    expect(active.products.map(p => p.id)).toEqual(['dish', 'fish'])
    expect(active.variants.map(v => v.id)).toEqual(['large'])
    expect(active.extras.map(a => a.id)).toEqual(['extra'])
    expect(active.links).toEqual([])
  })
  it.each(['0', '12', '12.5', '12.50', '9999999999.99'])('accepts valid price %s', value => expect(priceSchema.safeParse(value).success).toBe(true))
  it.each(['', '-1', '12.555', 'NaN', 'Infinity', '1,000', '1e3', '10000000000'])('rejects invalid price %s', value => expect(priceSchema.safeParse(value).success).toBe(false))
  it('rejects duplicate variant names before saving', () => expect(productSchema.safeParse({ name: 'Burger', category_id: '1', description: '', is_active: true, addon_ids: [], variants: [{ name: 'Regular', price: '400', is_active: true }, { name: 'Regular', price: '450', is_active: true }] }).success).toBe(false))
})
describe('phone photo input', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', type => expect(() => validatePhoto({ type, size: 100 })).not.toThrow())
  it.each([{ type: 'image/svg+xml', size: 100 }, { type: 'application/pdf', size: 100 }, { type: 'image/jpeg', size: 0 }, { type: 'image/jpeg', size: 16 * 1024 * 1024 }])('rejects unsupported or invalid input', file => expect(() => validatePhoto(file)).toThrow())
})


describe('photo object names', () => {
  it('generates distinct version 4 UUIDs for immutable uploads', () => {
    const first = photoId(), second = photoId()
    expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    expect(second).not.toBe(first)
  })
})

import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input, FieldError } from '@/components/ui/input'
import { useAuth } from '@/features/auth/auth-context'
import { saveCategory, saveExtra, saveProduct, useMenuSave } from './menu-api'
import { uploadPhoto } from './menu-photos'
import { PhotoField } from './PhotoField'
import { categorySchema, extraSchema, productSchema, type Category, type CategoryFormValues, type Extra, type ExtraFormValues, type MenuData, type Product, type ProductFormValues } from './menu-model'

const selectClass = 'h-11 w-full rounded-lg border border-line-strong bg-card px-3 text-base focus-visible:outline-brand-strong'
const checkboxClass = 'h-5 w-5 shrink-0 accent-brand'
export function ProductForm({ product, menu, onSaved }: { product?: Product; menu: MenuData; onSaved: () => void }) {
  const { profile } = useAuth()
  const [photo, setPhoto] = useState(product?.photo_path ?? null)
  const [file, setFile] = useState<File | null>(null)
  const form = useForm<ProductFormValues>({ resolver: zodResolver(productSchema), defaultValues: {
    name: product?.name ?? '', category_id: String(product?.category_id ?? menu.categories.find(c => c.is_active && !menu.products.some(p => p.category_id === c.id && p.addon_id))?.id ?? ''), description: product?.description ?? '', is_active: product?.is_active ?? true,
    variants: product ? menu.variants.filter(v => v.product_id === product.id).map(v => ({ id: v.id, name: v.name, price: String(v.price), is_active: v.is_active })) : [{ name: 'Regular', price: '', is_active: true }],
    addon_ids: menu.links.filter(l => l.product_id === product?.id && l.is_active).map(l => l.addon_id),
  } })
  const variants = useFieldArray({ control: form.control, name: 'variants' })
  const save = useMenuSave(async (values: ProductFormValues) => {
    if (!profile) throw new Error('Sign in again')
    const path = file ? await uploadPhoto(file, profile.id) : photo
    return saveProduct({ ...values, id: product?.id ?? null, category_id: Number(values.category_id), photo_path: path })
  }, onSaved)
  const errors = form.formState.errors
  return <form className="space-y-5" onSubmit={form.handleSubmit(values => save.mutate(values))}>
    <fieldset disabled={save.isPending} className="space-y-5">
      <div><label htmlFor="product-name" className="mb-2 block text-sm font-semibold">Product name</label><Input id="product-name" aria-invalid={!!errors.name} aria-describedby="menu-error-1" {...form.register('name')} /><FieldError id="menu-error-1" message={errors.name?.message} /></div>
      <div><label htmlFor="product-category" className="mb-2 block text-sm font-semibold">Category</label><select id="product-category" aria-invalid={!!errors.category_id} aria-describedby="menu-error-2" className={selectClass} {...form.register('category_id')}><option value="">Choose a category</option>{menu.categories.filter(c => c.id === product?.category_id || !menu.products.some(p => p.category_id === c.id && p.addon_id)).map(c => <option key={c.id} value={c.id}>{c.name}{!c.is_active ? ' (inactive)' : ''}</option>)}</select><FieldError id="menu-error-2" message={errors.category_id?.message} /></div>
      <div><label htmlFor="product-description" className="mb-2 block text-sm font-semibold">Description (optional)</label><textarea id="product-description" aria-invalid={!!errors.description} aria-describedby="menu-error-3" className={`${selectClass} h-24 py-2`} {...form.register('description')} /><FieldError id="menu-error-3" message={errors.description?.message} /></div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className={checkboxClass} {...form.register('is_active')} />Active product</label>
      <fieldset className="space-y-3"><legend className="mb-2 font-bold">Variants & prices</legend>{variants.fields.map((variant, index) => <div key={variant.id} className="space-y-2 rounded-xl border bg-card p-3">
        <label className="block text-sm font-semibold" htmlFor={`variant-${index}`}>Variant {index + 1}</label><Input id={`variant-${index}`} aria-invalid={!!errors.variants?.[index]?.name} aria-describedby={`variant-name-error-${index}`} {...form.register(`variants.${index}.name`)} /><FieldError id={`variant-name-error-${index}`} message={errors.variants?.[index]?.name?.message} />
        <label className="block text-sm font-semibold" htmlFor={`price-${index}`}>Price (₺)</label><Input id={`price-${index}`} aria-invalid={!!errors.variants?.[index]?.price} aria-describedby={`variant-price-error-${index}`} inputMode="decimal" {...form.register(`variants.${index}.price`)} /><FieldError id={`variant-price-error-${index}`} message={errors.variants?.[index]?.price?.message} />
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className={checkboxClass} {...form.register(`variants.${index}.is_active`)} />Active variant</label>
        {!form.getValues(`variants.${index}.id`) && variants.fields.length > 1 ? <Button variant="secondary" size="secondary" className="text-sm" onClick={() => variants.remove(index)}>Remove unsaved variant</Button> : null}
      </div>)}<FieldError id="menu-error-6" message={errors.variants?.message} /><Button variant="secondary" size="secondary" className="text-sm" onClick={() => variants.append({ name: '', price: '', is_active: true })}>Add variant</Button></fieldset>
      <fieldset><legend className="mb-2 font-bold">Allowed extras</legend><p className="mb-2 text-sm text-muted">Only selected extras can be added to this dish.</p>{menu.extras.map(extra => <label key={extra.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className={checkboxClass} value={extra.id} {...form.register('addon_ids')} />{extra.name}{!extra.is_active ? ' (inactive)' : ''}</label>)}</fieldset>
      <PhotoField path={photo} file={file} disabled={save.isPending} onChange={(next, path) => { setFile(next); setPhoto(path) }} />
    </fieldset>
    {save.error ? <p role="alert" className="break-words text-sm text-brand-strong">{save.error.message}</p> : null}
    <Button type="submit" disabled={save.isPending} className="w-full">{save.isPending ? 'Saving…' : 'Save product'}</Button>
  </form>
}

export function ExtraForm({ extra, menu, onSaved }: { extra?: Extra; menu: MenuData; onSaved: () => void }) {
  const { profile } = useAuth()
  const standalone = menu.products.find(p => p.addon_id === extra?.id)
  const [photo, setPhoto] = useState(standalone?.photo_path ?? null)
  const [file, setFile] = useState<File | null>(null)
  const form = useForm<ExtraFormValues>({ resolver: zodResolver(extraSchema), defaultValues: { name: extra?.name ?? '', price: extra ? String(extra.price) : '', is_active: extra?.is_active ?? true,
    product_ids: menu.links.filter(l => l.addon_id === extra?.id && l.is_active).map(l => l.product_id) } })
  const save = useMenuSave(async (values: ExtraFormValues) => {
    if (!profile) throw new Error('Sign in again')
    return saveExtra({ ...values, id: extra?.id ?? null, photo_path: file ? await uploadPhoto(file, profile.id) : photo })
  }, onSaved)
  return <form className="space-y-5" onSubmit={form.handleSubmit(values => save.mutate(values))}><fieldset disabled={save.isPending} className="space-y-5">
    <div><label htmlFor="extra-name" className="mb-2 block text-sm font-semibold">Extra name</label><Input id="extra-name" aria-invalid={!!form.formState.errors.name} aria-describedby="menu-error-7" {...form.register('name')} /><FieldError id="menu-error-7" message={form.formState.errors.name?.message} /></div>
    <div><label htmlFor="extra-price" className="mb-2 block text-sm font-semibold">Price (₺)</label><Input id="extra-price" aria-invalid={!!form.formState.errors.price} aria-describedby="menu-error-8" inputMode="decimal" {...form.register('price')} /><FieldError id="menu-error-8" message={form.formState.errors.price?.message} /><p className="mt-2 text-sm text-muted">This price applies on a dish and when sold on its own.</p></div>
    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className={checkboxClass} {...form.register('is_active')} />Active extra</label>
    <fieldset><legend className="mb-2 font-bold">Allowed on these dishes</legend>{menu.products.filter(p => !p.addon_id).map(product => <label key={product.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className={checkboxClass} value={product.id} {...form.register('product_ids')} />{product.name}{!product.is_active ? ' (inactive)' : ''}</label>)}</fieldset>
    <PhotoField path={photo} file={file} disabled={save.isPending} onChange={(next, path) => { setFile(next); setPhoto(path) }} />
  </fieldset>{save.error ? <p role="alert" className="break-words text-sm text-brand-strong">{save.error.message}</p> : null}<Button type="submit" disabled={save.isPending} className="w-full">{save.isPending ? 'Saving…' : 'Save extra'}</Button></form>
}

export function CategoryForm({ category, onSaved }: { category?: Category; onSaved: () => void }) {
  const form = useForm<CategoryFormValues>({ resolver: zodResolver(categorySchema), defaultValues: { name: category?.name ?? '', sort_order: String(category?.sort_order ?? 0), is_active: category?.is_active ?? true } })
  const save = useMenuSave((values: CategoryFormValues) => saveCategory(category?.id, values), onSaved)
  return <form className="space-y-5" onSubmit={form.handleSubmit(values => save.mutate(values))}><fieldset disabled={save.isPending} className="space-y-5">
    <div><label htmlFor="category-name" className="mb-2 block text-sm font-semibold">Category name</label><Input id="category-name" aria-invalid={!!form.formState.errors.name} aria-describedby="menu-error-9" {...form.register('name')} /><FieldError id="menu-error-9" message={form.formState.errors.name?.message} /></div>
    <div><label htmlFor="category-sort" className="mb-2 block text-sm font-semibold">Sort order</label><Input id="category-sort" aria-invalid={!!form.formState.errors.sort_order} aria-describedby="menu-error-10" inputMode="numeric" {...form.register('sort_order')} /><FieldError id="menu-error-10" message={form.formState.errors.sort_order?.message} /><p className="mt-2 text-sm text-muted">Lower numbers appear first.</p></div>
    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className={checkboxClass} {...form.register('is_active')} />Active category</label><p className="text-sm text-muted">Inactive categories hide their items from new orders.</p>
  </fieldset>{save.error ? <p role="alert" className="text-sm text-brand-strong">{save.error.message}</p> : null}<Button type="submit" disabled={save.isPending} className="w-full">{save.isPending ? 'Saving…' : 'Save category'}</Button></form>
}

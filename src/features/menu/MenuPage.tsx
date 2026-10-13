import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMenu } from './menu-api'
import type { Category, Extra, MenuData, Product } from './menu-model'
import { usePhotoUrls } from './menu-photos'
import { MenuPhoto } from './PhotoField'
import { CategoryForm, ExtraForm, ProductForm } from './MenuForms'
import { CsvImport } from './CsvImport'
import { PriceHistory } from './PriceHistory'

type Editor = { kind: 'product'; item?: Product } | { kind: 'extra'; item?: Extra } | { kind: 'category'; item?: Category } | { kind: 'import' } | { kind: 'history'; name: string; addonId?: string; variants: { id: string; name: string }[] }
function Status({ active, categoryActive = true }: { active: boolean; categoryActive?: boolean }) {
  return <span className={cn('inline-block rounded-md px-2 py-1 text-xs font-semibold', active && categoryActive ? 'bg-ok-soft text-ok' : 'bg-amber-soft text-amber-ink')}>{!active ? 'Inactive' : !categoryActive ? 'Category inactive' : 'Active'}</span>
}
export default function MenuPage() {
  const menu = useMenu()
  if (menu.isPending) return <p role="status">Loading menu…</p>
  if (menu.error) return <div role="alert"><p className="mb-3 text-brand-strong">{menu.error.message}</p><Button variant="secondary" onClick={() => { void menu.refetch() }}>Try again</Button></div>
  return <MenuEditor menu={menu.data} />
}
function MenuEditor({ menu }: { menu: MenuData }) {
  const [tab, setTab] = useState<'products' | 'extras' | 'categories'>('products')
  const [category, setCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const photos = usePhotoUrls(menu.products.map(p => p.photo_path))
  const title = editor?.kind === 'history' ? `${editor.name} · Price history` : editor?.kind === 'import' ? 'Import products' : editor ? `${editor.item ? 'Edit' : 'Add'} ${editor.kind}` : ''
  const description = editor?.kind === 'history' ? 'Every price change keeps its author and time.' : editor?.kind === 'import' ? 'Review new items and price updates before saving.' : 'Changes are recorded. Deactivate items to keep past orders intact.'
  const matches = (name: string) => name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  const dishes = menu.products.filter(p => !p.addon_id && (category === null || p.category_id === category) && matches(p.name))
  const extras = menu.extras.filter(a => matches(a.name))
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[26px] font-extrabold sm:text-[34px]">Menu & extras</h1><p className="mt-1 text-sm text-muted">Prices, variants and what’s available to order.</p></div><Button variant="secondary" size="secondary" className="text-sm" onClick={() => setEditor({ kind: 'import' })}>Import CSV</Button></div>
    <div className="flex rounded-xl bg-chip p-1" role="group" aria-label="Menu sections">{(['products', 'extras', 'categories'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} className={cn('min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm font-semibold', tab === value ? 'bg-card text-ink' : 'text-muted')} onClick={() => { setTab(value); setSearch('') }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    <div className="flex gap-2"><div className="min-w-0 flex-1"><label className="sr-only" htmlFor="menu-search">Search menu</label><Input id="menu-search" type="search" placeholder="Search menu" value={search} onChange={e => setSearch(e.target.value)} /></div><Button size="secondary" className="mt-0.5 text-sm" onClick={() => setEditor(tab === 'products' ? { kind: 'product' } : tab === 'extras' ? { kind: 'extra' } : { kind: 'category' })}>Add {tab === 'products' ? 'product' : tab === 'extras' ? 'extra' : 'category'}</Button></div>
    {tab === 'products' ? <><div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">{[{ id: null, name: 'All dishes' }, ...menu.categories.filter(c => !menu.products.some(p => p.category_id === c.id && p.addon_id) || menu.products.some(p => p.category_id === c.id && !p.addon_id))].map(c => <button key={c.id ?? 'all'} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={cn('min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold', category === c.id ? 'border-brand bg-brand text-card' : 'border-line-strong bg-card text-ink')}>{c.name}</button>)}</div>
      {dishes.length ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">{dishes.map(product => {
        const variants = menu.variants.filter(v => v.product_id === product.id)
        const category = menu.categories.find(c => c.id === product.category_id)
        const allowance = menu.links.filter(l => l.product_id === product.id && l.is_active).length
        return <Card key={product.id}><CardContent className="flex h-full flex-col gap-3 p-3"><MenuPhoto key={product.photo_path} src={product.photo_path ? photos.data?.[product.photo_path] : undefined} name={product.name} /><div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{category?.name}</p><h2 className="break-words text-base font-bold">{product.name}</h2><Status active={product.is_active && variants.some(v => v.is_active)} categoryActive={category?.is_active} /></div>
          <ul className="space-y-1">{variants.map(v => <li key={v.id} className="break-words text-sm"><span className="text-muted">{v.name}{!v.is_active ? ' (inactive)' : ''}</span><span className="block font-bold">{formatMoney(v.price, 'TRY')}</span></li>)}</ul>{allowance ? <p className="text-xs text-muted">{allowance} allowed extras</p> : null}
          <div className="mt-auto flex flex-col gap-2"><Button variant="secondary" size="secondary" className="px-2 text-sm" aria-label={`Edit ${product.name}`} onClick={() => setEditor({ kind: 'product', item: product })}>Edit</Button><Button variant="secondary" size="secondary" className="px-2 text-xs" aria-label={`Price history for ${product.name}`} onClick={() => setEditor({ kind: 'history', name: product.name, variants })}>Price history</Button></div>
        </CardContent></Card>
      })}</div> : <p className="rounded-xl border bg-card p-4 text-muted">No dishes found. Add a product or change the filter.</p>}</> : null}
    {tab === 'extras' ? <><p className="text-sm text-muted">One price for an extra on a dish or sold on its own.</p>{extras.length ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">{extras.map(extra => {
      const standalone = menu.products.find(p => p.addon_id === extra.id)
      const category = menu.categories.find(c => c.id === standalone?.category_id)
      const allowed = menu.links.filter(l => l.addon_id === extra.id && l.is_active).map(l => menu.products.find(p => p.id === l.product_id)?.name).filter(Boolean)
      return <Card key={extra.id}><CardContent className="flex h-full flex-col gap-3 p-3"><MenuPhoto key={standalone?.photo_path} src={standalone?.photo_path ? photos.data?.[standalone.photo_path] : undefined} name={extra.name} /><h2 className="break-words text-base font-bold">{extra.name}</h2><Status active={extra.is_active} /><p className="text-xl font-bold">{formatMoney(extra.price, 'TRY')}</p><p className="text-xs text-muted">Sold on its own{category?.is_active === false ? ' · category inactive' : ''}</p><p className="break-words text-xs text-muted">{allowed.length ? `Allowed on: ${allowed.join(', ')}` : 'No dishes selected'}</p><div className="mt-auto flex flex-col gap-2"><Button variant="secondary" size="secondary" className="px-2 text-sm" aria-label={`Edit ${extra.name}`} onClick={() => setEditor({ kind: 'extra', item: extra })}>Edit</Button><Button variant="secondary" size="secondary" className="px-2 text-xs" aria-label={`Price history for ${extra.name}`} onClick={() => setEditor({ kind: 'history', name: extra.name, addonId: extra.id, variants: [] })}>Price history</Button></div></CardContent></Card>
    })}</div> : <p className="rounded-xl border bg-card p-4 text-muted">No extras found.</p>}</> : null}
    {tab === 'categories' ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{menu.categories.filter(c => matches(c.name)).map(c => <Card key={c.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{c.name}</h2><p className="my-2 text-sm text-muted">Sort order {c.sort_order}</p><Status active={c.is_active} /></div><Button variant="secondary" size="secondary" className="text-sm" aria-label={`Edit ${c.name}`} onClick={() => setEditor({ kind: 'category', item: c })}>Edit</Button></CardContent></Card>)}</div> : null}
    {photos.error ? <p role="alert" className="text-sm text-brand-strong">{photos.error.message}</p> : null}
    <Sheet open={!!editor} onOpenChange={open => { if (!open) setEditor(null) }} title={title} description={description}>
      {editor?.kind === 'product' ? <ProductForm key={editor.item?.id ?? 'new-product'} product={editor.item} menu={menu} onSaved={() => setEditor(null)} /> : editor?.kind === 'extra' ? <ExtraForm key={editor.item?.id ?? 'new-extra'} extra={editor.item} menu={menu} onSaved={() => setEditor(null)} /> : editor?.kind === 'category' ? <CategoryForm key={editor.item?.id ?? 'new-category'} category={editor.item} onSaved={() => setEditor(null)} /> : editor?.kind === 'import' ? <CsvImport onSaved={() => setEditor(null)} /> : editor?.kind === 'history' ? <PriceHistory key={editor.addonId ?? editor.variants.map(v => v.id).join(',')} addonId={editor.addonId} variants={editor.variants} /> : null}
    </Sheet>
  </section>
}

import { assertOnline } from '@/lib/connectivity'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/lib/db.types'
import type { MenuData, CategoryFormValues } from './menu-model'

export function client() {
  if (!supabase) throw new Error('Sign-in is not configured yet')
  return supabase
}
export async function loadMenu(): Promise<MenuData> {
  const db = client()
  const results = await Promise.all([
    db.from('product_categories').select('*').order('sort_order').order('name'),
    db.from('products').select('*').order('name'),
    db.from('product_variants').select('*').order('sort_order').order('name'),
    db.from('addons').select('*').order('name'),
    db.from('product_addons').select('*'),
  ])
  for (const result of results) if (result.error) throw new Error(result.error.message)
  return { categories: results[0].data!, products: results[1].data!, variants: results[2].data!, extras: results[3].data!, links: results[4].data! }
}
export function useMenu() { return useQuery({ queryKey: ['menu'], queryFn: loadMenu, staleTime: 15_000, refetchInterval: 30_000 }) }
export async function saveProduct(payload: Json) {
  assertOnline()
  const { data, error } = await client().rpc('save_menu_product', { p_product: payload })
  if (error) throw new Error(error.message)
  return data
}
export async function saveExtra(payload: Json) {
  assertOnline()
  const { data, error } = await client().rpc('save_menu_extra', { p_extra: payload })
  if (error) throw new Error(error.message)
  return data
}
export async function saveCategory(id: number | undefined, values: CategoryFormValues) {
  assertOnline()
  const payload = { name: values.name, sort_order: Number(values.sort_order), is_active: values.is_active }
  const db = client()
  const result = id ? await db.from('product_categories').update(payload).eq('id', id).select('id').single() : await db.from('product_categories').insert(payload).select('id').single()
  if (result.error) throw new Error(result.error.message)
}
export function useMenuSave<T>(save: (values: T) => Promise<unknown>, onSaved: () => void) {
  const queries = useQueryClient()
  return useMutation({ mutationFn: (values: T) => { assertOnline(); return save(values) }, onSuccess: async () => {
    await Promise.all([queries.invalidateQueries({ queryKey: ['menu'] }), queries.invalidateQueries({ queryKey: ['price-history'] }), queries.invalidateQueries({ queryKey: ['activity'] })])
    toast.success('Menu saved'); onSaved()
  }, onError: (error: Error) => toast.error(error.message) })
}

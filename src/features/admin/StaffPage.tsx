import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet } from '@/components/ui/sheet'
import { supabase } from '@/lib/supabase'
import { roleNames } from '@/features/auth/permissions'
import { AddStaffForm, EditStaffForm } from './StaffForms'
import type { Staff } from './staff-api'

export function StaffPage() {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const staff = useQuery({ queryKey: ['staff'], queryFn: async () => {
    if (!supabase) throw new Error('Sign-in is not configured yet')
    const { data, error } = await supabase.from('profiles').select('*').order('is_active', { ascending: false }).order('full_name')
    if (error) throw new Error(error.message)
    return data
  } })
  return <section className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-3"><h1 className="text-[26px] font-extrabold sm:text-[34px]">Staff</h1><Button size="secondary" className="text-sm" onClick={() => setAdding(true)}>Add staff</Button></div>
    <p className="text-sm text-muted">Manage your team’s roles, PINs and access.</p>
    {staff.isPending ? <p role="status">Loading staff…</p> : staff.error ? <div role="alert"><p className="mb-3 text-brand-strong">{staff.error.message}</p><Button variant="secondary" onClick={() => { void staff.refetch() }}>Try again</Button></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{staff.data.map(person => <Card key={person.id}>
      <CardContent className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{person.full_name}</h2><p className="mt-1 text-sm text-muted">{person.phone ?? 'No phone set'}</p><p className="mt-2 text-sm font-semibold text-ink-2">{roleNames[person.role]}{!person.is_active ? <span className="ml-2 rounded-sm bg-amber-soft px-2 py-1 text-xs text-amber-ink">Inactive</span> : null}</p></div><Button variant="secondary" size="secondary" className="shrink-0 text-sm" aria-label={`Edit ${person.full_name}`} onClick={() => setEditing(person)}>Edit</Button></CardContent>
    </Card>)}</div>}
    <Sheet open={adding} onOpenChange={setAdding} title="Add staff" description="Their phone number and PIN are their sign-in details."><AddStaffForm onSaved={() => setAdding(false)} /></Sheet>
    <Sheet open={!!editing} onOpenChange={open => { if (!open) setEditing(null) }} title={editing?.full_name ?? 'Edit staff'} description="Changes are recorded in the activity log.">{editing ? <EditStaffForm key={editing.id} staff={editing} onSaved={() => setEditing(null)} /> : null}</Sheet>
  </section>
}

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, FieldError } from '@/components/ui/input'
import { isStaffPhone } from '@/lib/phone'
import { roleNames, type Role } from '@/features/auth/permissions'
import { saveStaff, type Staff, type StaffAction } from './staff-api'

const roles = z.enum(['operations', 'logistics', 'admin'])
const pinSchema = z.string().regex(/^\d{6}$/, 'Use exactly six digits')
const createSchema = z.object({ name: z.string().trim().min(2, 'Enter a full name').max(100, 'Use at most 100 characters'), phone: z.string().refine(isStaffPhone, 'Include the country code'), pin: pinSchema, role: roles })

function RoleSelect({ id, value, onChange }: { id: string; value: Role; onChange: (role: Role) => void }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-sm font-semibold">Role</label><select id={id} value={value} onChange={event => onChange(event.target.value as Role)} className="h-12 w-full rounded-lg border border-line-strong bg-card px-3">{Object.entries(roleNames).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></div>
}

function useStaffMutation(onSaved?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (action: StaffAction) => saveStaff(action),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['staff'] }), queryClient.invalidateQueries({ queryKey: ['auth-profile'] })])
      toast.success('Staff updated')
      onSaved?.()
    }, onError: (error: Error) => toast.error(error.message),
  })
}

export function AddStaffForm({ onSaved }: { onSaved: () => void }) {
  const form = useForm<z.infer<typeof createSchema>>({ resolver: zodResolver(createSchema), defaultValues: { name: '', phone: '', pin: '', role: 'operations' } })
  const mutation = useStaffMutation(() => { form.reset(); onSaved() })
  return <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(values => mutation.mutate(values))} noValidate>
    <div><label htmlFor="staff-name" className="mb-1.5 block text-sm font-semibold">Full name</label><Input id="staff-name" autoComplete="name" aria-invalid={!!form.formState.errors.name} aria-describedby="name-error" {...form.register('name')} /><FieldError id="name-error" message={form.formState.errors.name?.message} /></div>
    <div><label htmlFor="staff-phone" className="mb-1.5 block text-sm font-semibold">Phone number</label><Input id="staff-phone" type="tel" autoComplete="tel" placeholder="Include country code" aria-invalid={!!form.formState.errors.phone} aria-describedby="staff-phone-error" {...form.register('phone')} /><FieldError id="staff-phone-error" message={form.formState.errors.phone?.message} /></div>
    <RoleSelect id="staff-role" value={form.watch('role')} onChange={role => form.setValue('role', role, { shouldValidate: true })} />
    <div><label htmlFor="staff-pin" className="mb-1.5 block text-sm font-semibold">Six-digit PIN</label><Input id="staff-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} aria-invalid={!!form.formState.errors.pin} aria-describedby="staff-pin-error" {...form.register('pin')} /><FieldError id="staff-pin-error" message={form.formState.errors.pin?.message} /></div>
    <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Adding…' : 'Add staff member'}</Button>
  </form>
}

export function EditStaffForm({ staff, onSaved }: { staff: Staff; onSaved: () => void }) {
  const [role, setRole] = useState(staff.role)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const pinForm = useForm<{ pin: string }>({ resolver: zodResolver(z.object({ pin: pinSchema })), defaultValues: { pin: '' } })
  const mutation = useStaffMutation(onSaved)
  return <div className="flex flex-col gap-6">
    <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); mutation.mutate({ action: 'role', id: staff.id, role }) }}>
      <RoleSelect id="edit-role" value={role} onChange={setRole} /><Button type="submit" disabled={mutation.isPending || role === staff.role}>Save role</Button>
    </form>
    <form className="flex flex-col gap-3 border-t pt-5" onSubmit={pinForm.handleSubmit(({ pin }) => mutation.mutate({ action: 'pin', id: staff.id, pin }))} noValidate>
      <div><label htmlFor="new-pin" className="mb-1.5 block text-sm font-semibold">New six-digit PIN</label><Input id="new-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} aria-invalid={!!pinForm.formState.errors.pin} aria-describedby="new-pin-error" {...pinForm.register('pin')} /><FieldError id="new-pin-error" message={pinForm.formState.errors.pin?.message} /></div>
      <Button type="submit" variant="secondary" disabled={mutation.isPending}>Reset PIN</Button>
    </form>
    {staff.is_active ? <div className="border-t pt-5">
      {confirmDeactivate ? <div className="flex flex-col gap-3 rounded-lg bg-brand-soft p-3"><p className="text-sm text-brand-deep">{staff.full_name} will lose access immediately.</p><Button disabled={mutation.isPending} onClick={() => mutation.mutate({ action: 'deactivate', id: staff.id })}>Deactivate</Button><Button variant="secondary" disabled={mutation.isPending} onClick={() => setConfirmDeactivate(false)}>Keep active</Button></div> : <Button variant="secondary" className="w-full text-brand-strong" onClick={() => setConfirmDeactivate(true)}>Deactivate staff member</Button>}
    </div> : <p className="rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">This staff member is inactive.</p>}
  </div>
}

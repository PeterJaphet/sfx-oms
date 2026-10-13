export type Role = 'operations' | 'logistics' | 'admin'
export type CreateStaff = { name: string; phone: string; email: string; pin: string; role: Role }
export type ManageStaff = { action: 'role'; id: string; role: Role } | { action: 'pin'; id: string; pin: string } | { action: 'deactivate'; id: string }
const roles: readonly string[] = ['operations', 'logistics', 'admin']
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid staff request')
  return value as Record<string, unknown>
}
function pin(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value)) throw new Error('PIN must be exactly six digits')
  return value
}
function role(value: unknown): Role {
  if (typeof value !== 'string' || !roles.includes(value)) throw new Error('Choose a valid staff role')
  return value as Role
}
export function parseCreateStaff(value: unknown): CreateStaff {
  const body = object(value)
  if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 100) throw new Error('Enter a full name between 2 and 100 characters')
  if (typeof body.phone !== 'string' || !/^\+?[\d\s()-]+$/.test(body.phone.trim())) throw new Error('Enter a phone number with its country code')
  const digits = body.phone.replace(/\D/g, '')
  if (!/^\d{7,15}$/.test(digits)) throw new Error('Enter a phone number with its country code')
  return { name: body.name.trim(), phone: '+' + digits, email: digits + '@staff.sfxburger.app', pin: pin(body.pin), role: role(body.role) }
}
export function parseManageStaff(value: unknown): ManageStaff {
  const body = object(value)
  if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) throw new Error('Choose a staff member')
  if (body.action === 'role') return { action: 'role', id: body.id, role: role(body.role) }
  if (body.action === 'pin') return { action: 'pin', id: body.id, pin: pin(body.pin) }
  if (body.action === 'deactivate') return { action: 'deactivate', id: body.id }
  throw new Error('Unknown staff action')
}

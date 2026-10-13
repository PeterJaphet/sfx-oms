import { describe, expect, it } from 'vitest'
import { parseCreateStaff, parseManageStaff } from '../../../supabase/functions/_shared/validation'
const create = { name: 'Increase', phone: '+90 (500) 000-0000', pin: '123456', role: 'operations' }
const id = '00000000-0000-0000-0000-00000000000b'
describe('Edge staff validation', () => {
  it('normalizes phone identity and discards caller-supplied privileged fields', () => {
    const result = parseCreateStaff({ ...create, actor: id, is_active: false, email: 'admin@example.com' })
    expect(result.email).toBe('905000000000@staff.sfxburger.app')
    expect(result.phone).toBe('+905000000000')
    expect(result).not.toHaveProperty('actor')
    expect(result).not.toHaveProperty('is_active')
  })
  it.each(['12345','1234567','abcdef','12 456',123456])('rejects invalid PIN %s', pin => {
    expect(() => parseCreateStaff({ ...create, pin })).toThrow('PIN must be exactly six digits')
    expect(() => parseManageStaff({ action: 'pin', id, pin })).toThrow()
  })
  it.each([null, [], {}, { ...create, role: 'owner' }, { ...create, phone: 'abc905000000000' }, { ...create, name: 'A' }])('rejects invalid creation payload', value => expect(() => parseCreateStaff(value)).toThrow())
  it('accepts only the three scoped management actions', () => {
    expect(parseManageStaff({ action: 'role', id, role: 'logistics' })).toEqual({ action: 'role', id, role: 'logistics' })
    expect(parseManageStaff({ action: 'deactivate', id })).toEqual({ action: 'deactivate', id })
    expect(() => parseManageStaff({ action: 'delete', id })).toThrow()
    expect(() => parseManageStaff({ action: 'role', id: 'not-a-uuid', role: 'admin' })).toThrow()
  })
})

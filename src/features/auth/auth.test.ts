import { describe, expect, it } from 'vitest'
import { canVisit, homeRoutes, navigationFor, sessionIsExpired, type Role } from './permissions'
import { isStaffPhone, staffEmail } from '@/lib/phone'

describe('staff identity', () => {
  it('uses the same synthetic email for formatted and unformatted phone numbers', () => {
    expect(staffEmail('+90 (500) 000-0000')).toBe('905000000000@staff.sfxburger.app')
    expect(staffEmail('905000000000')).toBe(staffEmail('+90 (500) 000-0000'))
  })
  it.each(['', 'abc905000000000', '123', '+1234567890123456'])('rejects invalid phone %s', phone => {
    expect(isStaffPhone(phone)).toBe(false)
    expect(() => staffEmail(phone)).toThrow()
  })
})
describe('role routing', () => {
  it.each([['operations','/order'],['logistics','/deliveries'],['admin','/dashboard']] as const)('lands %s on %s', (role, route) => {
    expect(homeRoutes[role]).toBe(route)
    expect(navigationFor(role).some(page => page.path === route)).toBe(true)
  })
  it.each(['operations','logistics','admin'] as Role[])('all %s navigation entries are authorized', role => {
    for (const page of navigationFor(role)) expect(canVisit(role, page.path)).toBe(true)
  })
  it('blocks guessed privileged URLs', () => {
    expect(canVisit('operations','/staff')).toBe(false)
    expect(canVisit('operations','/dashboard')).toBe(false)
    expect(canVisit('logistics','/orders')).toBe(false)
    expect(canVisit('logistics','/money')).toBe(false)
    expect(canVisit('logistics','/menu')).toBe(false)
    expect(canVisit('admin','/unknown')).toBe(false)
  })
})
describe('session cutoff', () => {
  const cutoff = '2026-10-12T12:00:00.000Z'
  it('ends at the cutoff, not after another refresh or page load', () => {
    expect(sessionIsExpired(cutoff, Date.parse(cutoff)-1)).toBe(false)
    expect(sessionIsExpired(cutoff, Date.parse(cutoff))).toBe(true)
    expect(sessionIsExpired(cutoff, Date.parse(cutoff)+1)).toBe(true)
  })
  it('rejects invalid expiry data', () => expect(sessionIsExpired('not a date')).toBe(true))
})

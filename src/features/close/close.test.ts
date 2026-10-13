import { describe, expect, it } from 'vitest'
import {
  countedSchema,
  closeAttemptSchema,
  financialWritesBlocked,
} from './close-model'
describe('daily close validation and recovery', () => {
  it.each(['0', '0.00', '2400', '2,400.50', '999999999999.99'])(
    'accepts counted %s including a zero till',
    (v) => expect(countedSchema.safeParse(v).success).toBe(true),
  )
  it.each([
    '',
    '-1',
    'NaN',
    'Infinity',
    '1.001',
    '2,40',
    '1e3',
    '1000000000000',
  ])('rejects invalid count %s', (v) =>
    expect(countedSchema.safeParse(v).success).toBe(false),
  )
  it('recovers the same nonce and strips client computed totals', () => {
    const saved = {
      request_id: '80000000-0000-4000-8000-000000000001',
      payload: {
        counted: '2,400.50',
        date: '2026-10-13',
        account_id: 1,
        note: 'Count again',
        quote_token: 'a'.repeat(64),
        expected: 2450,
        difference: -49.5,
      },
    }
    const recovered = closeAttemptSchema.parse(
      JSON.parse(JSON.stringify(saved)),
    )
    expect(recovered.request_id).toBe(saved.request_id)
    expect(recovered.payload.counted).toBe('2400.50')
    expect(recovered.payload).not.toHaveProperty('expected')
    expect(recovered.payload).not.toHaveProperty('difference')
  })
  it('refuses corrupted pending snapshots', () =>
    expect(
      closeAttemptSchema.safeParse({
        request_id: 'bad',
        payload: { counted: 2400 },
      }).success,
    ).toBe(false))
  it.each(['operations', 'logistics'])(
    'blocks %s writes until open state is verified',
    (role) => {
      expect(financialWritesBlocked(role, undefined, false)).toBe(true)
      expect(financialWritesBlocked(role, false, true)).toBe(true)
      expect(financialWritesBlocked(role, true, false)).toBe(true)
      expect(financialWritesBlocked(role, false, false)).toBe(false)
    },
  )
  it('permits Admin financial corrections after close', () =>
    expect(financialWritesBlocked('admin', true, false)).toBe(false))
})

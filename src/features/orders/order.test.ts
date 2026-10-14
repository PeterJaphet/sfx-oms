import { describe, expect, it } from 'vitest'
import { extraSelectionSchema, extraText } from './extra-model'
import { addDraftItem, amountSchema, detailsSchema, discountSchema, emptyDraft, getDraftExtras, impliedRate, quotePayload, savePayload, workspaceSchema, type DraftItem } from './order-model'

const line: DraftItem = { id: '40000000-0000-4000-8000-000000000001', product_id: 'burger', variant_id: 'regular', quantity: 1, addon_ids: [], note: '' }
describe('order drafts and safe save payloads', () => {
  it('merges matching items without changing the earlier draft', () => {
    const original = [line]
    expect(addDraftItem(original, { ...line, id: '40000000-0000-4000-8000-000000000002', quantity: 2 })[0].quantity).toBe(3)
    expect(original[0].quantity).toBe(1)
  })
  it('keeps different variants, extras and notes separate', () => {
    const cases = [{ ...line, variant_id: 'double' }, { ...line, addon_ids: ['egg'] }, { ...line, note: 'No onions' }]
    for (const next of cases) expect(addDraftItem([line], next)).toHaveLength(2)
  })
  it('matches extras regardless of selection order', () => expect(addDraftItem([{ ...line, addon_ids: ['fish', 'swallow'] }], { ...line, addon_ids: ['swallow', 'fish'] })[0].quantity).toBe(2))
  it('sends item IDs and entered payment amounts, never client totals or prices', () => {
    const draft = emptyDraft(); draft.items = [{ ...line, quantity: 2 }]; draft.payments = [{ id: line.id, account_id: 7, amount_try: '410', amount: '15000' }]
    const payload = savePayload(draft, 'server-quote')
    expect(payload.items).toEqual([{ variant_id: 'regular', quantity: 2, addon_ids: [], note: '' }])
    expect(payload.payments).toEqual([{ account_id: 7, amount_try: '410', amount: '15000' }])
    expect(payload).not.toHaveProperty('total'); expect(payload).not.toHaveProperty('subtotal'); expect(payload).not.toHaveProperty('rate_to_try')
    expect(payload.client_request_id).toBe(draft.request_id)
  })
  it('unpaid saves exclude all draft payments', () => {
    const draft = emptyDraft(); draft.items = [line]; draft.payments = [{ id: line.id, account_id: 1, amount_try: '100' }]
    expect(savePayload(draft, 'server-quote', true).payments).toEqual([])
    expect(draft.payments).toHaveLength(1)
  })
  it('sends a percent without converting it to a money amount', () => {
    const draft = emptyDraft(); draft.discount = { kind: 'percent', value: '10', reason: 'Loyal customer' }
    expect(quotePayload(draft)).toHaveProperty('discount_percent', '10')
    expect(quotePayload(draft)).not.toHaveProperty('discount_amount')
  })
  it('removes a stale delivery address from pickup saves', () => {
    const draft = emptyDraft(); draft.details.delivery_address = 'Old address'
    expect(savePayload(draft, 'server-quote').delivery_address).toBe('')
  })
  it('preserves pending save payloads across local draft restoration', () => {
    const draft = emptyDraft(); draft.items = [line]
    const state = { draft, savedId: null, attempt: { unpaid: false, payload: savePayload(draft, 'server-quote') } }
    expect(workspaceSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })
  it('rejects invalid restored draft quantities', () => {
    const draft = emptyDraft(); draft.items = [{ ...line, quantity: -1 }]
    expect(workspaceSchema.safeParse({ draft, savedId: null, attempt: null }).success).toBe(false)
  })
})
describe('entered amounts and order metadata', () => {
  it.each(['1', '1.5', '1.50', '15,000', '1,000.25'])('accepts %s without deriving money totals', amount => expect(amountSchema.safeParse(amount).success).toBe(true))
  it.each(['0', '-1', '', '1.001', '1e3', 'NaN', 'Infinity', '12,3', '1,00.00'])('rejects invalid amount %s', amount => expect(amountSchema.safeParse(amount).success).toBe(false))
  it('normalizes correctly grouped currency input', () => expect(amountSchema.parse(' 15,000.50 ')).toBe('15000.50'))
  it('requires a delivery address only for delivery', () => {
    const details = emptyDraft().details
    expect(detailsSchema.safeParse(details).success).toBe(true)
    expect(detailsSchema.safeParse({ ...details, order_type: 'delivery' }).success).toBe(false)
    expect(detailsSchema.safeParse({ ...details, order_type: 'delivery', delivery_address: 'EMU dorm 3' }).success).toBe(true)
  })
  it('requires a reason and a percent no higher than 100', () => {
    expect(discountSchema.safeParse({ kind: 'percent', value: '101', reason: 'Too much' }).success).toBe(false)
    expect(discountSchema.safeParse({ kind: 'amount', value: '20', reason: '   ' }).success).toBe(false)
    expect(discountSchema.safeParse({ kind: 'percent', value: '10', reason: 'Loyal customer' }).success).toBe(true)
  })
  it('shows an implied rate without changing the submitted amounts', () => expect(impliedRate('410', '15,000')).toBeCloseTo(0.027333333))
  it('does not show a rate for invalid or zero receipts', () => { expect(impliedRate('410', '0')).toBeNull(); expect(impliedRate('bad', '100')).toBeNull() })
})

describe('M12 independent total extra quantities', () => {
  const soup = { ...line, quantity: 2, extras: [{ addon_id: 'swallow', quantity: 4 }] }
  it('sends total counts independent of dish quantity with no prices', () => {
    const draft = emptyDraft(); draft.items = [soup]
    expect(quotePayload(draft).items).toEqual([{ variant_id: 'regular', quantity: 2, extras: [{ addon_id: 'swallow', quantity: 4 }], note: '' }])
    expect(quotePayload({ ...draft, items: [{ ...soup, quantity: 3 }] }).items).toEqual([{ variant_id: 'regular', quantity: 3, extras: [{ addon_id: 'swallow', quantity: 4 }], note: '' }])
  })
  it('merges matching configurations by adding dish and extra counts', () => {
    const once = { ...line, extras: [{ addon_id: 'swallow', quantity: 4 }] }
    const twice = addDraftItem([once], { ...once, id: crypto.randomUUID() })
    expect(twice).toHaveLength(1); expect(twice[0].quantity).toBe(2); expect(twice[0].extras?.[0].quantity).toBe(8)
    const thrice = addDraftItem(twice, { ...once, id: crypto.randomUUID() })
    expect(thrice[0].quantity).toBe(3); expect(thrice[0].extras?.[0].quantity).toBe(12)
    expect(once.extras[0].quantity).toBe(4)
  })
  it('keeps configurations with different extras per dish separate', () => {
    expect(addDraftItem([soup], { ...soup, id: crypto.randomUUID(), quantity: 1 })).toHaveLength(2)
  })
  it('merges multiple extras regardless of selection order', () => {
    const a = { ...line, extras: [{ addon_id: 'fish', quantity: 1 }, { addon_id: 'swallow', quantity: 4 }] }
    const merged = addDraftItem([a], { ...a, id: crypto.randomUUID(), extras: [...a.extras].reverse() })
    expect(merged[0].extras).toEqual([{ addon_id: 'fish', quantity: 2 }, { addon_id: 'swallow', quantity: 8 }])
  })
  it('does not merge beyond dish or extra quantity limits', () => {
    expect(addDraftItem([{ ...line, quantity: 999 }], line)).toHaveLength(2)
    const many = { ...line, extras: [{ addon_id: 'swallow', quantity: 500 }] }
    expect(addDraftItem([many], { ...many, id: crypto.randomUUID() })).toHaveLength(2)
  })
  it('converts old selected extras to their original total count when editing', () => {
    expect(getDraftExtras({ ...line, quantity: 3, addon_ids: ['swallow', 'fish', 'swallow'] })).toEqual([{ addon_id: 'swallow', quantity: 3 }, { addon_id: 'fish', quantity: 3 }])
    expect(getDraftExtras(soup)).toEqual(soup.extras)
  })
  it('merges an old and new compatible line without losing extra counts', () => {
    const merged = addDraftItem([{ ...line, addon_ids: ['swallow'] }], { ...soup, id: crypto.randomUUID(), extras: [{ addon_id: 'swallow', quantity: 2 }] })
    expect(merged[0].quantity).toBe(3); expect(merged[0].extras).toEqual([{ addon_id: 'swallow', quantity: 3 }]); expect(merged[0].addon_ids).toEqual([])
  })
  it('restores new pending requests unchanged just like old pending requests', () => {
    const draft = emptyDraft(); draft.items = [soup]
    const state = { draft, savedId: null, attempt: { unpaid: true, payload: savePayload(draft, 'server-quote', true) } }
    expect(workspaceSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })
  it.each([0, -1, 1.5, 1000, NaN])('rejects invalid restored extra count %s', quantity => {
    const draft = emptyDraft(); draft.items = [{ ...soup, extras: [{ addon_id: 'swallow', quantity }] }]
    expect(workspaceSchema.safeParse({ draft, savedId: null, attempt: null }).success).toBe(false)
  })
  it('allows removing extras with zero in the picker but not negative or fractional counts', () => {
    expect(extraSelectionSchema.safeParse({ addon_id: 'swallow', quantity: 0 }).success).toBe(true)
    for (const quantity of [-1, 1.5, 1000, NaN]) expect(extraSelectionSchema.safeParse({ addon_id: 'swallow', quantity }).success).toBe(false)
  })
  it('labels explicit and historical counts without multiplying new quantities', () => {
    expect(extraText([{ name: 'Swallow', price: 50, quantity: 4 }, { name: 'Fish', price: 180, quantity: 1 }], 2)).toBe('4 × Swallow, Fish')
    expect(extraText([{ name: 'Swallow', price: 50 }], 2)).toBe('2 × Swallow')
  })
})

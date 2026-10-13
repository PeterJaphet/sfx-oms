import { describe, expect, it } from 'vitest'
import { addDraftItem, amountSchema, detailsSchema, discountSchema, emptyDraft, impliedRate, quotePayload, savePayload, workspaceSchema, type DraftItem } from './order-model'

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

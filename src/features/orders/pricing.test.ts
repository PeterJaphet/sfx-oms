import { describe, expect, it } from 'vitest'
import { addDraftItem, emptyDraft, quotePayload, savePayload, type DraftItem } from './order-model'
const item:DraftItem={id:'40000000-0000-4000-8000-000000000001',product_id:'p',variant_id:'v',quantity:2,addon_ids:[],extras:[],note:''}
describe('M17 per-order pricing',()=>{
 it('sends an override and reason without a client total',()=>{
  const d=emptyDraft();d.items=[{...item,unit_price_override:'250',price_override_reason:'Earlier receipt'}];d.details.order_type='pickup';d.discount={kind:'percent',value:'20',reason:'Staff discount (20%)'}
  const q=quotePayload(d);expect(q.items).toEqual([{variant_id:'v',quantity:2,extras:[],note:'',unit_price_override:'250',price_override_reason:'Earlier receipt'}]);expect(q).toMatchObject({discount_percent:'20',discount_reason:'Staff discount (20%)'});expect(savePayload(d,'q',true,'c')).not.toHaveProperty('total')
 })
 it('does not merge lines sold at different prices or for different reasons',()=>{
  const x={...item,unit_price_override:'250',price_override_reason:'Receipt'}
  expect(addDraftItem([x],{...item,unit_price_override:'300',price_override_reason:'Receipt'})).toHaveLength(2)
  expect(addDraftItem([x],{...x,price_override_reason:'Another receipt'})).toHaveLength(2)
 })
 it('treats an empty override like the normal menu price',()=>{
  expect(addDraftItem([item],{...item,unit_price_override:'',price_override_reason:''})).toHaveLength(1)
 })
})

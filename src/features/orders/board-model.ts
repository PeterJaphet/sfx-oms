import { extraSnapshotSchema, extraText } from './extra-model'
import { z } from 'zod'
import { formatMoney } from '@/lib/format'
import type { Role } from '@/features/auth/permissions'
import { channels, orderTypes } from './order-model'

export const statusSchema = z.enum(['new','preparing','ready','picked_up','completed','cancelled'])
export const statusNames = { new: 'Accepted', preparing: 'Accepted', ready: 'Accepted', picked_up: 'Accepted', completed: 'Delivered', cancelled: 'Cancelled' }
export const savedItemSchema = z.object({ id:z.string(), product_name:z.string(), variant_name:z.string(), quantity:z.number().int().positive(), line_total:z.number(), addons:z.array(extraSnapshotSchema), note:z.string().nullable() })
export const boardOrderSchema = z.object({ settlement:z.record(z.string(),z.json()).nullable().optional(), id:z.string().uuid(), business_date:z.string(), daily_number:z.number(), channel:z.enum(['walk_in','whatsapp','instagram','phone','delivery_app','event']), order_type:z.enum(['pickup','delivery','dine_in']), status:statusSchema, customer_name:z.string().nullable(),customer_phone:z.string().nullable(),delivery_address:z.string().nullable(),note:z.string().nullable(), subtotal:z.number(),discount_amount:z.number(),discount_reason:z.string().nullable(),total:z.number(),created_at:z.string(),ready_at:z.string().nullable(),picked_up_at:z.string().nullable(),paid_try:z.number(),balance_due:z.number(),paid_via:z.string().nullable().optional(),cancel_reason:z.string().nullable().optional(),items:z.array(savedItemSchema) })
export type BoardOrder=z.infer<typeof boardOrderSchema>
export const paymentLabel=(order:BoardOrder)=>order.status==='cancelled'?'Cancelled':order.balance_due>0?`${formatMoney(order.balance_due,'TRY')} due`:'Paid'
export const orderNumber=(o:Pick<BoardOrder,'daily_number'>)=>`#${String(o.daily_number).padStart(3,'0')}`
export const channelName=(v:string)=>channels.find(([id])=>id===v)?.[1]??v
export const typeName=(v:string)=>orderTypes.find(([id])=>id===v)?.[1]??(v==='dine_in'?'Dine-in':v)
export function nextAction(o:Pick<BoardOrder,'status'|'order_type'|'settlement'>,role:Role):{status:z.infer<typeof statusSchema>;label:string}|null {
 if(o.status==='completed'||o.status==='cancelled')return null
 if(o.settlement)return role==='logistics'&&o.order_type!=='delivery'?null:{status:'completed',label:'Mark delivered · confirm payment'}
 if(role==='logistics')return o.order_type!=='delivery'?null:o.status==='ready'?{status:'picked_up',label:'Picked up'}:o.status==='picked_up'?{status:'completed',label:'Delivered'}:null
 if(o.status==='new')return {status:'preparing',label:'Start cooking'}
 if(o.status==='preparing')return {status:'ready',label:'Mark ready'}
 if(o.order_type==='delivery')return role==='admin'?o.status==='ready'?{status:'picked_up',label:'Picked up'}:{status:'completed',label:'Delivered'}:null
 return o.status==='ready'?{status:'completed',label:'Complete order'}:null
}
export function canCancel(o:Pick<BoardOrder,'status'|'paid_try'>,role:Role){return o.status!=='cancelled'&&(role==='admin'||role==='operations'&&o.paid_try===0&&o.status!=='completed')}
export function matchesSearch(o:BoardOrder,search:string){const s=search.trim().toLowerCase();return !s||orderNumber(o).toLowerCase().includes(s)||String(o.daily_number)===s.replace(/^#/,'').replace(/^0+(?=\d)/,'')||(o.customer_name??'').toLowerCase().includes(s)||(o.customer_phone??'').includes(s)}
export function itemText(i:BoardOrder['items'][number]){return `${i.quantity} × ${i.product_name}${i.variant_name!=='Regular'?` (${i.variant_name})`:''}${i.addons.length?` + ${extraText(i.addons,i.quantity)}`:''}`}
export function receiptText(o:BoardOrder){return ['SFx Burger',`Order ${orderNumber(o)} · ${o.business_date}`,`${channelName(o.channel)} · ${typeName(o.order_type)}`,o.customer_name?`Customer: ${o.customer_name}`:'',o.order_type==='delivery'&&o.delivery_address?`Deliver to: ${o.delivery_address}`:'','',...o.items.flatMap(i=>[`${itemText(i)} — ${formatMoney(i.line_total,'TRY')}`,i.note?`  ${i.note}`:'']),`Subtotal: ${formatMoney(o.subtotal,'TRY')}`,o.discount_amount>0?`Discount: ${formatMoney(o.discount_amount,'TRY')} · ${o.discount_reason}`:'',`Total: ${formatMoney(o.total,'TRY')}`,`Status: ${statusNames[o.status]}`,o.status==='cancelled'?`Cancellation: ${o.cancel_reason??'Order cancelled'}`:`Received: ${formatMoney(o.paid_try,'TRY')}${o.paid_via?` · ${o.paid_via}`:''}`,o.status!=='cancelled'?`Payment: ${paymentLabel(o)}`:'',o.note?`Note: ${o.note}`:''].filter(line=>line!=='').join('\n')}
export function deliveryAge(o:BoardOrder,now=Date.now()){const picked=o.status==='picked_up';const time=Date.parse((picked?o.picked_up_at:o.ready_at)??o.created_at);return `${picked?'out':'ready'} ${Math.max(0,Math.floor((now-time)/60000))} min`}

export function statusGroup(status:BoardOrder['status']){return status==='cancelled'?'cancelled':status==='completed'?'completed':'accepted'}

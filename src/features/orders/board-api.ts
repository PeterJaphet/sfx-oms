import { assertOnline } from '@/lib/connectivity'
import { z } from 'zod'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { client } from '@/features/menu/menu-api'
import { boardOrderSchema } from './board-model'
import type { DraftPayment } from './order-model'
import { accountSchema } from './order-model'
import { SaveError } from './order-api'

export async function refreshOrderData(queryClient:QueryClient){await Promise.all(['orders','deliveries','order-payments','account-balances','activity','reports','debts'].map(key=>queryClient.invalidateQueries({queryKey:[key]})))}
export function useBoardReference(){return useQuery({queryKey:['orders','reference'],staleTime:15000,refetchInterval:15000,queryFn:async()=>{
 const db=client();const [day,accounts,rates]=await Promise.all([db.rpc('business_date'),db.from('accounts').select('id,name,currency,is_active').order('sort_order'),db.from('fx_rates').select('*').order('effective_date',{ascending:false}).order('id',{ascending:false})]);
 for(const result of [day,accounts,rates])if(result.error)throw new Error(result.error.message)
 return {day:z.string().parse(day.data),accounts:z.array(accountSchema.extend({is_active:z.boolean()})).parse(accounts.data),rates:rates.data!}
}})}
async function readPages<T>(load:(offset:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>){const rows:T[]=[];let offset=0;while(true){const result=await load(offset);if(result.error)throw new Error(result.error.message);if(!result.data)throw new Error('Order data is missing');rows.push(...result.data);if(result.data.length<1000)return rows;offset+=1000}}
export async function loadBoard(from:string,to:string,account:number|null){
 const db=client()
 const orders=await readPages(offset=>db.from('orders').select('id,business_date,daily_number,channel,order_type,status,customer_name,customer_phone,delivery_address,note,subtotal,discount_amount,discount_reason,total,created_at,ready_at,picked_up_at,cancel_reason,settlement').gte('business_date',from).lte('business_date',to).order('created_at',{ascending:false}).order('id').range(offset,offset+999))
 const paymentRows=[];const itemRows=[];const accountsForOrders=new Set<string>()
 // Bounded GET URLs; drain each result so larger orders are never truncated.
 for(let start=0;start<orders.length;start+=50){const ids=orders.slice(start,start+50).map(o=>o.id);const [payments,items,entries]=await Promise.all([
  readPages(offset=>db.from('v_order_payments').select('*').in('id',ids).order('id').range(offset,offset+999)),
  readPages(offset=>db.from('order_items').select('id,order_id,product_name,variant_name,quantity,line_total:charged_total,addons,note,catalogue_unit_price,price_override_reason').in('order_id',ids).order('id').range(offset,offset+999)),
  account!==null?readPages(offset=>db.from('ledger_entries').select('id,order_id').in('order_id',ids).eq('account_id',account).eq('entry_type','order_payment').order('id').range(offset,offset+999)):Promise.resolve([])
 ]);paymentRows.push(...payments);itemRows.push(...items);for(const entry of entries)if(entry.order_id)accountsForOrders.add(entry.order_id)}
 const paymentsById=new Map(paymentRows.map(p=>[p.id,p]));const itemsById=new Map<string,typeof itemRows>();for(const item of itemRows){const group=itemsById.get(item.order_id)??[];group.push(item);itemsById.set(item.order_id,group)}
 return orders.filter(o=>account===null||accountsForOrders.has(o.id)).map(o=>{const p=paymentsById.get(o.id);if(!p)throw new Error('Order payment totals are missing');return boardOrderSchema.parse({...o,paid_try:p.paid_try,balance_due:p.balance_due,paid_via:p.paid_via,items:itemsById.get(o.id)??[]})})
}
export async function loadDailySales(day:string){const result=await client().from('v_sales_daily').select('orders,net_sales').eq('business_date',day).maybeSingle();if(result.error)throw new Error(result.error.message);return result.data}
export async function loadDeliveries(){const result=await client().rpc('list_delivery_orders');if(result.error)throw new Error(result.error.message);return z.array(boardOrderSchema).parse(result.data)}
export async function changeStatus(id:string,status:'new'|'preparing'|'ready'|'picked_up'|'completed'|'cancelled',automatic=false){
  assertOnline();
  if(automatic){
    const r=await client().rpc('deliver_trading_order',{p_order:id})
    if(r.error)throw new Error(r.error.message)
    if(!r.data?.id)throw new Error('Delivery confirmation was not received; refresh and retry')
    return
  }
  const result=await client().rpc('set_order_status',{p_order:id,p_status:status});if(result.error)throw new Error(result.error.message);if(!result.data?.id)throw new Error('Status confirmation was not received; refresh the order')}
export async function cancelOrder(id:string,reason:string){
  assertOnline();const result=await client().rpc('cancel_order',{p_order:id,p_reason:reason});if(result.error)throw new Error(result.error.message);if(!result.data?.id)throw new Error('Cancellation confirmation was not received; refresh the order')}
export async function addSavedPayment(id:string,payment:DraftPayment){
  assertOnline();const result=await client().rpc('add_order_payment',{p_order:id,p_account:payment.account_id,p_amount_try:Number(payment.amount_try),p_amount:Number(payment.amount??payment.amount_try),p_request_id:payment.id});if(result.error)throw new SaveError(result.error.message,!result.error.code|| result.error.code === 'SFX_OFFLINE' ||result.error.code==='42501'||result.error.code.startsWith('PGRST')||result.error.code.startsWith('08'));if(!result.data)throw new SaveError('Payment confirmation was not received; retry the same payment',true);return result.data}

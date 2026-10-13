import { useFinancialDay } from '@/features/close/financial-day'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { FieldError, Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import type { Role } from '@/features/auth/permissions'
import { client } from '@/features/menu/menu-api'
import { PaymentForm } from './OrderForms'
import type { DraftPayment } from './order-model'
import { useBoardReference } from './board-api'
import { canCancel,channelName,itemText,orderNumber,receiptText,statusNames,typeName,type BoardOrder } from './board-model'
import { PaymentBadge } from './OrderCard'

const reasonSchema=z.object({reason:z.string().trim().min(3,'Enter a reason of at least 3 characters').max(1000)})
function CancelForm({paid,busy,onCancel}:{paid:boolean;busy:boolean;onCancel:(reason:string)=>Promise<void>}){
 const form=useForm<z.infer<typeof reasonSchema>>({resolver:zodResolver(reasonSchema),defaultValues:{reason:''}})
 return <form className="space-y-4" onSubmit={form.handleSubmit(async({reason})=>{try{await onCancel(reason)}catch{/* The mutation displays the database message. */}})}><p className="rounded-xl bg-amber-soft p-4 text-sm text-amber-ink">{paid?'Voiding refunds the recorded payments to their original accounts.':'Cancellation keeps the order and its items in history.'}</p><label className="block text-sm font-semibold" htmlFor="cancel-reason">Reason</label><Input id="cancel-reason" aria-invalid={!!form.formState.errors.reason} aria-describedby="cancel-reason-error" {...form.register('reason')}/><FieldError id="cancel-reason-error" message={form.formState.errors.reason?.message}/><Button className="w-full" disabled={busy||form.formState.isSubmitting} type="submit">{busy?'Saving…':paid?'Void and refund':'Cancel order'}</Button></form>
}
function ReceiptPreview({order}:{order:BoardOrder}){
 const text=receiptText(order);const input=useRef<HTMLTextAreaElement>(null)
 return <div className="space-y-4"><label className="block text-sm font-semibold" htmlFor="receipt-text">Receipt text</label><textarea ref={input} id="receipt-text" readOnly value={text} className="min-h-80 w-full rounded-xl border bg-card p-3 text-sm"/><Button className="w-full" variant="secondary" onClick={async()=>{try{if(!navigator.clipboard){input.current?.focus();input.current?.select();toast.info('Text selected; use your phone’s Copy command');return}await navigator.clipboard.writeText(text);toast.success('Receipt copied')}catch(e){toast.error((e as Error).message)}}}>Copy receipt</Button><Button asChild className="w-full"><a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></Button></div>
}
function PaymentHistory({id}:{id:string}){const query=useQuery({queryKey:['order-payments',id],refetchInterval:15000,queryFn:async()=>{const result=await client().from('ledger_entries').select('id,amount,amount_try,entry_type,accounts(name,currency)').eq('order_id',id).order('id');if(result.error)throw new Error(result.error.message);return result.data.map(p=>({...p,currency:z.enum(['TRY','USD','NGN']).parse(p.accounts?.currency)}))}})
 return <section className="space-y-2"><h3 className="text-sm font-bold">Payments and refunds</h3>{query.error?<p role="alert" className="text-sm text-brand-strong">{query.error.message}</p>:query.isPending?<p role="status" className="text-sm">Loading payments…</p>:query.data.length?query.data.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-2 rounded-lg border bg-card p-3 text-sm"><span>{p.accounts?.name} · {p.entry_type==='refund'?'Refund':p.entry_type==='reversal'?'Reversal':'Payment'}</span><span>{formatMoney(p.amount,p.currency)} · covers {formatMoney(p.amount_try,'TRY')}</span></div>):<p className="text-sm text-muted">No payments recorded.</p>}</section>
}
export function OrderDetails({order,role,busy,paymentBlocked,onClose,onPayment,onCancel}:{order:BoardOrder;role:Role;busy:boolean;paymentBlocked:boolean;onClose:()=>void;onPayment:(payment:DraftPayment)=>Promise<void>;onCancel:(reason:string)=>Promise<void>}){
 const financial=useFinancialDay();
 const [mode,setMode]=useState<'details'|'payment'|'cancel'|'receipt'>('details');const [accountId,setAccountId]=useState<number>();const ref=useBoardReference();const account=ref.data?.accounts.find(a=>a.id===accountId&&a.is_active)
 return <Sheet open onOpenChange={open=>{if(!open)onClose()}} title={`${mode==='payment'?'Payment · ':mode==='cancel'?'Cancel · ':mode==='receipt'?'Receipt · ':''}Order ${orderNumber(order)}`} description={`Business day ${order.business_date} · ${statusNames[order.status]}`}>
  {paymentBlocked?<div role="alert" className="mb-4 space-y-2 rounded-xl bg-amber-soft p-3 text-sm text-amber-ink"><p>A payment is waiting for confirmation. Close details and use Retry payment confirmation on the Orders page.</p><Button className="w-full" variant="secondary" onClick={onClose}>Close to confirm payment</Button></div>:null}
  {mode!=='details'?<Button variant="secondary" className="mb-4 w-full" onClick={()=>setMode('details')}>Back to details</Button>:null}
  {mode==='receipt'?<ReceiptPreview order={order}/>:mode==='cancel'?<CancelForm paid={order.paid_try>0} busy={busy||financial.blocked} onCancel={onCancel}/>:mode==='payment'?<div className="space-y-4"><PaymentBadge order={order}/><p className="text-sm text-muted">Each payment is recorded immediately. Saved payments cannot be removed here.</p>{ref.error?<p role="alert" className="text-brand-strong">{ref.error.message}</p>:null}<div className="grid grid-cols-3 gap-2" role="group" aria-label="Pay with">{ref.data?.accounts.filter(a=>a.is_active).map(a=><Button key={a.id} variant={a.id===accountId?'default':'secondary'} className="px-1 text-sm" disabled={busy||paymentBlocked||financial.blocked} aria-pressed={a.id===accountId} onClick={()=>setAccountId(a.id)}>{a.name}</Button>)}</div>{account?<PaymentForm key={account.id} account={account} due={order.balance_due} defaultRate={ref.data?.rates.find(rate=>rate.currency===account.currency)} disabled={busy||paymentBlocked||financial.blocked} onAdd={async payment=>{await onPayment(payment);setMode('details')}}/>:null}</div>:<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm">{channelName(order.channel)} · {typeName(order.order_type)}</span><PaymentBadge order={order}/></div>
   <section className="space-y-3 rounded-xl border bg-card p-4">{order.items.map(i=><div key={i.id}><div className="flex justify-between gap-3"><p className="break-words text-sm font-semibold">{itemText(i)}</p><span className="shrink-0 text-sm">{formatMoney(i.line_total,'TRY')}</span></div>{i.note?<p className="break-words text-sm text-muted">{i.note}</p>:null}</div>)}{order.discount_amount>0?<p className="text-sm text-muted">Discount {formatMoney(order.discount_amount,'TRY')} · {order.discount_reason}</p>:null}<div className="flex justify-between border-t pt-3 text-xl font-bold"><span>Total</span><span>{formatMoney(order.total,'TRY')}</span></div></section>
   {order.customer_name?<p className="break-words">Customer: {order.customer_name}</p>:null}{order.customer_phone?<p className="break-words">Phone: {order.customer_phone}</p>:null}{order.delivery_address?<p className="break-words">Deliver to: {order.delivery_address}</p>:null}{order.note?<p className="break-words text-sm">Note: {order.note}</p>:null}{order.cancel_reason?<p className="break-words text-sm">Cancellation: {order.cancel_reason}</p>:null}
   <PaymentHistory id={order.id}/><Button variant="secondary" className="w-full" onClick={()=>setMode('receipt')}>Receipt</Button>{order.status!=='cancelled'&&order.balance_due>0?<Button className="w-full" disabled={busy||paymentBlocked||financial.blocked} onClick={()=>setMode('payment')}>Add payment</Button>:null}{canCancel(order,role)?<Button variant="secondary" className="w-full text-brand-strong" disabled={busy||paymentBlocked||financial.blocked} onClick={()=>setMode('cancel')}>{order.paid_try>0?'Void and refund':'Cancel order'}</Button>:order.status!=='cancelled'&&order.paid_try>0&&role==='operations'?<p className="text-sm text-muted">Ask Admin to void and refund a paid order.</p>:null}
  </div>}
 </Sheet>
}

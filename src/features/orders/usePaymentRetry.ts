import { assertOnline } from '@/lib/connectivity'
import { useRef, useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { paymentSchema, type DraftPayment } from './order-model'
import { addSavedPayment, refreshOrderData } from './board-api'
import { SaveError } from './order-api'

const pendingSchema=z.object({orderId:z.string().uuid(),payment:paymentSchema})
export function usePaymentRetry(){
 const {profile}=useAuth();const key=`sfx-payment-v1:${profile!.id}`;const queryClient=useQueryClient()
 const [pending,setPending]=useState<z.infer<typeof pendingSchema>|null>(()=>{try{const raw=sessionStorage.getItem(key);return raw?pendingSchema.parse(JSON.parse(raw)):null}catch{return null}})
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string>();const lock=useRef(false)
 async function send(orderId:string,payment:DraftPayment){
  assertOnline()
  if(lock.current)throw new Error('Payment is already being saved')
  if(pending&&(pending.orderId!==orderId||pending.payment.id!==payment.id))throw new Error('Confirm the pending payment before adding another')
  const attempt={orderId,payment};lock.current=true;setBusy(true);setError(undefined)
  try{
   // Persist before the write. If this fails, no payment is sent.
   sessionStorage.setItem(key,JSON.stringify(attempt));setPending(attempt)
   await addSavedPayment(orderId,payment)
   try{sessionStorage.removeItem(key)}catch{/* Retaining a confirmed request is safe to retry after reload. */}setPending(null);toast.dismiss('m4-payment-error');toast.success('Payment saved')
  }catch(e){const failure=e as Error;setError(failure.message);toast.error(failure.message,{id:'m4-payment-error'})
   if(failure instanceof SaveError?!failure.uncertain:!pending){try{sessionStorage.removeItem(key)}catch{/* Browser storage may be blocked. */}setPending(null)}
   throw e
  }finally{lock.current=false;setBusy(false);await refreshOrderData(queryClient)}
 }
 return {pending,busy,error,send,retry:()=>pending?send(pending.orderId,pending.payment):Promise.resolve()}
}

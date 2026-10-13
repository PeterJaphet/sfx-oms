import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { quoteOrder } from './order-api'
import { useOrder } from './order-context'
import { quotePayload } from './order-model'
export function useOrderQuote() {
  const { draft } = useOrder()
  const payload = quotePayload(draft)
  const quote = useQuery({ queryKey: ['order-quote', payload], queryFn: () => quoteOrder(payload), enabled: draft.items.length > 0, staleTime: 5_000, retry: false, refetchInterval: 15_000 })
  const message = quote.error?.message
  useEffect(() => { if (message) toast.error(message, { id: 'order-quote-error' }) }, [message])
  return quote
}

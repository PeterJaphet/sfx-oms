import { financialWritesBlocked } from './close-model'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'
import { client } from '@/features/menu/menu-api'
const daySchema = z.object({ business_date: z.iso.date(), closed: z.boolean() })
export function useFinancialDay() {
  const { profile } = useAuth()
  const query = useQuery({
    queryKey: ['financial-day', profile?.id],
    enabled: !!profile,
    staleTime: 15000,
    refetchInterval: 15000,
    retry: false,
    queryFn: async () => {
      const r = await client().rpc('financial_day_state')
      if (r.error) throw new Error(r.error.message)
      return daySchema.parse(r.data)
    },
  })
  return {
    ...query,
    blocked: financialWritesBlocked(
      profile?.role,
      query.data?.closed,
      !!query.error,
    ),
  }
}

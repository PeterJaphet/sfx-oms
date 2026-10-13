import { Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { OrderProvider } from './OrderProvider'
export default function OrderLayout() { const { profile } = useAuth(); return profile ? <OrderProvider key={profile.id} userId={profile.id}><Outlet /></OrderProvider> : null }

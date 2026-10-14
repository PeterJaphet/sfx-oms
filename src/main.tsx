import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { Toaster } from 'sonner'
import './index.css'
import { ConnectionNotice } from '@/components/ConnectionNotice'
import { InstallNotice } from '@/components/InstallNotice'
import { PwaNotice } from '@/components/PwaNotice'

const queryClient = new QueryClient({
  defaultOptions: { mutations: { networkMode: 'always', retry: false }, queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider><ConnectionNotice /><PwaNotice /><InstallNotice /><App /></AuthProvider>
        <Toaster position="top-center" theme="light" toastOptions={{ duration: 6000, style: { fontFamily: 'Antic, League Spartan, system-ui, sans-serif', boxShadow: 'none', background: 'rgb(var(--card))', color: 'rgb(var(--ink))', borderColor: 'rgb(var(--line-strong))' } }} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

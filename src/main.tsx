import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { Toaster } from 'sonner'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider><App /></AuthProvider>
        <Toaster position="top-center" theme="light" toastOptions={{ duration: 6000, style: { fontFamily: 'Archivo, sans-serif', boxShadow: 'none', background: 'rgb(var(--card))', color: 'rgb(var(--ink))', borderColor: 'rgb(var(--line-strong))' } }} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

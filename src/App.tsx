import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './features/auth/AuthProvider'
import LoginPage from './features/auth/LoginPage'
import CaseCarousel from './features/cases/CaseCarousel'
import CaseDetail from './features/cases/CaseDetail'
import { LoadOutProvider } from './features/cases/LoadOutProvider'
import DashboardPage from './features/dashboard/DashboardPage'
import SearchPage from './features/search/SearchPage'
import { supabaseConfigured } from './lib/supabase'

function AdminOnly({ children }: { children: ReactNode }) {
  return useAuth().isAdmin ? children : <Navigate to="/" replace />
}

function Gate() {
  const { session, profile, loading } = useAuth()
  if (loading) return <p className="p-6 text-gray-400">Caricamento…</p>
  if (!session) return <LoginPage />
  if (!profile) return <p className="p-6">Account non abilitato. Chiedi a Matteo o Leonardo.</p>
  return (
    <LoadOutProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CaseCarousel />} />
          <Route path="case/:id" element={<CaseDetail />} />
          <Route path="cerca" element={<SearchPage />} />
          <Route path="dashboard" element={<AdminOnly><DashboardPage /></AdminOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LoadOutProvider>
  )
}

export default function App() {
  if (!supabaseConfigured) return (
    <p className="p-6">Configura <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (vedi README).</p>
  )
  return <AuthProvider><Gate /></AuthProvider>
}

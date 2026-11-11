import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import CatalogPage from './features/admin/CatalogPage'
import { AuthProvider, useAuth } from './features/auth/AuthProvider'
import LoginPage from './features/auth/LoginPage'
import CaseCarousel from './features/cases/CaseCarousel'
import CaseDetail from './features/cases/CaseDetail'
import { LoadOutProvider } from './features/cases/LoadOutProvider'
import DashboardPage from './features/dashboard/DashboardPage'
import FixPage from './features/fix/FixPage'
import LogPage from './features/log/LogPage'
import SearchPage from './features/search/SearchPage'

function AdminOnly({ children }: { children: ReactNode }) {
  return useAuth().isAdmin ? children : <Navigate to="/" replace />
}

function Gate() {
  const { profile, loading } = useAuth()
  if (loading) return <p className="p-6 text-muted">Caricamento…</p>
  if (!profile) return <LoginPage />
  return (
    <LoadOutProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CaseCarousel />} />
          <Route path="case/:id" element={<CaseDetail />} />
          <Route path="cerca" element={<SearchPage />} />
          <Route path="dashboard" element={<AdminOnly><DashboardPage /></AdminOnly>} />
          <Route path="catalogo" element={<AdminOnly><CatalogPage /></AdminOnly>} />
          <Route path="da-sistemare" element={<AdminOnly><FixPage /></AdminOnly>} />
          <Route path="registro" element={<AdminOnly><LogPage /></AdminOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LoadOutProvider>
  )
}

export default function App() {
  return <ToastProvider><AuthProvider><Gate /></AuthProvider></ToastProvider>
}

import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { resetDemo } from '../demo/demoApi'
import { useAuth } from '../features/auth/AuthProvider'
import { useLoadOut } from '../features/cases/LoadOutProvider'
import Balloon from './Balloon'

const icons = {
  cases: <path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16" />,
  search: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />,
  dash: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  catalog: <path d="M5 4h10l4 4v12H5zM9 10h6M9 14h6M9 18h3" />,
  fix: <path d="M12 3l9 16H3zM12 10v4M12 17v.5" />,
}

function Tab({ to, icon, label, badge }: { to: string; icon: keyof typeof icons; label: string; badge?: number }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) =>
      `relative flex-1 flex flex-col items-center gap-1 py-2.5 text-[9px] uppercase tracking-widest transition ${isActive ? 'text-accent' : 'text-muted'}`}>
      {!!badge && <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-warn text-ink text-[10px] font-bold leading-4 text-center tracking-normal">{badge > 99 ? '99+' : badge}</span>}
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[icon]}</svg>
      {label}
    </NavLink>
  )
}

export default function Layout() {
  const { isAdmin, profile, signOut } = useAuth()
  const { openIssues, moves } = useLoadOut()
  const toFix = openIssues.length + moves.filter(m => m.status === 'pending').length
  return (
    <div className="min-h-svh pb-[calc(env(safe-area-inset-bottom,0px)+80px)]">
      <div className="flex items-center gap-3 px-5 overflow-hidden pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2">
        <Balloon className="w-6 h-9" />
        <span className="text-xs uppercase tracking-[0.2em] font-semibold whitespace-nowrap">Check-case</span>
        {api.demo && <span className="chip bg-accent/15 text-accent border border-accent/30">Demo</span>}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted whitespace-nowrap" title={profile?.display_name}>
          <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-ink ${isAdmin ? 'bg-accent' : 'bg-muted'}`}>{profile?.display_name[0]}</span>
        </span>
        {api.demo && <button onClick={resetDemo} className="text-xs text-muted">Reset</button>}
        <button onClick={signOut} className="text-xs text-muted">{api.demo ? 'Cambia' : 'Esci'}</button>
      </div>
      <Outlet />
      <nav className="fixed bottom-0 inset-x-0 z-20 glass border-x-0 border-b-0 flex px-2 pb-[env(safe-area-inset-bottom,0px)]">
        <Tab to="/" icon="cases" label="Case" />
        <Tab to="/cerca" icon="search" label="Dove va?" />
        {isAdmin && <Tab to="/dashboard" icon="dash" label="Dashboard" />}
        {isAdmin && <Tab to="/da-sistemare" icon="fix" label="Sistemare" badge={toFix} />}
        {isAdmin && <Tab to="/catalogo" icon="catalog" label="Catalogo" />}
      </nav>
    </div>
  )
}

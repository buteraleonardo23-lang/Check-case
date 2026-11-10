import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 flex flex-col items-center py-2 text-xs ${isActive ? 'text-green-400' : 'text-gray-400'}`

export default function Layout() {
  const { isAdmin, profile, signOut } = useAuth()
  return (
    <div className="min-h-full pb-16">
      <div className="flex justify-end items-center gap-3 px-5 pt-3 text-sm text-gray-500">
        <span>{profile?.display_name}</span>
        <button onClick={signOut} className="underline">Esci</button>
      </div>
      <Outlet />
      <nav className="fixed bottom-0 inset-x-0 z-20 flex bg-gray-950 border-t border-gray-800 pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/" end className={tab}><span className="text-2xl">🧳</span>Case</NavLink>
        <NavLink to="/cerca" className={tab}><span className="text-2xl">🔍</span>Dove va?</NavLink>
        {isAdmin && <NavLink to="/dashboard" className={tab}><span className="text-2xl">📊</span>Dashboard</NavLink>}
      </nav>
    </div>
  )
}

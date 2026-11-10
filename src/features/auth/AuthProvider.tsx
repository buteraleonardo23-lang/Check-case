import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../../lib/api'
import type { Profile } from '../../lib/types'

interface AuthCtx {
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  signIn: (username: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setProfile(await api.currentUser())
    setLoading(false)
  }, [])

  useEffect(() => { reload(); return api.onAuthChange(reload) }, [reload])

  return (
    <Ctx.Provider value={{
      profile, loading, isAdmin: profile?.role === 'admin',
      signIn: (u, p) => api.signIn(u, p),
      signOut: () => api.signOut(),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuori da AuthProvider')
  return c
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, usernameToEmail } from '../../lib/supabase'
import type { Profile } from '../../lib/types'

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  signIn: (username: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    setLoading(true)
    supabase.from('profiles').select('id, username, display_name, role').eq('id', session.user.id).single()
      .then(({ data }) => { setProfile(data as Profile | null); setLoading(false) })
  }, [session])

  const signIn = async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
    return error ? 'Username o password errati' : null
  }
  const signOut = async () => { await supabase.auth.signOut() }

  return (
    <Ctx.Provider value={{ session, profile, loading, isAdmin: profile?.role === 'admin', signIn, signOut }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuori da AuthProvider')
  return c
}

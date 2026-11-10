import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabaseConfigured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'missing')

/** Login con username: internamente diventa una email fittizia. */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@checkcase.local`

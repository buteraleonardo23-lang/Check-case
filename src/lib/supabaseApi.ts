import { supabase, usernameToEmail } from './supabase'
import type { Api } from './api'
import type { ActivityRow, Case, Closure, Item, ItemMove, LoadOut, Profile, StatusRow } from './types'

const must = <T,>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error) throw new Error(error.message)
  return data
}

const urlCache = new Map<string, string>()

export const supabaseApi: Api = {
  demo: false,

  async currentUser() {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return null
    const { data: p } = await supabase.from('profiles')
      .select('id, username, display_name, role').eq('id', data.session.user.id).single()
    return (p as Profile | null)
  },
  async signIn(username, password) {
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
    return error ? 'Username o password errati' : null
  },
  async signOut() { await supabase.auth.signOut() },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange(() => cb())
    return () => data.subscription.unsubscribe()
  },

  async loadCatalog() {
    const [c, i, lo, mv] = await Promise.all([
      supabase.from('cases').select('*').eq('active', true).order('sort_order').order('code'),
      supabase.from('items').select('id, name, aliases, expected_case_id, photo_path, notes').eq('active', true).order('name'),
      supabase.from('load_outs').select('id, started_at, status').eq('status', 'open').maybeSingle(),
      supabase.from('item_moves').select('*, profiles!item_moves_created_by_fkey(display_name)')
        .order('created_at', { ascending: false }).limit(100),
    ])
    return {
      cases: (c.data ?? []) as Case[],
      items: (i.data ?? []) as Item[],
      loadOut: (lo.data ?? null) as LoadOut | null,
      moves: (mv.data ?? []).map((m: any) => ({ ...m, created_by_name: m.profiles?.display_name ?? '?' })) as ItemMove[],
    }
  },
  async loadState(loadOutId) {
    const [s, cl] = await Promise.all([
      supabase.from('load_out_item_status').select('*').eq('load_out_id', loadOutId),
      supabase.from('case_closures').select('*').eq('load_out_id', loadOutId).is('reopened_at', null),
    ])
    return { status: (s.data ?? []) as StatusRow[], closures: (cl.data ?? []) as Closure[] }
  },
  subscribe(loadOutId, onChange) {
    const filter = `load_out_id=eq.${loadOutId}`
    const ch = supabase.channel(`lo-${loadOutId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'placements', filter }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_closures', filter }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_moves' }, onChange)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  },
  async startLoadOut() {
    const { data: u } = await supabase.auth.getUser()
    must(await supabase.from('load_outs').insert({ created_by: u.user?.id }))
  },
  async endLoadOut(id) {
    must(await supabase.from('load_outs').update({ status: 'closed', ended_at: new Date().toISOString() }).eq('id', id))
  },
  async place(lo, item, cs, move) {
    return must(await supabase.rpc('place_item', { p_load_out: lo, p_item: item, p_case: cs, p_move: move }))
  },
  async unplace(lo, item) { must(await supabase.rpc('unplace_item', { p_load_out: lo, p_item: item })) },
  async closeCase(lo, cs, o) {
    return must(await supabase.rpc('close_case', {
      p_load_out: lo, p_case: cs, p_confirm: o.confirm ?? false, p_force: o.force ?? false, p_note: o.note ?? null,
    }))
  },
  async reopenCase(lo, cs) { must(await supabase.rpc('reopen_case', { p_load_out: lo, p_case: cs })) },
  async activity(lo) {
    const { data } = await supabase.from('placements')
      .select('id, item_id, case_id, placed_at, removed_at, profiles!placements_placed_by_fkey(display_name)')
      .eq('load_out_id', lo).order('placed_at', { ascending: false }).limit(40)
    return (data ?? []).map((r: any) => ({ ...r, by: r.profiles?.display_name ?? '?' })) as ActivityRow[]
  },

  async saveCase(c) {
    const { id, ...rest } = c
    must(id ? await supabase.from('cases').update(rest).eq('id', id) : await supabase.from('cases').insert(rest))
  },
  async saveItem(i) {
    const { id, ...rest } = i
    must(id ? await supabase.from('items').update(rest).eq('id', id) : await supabase.from('items').insert(rest))
  },
  async moveItem(itemId, toCaseId, pending, note) {
    must(await supabase.rpc('move_item', { p_item: itemId, p_to_case: toCaseId, p_pending: pending, p_note: note }))
  },
  async completeMove(moveId) { must(await supabase.rpc('complete_move', { p_move: moveId })) },

  async uploadPhoto(file) {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    must(await supabase.storage.from('photos').upload(path, file, { contentType: file.type }))
    return path
  },
  async photoUrl(path) {
    if (urlCache.has(path)) return urlCache.get(path)!
    const { data } = await supabase.storage.from('photos').createSignedUrl(path, 60 * 60 * 12)
    if (data?.signedUrl) urlCache.set(path, data.signedUrl)
    return data?.signedUrl ?? null
  },
}

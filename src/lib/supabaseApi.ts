import { supabase, usernameToEmail } from './supabase'
import type { Api } from './api'
import type { ActivityRow, Case, Closure, Item, ItemMove, LoadOut, LoadOutInfo, LogRow, Profile, StatusRow } from './types'

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
  subscribe(onChange, onStatus) {
    // un solo canale per tutte le tabelle che cambiano lo stato visto dagli altri telefoni
    const tables = ['load_outs', 'placements', 'case_closures', 'item_moves', 'load_out_issues', 'cases', 'items']
    let ch = supabase.channel(`checkcase-${Math.random().toString(36).slice(2)}`)
    for (const table of tables) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    ch.subscribe(status => onStatus?.(status === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(ch) }
  },
  async startLoadOut() {
    const { data: u } = await supabase.auth.getUser()
    must(await supabase.from('load_outs').insert({ created_by: u.user?.id }))
  },
  async loadOutSummary(id) {
    const r = must(await supabase.rpc('end_load_out', { p_load_out: id, p_confirm: false })) as any
    if (r.result === 'already_closed') throw new Error('Lo smontaggio è già concluso')
    return r.summary
  },
  async endLoadOut(id) {
    const r = must(await supabase.rpc('end_load_out', { p_load_out: id, p_confirm: true })) as any
    return r.summary
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

  async issues() {
    const { data, error } = await supabase.from('load_out_issues')
      .select('*, load_outs(started_at), profiles!load_out_issues_placed_by_fkey(display_name)')
      .order('created_at', { ascending: false }).limit(500)
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: any) => ({
      ...r, load_out_date: r.load_outs?.started_at ?? r.created_at, placed_by_name: r.profiles?.display_name ?? null,
    }))
  },
  async resolveIssues(ids, action, note) {
    must(await supabase.rpc('resolve_issues', { p_issues: ids, p_action: action, p_note: note }))
  },
  async activityLog(loadOutId, limit = 1000) {
    let q = supabase.from('activity_log').select('id, at, actor_name, action, message, load_out_id')
      .order('at', { ascending: true }).order('id', { ascending: true }).limit(limit)
    if (loadOutId === null) q = q.is('load_out_id', null)
    else if (loadOutId !== 'all') q = q.eq('load_out_id', loadOutId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []) as LogRow[]
  },
  async loadOuts() {
    const { data } = await supabase.from('load_outs').select('id, started_at, ended_at, status').order('started_at', { ascending: false })
    return (data ?? []) as LoadOutInfo[]
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

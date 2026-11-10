import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import type { Case, Closure, Item, LoadOut, StatusRow } from '../../lib/types'

export type PlaceResult =
  | { result: 'ok' | 'already_here' | 'case_closed' }
  | { result: 'conflict'; case_code: string; by: string; at: string }

export interface ListedItem { name: string; case_code?: string; by?: string }
export type CloseResult =
  | { result: 'closed' | 'already_closed'; elsewhere?: ListedItem[] }
  | { result: 'needs_confirm'; elsewhere: ListedItem[] }
  | { result: 'blocked'; missing: ListedItem[]; elsewhere: ListedItem[] }

interface LoadOutCtx {
  loading: boolean
  loadOut: LoadOut | null
  cases: Case[]
  items: Item[]
  status: Map<string, StatusRow>        // item_id → stato
  closures: Map<string, Closure>        // case_id → chiusura attiva
  caseById: Map<string, Case>
  refresh: () => Promise<void>
  startLoadOut: () => Promise<void>
  endLoadOut: () => Promise<void>
  place: (itemId: string, caseId: string, move?: boolean) => Promise<PlaceResult>
  unplace: (itemId: string) => Promise<void>
  closeCase: (caseId: string, opts?: { confirm?: boolean; force?: boolean; note?: string }) => Promise<CloseResult>
  reopenCase: (caseId: string) => Promise<void>
}

const Ctx = createContext<LoadOutCtx | null>(null)

export function LoadOutProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [loadOut, setLoadOut] = useState<LoadOut | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [statusRows, setStatusRows] = useState<StatusRow[]>([])
  const [closureRows, setClosureRows] = useState<Closure[]>([])

  const loadCatalog = useCallback(async () => {
    const [c, i, lo] = await Promise.all([
      supabase.from('cases').select('*').eq('active', true).order('sort_order').order('code'),
      supabase.from('items').select('id, name, aliases, expected_case_id, photo_path, notes').eq('active', true).order('name'),
      supabase.from('load_outs').select('id, started_at, status').eq('status', 'open').maybeSingle(),
    ])
    setCases((c.data ?? []) as Case[])
    setItems((i.data ?? []) as Item[])
    setLoadOut((lo.data ?? null) as LoadOut | null)
    return (lo.data ?? null) as LoadOut | null
  }, [])

  const loadState = useCallback(async (lo: LoadOut | null) => {
    if (!lo) { setStatusRows([]); setClosureRows([]); return }
    const [s, cl] = await Promise.all([
      supabase.from('load_out_item_status').select('*').eq('load_out_id', lo.id),
      supabase.from('case_closures').select('*').eq('load_out_id', lo.id).is('reopened_at', null),
    ])
    setStatusRows((s.data ?? []) as StatusRow[])
    setClosureRows((cl.data ?? []) as Closure[])
  }, [])

  const refresh = useCallback(async () => {
    const lo = await loadCatalog()
    await loadState(lo)
    setLoading(false)
  }, [loadCatalog, loadState])

  useEffect(() => { refresh() }, [refresh])

  // Realtime: qualsiasi modifica di placements/chiusure → ricarico lo stato
  useEffect(() => {
    if (!loadOut) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const reload = () => { clearTimeout(timer); timer = setTimeout(() => loadState(loadOut), 150) }
    const filter = `load_out_id=eq.${loadOut.id}`
    const ch = supabase.channel(`lo-${loadOut.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'placements', filter }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_closures', filter }, reload)
      .subscribe()
    // al ritorno in primo piano (telefono in tasca) riallineo
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadOut, loadState])

  const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw new Error(error.message)
    await loadState(loadOut)
    return data as T
  }

  const value = useMemo<LoadOutCtx>(() => ({
    loading, loadOut, cases, items,
    status: new Map(statusRows.map(r => [r.item_id, r])),
    closures: new Map(closureRows.map(r => [r.case_id, r])),
    caseById: new Map(cases.map(c => [c.id, c])),
    refresh,
    startLoadOut: async () => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('load_outs').insert({ created_by: u.user?.id })
      if (error) throw new Error(error.message)
      await refresh()
    },
    endLoadOut: async () => {
      if (!loadOut) return
      const { error } = await supabase.from('load_outs')
        .update({ status: 'closed', ended_at: new Date().toISOString() }).eq('id', loadOut.id)
      if (error) throw new Error(error.message)
      await refresh()
    },
    place: (itemId, caseId, move = false) =>
      rpc<PlaceResult>('place_item', { p_load_out: loadOut!.id, p_item: itemId, p_case: caseId, p_move: move }),
    unplace: (itemId) => rpc<void>('unplace_item', { p_load_out: loadOut!.id, p_item: itemId }),
    closeCase: (caseId, o = {}) => rpc<CloseResult>('close_case', {
      p_load_out: loadOut!.id, p_case: caseId,
      p_confirm: o.confirm ?? false, p_force: o.force ?? false, p_note: o.note ?? null,
    }),
    reopenCase: (caseId) => rpc<void>('reopen_case', { p_load_out: loadOut!.id, p_case: caseId }),
  }), [loading, loadOut, cases, items, statusRows, closureRows, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLoadOut() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLoadOut fuori da LoadOutProvider')
  return c
}

/** Progresso di un case: oggetti previsti verdi / totali, più arancioni e rossi. */
export function caseProgress(caseId: string, items: Item[], status: Map<string, StatusRow>) {
  let total = 0, green = 0, orange = 0, red = 0
  for (const it of items) {
    if (it.expected_case_id !== caseId) continue
    total++
    const s = status.get(it.id)?.status ?? 'red'
    if (s === 'green') green++; else if (s === 'orange') orange++; else red++
  }
  return { total, green, orange, red }
}

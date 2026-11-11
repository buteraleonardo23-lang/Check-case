import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../../lib/api'
import type { Case, CloseResult, Closure, IssueAction, Item, ItemMove, LoadOut, LoadOutIssue, LoadOutSummary, PlaceResult, StatusRow } from '../../lib/types'

interface LoadOutCtx {
  loading: boolean
  loadOut: LoadOut | null
  cases: Case[]
  items: Item[]
  moves: ItemMove[]
  status: Map<string, StatusRow>        // item_id → stato
  closures: Map<string, Closure>        // case_id → chiusura attiva
  caseById: Map<string, Case>
  itemById: Map<string, Item>
  issues: LoadOutIssue[]                // voci "da sistemare" (tutte, anche risolte)
  openIssues: LoadOutIssue[]            // solo quelle ancora da gestire (open + lost)
  dbOutdated: boolean                   // il database non ha ancora la migration 0003
  version: number                       // cresce a ogni modifica (per ricaricare feed ecc.)
  refresh: () => Promise<void>
  startLoadOut: () => Promise<void>
  loadOutSummary: () => Promise<LoadOutSummary>
  endLoadOut: () => Promise<LoadOutSummary>
  resolveIssues: (ids: string[], action: IssueAction, note?: string | null) => Promise<void>
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
  const [moves, setMoves] = useState<ItemMove[]>([])
  const [statusRows, setStatusRows] = useState<StatusRow[]>([])
  const [closureRows, setClosureRows] = useState<Closure[]>([])
  const [issues, setIssues] = useState<LoadOutIssue[]>([])
  const [dbOutdated, setDbOutdated] = useState(false)
  const [version, setVersion] = useState(0)
  const loRef = useRef<LoadOut | null>(null)

  const refresh = useCallback(async () => {
    const cat = await api.loadCatalog()
    setCases(cat.cases); setItems(cat.items); setMoves(cat.moves); setLoadOut(cat.loadOut)
    loRef.current = cat.loadOut
    if (cat.loadOut) {
      const st = await api.loadState(cat.loadOut.id)
      setStatusRows(st.status); setClosureRows(st.closures)
    } else { setStatusRows([]); setClosureRows([]) }
    try { setIssues(await api.issues()); setDbOutdated(false) }
    catch { setIssues([]); setDbOutdated(true) }   // migration 0003 non ancora eseguita
    setVersion(v => v + 1)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Tempo reale, SEMPRE attivo (anche prima che l'admin avvii lo smontaggio):
  // qualsiasi modifica di un collega → ricarico (con piccolo debounce).
  // Rete di sicurezza: se il tempo reale cade (segnale scarso in teatro) ricontrollo ogni 5 s,
  // altrimenti ogni 30 s; e sempre quando l'app torna in primo piano o torna la rete.
  const [live, setLive] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const reload = () => { clearTimeout(timer); timer = setTimeout(refresh, 150) }
    const off = api.subscribe(reload, ok => { setLive(ok); if (ok) reload() })
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', reload)
    window.addEventListener('focus', reload)
    return () => {
      clearTimeout(timer); off()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', reload)
      window.removeEventListener('focus', reload)
    }
  }, [refresh])
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, live ? 30_000 : 5_000)
    return () => clearInterval(id)
  }, [live, refresh])

  const after = async <T,>(p: Promise<T>) => { const r = await p; await refresh(); return r }
  const loId = () => {
    if (!loRef.current) throw new Error('Nessuno smontaggio in corso')
    return loRef.current.id
  }

  const value = useMemo<LoadOutCtx>(() => ({
    loading, loadOut, cases, items, moves, version, issues, dbOutdated,
    openIssues: issues.filter(i => i.status !== 'resolved'),
    status: new Map(statusRows.map(r => [r.item_id, r])),
    closures: new Map(closureRows.map(r => [r.case_id, r])),
    caseById: new Map(cases.map(c => [c.id, c])),
    itemById: new Map(items.map(i => [i.id, i])),
    refresh,
    startLoadOut: () => after(api.startLoadOut()),
    loadOutSummary: () => api.loadOutSummary(loId()),
    endLoadOut: () => after(api.endLoadOut(loId())),
    resolveIssues: (ids, action, note = null) => after(api.resolveIssues(ids, action, note)),
    place: (itemId, caseId, move = false) => after(api.place(loId(), itemId, caseId, move)),
    unplace: (itemId) => after(api.unplace(loId(), itemId)),
    closeCase: (caseId, o = {}) => after(api.closeCase(loId(), caseId, o)),
    reopenCase: (caseId) => after(api.reopenCase(loId(), caseId)),
  }), [loading, loadOut, cases, items, moves, version, issues, dbOutdated, statusRows, closureRows, refresh])

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

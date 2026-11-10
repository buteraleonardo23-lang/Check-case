import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../../lib/api'
import type { Case, CloseResult, Closure, Item, ItemMove, LoadOut, PlaceResult, StatusRow } from '../../lib/types'

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
  version: number                       // cresce a ogni modifica (per ricaricare feed ecc.)
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
  const [moves, setMoves] = useState<ItemMove[]>([])
  const [statusRows, setStatusRows] = useState<StatusRow[]>([])
  const [closureRows, setClosureRows] = useState<Closure[]>([])
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
    setVersion(v => v + 1)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Tempo reale: qualsiasi modifica di un collega → ricarico (con piccolo debounce)
  useEffect(() => {
    if (!loadOut) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const reload = () => { clearTimeout(timer); timer = setTimeout(refresh, 120) }
    const off = api.subscribe(loadOut.id, reload)
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); off(); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadOut?.id, refresh])

  const after = async <T,>(p: Promise<T>) => { const r = await p; await refresh(); return r }
  const loId = () => {
    if (!loRef.current) throw new Error('Nessuno smontaggio in corso')
    return loRef.current.id
  }

  const value = useMemo<LoadOutCtx>(() => ({
    loading, loadOut, cases, items, moves, version,
    status: new Map(statusRows.map(r => [r.item_id, r])),
    closures: new Map(closureRows.map(r => [r.case_id, r])),
    caseById: new Map(cases.map(c => [c.id, c])),
    itemById: new Map(items.map(i => [i.id, i])),
    refresh,
    startLoadOut: () => after(api.startLoadOut()),
    endLoadOut: () => after(api.endLoadOut(loId())),
    place: (itemId, caseId, move = false) => after(api.place(loId(), itemId, caseId, move)),
    unplace: (itemId) => after(api.unplace(loId(), itemId)),
    closeCase: (caseId, o = {}) => after(api.closeCase(loId(), caseId, o)),
    reopenCase: (caseId) => after(api.reopenCase(loId(), caseId)),
  }), [loading, loadOut, cases, items, moves, version, statusRows, closureRows, refresh])

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

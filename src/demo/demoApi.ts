// Backend finto per la demo: tutto in memoria (+ localStorage se disponibile).
// Replica le stesse regole delle RPC in supabase/migrations.
import type { Api } from '../lib/api'
import type { Case, CloseResult, Closure, Item, ItemMove, ListedItem, LoadOut, PlaceResult, Profile, StatusRow } from '../lib/types'
import { demoCases, demoItems, demoUsers } from './demoData'

interface Placement { id: string; item_id: string; case_id: string; placed_by: string; placed_at: string; removed_at: string | null }
interface DbClosure extends Closure { reopened_at: string | null }
interface Db {
  cases: Case[]; items: Item[]; loadOut: LoadOut | null
  placements: Placement[]; closures: DbClosure[]; moves: (ItemMove & { created_by: string })[]
  userId: string | null
}

const KEY = 'checkcase-demo-v2'
const uid = () => Math.random().toString(36).slice(2, 10)
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function seed(): Db {
  const placements: Placement[] = []
  let t = 42
  const put = (item: string, cs: string, by: string) =>
    placements.push({ id: uid(), item_id: item, case_id: cs, placed_by: `u-${by}`, placed_at: minsAgo((t -= 0.4)), removed_at: null })
  const fill = (code: string, n: number, by: string, skip: number[] = []) => {
    for (let j = 1; j <= n; j++) if (!skip.includes(j)) put(`i${code}-${j}`, `c${code}`, by)
  }
  fill('01', 10, 'lorenzo')
  fill('02', 8, 'rossana')
  fill('03', 10, 'diego', [4])
  put('i03-4', 'c04', 'diego')        // microfono vintage finito tra gli strumenti
  fill('04', 6, 'lorenzo')
  fill('05', 5, 'matteo', [1])
  put('i05-1', 'c08', 'diego')        // la scatola rossa nel case video
  fill('06', 3, 'rossana')
  fill('07', 5, 'rossana')
  fill('08', 4, 'diego')
  fill('09', 7, 'lorenzo')
  const items = demoItems.map(i => ({ ...i }))
  // spostamento definitivo già deciso ma da fare alla prossima replica
  items.find(i => i.id === 'i10-3')!.expected_case_id = 'c09'
  return {
    cases: demoCases.map(c => ({ ...c })),
    items,
    loadOut: { id: 'lo-demo', started_at: minsAgo(45), status: 'open' },
    placements,
    closures: [{ id: uid(), case_id: 'c01', closed_by: 'u-lorenzo', closed_at: minsAgo(20), forced: false, note: null, reopened_at: null }],
    moves: [
      { id: uid(), item_id: 'i10-3', from_case_id: 'c10', to_case_id: 'c09', status: 'pending', note: 'Sta meglio con i cavi',
        created_at: minsAgo(60 * 24 * 3), created_by: 'u-leonardo', created_by_name: 'Leonardo' },
      { id: uid(), item_id: 'i09-9', from_case_id: 'c10', to_case_id: 'c09', status: 'done', note: null,
        created_at: minsAgo(60 * 24 * 20), created_by: 'u-matteo', created_by_name: 'Matteo' },
    ],
    userId: null,
  }
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch { /* storage non disponibile */ }
  return seed()
}

let db = load()
const listeners = new Set<() => void>()
const authListeners = new Set<() => void>()

function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota o storage bloccato: resta in memoria */ }
  listeners.forEach(l => l())
}

const me = () => demoUsers.find(u => u.id === db.userId) ?? null
const userName = (id: string) => demoUsers.find(u => u.id === id)?.display_name ?? '?'
const caseCode = (id: string) => db.cases.find(c => c.id === id)?.code ?? '?'
const active = (itemId: string) => db.placements.find(p => p.item_id === itemId && !p.removed_at)
const closureOf = (caseId: string) => db.closures.find(c => c.case_id === caseId && !c.reopened_at)
const requireAdmin = () => { if (me()?.role !== 'admin') throw new Error('Solo Matteo e Leonardo possono farlo') }
const pause = () => new Promise(r => setTimeout(r, 120))

function statusRows(): StatusRow[] {
  return db.items.map(i => {
    const p = active(i.id)
    return {
      item_id: i.id, item_name: i.name, aliases: i.aliases, expected_case_id: i.expected_case_id,
      actual_case_id: p?.case_id ?? null, placed_by: p?.placed_by ?? null,
      placed_by_name: p ? userName(p.placed_by) : null, placed_at: p?.placed_at ?? null,
      status: !p ? 'red' : p.case_id === i.expected_case_id ? 'green' : 'orange',
    }
  })
}

export function resetDemo() {
  const user = db.userId
  db = seed()
  db.userId = user
  commit()
}

export const demoApi: Api = {
  demo: true,

  async currentUser() { return me() as Profile | null },
  async signIn(username) {
    const u = demoUsers.find(x => x.username === username.trim().toLowerCase())
    if (!u) return 'Utente demo non trovato'
    db.userId = u.id; commit(); authListeners.forEach(l => l())
    return null
  },
  async signOut() { db.userId = null; commit(); authListeners.forEach(l => l()) },
  onAuthChange(cb) { authListeners.add(cb); return () => { authListeners.delete(cb) } },

  async loadCatalog() {
    return {
      cases: [...db.cases].sort((a, b) => a.sort_order - b.sort_order),
      items: [...db.items].sort((a, b) => a.name.localeCompare(b.name, 'it')),
      loadOut: db.loadOut?.status === 'open' ? db.loadOut : null,
      moves: [...db.moves].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }
  },
  async loadState() {
    return { status: statusRows(), closures: db.closures.filter(c => !c.reopened_at) }
  },
  subscribe(_lo, cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
  async startLoadOut() {
    requireAdmin()
    db.loadOut = { id: uid(), started_at: new Date().toISOString(), status: 'open' }
    db.placements = []; db.closures = []; commit()
  },
  async endLoadOut() { requireAdmin(); if (db.loadOut) db.loadOut.status = 'closed'; commit() },

  async place(_lo, itemId, caseId, move): Promise<PlaceResult> {
    await pause()
    if (closureOf(caseId)) return { result: 'case_closed' }
    const cur = active(itemId)
    if (cur) {
      if (cur.case_id === caseId) return { result: 'already_here' }
      if (!move) return { result: 'conflict', case_code: caseCode(cur.case_id), by: userName(cur.placed_by), at: cur.placed_at }
      cur.removed_at = new Date().toISOString()
    }
    db.placements.push({ id: uid(), item_id: itemId, case_id: caseId, placed_by: db.userId!, placed_at: new Date().toISOString(), removed_at: null })
    for (const m of db.moves) if (m.item_id === itemId && m.status === 'pending' && m.to_case_id === caseId) m.status = 'done'
    commit()
    return { result: 'ok' }
  },
  async unplace(_lo, itemId) {
    const cur = active(itemId)
    if (cur && !closureOf(cur.case_id)) { cur.removed_at = new Date().toISOString(); commit() }
  },
  async closeCase(_lo, caseId, o): Promise<CloseResult> {
    await pause()
    if (closureOf(caseId)) return { result: 'already_closed' }
    const rows = statusRows().filter(r => r.expected_case_id === caseId)
    const missing: ListedItem[] = rows.filter(r => r.status === 'red').map(r => ({ name: r.item_name }))
    const elsewhere: ListedItem[] = rows.filter(r => r.status === 'orange')
      .map(r => ({ name: r.item_name, case_code: caseCode(r.actual_case_id!), by: r.placed_by_name ?? undefined }))
    if (missing.length && !(o.force && me()?.role === 'admin' && o.note?.trim())) return { result: 'blocked', missing, elsewhere }
    if (!missing.length && elsewhere.length && !o.confirm) return { result: 'needs_confirm', elsewhere }
    db.closures.push({ id: uid(), case_id: caseId, closed_by: db.userId!, closed_at: new Date().toISOString(),
      forced: missing.length > 0, note: o.note ?? null, reopened_at: null })
    commit()
    return { result: 'closed', elsewhere }
  },
  async reopenCase(_lo, caseId) {
    const c = closureOf(caseId)
    if (c) { c.reopened_at = new Date().toISOString(); commit() }
  },
  async activity() {
    return [...db.placements].sort((a, b) => b.placed_at.localeCompare(a.placed_at)).slice(0, 40)
      .map(p => ({ id: p.id, item_id: p.item_id, case_id: p.case_id, by: userName(p.placed_by), placed_at: p.placed_at, removed_at: p.removed_at }))
  },

  async saveCase(c) {
    requireAdmin()
    if (c.id) Object.assign(db.cases.find(x => x.id === c.id)!, c)
    else db.cases.push({ photo_path: null, layout_photo_path: null, notes: null, color: null,
      sort_order: Math.max(0, ...db.cases.map(x => x.sort_order)) + 1, ...c, id: uid() } as Case)
    commit()
  },
  async saveItem(i) {
    requireAdmin()
    if (i.id) Object.assign(db.items.find(x => x.id === i.id)!, i)
    else db.items.push({ aliases: [], expected_case_id: null, photo_path: null, notes: null, ...i, id: uid() } as Item)
    commit()
  },
  async moveItem(itemId, toCaseId, pending, note) {
    requireAdmin()
    const item = db.items.find(i => i.id === itemId)!
    if (item.expected_case_id === toCaseId) return
    for (const m of db.moves) if (m.item_id === itemId && m.status === 'pending') m.status = 'done'
    db.moves.push({ id: uid(), item_id: itemId, from_case_id: item.expected_case_id, to_case_id: toCaseId,
      status: pending ? 'pending' : 'done', note, created_at: new Date().toISOString(),
      created_by: db.userId!, created_by_name: userName(db.userId!) })
    item.expected_case_id = toCaseId
    commit()
  },
  async completeMove(moveId) {
    const m = db.moves.find(x => x.id === moveId)
    if (m) { m.status = 'done'; commit() }
  },

  uploadPhoto(file) {
    return new Promise((resolve, reject) => {
      // ridimensiono per non riempire la memoria del browser
      const r = new FileReader()
      r.onerror = () => reject(new Error('Impossibile leggere la foto'))
      r.onload = () => {
        const im = new Image()
        im.onload = () => {
          const s = Math.min(1, 900 / Math.max(im.width, im.height))
          const cv = document.createElement('canvas')
          cv.width = im.width * s; cv.height = im.height * s
          cv.getContext('2d')!.drawImage(im, 0, 0, cv.width, cv.height)
          resolve(cv.toDataURL('image/jpeg', 0.7))
        }
        im.onerror = () => reject(new Error('Formato foto non supportato'))
        im.src = r.result as string
      }
      r.readAsDataURL(file)
    })
  },
  async photoUrl(path) { return path },
}

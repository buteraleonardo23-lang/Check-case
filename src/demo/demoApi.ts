// Backend finto per la demo: tutto in memoria (+ localStorage se disponibile).
// Replica le stesse regole delle RPC e dei trigger in supabase/migrations (vedi i test in demoApi.test.ts).
import type { Api } from '../lib/api'
import type {
  Case, CloseResult, Closure, IssueAction, Item, ItemMove, ListedItem, LoadOut, LoadOutInfo, LoadOutIssue,
  LoadOutSummary, LogRow, PlaceResult, Profile, StatusRow,
} from '../lib/types'
import { demoCases, demoItems, demoUsers } from './demoData'

interface Placement { id: string; load_out_id: string; item_id: string; case_id: string; placed_by: string; placed_at: string; removed_at: string | null }
interface DbClosure extends Closure { load_out_id: string; reopened_at: string | null }
type DbIssue = Omit<LoadOutIssue, 'load_out_date' | 'placed_by_name'> & { placed_by: string | null }
interface Db {
  cases: Case[]; items: Item[]; loadOuts: LoadOutInfo[]
  placements: Placement[]; closures: DbClosure[]; moves: (ItemMove & { created_by: string })[]
  issues: DbIssue[]; log: LogRow[]
  userId: string | null
}

const KEY = 'checkcase-demo-v3'
const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

let db: Db
const listeners = new Set<() => void>()
const authListeners = new Set<() => void>()

// ───── helper (lavorano sul db corrente) ─────
const me = () => demoUsers.find(u => u.id === db.userId) ?? null
const userName = (id: string | null) => demoUsers.find(u => u.id === id)?.display_name ?? 'Sistema'
const caseCode = (id: string | null) => db.cases.find(c => c.id === id)?.code ?? '?'
const caseLabel = (id: string | null) => id ? `case ${caseCode(id)}` : 'nessun case'
const itemOf = (id: string) => db.items.find(i => i.id === id)
const itemLabel = (id: string) => `«${itemOf(id)?.name ?? '?'}»`
const openLo = () => db.loadOuts.find(l => l.status === 'open') ?? null
const active = (loId: string, itemId: string) => db.placements.find(p => p.load_out_id === loId && p.item_id === itemId && !p.removed_at)
const closureOf = (loId: string, caseId: string) => db.closures.find(c => c.load_out_id === loId && c.case_id === caseId && !c.reopened_at)
const requireAdmin = (msg = 'Solo Matteo e Leonardo possono farlo') => { if (me()?.role !== 'admin') throw new Error(msg) }
const pause = () => new Promise(r => setTimeout(r, 100))
let logSeq = 1

function log(action: string, actor: string | null, message: string, loId: string | null = null, at = now()) {
  db.log.push({ id: logSeq++, at, actor_name: userName(actor), action, message: `${userName(actor)} ${message}`, load_out_id: loId })
}

function statusRows(loId: string): StatusRow[] {
  return db.items.map(i => {
    const p = active(loId, i.id)
    return {
      item_id: i.id, item_name: i.name, aliases: i.aliases, expected_case_id: i.expected_case_id,
      actual_case_id: p?.case_id ?? null, placed_by: p?.placed_by ?? null,
      placed_by_name: p ? userName(p.placed_by) : null, placed_at: p?.placed_at ?? null,
      status: !p ? 'red' : p.case_id === i.expected_case_id ? 'green' : 'orange',
    }
  })
}

function summary(loId: string): LoadOutSummary {
  const rows = statusRows(loId)
  return {
    misplaced: rows.filter(r => r.status === 'orange').map(r => ({
      item_id: r.item_id, name: r.item_name, expected_code: r.expected_case_id ? caseCode(r.expected_case_id) : null,
      actual_code: caseCode(r.actual_case_id), by: r.placed_by_name, at: r.placed_at,
    })),
    missing: rows.filter(r => r.status === 'red').map(r => ({
      item_id: r.item_id, name: r.item_name, expected_code: r.expected_case_id ? caseCode(r.expected_case_id) : null,
    })),
    open_cases: [...db.cases].sort((a, b) => a.sort_order - b.sort_order).filter(c => !closureOf(loId, c.id)).map(c => c.code),
    placed: rows.filter(r => r.status !== 'red').length,
    total: rows.length,
  }
}

function placeRaw(loId: string, itemId: string, caseId: string, by: string, at = now()) {
  db.placements.push({ id: uid(), load_out_id: loId, item_id: itemId, case_id: caseId, placed_by: by, placed_at: at, removed_at: null })
  const exp = itemOf(itemId)?.expected_case_id ?? null
  log(exp === caseId ? 'placed' : 'placed_elsewhere', by,
    `ha messo ${itemLabel(itemId)} nel ${caseLabel(caseId)}${exp !== caseId ? ` (dovrebbe stare nel ${caseLabel(exp)})` : ''}`, loId, at)
  // spostamenti decisi completati
  for (const m of db.moves) if (m.item_id === itemId && m.status === 'pending' && m.to_case_id === caseId) {
    m.status = 'done'
    log('move_done', by, `ha completato lo spostamento di ${itemLabel(itemId)} nel ${caseLabel(caseId)}`, null, at)
  }
  // voci di smontaggi precedenti che si risolvono da sole
  for (const i of db.issues) if (i.item_id === itemId && i.status === 'open' && i.load_out_id !== loId
    && (i.kind === 'missing' || caseId === exp)) {
    Object.assign(i, { status: 'resolved', resolution: i.kind === 'missing' ? 'found' : 'fixed', resolved_at: at,
      note: i.note ?? 'Risolto automaticamente allo smontaggio successivo' })
  }
}

function moveItemRaw(itemId: string, toCaseId: string, pending: boolean, note: string | null) {
  const item = itemOf(itemId)!
  if (item.expected_case_id === toCaseId) return
  for (const m of db.moves) if (m.item_id === itemId && m.status === 'pending') m.status = 'done'
  db.moves.push({ id: uid(), item_id: itemId, from_case_id: item.expected_case_id, to_case_id: toCaseId,
    status: pending ? 'pending' : 'done', note, created_at: now(), created_by: db.userId!, created_by_name: userName(db.userId) })
  log('item_reassigned', db.userId, `ha assegnato ${itemLabel(itemId)} al ${caseLabel(toCaseId)} (prima ${caseLabel(item.expected_case_id)})${pending ? ' — da spostare alla prossima replica' : ' — già lì'}`)
  for (const i of db.issues) if (i.item_id === itemId && i.kind === 'misplaced' && i.status === 'open' && i.actual_case_id === toCaseId)
    Object.assign(i, { status: 'resolved', resolution: 'reassigned', resolved_at: now() })
  item.expected_case_id = toCaseId
}

// ───── dati iniziali ─────
function seed(): Db {
  db = {
    cases: demoCases.map(c => ({ ...c })), items: demoItems.map(i => ({ ...i })),
    loadOuts: [], placements: [], closures: [], moves: [], issues: [], log: [], userId: null,
  }
  logSeq = 1
  // smontaggio precedente (4 giorni fa), già concluso: ha lasciato qualcosa da sistemare
  const prev: LoadOutInfo = { id: 'lo-prev', started_at: minsAgo(60 * 24 * 4 + 90), ended_at: minsAgo(60 * 24 * 4), status: 'closed' }
  db.loadOuts.push(prev)
  log('load_out_started', 'u-leonardo', 'ha iniziato lo smontaggio', prev.id, prev.started_at)
  placeRaw(prev.id, 'i08-10', 'c10', 'u-rossana', minsAgo(60 * 24 * 4 + 40))
  const prevIssue = (item: string, kind: 'misplaced' | 'missing', actual: string | null, by: string | null, status: DbIssue['status'] = 'open') =>
    db.issues.push({ id: uid(), load_out_id: prev.id, item_id: item, kind, expected_case_id: itemOf(item)!.expected_case_id,
      actual_case_id: actual, placed_by: by, status, resolution: null, note: null, created_at: prev.ended_at!, resolved_at: null })
  prevIssue('i08-10', 'misplaced', 'c10', 'u-rossana')
  prevIssue('i05-6', 'missing', null, null)
  prevIssue('i04-10', 'missing', null, null, 'lost')
  log('load_out_ended', 'u-leonardo', 'ha concluso lo smontaggio', prev.id, prev.ended_at!)
  log('load_out_summary', 'u-leonardo', 'ha confermato il riepilogo: 1 nel case sbagliato, 2 non trovati', prev.id, prev.ended_at!)

  // spostamento definitivo deciso 3 giorni fa, da fare
  db.userId = 'u-leonardo'
  moveItemRaw('i10-3', 'c09', true, 'Sta meglio con i cavi')
  db.moves[db.moves.length - 1].created_at = minsAgo(60 * 24 * 3)
  db.userId = null

  // smontaggio in corso
  const lo: LoadOutInfo = { id: 'lo-demo', started_at: minsAgo(45), ended_at: null, status: 'open' }
  db.loadOuts.push(lo)
  log('load_out_started', 'u-leonardo', 'ha iniziato lo smontaggio', lo.id, lo.started_at)
  let t = 42
  const put = (item: string, cs: string, by: string) => placeRaw(lo.id, item, cs, `u-${by}`, minsAgo((t -= 0.4)))
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
  db.closures.push({ id: uid(), load_out_id: lo.id, case_id: 'c01', closed_by: 'u-lorenzo', closed_at: minsAgo(20), forced: false, note: null, reopened_at: null })
  log('case_closed', 'u-lorenzo', 'ha chiuso il case 01', lo.id, minsAgo(20))
  db.log.sort((a, b) => a.at.localeCompare(b.at))
  return db
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const d = JSON.parse(raw) as Db; logSeq = Math.max(0, ...d.log.map(l => l.id)) + 1; return d }
  } catch { /* storage non disponibile */ }
  return seed()
}

db = load()

function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota o storage bloccato: resta in memoria */ }
  listeners.forEach(l => l())
}

export function resetDemo() {
  const user = db.userId
  seed()
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
    const lo = openLo()
    return {
      cases: [...db.cases].sort((a, b) => a.sort_order - b.sort_order),
      items: [...db.items].sort((a, b) => a.name.localeCompare(b.name, 'it')),
      loadOut: lo ? { id: lo.id, started_at: lo.started_at, status: 'open' } as LoadOut : null,
      moves: [...db.moves].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }
  },
  async loadState(loId) {
    return { status: statusRows(loId), closures: db.closures.filter(c => c.load_out_id === loId && !c.reopened_at) }
  },
  subscribe(_lo, cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
  async startLoadOut() {
    requireAdmin('Solo un admin può iniziare lo smontaggio')
    if (openLo()) throw new Error('C\'è già uno smontaggio in corso')
    const lo: LoadOutInfo = { id: uid(), started_at: now(), ended_at: null, status: 'open' }
    db.loadOuts.push(lo)
    log('load_out_started', db.userId, 'ha iniziato lo smontaggio', lo.id)
    commit()
  },
  async loadOutSummary(loId) {
    requireAdmin('Solo un admin può concludere lo smontaggio')
    return summary(loId)
  },
  async endLoadOut(loId) {
    requireAdmin('Solo un admin può concludere lo smontaggio')
    const lo = db.loadOuts.find(l => l.id === loId)
    if (!lo || lo.status !== 'open') throw new Error('Lo smontaggio è già concluso')
    const s = summary(loId)
    lo.status = 'closed'; lo.ended_at = now()
    log('load_out_ended', db.userId, 'ha concluso lo smontaggio', loId)
    for (const r of statusRows(loId).filter(r => r.status !== 'green')) {
      if (db.issues.some(i => i.load_out_id === loId && i.item_id === r.item_id)) continue
      db.issues.push({ id: uid(), load_out_id: loId, item_id: r.item_id, kind: r.status === 'orange' ? 'misplaced' : 'missing',
        expected_case_id: r.expected_case_id, actual_case_id: r.actual_case_id, placed_by: r.placed_by,
        status: 'open', resolution: null, note: null, created_at: lo.ended_at, resolved_at: null })
    }
    log('load_out_summary', db.userId, `ha confermato il riepilogo: ${s.misplaced.length} nel case sbagliato, ${s.missing.length} non trovati`, loId)
    commit()
    return s
  },

  async place(loId, itemId, caseId, move): Promise<PlaceResult> {
    await pause()
    if (closureOf(loId, caseId)) return { result: 'case_closed' }
    const cur = active(loId, itemId)
    if (cur) {
      if (cur.case_id === caseId) return { result: 'already_here' }
      if (!move) return { result: 'conflict', case_code: caseCode(cur.case_id), by: userName(cur.placed_by), at: cur.placed_at }
      cur.removed_at = now()
      log('removed', db.userId, `ha tolto ${itemLabel(itemId)} dal ${caseLabel(cur.case_id)}`, loId)
    }
    placeRaw(loId, itemId, caseId, db.userId!)
    commit()
    return { result: 'ok' }
  },
  async unplace(loId, itemId) {
    const cur = active(loId, itemId)
    if (cur && !closureOf(loId, cur.case_id)) {
      cur.removed_at = now()
      log('removed', db.userId, `ha tolto ${itemLabel(itemId)} dal ${caseLabel(cur.case_id)}`, loId)
      commit()
    }
  },
  async closeCase(loId, caseId, o): Promise<CloseResult> {
    await pause()
    if (closureOf(loId, caseId)) return { result: 'already_closed' }
    const rows = statusRows(loId).filter(r => r.expected_case_id === caseId)
    const missing: ListedItem[] = rows.filter(r => r.status === 'red').map(r => ({ name: r.item_name }))
    const elsewhere: ListedItem[] = rows.filter(r => r.status === 'orange')
      .map(r => ({ name: r.item_name, case_code: caseCode(r.actual_case_id), by: r.placed_by_name ?? undefined }))
    if (missing.length && !(o.force && me()?.role === 'admin' && o.note?.trim())) return { result: 'blocked', missing, elsewhere }
    if (!missing.length && elsewhere.length && !o.confirm) return { result: 'needs_confirm', elsewhere }
    const forced = missing.length > 0
    db.closures.push({ id: uid(), load_out_id: loId, case_id: caseId, closed_by: db.userId!, closed_at: now(), forced, note: o.note ?? null, reopened_at: null })
    log(forced ? 'case_forced' : 'case_closed', db.userId,
      forced ? `ha FORZATO la chiusura del ${caseLabel(caseId)} (nota: ${o.note})` : `ha chiuso il ${caseLabel(caseId)}`, loId)
    commit()
    return { result: 'closed', elsewhere }
  },
  async reopenCase(loId, caseId) {
    const c = closureOf(loId, caseId)
    if (c) { c.reopened_at = now(); log('case_reopened', db.userId, `ha riaperto il ${caseLabel(caseId)}`, loId); commit() }
  },
  async activity(loId) {
    return db.placements.filter(p => p.load_out_id === loId).sort((a, b) => b.placed_at.localeCompare(a.placed_at)).slice(0, 40)
      .map(p => ({ id: p.id, item_id: p.item_id, case_id: p.case_id, by: userName(p.placed_by), placed_at: p.placed_at, removed_at: p.removed_at }))
  },

  async issues() {
    return db.issues.map(i => ({
      ...i, load_out_date: db.loadOuts.find(l => l.id === i.load_out_id)?.started_at ?? i.created_at,
      placed_by_name: i.placed_by ? userName(i.placed_by) : null,
    })).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  async resolveIssues(ids, action: IssueAction, note) {
    requireAdmin('Solo un admin può risolvere')
    for (const id of ids) {
      const v = db.issues.find(i => i.id === id)
      if (!v) continue
      if (action === 'reassigned' && v.actual_case_id) moveItemRaw(v.item_id, v.actual_case_id, false, note ?? 'Lasciato dove l\'avete messo')
      if (action === 'lost') {
        Object.assign(v, { status: 'lost', note: note ?? v.note })
        log('issue_lost', db.userId, `ha confermato PERSO ${itemLabel(v.item_id)} — da ricomprare`, v.load_out_id)
        continue
      }
      Object.assign(v, { status: 'resolved', resolution: action, note: note ?? v.note, resolved_at: now() })
      const msg: Record<string, string> = {
        fixed: `ha rimesso a posto ${itemLabel(v.item_id)} nel ${caseLabel(v.expected_case_id)}`,
        reassigned: `ha deciso che ${itemLabel(v.item_id)} resta nel ${caseLabel(v.actual_case_id)}`,
        found: `ha ritrovato ${itemLabel(v.item_id)}`,
        replaced: `ha ricomprato/sostituito ${itemLabel(v.item_id)}`,
        dismissed: `ha ignorato la segnalazione su ${itemLabel(v.item_id)}`,
      }
      log(`issue_${action}`, db.userId, msg[action] + (note ? ` (${note})` : ''), v.load_out_id)
    }
    commit()
  },
  async activityLog(loId, limit = 1000) {
    return db.log.filter(l => loId === 'all' || l.load_out_id === loId).slice(-limit)
  },
  async loadOuts() {
    return [...db.loadOuts].sort((a, b) => b.started_at.localeCompare(a.started_at))
  },

  async saveCase(c) {
    requireAdmin()
    if (c.id) {
      Object.assign(db.cases.find(x => x.id === c.id)!, c)
      log('case_updated', db.userId, `ha modificato il case ${c.code} «${c.name}»`)
    } else {
      db.cases.push({ photo_path: null, layout_photo_path: null, notes: null, color: null,
        sort_order: Math.max(0, ...db.cases.map(x => x.sort_order)) + 1, ...c, id: uid() } as Case)
      log('case_created', db.userId, `ha creato il case ${c.code} «${c.name}»`)
    }
    commit()
  },
  async saveItem(i) {
    requireAdmin()
    if (i.id) {
      Object.assign(db.items.find(x => x.id === i.id)!, i)
      log('item_updated', db.userId, `ha modificato l'oggetto «${i.name}»`)
    } else {
      const it = { aliases: [], expected_case_id: null, photo_path: null, notes: null, ...i, id: uid() } as Item
      db.items.push(it)
      log('item_created', db.userId, `ha creato l'oggetto «${i.name}» nel ${caseLabel(it.expected_case_id)}`)
    }
    commit()
  },
  async moveItem(itemId, toCaseId, pending, note) {
    requireAdmin()
    moveItemRaw(itemId, toCaseId, pending, note)
    commit()
  },
  async completeMove(moveId) {
    const m = db.moves.find(x => x.id === moveId)
    if (m && m.status === 'pending') {
      m.status = 'done'
      log('move_done', db.userId, `ha completato lo spostamento di ${itemLabel(m.item_id)} nel ${caseLabel(m.to_case_id)}`)
      commit()
    }
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

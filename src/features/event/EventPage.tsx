import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/Toast'
import { dateOf } from '../../lib/status'
import type { Checkout } from '../../lib/types'
import { useLoadOut } from '../cases/LoadOutProvider'
import { useItemSearch } from '../search/useItemSearch'

const EVENT_KEY = 'checkcase-evento'
const loadEvent = () => { try { return localStorage.getItem(EVENT_KEY) ?? '' } catch { return '' } }
const saveEvent = (v: string) => { try { localStorage.setItem(EVENT_KEY, v) } catch { /* niente */ } }

/** "Ho un altro evento": segno gli oggetti che prendo dai case; restano "fuori" finché non li rimetto. */
export default function EventPage() {
  const lo = useLoadOut()
  const toast = useToast()
  const [eventName, setEventName] = useState(loadEvent)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState<string | null>(null)   // evento da rimettere tutto
  const results = useItemSearch(lo.items, q)
  const outByItem = useMemo(() => new Map(lo.openCheckouts.map(k => [k.item_id, k])), [lo.openCheckouts])
  const code = (id: string | null) => (id && lo.caseById.get(id)?.code) || '—'
  const name = (id: string) => lo.itemById.get(id)?.name ?? '?'

  const groups = useMemo(() => {
    const g = new Map<string, Checkout[]>()
    for (const k of lo.openCheckouts) g.set(k.event_name ?? '', [...(g.get(k.event_name ?? '') ?? []), k])
    return [...g.entries()]
  }, [lo.openCheckouts])

  const take = async (itemId: string) => {
    setBusy(true)
    try {
      const r = await lo.checkoutItem(itemId, null, eventName.trim() || null)
      if (r === 'already_out') toast('È già segnato come fuori', 'warn')
      else { toast(`${name(itemId)}: preso`, 'ok'); setQ('') }
    } catch (e) { toast((e as Error).message, 'bad') }
    setBusy(false)
  }
  const giveBack = async (ids: string[], msg: string) => {
    setBusy(true)
    try { await lo.returnCheckouts(ids); toast(msg, 'ok'); setConfirmAll(null) } catch (e) { toast((e as Error).message, 'bad') }
    setBusy(false)
  }

  if (lo.dbOutdated) return <p className="px-5 pt-4 text-muted">Prima va aggiornato il database (vedi il banner nella schermata Case).</p>

  return (
    <div className="px-5 pt-2 space-y-6 pb-8">
      <header>
        <Link to="/" className="text-sm text-muted">← Case</Link>
        <p className="eyebrow mt-3">Prima dello smontaggio</p>
        <h1 className="title text-[40px] mt-2">Ho un altro evento</h1>
        <p className="text-sm text-muted mt-2">Segna cosa prendi dai case. Restano in <b className="text-fog">Da sistemare</b> finché non li rimetti al loro posto.</p>
      </header>

      <div className="space-y-2">
        <label htmlFor="event-name" className="eyebrow text-muted">Nome dell'evento (facoltativo)</label>
        <input id="event-name" className="field" value={eventName} placeholder="Es. Festa privata 22/11"
          onChange={e => { setEventName(e.target.value); saveEvent(e.target.value) }} />
      </div>

      <div className="space-y-3">
        <label htmlFor="event-search" className="eyebrow text-muted">Cosa prendi?</label>
        <input id="event-search" className="field text-lg py-4" value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca tra gli oggetti di tutti i case" />
        <ul className="space-y-2">
          {results.map(i => {
            const out = outByItem.get(i.id)
            const c = i.expected_case_id ? lo.caseById.get(i.expected_case_id) : null
            return (
              <li key={i.id} className="rounded-2xl bg-panel border border-line px-4 py-3 flex items-center gap-3">
                <span className="title text-xl w-9 shrink-0" style={{ color: c?.color ?? undefined }}>{c?.code ?? '—'}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">{i.name}</span>
                  <span className="block text-xs text-muted">{out ? `Già fuori${out.event_name ? ` per «${out.event_name}»` : ''}` : `Dal case ${c?.code ?? '—'} · ${c?.name ?? ''}`}</span>
                </span>
                {out
                  ? <span className="chip bg-warn/15 text-warn">fuori</span>
                  : <button disabled={busy} onClick={() => take(i.id)} className="btn-primary px-4 py-2 text-sm">Preso</button>}
              </li>
            )
          })}
        </ul>
      </div>

      <section className="space-y-3">
        <h2 className="eyebrow text-warn">Fuori adesso · {lo.openCheckouts.length}</h2>
        {lo.openCheckouts.length === 0 && <p className="text-sm text-muted">Nessun oggetto fuori.</p>}
        {groups.map(([ev, list]) => (
          <div key={ev} className="rounded-2xl border border-warn/40 bg-warn/[0.05] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-warn/20">
              <span className="flex-1 font-semibold">{ev || 'Altro evento'} <span className="text-xs text-muted font-normal">· {list.length}</span></span>
              {confirmAll === ev
                ? <>
                    <button disabled={busy} onClick={() => giveBack(list.map(k => k.id), `${list.length} oggetti rimessi`)} className="btn-primary px-3 py-1.5 text-xs">Sì, tutto rimesso</button>
                    <button onClick={() => setConfirmAll(null)} className="btn-ghost px-3 py-1.5 text-xs">No</button>
                  </>
                : <button onClick={() => setConfirmAll(ev)} className="btn-ghost px-3 py-1.5 text-xs">Tutto rimesso</button>}
            </div>
            <ul className="divide-y divide-warn/15">
              {list.map(k => (
                <li key={k.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{name(k.item_id)}</span>
                    <span className="block text-xs text-muted">Va nel case {code(lo.itemById.get(k.item_id)?.expected_case_id ?? k.from_case_id)} · preso {dateOf(k.taken_at)}{k.taken_by_name ? ` da ${k.taken_by_name}` : ''}</span>
                  </span>
                  <button disabled={busy} onClick={() => giveBack([k.id], `${name(k.item_id)}: rimesso`)} className="chip border border-ok/50 text-ok py-1.5">Rimesso</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}

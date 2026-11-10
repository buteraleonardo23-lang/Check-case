import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Modal from '../../components/Modal'
import Ring from '../../components/Ring'
import { useToast } from '../../components/Toast'
import { usePhotoUrl } from '../../lib/photos'
import { buzz, statusStyle, timeOf } from '../../lib/status'
import type { CloseResult, Item, ListedItem } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useItemSearch } from '../search/useItemSearch'
import { caseProgress, useLoadOut } from './LoadOutProvider'

type Dialog =
  | { kind: 'move'; item: Item; fromCode: string; by: string }
  | { kind: 'close'; res: CloseResult }
  | { kind: 'add' }
  | { kind: 'photo' }

const listText = (l: ListedItem[]) => l.map(i => i.case_code ? `${i.name} → case ${i.case_code}${i.by ? ` (${i.by})` : ''}` : i.name)

function Row({ item, extra, caseId, closed, pending, onToggle }: {
  item: Item; extra?: boolean; caseId: string; closed: boolean; pending: boolean; onToggle: (i: Item) => void
}) {
    const lo = useLoadOut()
    const s = lo.status.get(item.id)
    const st = extra ? 'orange' : (s?.status ?? 'red')
    const here = s?.actual_case_id === caseId
    const where = s?.actual_case_id && !here ? lo.caseById.get(s.actual_case_id)?.code : null
    const from = extra && item.expected_case_id ? lo.caseById.get(item.expected_case_id)?.code : null
    const photo = usePhotoUrl(item.photo_path)
    return (
      <li>
        <button onClick={() => onToggle(item)} disabled={closed}
          className={`w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.985] ${statusStyle[st].row}`}>
          <span className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-ink font-bold ${here ? statusStyle[st].dot : 'border-2 border-current ' + statusStyle[st].text}`}>
            {here && <span className="pop">✓</span>}
          </span>
          {photo && <img src={photo} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />}
          <span className="flex-1 min-w-0">
            <span className="block font-medium leading-snug">{item.name}</span>
            <span className="block text-xs text-muted truncate mt-0.5">
              {where && <span className="text-warn">Nel case {where} · </span>}
              {from && <span className="text-warn">Va nel case {from} · </span>}
              {pending && <span className="text-accent">Nuovo qui · </span>}
              {s?.placed_by_name ? `${s.placed_by_name} ${timeOf(s.placed_at)}` : !where && !here ? 'Da mettere' : ''}
            </span>
          </span>
        </button>
      </li>
    )
  }

export default function CaseDetail() {
  const { id } = useParams()
  const lo = useLoadOut()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const c = id ? lo.caseById.get(id) : undefined
  const layout = usePhotoUrl(c?.layout_photo_path)
  const addResults = useItemSearch(lo.items, query)

  if (!c) return <p className="p-6">Case non trovato. <Link to="/" className="text-accent underline">Torna ai case</Link></p>
  if (!lo.loadOut) return <p className="p-6 text-muted">Nessuno smontaggio in corso.</p>

  const closed = lo.closures.get(c.id)
  const expected = lo.items.filter(i => i.expected_case_id === c.id)
  const extras = lo.items.filter(i => i.expected_case_id !== c.id && lo.status.get(i.id)?.actual_case_id === c.id)
  const p = caseProgress(c.id, lo.items, lo.status)
  const pendingIn = lo.moves.filter(m => m.status === 'pending' && m.to_case_id === c.id)
  const pendingOut = lo.moves.filter(m => m.status === 'pending' && m.from_case_id === c.id)
  const pendingIds = new Set(pendingIn.map(m => m.item_id))

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast((e as Error).message, 'bad') } finally { setBusy(false) }
  }

  const placeHere = (item: Item, move = false) => run(async () => {
    const r = await lo.place(item.id, c.id, move)
    if (r.result === 'conflict') setDialog({ kind: 'move', item, fromCode: r.case_code, by: r.by })
    else if (r.result === 'case_closed') toast('Il case è chiuso: riaprilo per modificarlo', 'warn')
    else {
      buzz(); setDialog(null)
      if (item.expected_case_id !== c.id) toast(`${item.name} aggiunto come extra`, 'warn')
    }
  })

  const toggle = (item: Item) => {
    if (closed || busy) return
    const s = lo.status.get(item.id)
    if (s?.actual_case_id === c.id) run(() => lo.unplace(item.id))
    else placeHere(item)
  }

  const tryClose = (opts?: { confirm?: boolean; force?: boolean; note?: string }) => run(async () => {
    const res = await lo.closeCase(c.id, opts)
    if (res.result === 'closed') { buzz(); setDialog(null); setNote(''); toast(`Case ${c.code} chiuso`, 'ok') }
    else if (res.result !== 'already_closed') setDialog({ kind: 'close', res })
  })

  return (
    <div className="pb-40">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 glass border-x-0 border-t-0 px-5 pt-3 pb-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-full bg-panel-2 flex items-center justify-center text-lg" aria-label="Torna ai case">←</Link>
          <div className="flex-1 min-w-0">
            <p className="eyebrow" style={{ color: c.color ?? undefined }}>Case {c.code}</p>
            <h1 className="title text-2xl truncate">{c.name}</h1>
          </div>
          <div className="relative">
            <Ring green={p.green} orange={p.orange} total={p.total} size={52} />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{p.green}/{p.total}</span>
          </div>
        </div>
      </header>

      {layout && (
        <button onClick={() => setDialog({ kind: 'photo' })} className="relative block w-full group">
          <img src={layout} alt="Come va riempito il case" className="w-full h-56 object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-ink via-transparent" />
          <span className="absolute left-5 bottom-3 eyebrow text-fog">◎ Foto di riferimento · tocca per ingrandire</span>
        </button>
      )}

      <div className="px-5 space-y-3 mt-4">
        {c.notes && <p className="rounded-2xl bg-panel border border-line p-3.5 text-sm text-fog/90">{c.notes}</p>}

        {(pendingIn.length > 0 || pendingOut.length > 0) && (
          <div className="rounded-2xl border border-accent/40 bg-accent/[0.07] p-3.5 text-sm space-y-1">
            <p className="eyebrow">⇄ Spostamenti decisi da sistemare</p>
            {pendingIn.map(m => <p key={m.id}><b>{lo.itemById.get(m.item_id)?.name}</b> ora va qui (prima nel case {lo.caseById.get(m.from_case_id ?? '')?.code ?? '—'})</p>)}
            {pendingOut.map(m => <p key={m.id}><b>{lo.itemById.get(m.item_id)?.name}</b> ora va nel case {lo.caseById.get(m.to_case_id)?.code}</p>)}
          </div>
        )}

        {closed && (
          <div className="rounded-2xl bg-ok/15 border border-ok/50 p-4 flex items-center gap-3">
            <span className="flex-1 text-sm">✓ Chiuso alle {timeOf(closed.closed_at)}{closed.forced && <span className="text-warn"> · forzato: {closed.note}</span>}</span>
            <button onClick={() => run(() => lo.reopenCase(c.id))} className="btn-ghost py-2 px-4 text-sm">Riapri</button>
          </div>
        )}
      </div>

      <section className="px-5 mt-5">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="eyebrow text-muted">Cosa va dentro</h2>
          <span className="text-xs text-muted">tocca per segnare</span>
        </div>
        <ul className="space-y-2">{expected.map(i => <Row key={i.id} item={i} caseId={c.id} closed={!!closed} pending={pendingIds.has(i.id)} onToggle={toggle} />)}</ul>
      </section>

      <section className="px-5 mt-8">
        <h2 className="eyebrow text-muted mb-2">Oggetti extra in questo case</h2>
        {extras.length === 0 && <p className="text-muted text-sm">Nessuno.</p>}
        <ul className="space-y-2">{extras.map(i => <Row key={i.id} item={i} extra caseId={c.id} closed={!!closed} pending={false} onToggle={toggle} />)}</ul>
        {!closed && (
          <button onClick={() => { setQuery(''); setDialog({ kind: 'add' }) }}
            className="mt-3 w-full rounded-2xl border border-dashed border-line py-4 text-muted active:bg-panel">
            + Aggiungi un oggetto di un altro case
          </button>
        )}
      </section>

      {!closed && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] inset-x-0 px-5 pt-6 pb-3 bg-gradient-to-t from-ink via-ink/90 to-transparent z-10">
          <button disabled={busy} onClick={() => tryClose()} className="btn-primary w-full py-4 text-lg">
            Tutto pronto · Chiudi case
          </button>
        </div>
      )}

      {dialog?.kind === 'photo' && layout && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setDialog(null)}>
          <img src={layout} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {dialog?.kind === 'move' && (
        <Modal eyebrow="Attenzione" title="È già in un altro case" onClose={() => setDialog(null)}>
          <p><b>{dialog.item.name}</b> è già stato segnato nel <b>case {dialog.fromCode}</b> da {dialog.by}.</p>
          <p className="text-muted text-sm">L'hai messo tu nel case {c.code}? Lo sposto qui.</p>
          <button onClick={() => placeHere(dialog.item, true)} className="btn-warn w-full">Sì, ora è nel {c.code}</button>
          <button onClick={() => setDialog(null)} className="btn-ghost w-full">Annulla</button>
        </Modal>
      )}

      {dialog?.kind === 'add' && (
        <Modal eyebrow={`Case ${c.code}`} title="Aggiungi oggetto" onClose={() => setDialog(null)}>
          <input id="add-search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca per nome o alias" className="field" />
          <ul className="space-y-2">
            {addResults.filter(i => lo.status.get(i.id)?.actual_case_id !== c.id).map(i => {
              const exp = i.expected_case_id ? lo.caseById.get(i.expected_case_id)?.code : '—'
              return (
                <li key={i.id}>
                  <button onClick={() => placeHere(i)} className="w-full text-left rounded-2xl bg-panel-2 px-4 py-3 active:scale-[0.98] transition">
                    <span className="block font-medium">{i.name}</span>
                    <span className="block text-xs text-muted">Va nel case {exp}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!query && <p className="text-sm text-muted">Scrivi per cercare tra tutti gli oggetti.</p>}
        </Modal>
      )}

      {dialog?.kind === 'close' && dialog.res.result === 'blocked' && (
        <Modal eyebrow="Non si chiude" title="Manca qualcosa" onClose={() => setDialog(null)}>
          <p className="text-sm text-muted">Questi oggetti non sono in nessun case:</p>
          <ul className="space-y-1">{listText(dialog.res.missing).map(t => <li key={t} className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-bad" />{t}</li>)}</ul>
          {dialog.res.elsewhere.length > 0 && <>
            <p className="text-sm text-muted pt-1">In altri case (ok):</p>
            <ul className="space-y-1 text-sm">{listText(dialog.res.elsewhere).map(t => <li key={t} className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-warn" />{t}</li>)}</ul>
          </>}
          {isAdmin && (
            <div className="rounded-2xl border border-line p-3 space-y-2">
              <p className="eyebrow">Solo admin</p>
              <textarea id="force-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Perché lo chiudi lo stesso? (es. rimasto in teatro)" className="field min-h-20" />
              <button disabled={!note.trim() || busy} onClick={() => tryClose({ confirm: true, force: true, note })} className="btn-bad w-full">Forza chiusura</button>
            </div>
          )}
          <button onClick={() => setDialog(null)} className="btn-primary w-full">Torno a cercarli</button>
        </Modal>
      )}

      {dialog?.kind === 'close' && dialog.res.result === 'needs_confirm' && (
        <Modal eyebrow="Quasi pronto" title="Alcuni oggetti sono altrove" onClose={() => setDialog(null)}>
          <ul className="space-y-1">{listText(dialog.res.elsewhere).map(t => <li key={t} className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-warn" />{t}</li>)}</ul>
          <p className="text-sm text-muted">Sono al sicuro in un altro case. Chiudo comunque il case {c.code}?</p>
          <button disabled={busy} onClick={() => tryClose({ confirm: true })} className="btn-warn w-full">Sì, chiudi</button>
          <button onClick={() => setDialog(null)} className="btn-ghost w-full">Annulla</button>
        </Modal>
      )}
    </div>
  )
}

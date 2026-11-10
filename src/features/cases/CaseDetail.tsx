import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Modal from '../../components/Modal'
import { usePhotoUrl } from '../../lib/photos'
import { statusStyle, timeOf } from '../../lib/status'
import type { Item } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useItemSearch } from '../search/useItemSearch'
import { caseProgress, useLoadOut, type CloseResult, type ListedItem } from './LoadOutProvider'

type Dialog =
  | { kind: 'move'; item: Item; fromCode: string; by: string }
  | { kind: 'close'; res: CloseResult }
  | { kind: 'add' }
  | { kind: 'photo' }

const listText = (l: ListedItem[]) => l.map(i => i.case_code ? `${i.name} (case ${i.case_code})` : i.name)

export default function CaseDetail() {
  const { id } = useParams()
  const lo = useLoadOut()
  const { isAdmin } = useAuth()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const c = id ? lo.caseById.get(id) : undefined
  const layout = usePhotoUrl(c?.layout_photo_path)
  const addResults = useItemSearch(lo.items, query)

  if (!c) return <p className="p-6">Case non trovato. <Link to="/" className="underline">Torna ai case</Link></p>
  if (!lo.loadOut) return <p className="p-6">Nessuno smontaggio in corso.</p>

  const closed = lo.closures.get(c.id)
  const expected = lo.items.filter(i => i.expected_case_id === c.id)
  const extras = lo.items.filter(i => i.expected_case_id !== c.id && lo.status.get(i.id)?.actual_case_id === c.id)
  const p = caseProgress(c.id, lo.items, lo.status)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn() } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }

  const placeHere = (item: Item, move = false) => run(async () => {
    const r = await lo.place(item.id, c.id, move)
    if (r.result === 'conflict') setDialog({ kind: 'move', item, fromCode: r.case_code, by: r.by })
    else if (r.result === 'case_closed') alert('Il case è chiuso: riaprilo per modificarlo.')
    else setDialog(null)
  })

  const toggle = (item: Item) => {
    if (closed || busy) return
    const s = lo.status.get(item.id)
    if (s?.actual_case_id === c.id) run(() => lo.unplace(item.id))
    else placeHere(item)
  }

  const tryClose = (opts?: { confirm?: boolean; force?: boolean; note?: string }) => run(async () => {
    const res = await lo.closeCase(c.id, opts)
    setDialog(res.result === 'closed' || res.result === 'already_closed' ? null : { kind: 'close', res })
  })

  const Row = ({ item, extra }: { item: Item; extra?: boolean }) => {
    const s = lo.status.get(item.id)
    const st = extra ? 'orange' : (s?.status ?? 'red')
    const where = s?.actual_case_id && s.actual_case_id !== c.id ? lo.caseById.get(s.actual_case_id)?.code : null
    const from = extra && item.expected_case_id ? lo.caseById.get(item.expected_case_id)?.code : null
    return (
      <li>
        <button onClick={() => toggle(item)} disabled={!!closed}
          className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-4 text-left active:scale-[0.99] transition ${statusStyle[st].ring}`}>
          <span className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${statusStyle[st].dot}`}>
            {s?.actual_case_id === c.id && '✓'}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-lg font-medium truncate">{item.name}</span>
            <span className="block text-sm text-gray-400 truncate">
              {where && `Nel case ${where} · `}
              {from && `Va nel case ${from} · `}
              {s?.placed_by_name && `${s.placed_by_name} ${timeOf(s.placed_at)}`}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="pb-36">
      <header className="sticky top-0 z-10 bg-[#0b0f14]/95 backdrop-blur px-5 pt-4 pb-3 border-b border-gray-800">
        <Link to="/" className="text-gray-400">← Case</Link>
        <div className="flex items-baseline gap-2 mt-1">
          <h1 className="text-3xl font-black" style={{ color: c.color ?? undefined }}>{c.code}</h1>
          <span className="text-xl text-gray-300 truncate">{c.name}</span>
          <span className="ml-auto text-lg font-semibold">{p.green}/{p.total}</span>
        </div>
      </header>

      {layout && (
        <button onClick={() => setDialog({ kind: 'photo' })} className="block w-full">
          <img src={layout} alt="Come va riempito" className="w-full max-h-64 object-cover" />
          <span className="block text-xs text-gray-500 py-1">Tocca per ingrandire la foto di riferimento</span>
        </button>
      )}
      {c.notes && <p className="mx-5 mt-3 rounded-xl bg-gray-900 p-3 text-gray-300">{c.notes}</p>}

      {closed && (
        <div className="mx-5 mt-4 rounded-2xl bg-green-600/20 border border-green-600 p-4 flex items-center gap-3">
          <span className="flex-1">✓ Chiuso alle {timeOf(closed.closed_at)}{closed.forced && ' (forzato)'}</span>
          <button onClick={() => run(() => lo.reopenCase(c.id))} className="rounded-xl bg-gray-800 px-4 py-2">Riapri</button>
        </div>
      )}

      <ul className="px-5 mt-4 space-y-2">
        {expected.map(i => <Row key={i.id} item={i} />)}
      </ul>

      <section className="px-5 mt-8">
        <h2 className="text-lg font-semibold mb-2">Oggetti extra in questo case</h2>
        {extras.length === 0 && <p className="text-gray-500 text-sm">Nessuno.</p>}
        <ul className="space-y-2">{extras.map(i => <Row key={i.id} item={i} extra />)}</ul>
        {!closed && (
          <button onClick={() => { setQuery(''); setDialog({ kind: 'add' }) }}
            className="mt-3 w-full rounded-2xl border border-dashed border-gray-600 py-4 text-gray-300">
            + Aggiungi oggetto qui
          </button>
        )}
      </section>

      {!closed && (
        <div className="fixed bottom-16 inset-x-0 p-4 bg-gradient-to-t from-[#0b0f14] via-[#0b0f14]">
          <button disabled={busy} onClick={() => tryClose()}
            className="w-full rounded-2xl bg-green-600 disabled:opacity-50 py-5 text-xl font-bold">
            Tutto pronto · Chiudi case
          </button>
        </div>
      )}

      {dialog?.kind === 'photo' && layout && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setDialog(null)}>
          <img src={layout} alt="" className="max-w-full max-h-full object-contain touch-pinch-zoom" />
        </div>
      )}

      {dialog?.kind === 'move' && (
        <Modal title="Già in un altro case" onClose={() => setDialog(null)}>
          <p><b>{dialog.item.name}</b> è già stato messo nel <b>case {dialog.fromCode}</b> da {dialog.by}.</p>
          <p className="text-gray-400">Vuoi spostarlo nel case {c.code}?</p>
          <button onClick={() => placeHere(dialog.item, true)} className="w-full rounded-xl bg-orange-600 py-4 font-semibold">
            Sì, l'ho messo nel {c.code}
          </button>
          <button onClick={() => setDialog(null)} className="w-full rounded-xl bg-gray-800 py-4">Annulla</button>
        </Modal>
      )}

      {dialog?.kind === 'add' && (
        <Modal title={`Aggiungi al case ${c.code}`} onClose={() => setDialog(null)}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca oggetto (nome o alias)"
            className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-lg" />
          <ul className="space-y-2">
            {addResults.filter(i => lo.status.get(i.id)?.actual_case_id !== c.id).map(i => {
              const exp = i.expected_case_id ? lo.caseById.get(i.expected_case_id)?.code : '—'
              return (
                <li key={i.id}>
                  <button onClick={() => placeHere(i)} className="w-full text-left rounded-xl bg-gray-800 px-4 py-3">
                    <span className="block font-medium">{i.name}</span>
                    <span className="block text-sm text-gray-400">Va nel case {exp}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Modal>
      )}

      {dialog?.kind === 'close' && dialog.res.result === 'blocked' && (
        <Modal title="⚠️ Attenzione, manca qualcosa" onClose={() => setDialog(null)}>
          <p>Non puoi chiudere il case {c.code}. Mancano:</p>
          <ul className="list-disc pl-6 text-red-400">{listText(dialog.res.missing).map(t => <li key={t}>{t}</li>)}</ul>
          {dialog.res.elsewhere.length > 0 && <>
            <p className="text-gray-400">In altri case:</p>
            <ul className="list-disc pl-6 text-orange-400">{listText(dialog.res.elsewhere).map(t => <li key={t}>{t}</li>)}</ul>
          </>}
          {isAdmin && <>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Nota obbligatoria per forzare (es. rimasto in teatro)"
              className="w-full rounded-xl bg-gray-800 border border-gray-700 p-3" />
            <button disabled={!note.trim() || busy} onClick={() => tryClose({ confirm: true, force: true, note })}
              className="w-full rounded-xl bg-red-700 disabled:opacity-40 py-4 font-semibold">Forza chiusura (admin)</button>
          </>}
          <button onClick={() => setDialog(null)} className="w-full rounded-xl bg-gray-800 py-4">Torna al case</button>
        </Modal>
      )}

      {dialog?.kind === 'close' && dialog.res.result === 'needs_confirm' && (
        <Modal title="Alcuni oggetti sono altrove" onClose={() => setDialog(null)}>
          <ul className="list-disc pl-6 text-orange-400">{listText(dialog.res.elsewhere).map(t => <li key={t}>{t}</li>)}</ul>
          <p>Sono al sicuro in un altro case. Vuoi comunque chiudere il case {c.code}?</p>
          <button disabled={busy} onClick={() => tryClose({ confirm: true })} className="w-full rounded-xl bg-orange-600 py-4 font-semibold">
            Sì, chiudi
          </button>
          <button onClick={() => setDialog(null)} className="w-full rounded-xl bg-gray-800 py-4">Annulla</button>
        </Modal>
      )}
    </div>
  )
}

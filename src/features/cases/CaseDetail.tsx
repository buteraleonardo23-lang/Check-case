import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LayoutGallery from '../../components/LayoutGallery'
import Modal from '../../components/Modal'
import Ring from '../../components/Ring'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { usePhotoUrl } from '../../lib/photos'
import { buzz, statusStyle, timeOf } from '../../lib/status'
import { layoutPhotos, type Case, type CloseResult, type Item, type ListedItem, type PlaceResult } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useItemSearch } from '../search/useItemSearch'
import { boxProgress, caseProgress, useLoadOut } from './LoadOutProvider'

type Dialog =
  | { kind: 'move'; item: Item; where: string; by: string }
  | { kind: 'close'; res: CloseResult }
  | { kind: 'add' }
  | { kind: 'boxOpen'; box: Item; missing: ListedItem[] }

const listText = (l: ListedItem[]) => l.map(i => i.case_code ? `${i.name} → case ${i.case_code}${i.by ? ` (${i.by})` : ''}` : i.name)

/** Una riga della lista: un oggetto da spuntare. */
function Row({ item, extra, here, closed, pending, onToggle }: {
  item: Item; extra?: boolean; here: (actualCase: string | null, actualBox: string | null) => boolean
  closed: boolean; pending: boolean; onToggle: (i: Item) => void
}) {
  const lo = useLoadOut()
  const s = lo.status.get(item.id)
  const st = extra ? 'orange' : (s?.status ?? 'red')
  const isHere = !!s?.actual_case_id && here(s.actual_case_id, s.actual_container_id ?? null)
  const box = s?.actual_container_id ? lo.itemById.get(s.actual_container_id) : null
  const where = s?.actual_case_id && !isHere ? (box ? `Nella «${box.name}»` : `Nel case ${lo.caseById.get(s.actual_case_id)?.code}`) : null
  const parent = item.parent_item_id ? lo.itemById.get(item.parent_item_id) : null
  const goes = extra ? (parent ? `Va nella «${parent.name}»` : item.expected_case_id ? `Va nel case ${lo.caseById.get(item.expected_case_id)?.code}` : null) : null
  const photo = usePhotoUrl(item.photo_path)
  return (
    <li>
      <button onClick={() => onToggle(item)} disabled={closed}
        className={`w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.985] ${statusStyle[st].row}`}>
        <span className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-ink font-bold ${isHere ? statusStyle[st].dot : 'border-2 border-current ' + statusStyle[st].text}`}>
          {isHere && <span className="pop">✓</span>}
        </span>
        {photo && <img src={photo} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className="block font-medium leading-snug">{item.name}</span>
          <span className="block text-xs text-muted truncate mt-0.5">
            {where && <span className="text-warn">{where} · </span>}
            {goes && <span className="text-warn">{goes} · </span>}
            {pending && <span className="text-accent">Nuovo qui · </span>}
            {s?.placed_by_name ? `${s.placed_by_name} ${timeOf(s.placed_at)}` : !where && !isHere ? 'Da mettere' : ''}
          </span>
        </span>
      </button>
    </li>
  )
}

/** Una scatola (sottocase) nella lista del case: si apre per riempirla, si spunta solo quando è chiusa. */
function BoxRow({ box, c, closed, onToggle }: { box: Item; c: Case; closed: boolean; onToggle: (i: Item) => void }) {
  const lo = useLoadOut()
  const s = lo.status.get(box.id)
  const st = s?.status ?? 'red'
  const isHere = s?.actual_case_id === c.id
  const p = boxProgress(box.id, lo.items, lo.status)
  const boxClosed = lo.boxClosures.get(box.id)
  return (
    <li className={`rounded-2xl border transition ${statusStyle[st].row}`}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <button onClick={() => onToggle(box)} disabled={closed} aria-label={isHere ? `Togli ${box.name} dal case` : `Metti ${box.name} nel case`}
          className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-ink font-bold ${isHere ? statusStyle[st].dot : 'border-2 border-current ' + statusStyle[st].text}`}>
          {isHere && <span className="pop">✓</span>}
        </button>
        <Link to={`/case/${c.id}/scatola/${box.id}`} className="flex-1 min-w-0 flex items-center gap-3">
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="chip bg-accent/15 text-accent border border-accent/30 py-0.5 px-2 text-[10px] uppercase tracking-widest">Scatola</span>
              <span className="font-semibold leading-snug truncate">{box.name}</span>
            </span>
            <span className="block text-xs text-muted mt-1">
              <span className="tabular-nums">{p.green}/{p.total} dentro</span>
              {p.orange > 0 && <span className="text-warn"> · {p.orange} fuori posto</span>}
              {boxClosed ? <span className="text-ok"> · chiusa</span> : <span> · da riempire e chiudere</span>}
              {s?.placed_by_name && isHere && ` · ${s.placed_by_name} ${timeOf(s.placed_at)}`}
            </span>
          </span>
          <span className="text-muted text-xl">›</span>
        </Link>
      </div>
    </li>
  )
}

export default function CaseDetail() {
  const { id, boxId } = useParams()
  const lo = useLoadOut()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const c = id ? lo.caseById.get(id) : undefined
  const box = boxId ? lo.itemById.get(boxId) : undefined
  const addResults = useItemSearch(lo.items, query)

  if (!c || (boxId && !box?.is_container)) return <p className="p-6">Non trovato. <Link to="/" className="text-accent underline">Torna ai case</Link></p>
  if (!lo.loadOut) return <p className="p-6 text-muted">Nessuno smontaggio in corso.</p>

  // ── cosa sto riempendo: il case oppure una sua scatola ──
  const caseClosed = lo.closures.get(c.id)
  const closed = box ? (lo.boxClosures.get(box.id) ?? null) : (caseClosed ?? null)
  const locked = !!closed || (!!box && !!caseClosed)
  const here = (ac: string | null, ab: string | null) => box ? ab === box.id : ac === c.id
  const label = box ? `«${box.name}»` : `case ${c.code}`
  const st = (i: Item) => lo.status.get(i.id)

  const expected = box
    ? lo.items.filter(i => i.parent_item_id === box.id)
    : lo.items.filter(i => i.expected_case_id === c.id && !i.parent_item_id)
  const extras = box
    ? lo.items.filter(i => st(i)?.actual_container_id === box.id && i.parent_item_id !== box.id)
    : lo.items.filter(i => st(i)?.actual_case_id === c.id && !st(i)?.actual_container_id && (i.expected_case_id !== c.id || !!i.parent_item_id))
  const p = box ? boxProgress(box.id, lo.items, lo.status) : caseProgress(c.id, lo.items, lo.status)
  const pendingIn = box ? [] : lo.moves.filter(m => m.status === 'pending' && m.to_case_id === c.id)
  const pendingOut = box ? [] : lo.moves.filter(m => m.status === 'pending' && m.from_case_id === c.id)
  const pendingIds = new Set(pendingIn.map(m => m.item_id))
  const boxStatus = box ? st(box) : undefined
  const boxPlaced = !!box && boxStatus?.actual_case_id === c.id

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast((e as Error).message, 'bad') } finally { setBusy(false) }
  }

  const handle = (item: Item, r: PlaceResult, intoCase = false) => {
    if (r.result === 'conflict') setDialog({ kind: 'move', item, where: r.container ? `nella «${r.container}» (case ${r.case_code})` : `nel case ${r.case_code}`, by: r.by })
    else if (r.result === 'case_closed') toast('Il case è chiuso: riaprilo per modificarlo', 'warn')
    else if (r.result === 'container_closed') toast('La scatola è chiusa: riaprila per modificarla', 'warn')
    else if (r.result === 'nested_container') toast('Una scatola non va dentro un\'altra scatola', 'warn')
    else if (r.result === 'container_open') setDialog({ kind: 'boxOpen', box: item, missing: r.missing })
    else {
      buzz(); setDialog(null)
      const ok = intoCase || (box ? item.parent_item_id === box.id : item.expected_case_id === c.id && !item.parent_item_id)
      if (!ok) toast(`${item.name} aggiunto come extra`, 'warn')
    }
  }
  const placeHere = (item: Item, move = false) => run(async () => handle(item, await lo.place(item.id, c.id, move, box?.id ?? null)))
  const placeBoxInCase = (b: Item) => run(async () => handle(b, await lo.place(b.id, c.id, false, null), b.expected_case_id === c.id))

  const toggle = (item: Item) => {
    if (locked || busy) return
    const s = st(item)
    if (s?.actual_case_id && here(s.actual_case_id, s.actual_container_id ?? null)) run(() => lo.unplace(item.id))
    else if (item.is_container && !box) placeBoxInCase(item)
    else placeHere(item)
  }

  const tryClose = (opts?: { confirm?: boolean; force?: boolean; note?: string }) => run(async () => {
    const res = box ? await lo.closeBox(box.id, opts) : await lo.closeCase(c.id, opts)
    if (res.result === 'closed') {
      buzz(); setDialog(null); setNote('')
      toast(box ? `«${box.name}» chiusa: ora mettila nel case ${c.code}` : `Case ${c.code} chiuso`, 'ok')
    } else if (res.result !== 'already_closed') setDialog({ kind: 'close', res })
  })
  const reopen = () => run(async () => {
    if (!box) return lo.reopenCase(c.id)
    const r = await lo.reopenBox(box.id)
    if (r === 'case_closed') toast(`Il case ${c.code} è chiuso: riapri prima il case`, 'warn')
    else if (boxPlaced) toast(`«${box.name}» riaperta: è stata tolta dal case, rimettila quando l'hai richiusa`, 'warn')
  })

  return (
    <div className="pb-40">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 glass border-x-0 border-t-0 px-5 pt-3 pb-3">
        <div className="flex items-center gap-3">
          <Link to={box ? `/case/${c.id}` : '/'} className="w-10 h-10 rounded-full bg-panel-2 flex items-center justify-center text-lg" aria-label={box ? `Torna al case ${c.code}` : 'Torna ai case'}>←</Link>
          <div className="flex-1 min-w-0">
            <p className="eyebrow" style={{ color: c.color ?? undefined }}>{box ? `Scatola · case ${c.code} ${c.name}` : `Case ${c.code}`}</p>
            <h1 className="title text-2xl truncate">{box ? box.name : c.name}</h1>
          </div>
          <div className="relative">
            <Ring green={p.green} orange={p.orange} total={p.total} size={52} />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{p.green}/{p.total}</span>
          </div>
        </div>
      </header>

      <div className="mt-4">
        {box
          ? <LayoutGallery id={box.id} label={`«${box.name}»`} photos={[box.photo_path, ...(box.layout_photos ?? [])].filter((x): x is string => !!x)}
              isAdmin={isAdmin} onSave={async next => { await api.setItemPhotos(box.id, next); await lo.refresh() }} />
          : <LayoutGallery id={c.id} label={`case ${c.code}`} photos={layoutPhotos(c)} isAdmin={isAdmin}
              onSave={async next => { await api.setCasePhotos(c.id, next); await lo.refresh() }} />}
      </div>

      <div className="px-5 space-y-3 mt-4">
        {(box ? box.notes : c.notes) && <p className="rounded-2xl bg-panel border border-line p-3.5 text-sm text-fog/90">{box ? box.notes : c.notes}</p>}

        {(pendingIn.length > 0 || pendingOut.length > 0) && (
          <div className="rounded-2xl border border-accent/40 bg-accent/[0.07] p-3.5 text-sm space-y-1">
            <p className="eyebrow">⇄ Spostamenti decisi da sistemare</p>
            {pendingIn.map(m => <p key={m.id}><b>{lo.itemById.get(m.item_id)?.name}</b> ora va qui (prima nel case {lo.caseById.get(m.from_case_id ?? '')?.code ?? '—'})</p>)}
            {pendingOut.map(m => <p key={m.id}><b>{lo.itemById.get(m.item_id)?.name}</b> ora va nel case {lo.caseById.get(m.to_case_id)?.code}</p>)}
          </div>
        )}

        {closed && (
          <div className="rounded-2xl bg-ok/15 border border-ok/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm">✓ {box ? 'Chiusa' : 'Chiuso'} alle {timeOf(closed.closed_at)}{closed.forced && <span className="text-warn"> · forzato: {closed.note}</span>}</span>
              <button onClick={reopen} className="btn-ghost py-2 px-4 text-sm">Riapri</button>
            </div>
            {box && (boxPlaced
              ? <p className="text-sm text-ok">✓ La scatola è nel case {c.code}{boxStatus?.placed_by_name && ` (${boxStatus.placed_by_name} ${timeOf(boxStatus.placed_at)})`}</p>
              : <button disabled={busy || !!caseClosed} onClick={() => placeBoxInCase(box)} className="btn-primary w-full">Metti la scatola nel case {c.code}</button>)}
          </div>
        )}
        {box && !closed && caseClosed && <p className="rounded-2xl border border-warn/50 bg-warn/10 p-3 text-sm">Il case {c.code} è chiuso: riaprilo per modificare la scatola.</p>}
      </div>

      <section className="px-5 mt-5">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="eyebrow text-muted">Cosa va dentro</h2>
          <span className="text-xs text-muted">tocca per segnare</span>
        </div>
        {expected.length === 0 && <p className="text-sm text-muted">{box ? 'Nessun oggetto assegnato a questa scatola (lo fa un admin dal Catalogo).' : 'Nessun oggetto.'}</p>}
        <ul className="space-y-2">
          {expected.map(i => i.is_container && !box
            ? <BoxRow key={i.id} box={i} c={c} closed={locked} onToggle={toggle} />
            : <Row key={i.id} item={i} here={here} closed={locked} pending={pendingIds.has(i.id)} onToggle={toggle} />)}
        </ul>
      </section>

      <section className="px-5 mt-8">
        <h2 className="eyebrow text-muted mb-2">Oggetti extra {box ? 'in questa scatola' : 'in questo case'}</h2>
        {extras.length === 0 && <p className="text-muted text-sm">Nessuno.</p>}
        <ul className="space-y-2">{extras.map(i => <Row key={i.id} item={i} extra here={here} closed={locked} pending={false} onToggle={toggle} />)}</ul>
        {!locked && (
          <button onClick={() => { setQuery(''); setDialog({ kind: 'add' }) }}
            className="mt-3 w-full rounded-2xl border border-dashed border-line py-4 text-muted active:bg-panel">
            + Aggiungi un oggetto che non va qui
          </button>
        )}
      </section>

      {!locked && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] inset-x-0 px-5 pt-6 pb-3 bg-gradient-to-t from-ink via-ink/90 to-transparent z-10">
          <button disabled={busy} onClick={() => tryClose()} className="btn-primary w-full py-4 text-lg">
            Tutto pronto · {box ? 'Chiudi scatola' : 'Chiudi case'}
          </button>
        </div>
      )}

      {dialog?.kind === 'move' && (
        <Modal eyebrow="Attenzione" title="È già da un'altra parte" onClose={() => setDialog(null)}>
          <p><b>{dialog.item.name}</b> è già stato segnato <b>{dialog.where}</b> da {dialog.by}.</p>
          <p className="text-muted text-sm">L'hai messo tu qui? Lo sposto nel {label}.</p>
          <button onClick={() => placeHere(dialog.item, true)} className="btn-warn w-full">Sì, ora è qui</button>
          <button onClick={() => setDialog(null)} className="btn-ghost w-full">Annulla</button>
        </Modal>
      )}

      {dialog?.kind === 'boxOpen' && (
        <Modal eyebrow="Prima la scatola" title={`Riempi e chiudi «${dialog.box.name}»`} onClose={() => setDialog(null)}>
          <p className="text-sm">La scatola si mette nel case solo dopo averla riempita e chiusa.</p>
          {dialog.missing.length > 0 && <>
            <p className="text-sm text-muted">Mancano ancora:</p>
            <ul className="space-y-1">{dialog.missing.map(m => <li key={m.name} className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-bad" />{m.name}</li>)}</ul>
          </>}
          <button onClick={() => { const b = dialog.box; setDialog(null); navigate(`/case/${c.id}/scatola/${b.id}`) }} className="btn-primary w-full">Apri la scatola</button>
          <button onClick={() => setDialog(null)} className="btn-ghost w-full">Annulla</button>
        </Modal>
      )}

      {dialog?.kind === 'add' && (
        <Modal eyebrow={box ? `«${box.name}»` : `Case ${c.code}`} title="Aggiungi oggetto" onClose={() => setDialog(null)}>
          <input id="add-search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca per nome o alias" className="field" />
          <ul className="space-y-2">
            {addResults.filter(i => { const s = st(i); return !(s?.actual_case_id && here(s.actual_case_id, s.actual_container_id ?? null)) && i.id !== box?.id }).map(i => {
              const parent = i.parent_item_id ? lo.itemById.get(i.parent_item_id) : null
              const exp = i.expected_case_id ? lo.caseById.get(i.expected_case_id)?.code : '—'
              return (
                <li key={i.id}>
                  <button onClick={() => placeHere(i)} className="w-full text-left rounded-2xl bg-panel-2 px-4 py-3 active:scale-[0.98] transition">
                    <span className="block font-medium">{i.name}</span>
                    <span className="block text-xs text-muted">{parent ? `Va nella «${parent.name}» (case ${exp})` : `Va nel case ${exp}`}</span>
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
          <p className="text-sm text-muted">Questi oggetti non sono stati messi:</p>
          <ul className="space-y-1">{listText(dialog.res.missing).map(t => <li key={t} className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-bad" />{t}</li>)}</ul>
          {dialog.res.elsewhere.length > 0 && <>
            <p className="text-sm text-muted pt-1">Da un'altra parte (ok):</p>
            <ul className="space-y-1 text-sm">{listText(dialog.res.elsewhere).map(t => <li key={t} className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-warn" />{t}</li>)}</ul>
          </>}
          {isAdmin && (
            <div className="rounded-2xl border border-line p-3 space-y-2">
              <p className="eyebrow">Solo admin</p>
              <textarea id="force-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Perché la chiudi lo stesso? (es. rimasto in teatro)" className="field min-h-20" />
              <button disabled={!note.trim() || busy} onClick={() => tryClose({ confirm: true, force: true, note })} className="btn-bad w-full">Forza chiusura</button>
            </div>
          )}
          <button onClick={() => setDialog(null)} className="btn-primary w-full">Torno a cercarli</button>
        </Modal>
      )}

      {dialog?.kind === 'close' && dialog.res.result === 'needs_confirm' && (
        <Modal eyebrow="Quasi pronto" title="Alcuni oggetti sono altrove" onClose={() => setDialog(null)}>
          <ul className="space-y-1">{listText(dialog.res.elsewhere).map(t => <li key={t} className="flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-warn" />{t}</li>)}</ul>
          <p className="text-sm text-muted">Sono al sicuro da un'altra parte. Chiudo comunque {box ? `la «${box.name}»` : `il case ${c.code}`}?</p>
          <button disabled={busy} onClick={() => tryClose({ confirm: true })} className="btn-warn w-full">Sì, chiudi</button>
          <button onClick={() => setDialog(null)} className="btn-ghost w-full">Annulla</button>
        </Modal>
      )}
    </div>
  )
}

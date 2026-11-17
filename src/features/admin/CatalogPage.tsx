import { useEffect, useMemo, useState } from 'react'
import LayoutGallery from '../../components/LayoutGallery'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { usePhotoUrl } from '../../lib/photos'
import { shrink } from '../../lib/shrink'
import { dateOf } from '../../lib/status'
import { layoutPhotos, type Case, type Item, type TrashedCase, type TrashedItem } from '../../lib/types'
import { useLoadOut } from '../cases/LoadOutProvider'
import { useItemSearch } from '../search/useItemSearch'

const swatches = ['#0BB9EA', '#F5C542', '#B583FF', '#FF7A45', '#FF3B6B', '#E23A3A', '#E86BD8', '#4ADE80', '#94A3B8', '#38BDF8']


function PhotoInput({ id, label, value, onChange }: { id: string; label: string; value: string | null; onChange: (p: string | null) => void }) {
  const url = usePhotoUrl(value)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  return (
    <div className="space-y-1.5">
      <span className="eyebrow text-muted">{label}</span>
      <label htmlFor={id} className="relative flex items-center justify-center h-32 rounded-2xl border border-dashed border-line bg-panel-2 overflow-hidden cursor-pointer">
        {url ? <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
             : <span className="text-sm text-muted">{busy ? 'Carico…' : '+ Scatta o scegli una foto'}</span>}
        {url && <span className="absolute bottom-2 right-2 chip bg-ink/80 text-fog">Cambia</span>}
      </label>
      <input id={id} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={async e => {
          const f = e.target.files?.[0]
          if (!f) return
          setBusy(true)
          try { onChange(await api.uploadPhoto(await shrink(f))) } catch (err) { toast((err as Error).message, 'bad') }
          setBusy(false)
        }} />
    </div>
  )
}

function CaseForm({ c, onClose }: { c: Case | null; onClose: () => void }) {
  const lo = useLoadOut()
  const toast = useToast()
  const nextCode = String(Math.max(0, ...lo.cases.map(x => parseInt(x.code) || 0)) + 1).padStart(2, '0')
  const [f, setF] = useState({
    code: c?.code ?? nextCode, name: c?.name ?? '', color: c?.color ?? swatches[lo.cases.length % swatches.length],
    notes: c?.notes ?? '', photo_path: c?.photo_path ?? null,
  })
  // le foto "come è dentro" NON passano da qui: le salva la galleria da sola (così non si sovrascrivono)
  const [confirmTrash, setConfirmTrash] = useState(false)
  const nItems = c ? lo.items.filter(i => i.expected_case_id === c.id).length : 0
  const trash = async () => {
    if (!c) return
    try { await api.trashCase(c.id); await lo.refresh(); toast(`Case ${c.code} spostato nel cestino`, 'ok'); onClose() }
    catch (e) { toast((e as Error).message, 'bad') }
  }
  const save = async () => {
    try {
      await api.saveCase({ ...(c ? { id: c.id } : {}), ...f, notes: f.notes || null })
      await lo.refresh(); toast(c ? 'Case aggiornato' : `Case ${f.code} creato`, 'ok'); onClose()
    } catch (e) { toast((e as Error).message, 'bad') }
  }
  return (
    <Modal eyebrow="Catalogo" title={c ? `Case ${c.code}` : 'Nuovo case'} onClose={onClose}>
      <div className="grid grid-cols-[88px_1fr] gap-2">
        <input id="case-code" className="field text-center font-bold" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="N°" />
        <input id="case-name" className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nome (es. Audio)" />
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colore">
        {swatches.map(s => (
          <button key={s} onClick={() => setF({ ...f, color: s })} aria-label={s} role="radio" aria-checked={f.color === s}
            className={`w-8 h-8 rounded-full transition ${f.color === s ? 'ring-2 ring-offset-2 ring-offset-panel ring-fog scale-110' : ''}`} style={{ background: s }} />
        ))}
      </div>
      <textarea id="case-notes" className="field min-h-20" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Note per chi lo riempie" />
      <PhotoInput id="case-photo" label="Foto del case (copertina)" value={f.photo_path} onChange={p => setF({ ...f, photo_path: p })} />
      {c
        ? <div className="-mx-5"><LayoutGallery id={c.id} label={`case ${c.code}`} photos={layoutPhotos(lo.caseById.get(c.id) ?? c)} isAdmin onSave={async next => { await api.setCasePhotos(c.id, next); await lo.refresh() }} /></div>
        : <p className="text-xs text-muted">Le foto di come va sistemato dentro le aggiungi dopo, dalla scheda del case.</p>}
      <button disabled={!f.code.trim() || !f.name.trim()} onClick={save} className="btn-primary w-full">{c ? 'Salva' : 'Crea case'}</button>
      {c && (nItems > 0 ? (
        <p className="text-xs text-muted text-center">Per eliminare questo case prima sposta i suoi {nItems} oggetti in un altro case.</p>
      ) : confirmTrash ? (
        <div className="rounded-2xl border border-bad/50 bg-bad/[0.07] p-4 space-y-3">
          <p className="text-sm">Spostare il case {c.code} «{c.name}» nel <b>cestino</b>? Sparisce da home e catalogo; lo puoi ripristinare dal Catalogo → Cestino. Il suo storico negli smontaggi passati resta.</p>
          <div className="flex gap-2">
            <button onClick={trash} className="btn-bad flex-1 py-2.5">Sposta nel cestino</button>
            <button onClick={() => setConfirmTrash(false)} className="btn-ghost flex-1 py-2.5">Annulla</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmTrash(true)} className="w-full text-sm text-bad/80 underline underline-offset-2 py-1">Elimina case (sposta nel cestino)</button>
      ))}
    </Modal>
  )
}

function ItemForm({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const lo = useLoadOut()
  const toast = useToast()
  const [f, setF] = useState({
    name: item?.name ?? '', aliases: item?.aliases.join(', ') ?? '', notes: item?.notes ?? '',
    photo_path: item?.photo_path ?? null, expected_case_id: item?.expected_case_id ?? lo.cases[0]?.id ?? null,
    is_container: !!item?.is_container, parent_item_id: item?.parent_item_id ?? null,
  })
  const boxes = lo.items.filter(i => i.is_container && i.id !== item?.id)
  const children = item ? lo.items.filter(i => i.parent_item_id === item.id) : []
  const parentBox = f.parent_item_id ? lo.itemById.get(f.parent_item_id) : null
  const [moveTo, setMoveTo] = useState<string | null>(null)
  const [pending, setPending] = useState(true)
  const [moveNote, setMoveNote] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const current = item?.expected_case_id ? lo.caseById.get(item.expected_case_id) : null

  const remove = async () => {
    if (!item) return
    try { await lo.trashItem(item.id); toast(`«${item.name}» spostato nel cestino`, 'ok'); onClose() }
    catch (e) { toast((e as Error).message, 'bad') }
  }

  const save = async () => {
    try {
      const aliases = f.aliases.split(',').map(a => a.trim()).filter(Boolean)
      // scatola / dentro una scatola: si inviano solo se cambiano (così non si tocca niente per sbaglio)
      const boxFields: Partial<Item> = {}
      if (f.is_container !== !!item?.is_container) boxFields.is_container = f.is_container
      if ((f.parent_item_id ?? null) !== (item?.parent_item_id ?? null)) boxFields.parent_item_id = f.parent_item_id
      await api.saveItem({
        ...(item ? { id: item.id } : { expected_case_id: parentBox?.expected_case_id ?? f.expected_case_id }),
        name: f.name.trim(), aliases, notes: f.notes || null, photo_path: f.photo_path, ...boxFields,
      })
      if (item && moveTo) await api.moveItem(item.id, moveTo, pending, moveNote || null)
      await lo.refresh()
      toast(moveTo ? (pending ? 'Spostamento segnato: da fare alla prossima replica' : 'Oggetto spostato') : item ? 'Oggetto aggiornato' : 'Oggetto creato', 'ok')
      onClose()
    } catch (e) { toast((e as Error).message, 'bad') }
  }

  const CasePicker = ({ value, onPick, exclude }: { value: string | null; onPick: (id: string) => void; exclude?: string | null }) => (
    <div className="grid grid-cols-5 gap-1.5">
      {lo.cases.filter(c => c.id !== exclude).map(c => (
        <button key={c.id} onClick={() => onPick(c.id)} title={c.name}
          className={`rounded-xl py-2 border text-center transition ${value === c.id ? 'border-accent bg-accent/15' : 'border-line bg-panel-2'}`}>
          <span className="block title text-lg" style={{ color: c.color ?? undefined }}>{c.code}</span>
          <span className="block text-[9px] text-muted truncate px-1">{c.name}</span>
        </button>
      ))}
    </div>
  )

  return (
    <Modal eyebrow="Catalogo" title={item ? 'Modifica oggetto' : 'Nuovo oggetto'} onClose={onClose}>
      <input id="item-name" className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nome (es. Scatola rossa)" />
      <input id="item-aliases" className="field" value={f.aliases} onChange={e => setF({ ...f, aliases: e.target.value })} placeholder="Altri nomi, separati da virgola" />
      <textarea id="item-notes" className="field min-h-16" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Note (opzionale)" />
      <PhotoInput id="item-photo" label="Foto oggetto" value={f.photo_path} onChange={p => setF({ ...f, photo_path: p })} />

      <div className="rounded-2xl border border-line p-3.5 space-y-3">
        <p className="eyebrow">Scatole (sottocase)</p>
        {!f.parent_item_id && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input id="item-container" type="checkbox" className="mt-1 w-5 h-5 accent-[#0BB9EA]" checked={f.is_container}
              disabled={f.is_container && children.length > 0}
              onChange={e => setF({ ...f, is_container: e.target.checked })} />
            <span className="text-sm">
              <b>È una scatola</b> che contiene altri oggetti: si riempie e si chiude prima di metterla nel case.
              {f.is_container && children.length > 0 && <span className="block text-xs text-muted mt-1">Contiene {children.length} oggetti: per toglierla dalle scatole, prima sposta fuori gli oggetti.</span>}
            </span>
          </label>
        )}
        {!f.is_container && (
          <div className="space-y-1.5">
            <label htmlFor="item-parent" className="text-sm text-muted">Va dentro una scatola?</label>
            <select id="item-parent" className="field" value={f.parent_item_id ?? ''} onChange={e => setF({ ...f, parent_item_id: e.target.value || null })}>
              <option value="">No, va direttamente nel case</option>
              {boxes.map(b => <option key={b.id} value={b.id}>«{b.name}» · case {lo.caseById.get(b.expected_case_id ?? '')?.code ?? '—'}</option>)}
            </select>
            {boxes.length === 0 && <p className="text-xs text-muted">Non ci sono ancora scatole: rendi prima un oggetto “scatola”.</p>}
          </div>
        )}
      </div>

      {!item ? (parentBox ? (
        <p className="text-sm text-muted">Va nel case {lo.caseById.get(parentBox.expected_case_id ?? '')?.code ?? '—'} insieme alla scatola.</p>
      ) : (
        <div className="space-y-2">
          <span className="eyebrow text-muted">Va nel case</span>
          <CasePicker value={f.expected_case_id} onPick={id => setF({ ...f, expected_case_id: id })} />
        </div>
      )) : (
        <div className="rounded-2xl border border-line p-3.5 space-y-3">
          <p className="eyebrow">⇄ Sposta in un altro case</p>
          <p className="text-sm text-muted">Ora va {item.parent_item_id ? <>nella <b className="text-fog">«{lo.itemById.get(item.parent_item_id)?.name}»</b>, </> : null}nel <b className="text-fog">case {current?.code ?? '—'}</b>{current && ` · ${current.name}`}. Scegli il nuovo case{item.parent_item_id ? ' (esce dalla scatola)' : ''}:</p>
          <CasePicker value={moveTo} onPick={id => setMoveTo(moveTo === id ? null : id)} exclude={item.expected_case_id} />
          {moveTo && (
            <div className="space-y-2 rise">
              {[
                { v: false, t: 'È già lì', d: 'L\'oggetto è già stato messo fisicamente nel nuovo case.' },
                { v: true, t: 'Da spostare alla prossima replica', d: 'Ora è ancora nel vecchio case: ve lo ricordo al prossimo smontaggio.' },
              ].map(o => (
                <button key={String(o.v)} onClick={() => setPending(o.v)} role="radio" aria-checked={pending === o.v}
                  className={`w-full text-left rounded-2xl border p-3 transition ${pending === o.v ? 'border-accent bg-accent/10' : 'border-line'}`}>
                  <span className="block font-semibold text-sm">{o.t}</span>
                  <span className="block text-xs text-muted">{o.d}</span>
                </button>
              ))}
              <input id="move-note" className="field" value={moveNote} onChange={e => setMoveNote(e.target.value)} placeholder="Motivo (opzionale)" />
            </div>
          )}
        </div>
      )}
      <button disabled={!f.name.trim() || (!item && !f.expected_case_id)} onClick={save} className="btn-primary w-full">
        {item ? (moveTo ? 'Salva e sposta' : 'Salva') : 'Crea oggetto'}
      </button>
      {item && (confirmDel ? (
        <div className="rounded-2xl border border-bad/50 bg-bad/[0.07] p-4 space-y-3">
          <p className="text-sm">Spostare «{item.name}» nel <b>cestino</b>? Sparisce da case, ricerca e smontaggi. Puoi ripristinarlo quando vuoi dal Catalogo → Cestino, con tutto il suo storico.</p>
          <div className="flex gap-2">
            <button onClick={remove} className="btn-bad flex-1 py-2.5">Sposta nel cestino</button>
            <button onClick={() => setConfirmDel(false)} className="btn-ghost flex-1 py-2.5">Annulla</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmDel(true)} className="w-full text-sm text-bad/80 underline underline-offset-2 py-1">Elimina (sposta nel cestino)</button>
      ))}
    </Modal>
  )
}

function CaseRow({ c, onEdit }: { c: Case; onEdit: () => void }) {
  const { items } = useLoadOut()
  const photo = usePhotoUrl(c.photo_path)
  const n = items.filter(i => i.expected_case_id === c.id).length
  return (
    <button onClick={onEdit} className="w-full flex items-center gap-3 rounded-2xl bg-panel border border-line p-2.5 text-left active:scale-[0.98] transition">
      <span className="relative w-16 h-16 rounded-xl overflow-hidden bg-panel-2 shrink-0">
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />}
        <span className="absolute inset-0 flex items-center justify-center title text-2xl" style={{ color: c.color ?? undefined }}>{c.code}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold">{c.name}</span>
        <span className="block text-xs text-muted">{n} oggetti</span>
      </span>
      <span className="text-muted pr-2">›</span>
    </button>
  )
}

function TrashTab({ trash, cases }: { trash: TrashedItem[]; cases: TrashedCase[] }) {
  const lo = useLoadOut()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [forever, setForever] = useState<string | null>(null)   // id da eliminare per sempre (conferma)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const run = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true)
    try { await fn(); toast(msg, 'ok') } catch (e) { toast((e as Error).message, 'bad') }
    setBusy(false); setForever(null); setConfirmEmpty(false)
  }
  const caseSection = cases.length > 0 && (
    <section className="space-y-2">
      <h2 className="eyebrow text-muted">Case nel cestino · {cases.length}</h2>
      {cases.map(c => (
        <div key={c.id} className="rounded-2xl border border-line bg-panel p-4 flex items-center gap-3">
          <span className="title text-2xl w-10 shrink-0 opacity-70" style={{ color: c.color ?? undefined }}>{c.code}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{c.name}</p>
            <p className="text-xs text-muted">{c.deleted_at && `Eliminato il ${dateOf(c.deleted_at)}`}{c.deleted_by_name && ` da ${c.deleted_by_name}`}</p>
          </div>
          <button disabled={busy} onClick={() => run(async () => { await api.restoreCase(c.id); await lo.refresh() }, `Case ${c.code} ripristinato`)} className="btn-primary px-4 py-2.5 text-sm">Ripristina</button>
        </div>
      ))}
    </section>
  )
  if (!trash.length) return <div className="space-y-4">{caseSection}<p className="text-sm text-muted">{cases.length ? 'Nessun oggetto nel cestino.' : 'Il cestino è vuoto. Oggetti e case eliminati finiscono qui e si possono ripristinare.'}</p></div>
  return (
    <div className="space-y-3">
      {caseSection}
      {cases.length > 0 && <h2 className="eyebrow text-muted pt-2">Oggetti nel cestino · {trash.length}</h2>}
      <p className="text-xs text-muted">Questi oggetti non compaiono nei case, nella ricerca e negli smontaggi. “Ripristina” li rimette nel loro case con tutto lo storico.</p>
      {trash.map(t => {
        const c = t.expected_case_id ? lo.caseById.get(t.expected_case_id) : null
        return (
          <div key={t.id} className="rounded-2xl border border-line bg-panel p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="title text-xl w-9 shrink-0 opacity-70" style={{ color: c?.color ?? undefined }}>{c?.code ?? '—'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs text-muted">Va nel case {c?.code ?? '—'}{t.deleted_at && ` · eliminato il ${dateOf(t.deleted_at)}`}{t.deleted_by_name && ` da ${t.deleted_by_name}`}</p>
              </div>
            </div>
            {forever === t.id ? (
              <div className="rounded-xl border border-bad/50 bg-bad/[0.07] p-3 space-y-2">
                <p className="text-sm">Eliminare <b>per sempre</b> «{t.name}» e tutto il suo storico? <b>Non si può annullare.</b></p>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => run(() => lo.deleteItemForever(t.id), `«${t.name}» eliminato per sempre`)} className="btn-bad flex-1 py-2 text-sm">Elimina per sempre</button>
                  <button onClick={() => setForever(null)} className="btn-ghost flex-1 py-2 text-sm">Annulla</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => run(() => lo.restoreItem(t.id), `«${t.name}» ripristinato nel case ${c?.code ?? ''}`)} className="btn-primary flex-1 py-2.5 text-sm">Ripristina</button>
                <button onClick={() => setForever(t.id)} className="btn-ghost px-4 py-2.5 text-sm text-bad">Elimina per sempre</button>
              </div>
            )}
          </div>
        )
      })}
      {confirmEmpty ? (
        <div className="rounded-2xl border border-bad/50 bg-bad/[0.07] p-4 space-y-3">
          <p className="text-sm">Svuotare il cestino? I {trash.length} oggetti vengono eliminati <b>per sempre</b>, con tutto il loro storico. <b>Non si può annullare.</b></p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => run(() => lo.emptyTrash(), 'Cestino svuotato')} className="btn-bad flex-1 py-2.5">Svuota cestino</button>
            <button onClick={() => setConfirmEmpty(false)} className="btn-ghost flex-1 py-2.5">Annulla</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmEmpty(true)} className="w-full text-sm text-bad/80 underline underline-offset-2 py-2">Svuota cestino</button>
      )}
    </div>
  )
}

export default function CatalogPage() {
  const lo = useLoadOut()
  const [tab, setTab] = useState<'cases' | 'items' | 'trash'>('items')
  const [trash, setTrash] = useState<TrashedItem[]>([])
  const [trashCases, setTrashCases] = useState<TrashedCase[]>([])
  useEffect(() => {
    api.trashedItems().then(setTrash).catch(() => setTrash([]))
    api.trashedCases().then(setTrashCases).catch(() => setTrashCases([]))
  }, [lo.version])
  const [editCase, setEditCase] = useState<Case | null | 'new'>(null)
  const [editItem, setEditItem] = useState<Item | null | 'new'>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const found = useItemSearch(lo.items, q, 200)
  const pending = lo.moves.filter(m => m.status === 'pending')
  const shown = useMemo(() => (q ? found : lo.items).filter(i => !filter || i.expected_case_id === filter), [q, found, lo.items, filter])

  const tabs = [
    { k: 'items' as const, t: 'Oggetti', n: lo.items.length },
    { k: 'cases' as const, t: 'Case', n: lo.cases.length },
    { k: 'trash' as const, t: 'Cestino', n: trash.length + trashCases.length },
  ]

  return (
    <div className="px-5 pt-2 space-y-5 pb-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Solo admin</p>
          <h1 className="title text-[40px] mt-2">Catalogo</h1>
        </div>
        {tab !== 'trash' && (
          <button onClick={() => tab === 'cases' ? setEditCase('new') : setEditItem('new')} className="btn-primary px-4 py-2.5 text-sm whitespace-nowrap shrink-0">
            + {tab === 'cases' ? 'Case' : 'Oggetto'}
          </button>
        )}
      </header>

      <div className="flex gap-1 p-1 rounded-full bg-panel border border-line" role="tablist">
        {tabs.map(t => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}
            className={`flex-1 rounded-full py-2.5 text-sm font-medium transition ${tab === t.k ? 'bg-accent text-ink' : 'text-muted'}`}>
            {t.t} <span className="tabular-nums opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === 'cases' && (
        <div className="space-y-2">{lo.cases.map(c => <CaseRow key={c.id} c={c} onEdit={() => setEditCase(c)} />)}</div>
      )}

      {tab === 'trash' && <TrashTab trash={trash} cases={trashCases} />}

      {tab === 'items' && (
        <div className="space-y-3">
          <input id="catalog-search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca oggetto" />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
            <button onClick={() => setFilter(null)} className={`chip shrink-0 border py-1.5 ${!filter ? 'border-accent text-accent' : 'border-line text-muted'}`}>Tutti</button>
            {lo.cases.map(c => (
              <button key={c.id} onClick={() => setFilter(filter === c.id ? null : c.id)}
                className={`chip shrink-0 border py-1.5 ${filter === c.id ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: c.color ?? undefined }} />{c.code} {c.name}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-panel overflow-hidden">
            {shown.map(i => {
              const c = i.expected_case_id ? lo.caseById.get(i.expected_case_id) : null
              const mv = pending.find(m => m.item_id === i.id)
              return (
                <li key={i.id}>
                  <button onClick={() => setEditItem(i)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-panel-2">
                    <span className="title text-lg w-8 shrink-0" style={{ color: c?.color ?? undefined }}>{c?.code ?? '—'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{i.name}</span>
                      {(i.aliases.length > 0 || mv || i.is_container || i.parent_item_id) && <span className="block text-xs text-muted truncate">
                        {i.is_container && <span className="text-accent">▣ scatola · {lo.items.filter(x => x.parent_item_id === i.id).length} oggetti · </span>}
                        {i.parent_item_id && <span className="text-accent">↳ nella «{lo.itemById.get(i.parent_item_id)?.name}» · </span>}
                        {mv && <span className="text-accent">⇄ da spostare · </span>}{i.aliases.join(' · ')}
                      </span>}
                    </span>
                    <span className="text-muted">›</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {editCase && <CaseForm c={editCase === 'new' ? null : editCase} onClose={() => setEditCase(null)} />}
      {editItem && <ItemForm item={editItem === 'new' ? null : editItem} onClose={() => setEditItem(null)} />}
    </div>
  )
}

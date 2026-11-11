import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { usePhotoUrl } from '../../lib/photos'
import type { Case, Item } from '../../lib/types'
import { useLoadOut } from '../cases/LoadOutProvider'
import { useItemSearch } from '../search/useItemSearch'

const swatches = ['#0BB9EA', '#F5C542', '#B583FF', '#FF7A45', '#FF3B6B', '#E23A3A', '#E86BD8', '#4ADE80', '#94A3B8', '#38BDF8']

/** Riduce la foto prima dell'upload (~1600px, JPEG 0.75). */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const cv = document.createElement('canvas')
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s)
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height)
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.75))
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
}

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
    notes: c?.notes ?? '', photo_path: c?.photo_path ?? null, layout_photo_path: c?.layout_photo_path ?? null,
  })
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
      <div className="grid grid-cols-2 gap-2">
        <PhotoInput id="case-photo" label="Foto case" value={f.photo_path} onChange={p => setF({ ...f, photo_path: p })} />
        <PhotoInput id="case-layout" label="Come va riempito" value={f.layout_photo_path} onChange={p => setF({ ...f, layout_photo_path: p })} />
      </div>
      <button disabled={!f.code.trim() || !f.name.trim()} onClick={save} className="btn-primary w-full">{c ? 'Salva' : 'Crea case'}</button>
    </Modal>
  )
}

function ItemForm({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const lo = useLoadOut()
  const toast = useToast()
  const [f, setF] = useState({
    name: item?.name ?? '', aliases: item?.aliases.join(', ') ?? '', notes: item?.notes ?? '',
    photo_path: item?.photo_path ?? null, expected_case_id: item?.expected_case_id ?? lo.cases[0]?.id ?? null,
  })
  const [moveTo, setMoveTo] = useState<string | null>(null)
  const [pending, setPending] = useState(true)
  const [moveNote, setMoveNote] = useState('')
  const current = item?.expected_case_id ? lo.caseById.get(item.expected_case_id) : null

  const save = async () => {
    try {
      const aliases = f.aliases.split(',').map(a => a.trim()).filter(Boolean)
      await api.saveItem({
        ...(item ? { id: item.id } : { expected_case_id: f.expected_case_id }),
        name: f.name.trim(), aliases, notes: f.notes || null, photo_path: f.photo_path,
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

      {!item ? (
        <div className="space-y-2">
          <span className="eyebrow text-muted">Va nel case</span>
          <CasePicker value={f.expected_case_id} onPick={id => setF({ ...f, expected_case_id: id })} />
        </div>
      ) : (
        <div className="rounded-2xl border border-line p-3.5 space-y-3">
          <p className="eyebrow">⇄ Sposta in un altro case</p>
          <p className="text-sm text-muted">Ora va nel <b className="text-fog">case {current?.code ?? '—'}</b>{current && ` · ${current.name}`}. Scegli il nuovo case:</p>
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

export default function CatalogPage() {
  const lo = useLoadOut()
  const [tab, setTab] = useState<'cases' | 'items'>('items')
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
  ]

  return (
    <div className="px-5 pt-2 space-y-5 pb-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Solo admin</p>
          <h1 className="title text-[40px] mt-2">Catalogo</h1>
        </div>
        {(
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
                      {(i.aliases.length > 0 || mv) && <span className="block text-xs text-muted truncate">
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

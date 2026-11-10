import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePhotoUrl } from '../../lib/photos'
import { statusStyle, timeOf } from '../../lib/status'
import type { Item } from '../../lib/types'
import { useLoadOut } from '../cases/LoadOutProvider'
import { useItemSearch } from './useItemSearch'

function Result({ item }: { item: Item }) {
  const { caseById, status, loadOut } = useLoadOut()
  const exp = item.expected_case_id ? caseById.get(item.expected_case_id) : undefined
  const s = status.get(item.id)
  const actual = s?.actual_case_id ? caseById.get(s.actual_case_id) : undefined
  const photo = usePhotoUrl(item.photo_path)
  return (
    <li className="rise rounded-3xl bg-panel border border-line p-4 flex gap-4 items-center">
      {exp
        ? <Link to={`/case/${exp.id}`} className="shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center border border-line bg-panel-2" aria-label={`Apri case ${exp.code}`}>
            <span className="text-[9px] uppercase tracking-widest text-muted">case</span>
            <span className="title text-2xl" style={{ color: exp.color ?? undefined }}>{exp.code}</span>
          </Link>
        : <span className="shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center border border-dashed border-line text-muted">?</span>}
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-snug">{item.name}</p>
        {item.aliases.length > 0 && <p className="text-xs text-muted truncate">{item.aliases.join(' · ')}</p>}
        <p className="text-sm mt-1">{exp ? <>Va nel <b>case {exp.code}</b> · {exp.name}</> : 'Nessun case assegnato'}</p>
        {loadOut && s && (
          <p className="text-xs mt-1 flex items-center gap-2 text-muted">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusStyle[s.status].dot}`} />
            {actual ? <>Ora nel case {actual.code} · {s.placed_by_name} {timeOf(s.placed_at)}</> : 'Non ancora in nessun case'}
          </p>
        )}
      </div>
      {photo && <img src={photo} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />}
    </li>
  )
}

const hints = ['scatola rossa', 'sax', 'prolunga', 'giacca', 'tuba']

export default function SearchPage() {
  const { items } = useLoadOut()
  const [q, setQ] = useState('')
  const results = useItemSearch(items, q)
  return (
    <div className="px-5 pt-2 space-y-5">
      <header>
        <p className="eyebrow">Ricerca</p>
        <h1 className="title text-5xl mt-2">Dove va?</h1>
      </header>
      <input id="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nome o alias, anche sbagliato" className="field text-lg py-4" />
      {!q && (
        <div className="flex flex-wrap gap-2">
          {hints.map(h => <button key={h} onClick={() => setQ(h)} className="chip border border-line bg-panel text-muted py-1.5">{h}</button>)}
        </div>
      )}
      <ul className="space-y-3">{results.map(i => <Result key={i.id} item={i} />)}</ul>
      {q && results.length === 0 && <p className="text-muted">Nessun oggetto trovato per “{q}”.</p>}
    </div>
  )
}

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
    <li className="rounded-2xl bg-gray-900 border border-gray-800 p-4 flex gap-3">
      {photo && <img src={photo} alt="" className="w-16 h-16 rounded-xl object-cover" />}
      <div className="flex-1 min-w-0">
        <p className="text-lg font-semibold">{item.name}</p>
        {item.aliases.length > 0 && <p className="text-sm text-gray-500 truncate">{item.aliases.join(' · ')}</p>}
        <p className="mt-1">Va nel {exp
          ? <Link to={`/case/${exp.id}`} className="font-bold underline">case {exp.code}</Link>
          : <span className="text-gray-400">nessun case assegnato</span>}</p>
        {loadOut && s && (
          <p className="text-sm mt-1 flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${statusStyle[s.status].dot}`} />
            {actual ? <>Ora nel case {actual.code} · {s.placed_by_name} {timeOf(s.placed_at)}</> : 'Non ancora messo in nessun case'}
          </p>
        )}
        {item.notes && <p className="text-sm text-gray-400 mt-1">{item.notes}</p>}
      </div>
    </li>
  )
}

export default function SearchPage() {
  const { items } = useLoadOut()
  const [q, setQ] = useState('')
  const results = useItemSearch(items, q)
  return (
    <div className="p-5 space-y-4">
      <h1 className="text-2xl font-bold">Dove va?</h1>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Scatola rossa, prolunga…"
        className="w-full rounded-xl bg-gray-900 border border-gray-700 px-4 py-4 text-lg" />
      <ul className="space-y-3">{results.map(i => <Result key={i.id} item={i} />)}</ul>
      {q && results.length === 0 && <p className="text-gray-400">Nessun oggetto trovato.</p>}
    </div>
  )
}

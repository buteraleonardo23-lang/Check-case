import { Link } from 'react-router-dom'
import { usePhotoUrl } from '../../lib/photos'
import type { Case } from '../../lib/types'
import { caseProgress, useLoadOut } from './LoadOutProvider'
import { useAuth } from '../auth/AuthProvider'

function CaseCard({ c }: { c: Case }) {
  const { items, status, closures } = useLoadOut()
  const photo = usePhotoUrl(c.photo_path)
  const p = caseProgress(c.id, items, status)
  const closed = closures.has(c.id)
  const pct = p.total ? Math.round((p.green / p.total) * 100) : 0

  return (
    <Link to={`/case/${c.id}`}
      className="snap-center shrink-0 w-[78vw] max-w-sm h-[62vh] rounded-3xl overflow-hidden relative border border-gray-800 bg-gray-900 flex flex-col">
      <div className="flex-1 relative bg-gray-800">
        {photo
          ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 flex items-center justify-center text-8xl font-black text-gray-700">{c.code}</div>}
        {closed && <div className="absolute top-3 right-3 rounded-full bg-green-600 px-3 py-1 text-sm font-bold">✓ CHIUSO</div>}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black" style={{ color: c.color ?? undefined }}>{c.code}</span>
          <span className="text-lg text-gray-300 truncate">{c.name}</span>
        </div>
        <div className="h-3 rounded-full bg-gray-800 overflow-hidden flex">
          <div className="bg-green-500" style={{ width: `${pct}%` }} />
          <div className="bg-orange-500" style={{ width: `${p.total ? (p.orange / p.total) * 100 : 0}%` }} />
        </div>
        <div className="flex gap-4 text-sm text-gray-400">
          <span>{p.green}/{p.total}</span>
          {p.orange > 0 && <span className="text-orange-400">● {p.orange} altrove</span>}
          {p.red > 0 && <span className="text-red-400">● {p.red} mancano</span>}
        </div>
      </div>
    </Link>
  )
}

export default function CaseCarousel() {
  const { cases, loadOut, loading, startLoadOut } = useLoadOut()
  const { isAdmin } = useAuth()

  if (loading) return <p className="p-6 text-gray-400">Caricamento…</p>

  if (!loadOut) return (
    <div className="p-6 text-center space-y-4 mt-20">
      <p className="text-xl">Nessuno smontaggio in corso.</p>
      {isAdmin
        ? <button onClick={() => startLoadOut().catch(e => alert(e.message))}
            className="rounded-xl bg-green-600 px-6 py-4 text-lg font-semibold">Inizia smontaggio</button>
        : <p className="text-gray-400">Aspetta che Matteo o Leonardo lo avviino.</p>}
    </div>
  )

  return (
    <div className="pt-4">
      <h1 className="px-5 text-2xl font-bold mb-3">Case</h1>
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar px-[11vw] pb-4">
        {cases.map(c => <CaseCard key={c.id} c={c} />)}
      </div>
      <p className="text-center text-gray-500 text-sm">← scorri →</p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { timeOf } from '../../lib/status'
import type { Activity } from '../../lib/types'
import { caseProgress, useLoadOut } from '../cases/LoadOutProvider'

export default function DashboardPage() {
  const lo = useLoadOut()
  const [feed, setFeed] = useState<(Activity & { by: string })[]>([])
  const statuses = [...lo.status.values()]

  useEffect(() => {
    if (!lo.loadOut) return
    supabase.from('placements')
      .select('id, item_id, case_id, placed_by, placed_at, removed_at, profiles!placements_placed_by_fkey(display_name)')
      .eq('load_out_id', lo.loadOut.id).order('placed_at', { ascending: false }).limit(40)
      .then(({ data }) => setFeed((data ?? []).map((r: any) => ({ ...r, by: r.profiles?.display_name ?? '?' }))))
  }, [lo.loadOut, lo.status])

  if (!lo.loadOut) return <p className="p-6 text-gray-400">Nessuno smontaggio in corso.</p>

  const red = statuses.filter(s => s.status === 'red').length
  const orange = statuses.filter(s => s.status === 'orange')
  const closedCount = lo.cases.filter(c => lo.closures.has(c.id)).length
  const allClosed = closedCount === lo.cases.length && lo.cases.length > 0
  const name = (id: string) => lo.items.find(i => i.id === id)?.name ?? '?'
  const code = (id: string | null) => (id && lo.caseById.get(id)?.code) || '—'

  return (
    <div className="p-5 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {allClosed && <div className="rounded-2xl bg-green-600 p-4 text-lg font-bold text-center">✓ Tutto pronto per il carico</div>}

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-2xl bg-gray-900 p-3"><p className="text-3xl font-black">{closedCount}/{lo.cases.length}</p><p className="text-sm text-gray-400">case chiusi</p></div>
        <div className="rounded-2xl bg-gray-900 p-3"><p className="text-3xl font-black text-orange-400">{orange.length}</p><p className="text-sm text-gray-400">altrove</p></div>
        <div className="rounded-2xl bg-gray-900 p-3"><p className="text-3xl font-black text-red-400">{red}</p><p className="text-sm text-gray-400">mancano</p></div>
      </div>

      <section className="space-y-2">
        {lo.cases.map(c => {
          const p = caseProgress(c.id, lo.items, lo.status)
          const cl = lo.closures.get(c.id)
          return (
            <Link key={c.id} to={`/case/${c.id}`} className="flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3">
              <span className="text-xl font-black w-10" style={{ color: c.color ?? undefined }}>{c.code}</span>
              <span className="flex-1">
                <span className="block h-2 rounded-full bg-gray-800 overflow-hidden">
                  <span className="block h-full bg-green-500" style={{ width: `${p.total ? (p.green / p.total) * 100 : 0}%` }} />
                </span>
                <span className="text-xs text-gray-400">{p.green}/{p.total}{p.orange ? ` · ${p.orange} altrove` : ''}{p.red ? ` · ${p.red} mancano` : ''}</span>
              </span>
              {cl ? <span className="text-green-400 text-sm">✓ {timeOf(cl.closed_at)}{cl.forced && ' ⚠️'}</span> : <span className="text-gray-500 text-sm">aperto</span>}
            </Link>
          )
        })}
      </section>

      {orange.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2 text-orange-400">Nei case sbagliati</h2>
          <ul className="space-y-1 text-sm">
            {orange.map(s => (
              <li key={s.item_id} className="rounded-xl bg-gray-900 px-3 py-2">
                <b>{s.item_name}</b>: case {code(s.actual_case_id)} invece del {code(s.expected_case_id)} · {s.placed_by_name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Attività</h2>
        <ul className="space-y-1 text-sm text-gray-300">
          {feed.map(f => (
            <li key={f.id} className={f.removed_at ? 'line-through text-gray-500' : ''}>
              {timeOf(f.placed_at)} · <b>{f.by}</b> → {name(f.item_id)} nel case {code(f.case_id)}
            </li>
          ))}
        </ul>
      </section>

      <button onClick={() => confirm('Chiudere lo smontaggio? Non si potranno più modificare i case.') && lo.endLoadOut().catch(e => alert(e.message))}
        className="w-full rounded-2xl bg-gray-800 py-4">Concludi smontaggio</button>
    </div>
  )
}

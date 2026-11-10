import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Ring from '../../components/Ring'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { timeOf } from '../../lib/status'
import type { ActivityRow } from '../../lib/types'
import { caseProgress, useLoadOut } from '../cases/LoadOutProvider'

export default function DashboardPage() {
  const lo = useLoadOut()
  const toast = useToast()
  const [feed, setFeed] = useState<ActivityRow[]>([])
  const [confirmEnd, setConfirmEnd] = useState(false)

  useEffect(() => {
    if (lo.loadOut) api.activity(lo.loadOut.id).then(setFeed)
  }, [lo.loadOut, lo.version])

  if (!lo.loadOut) return (
    <div className="px-5 pt-2">
      <p className="eyebrow">Dashboard</p>
      <p className="text-muted mt-4">Nessuno smontaggio in corso. Avvialo dalla schermata Case.</p>
    </div>
  )

  const statuses = [...lo.status.values()]
  const green = statuses.filter(s => s.status === 'green').length
  const red = statuses.filter(s => s.status === 'red')
  const orange = statuses.filter(s => s.status === 'orange')
  const closedCount = lo.cases.filter(c => lo.closures.has(c.id)).length
  const allClosed = closedCount === lo.cases.length && lo.cases.length > 0
  const name = (id: string) => lo.itemById.get(id)?.name ?? '?'
  const code = (id: string | null) => (id && lo.caseById.get(id)?.code) || '—'

  return (
    <div className="px-5 pt-2 space-y-7 pb-6">
      <header>
        <p className="eyebrow">Regia · live</p>
        <h1 className="title text-5xl mt-2">Dashboard</h1>
      </header>

      {allClosed
        ? <div className="rounded-3xl bg-ok text-ink p-5"><p className="eyebrow text-ink/70">Stato</p><p className="title text-3xl mt-1">Tutto pronto per il carico</p></div>
        : (
          <div className="rounded-3xl glass p-5 flex items-center gap-5">
            <div className="relative shrink-0">
              <Ring green={green} orange={orange.length} total={statuses.length} size={92} />
              <span className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums">{statuses.length ? Math.round(((green + orange.length) / statuses.length) * 100) : 0}%</span>
                <span className="text-[9px] uppercase tracking-widest text-muted">al sicuro</span>
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm flex-1">
              <dt className="text-muted">Case chiusi</dt><dd className="font-bold tabular-nums text-right">{closedCount}/{lo.cases.length}</dd>
              <dt className="text-muted">Nel case giusto</dt><dd className="font-bold tabular-nums text-right text-ok">{green}</dd>
              <dt className="text-muted">Altrove</dt><dd className="font-bold tabular-nums text-right text-warn">{orange.length}</dd>
              <dt className="text-muted">Mancano</dt><dd className="font-bold tabular-nums text-right text-bad">{red.length}</dd>
            </dl>
          </div>
        )}

      <section>
        <h2 className="eyebrow text-muted mb-3">Case</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {lo.cases.map(c => {
            const p = caseProgress(c.id, lo.items, lo.status)
            const cl = lo.closures.get(c.id)
            return (
              <Link key={c.id} to={`/case/${c.id}`} className={`rounded-2xl border p-3.5 flex flex-col gap-2 transition active:scale-[0.97] ${cl ? 'border-ok/50 bg-ok/[0.07]' : 'border-line bg-panel'}`}>
                <div className="flex items-baseline gap-2">
                  <span className="title text-2xl" style={{ color: c.color ?? undefined }}>{c.code}</span>
                  <span className="text-xs text-muted truncate">{c.name}</span>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden flex">
                  <span className="bg-ok" style={{ width: `${p.total ? (p.green / p.total) * 100 : 0}%` }} />
                  <span className="bg-warn" style={{ width: `${p.total ? (p.orange / p.total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs tabular-nums flex justify-between">
                  <span>{p.green}/{p.total}{p.red > 0 && <span className="text-bad"> · {p.red}✕</span>}</span>
                  {cl ? <span className="text-ok">✓ {timeOf(cl.closed_at)}{cl.forced && ' ⚠'}</span> : <span className="text-muted">aperto</span>}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {orange.length > 0 && (
        <section>
          <h2 className="eyebrow text-warn mb-3">Nel case sbagliato</h2>
          <ul className="space-y-2">
            {orange.map(s => (
              <li key={s.item_id} className="rounded-2xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-sm">
                <b>{s.item_name}</b>
                <span className="block text-xs text-muted mt-0.5">Nel case {code(s.actual_case_id)} invece del {code(s.expected_case_id)} · segnato da <span className="text-fog">{s.placed_by_name}</span> alle {timeOf(s.placed_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="eyebrow text-muted mb-3">Attività</h2>
        <ol className="relative border-l border-line ml-1.5 space-y-3">
          {feed.slice(0, 15).map(f => (
            <li key={f.id} className={`pl-4 text-sm relative ${f.removed_at ? 'text-muted line-through' : ''}`}>
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent" />
              <span className="tabular-nums text-muted text-xs">{timeOf(f.placed_at)}</span> · <b>{f.by}</b> → {name(f.item_id)} <span className="text-muted">nel {code(f.case_id)}</span>
            </li>
          ))}
        </ol>
      </section>

      {confirmEnd
        ? <div className="rounded-2xl border border-line p-4 space-y-3">
            <p className="text-sm">Concludere lo smontaggio? I case non si potranno più modificare.</p>
            <div className="flex gap-2">
              <button onClick={() => lo.endLoadOut().then(() => toast('Smontaggio concluso', 'ok')).catch(e => toast(e.message, 'bad'))} className="btn-primary flex-1">Concludi</button>
              <button onClick={() => setConfirmEnd(false)} className="btn-ghost flex-1">Annulla</button>
            </div>
          </div>
        : <button onClick={() => setConfirmEnd(true)} className="btn-ghost w-full">Concludi smontaggio</button>}
    </div>
  )
}

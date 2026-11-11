import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { copyText } from '../../lib/share'
import type { LoadOutInfo, LogRow } from '../../lib/types'
import { useLoadOut } from '../cases/LoadOutProvider'

const dot = (a: string) =>
  a === 'placed' ? 'bg-ok' : a === 'placed_elsewhere' ? 'bg-warn' : a === 'removed' ? 'bg-muted'
  : a.startsWith('case_forced') || a === 'issue_lost' ? 'bg-bad'
  : a.startsWith('case_') ? 'bg-ok' : a.startsWith('load_out') ? 'bg-accent' : 'bg-fog'

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

type Filter = string | null | 'all'   // id smontaggio | null = catalogo | 'all'

export default function LogPage() {
  const lo = useLoadOut()
  const toast = useToast()
  const [loadOuts, setLoadOuts] = useState<LoadOutInfo[]>([])
  const [filter, setFilter] = useState<Filter | undefined>(undefined)
  const [rows, setRows] = useState<LogRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)

  useEffect(() => { api.loadOuts().then(l => { setLoadOuts(l); setFilter(f => f === undefined ? (l[0]?.id ?? 'all') : f) }) }, [lo.version])
  useEffect(() => {
    if (filter === undefined) return
    api.activityLog(filter).then(r => { setRows(r); setError(null) }).catch(e => setError(e.message))
  }, [filter, lo.version])

  const label = (f: Filter) => {
    if (f === 'all') return 'Tutto'
    if (f === null) return 'Catalogo'
    const l = loadOuts.find(x => x.id === f)
    return l ? `${fmtDay(l.started_at)}${l.status === 'open' ? ' · in corso' : ''}` : '?'
  }

  const grouped = useMemo(() => {
    const g: [string, LogRow[]][] = []
    for (const r of rows) {
      const d = fmtDay(r.at)
      if (!g.length || g[g.length - 1][0] !== d) g.push([d, []])
      g[g.length - 1][1].push(r)
    }
    return g
  }, [rows])

  const copyForClaude = async () => {
    const head = `Check-case · Registro · ${filter === 'all' ? 'tutto' : filter === null || filter === undefined ? 'catalogo' : 'smontaggio del ' + label(filter)}\n` +
      `Esportato il ${new Date().toLocaleString('it-IT')} · ${rows.length} righe\n\n`
    const text = head + rows.map(r => `${new Date(r.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${r.message}`).join('\n')
    if (await copyText(text) === 'copied') toast(`Registro copiato (${rows.length} righe): incollalo in chat con Claude`, 'ok')
    else setManual(text)
  }

  return (
    <div className="px-5 pt-2 space-y-5 pb-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Chi ha fatto cosa</p>
          <h1 className="title text-[40px] mt-2">Registro</h1>
        </div>
        <button onClick={copyForClaude} disabled={!rows.length} className="btn-primary px-4 py-2.5 text-sm shrink-0">Copia per Claude</button>
      </header>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
        {[...loadOuts.map(l => l.id as Filter), null, 'all' as Filter].map(f => (
          <button key={String(f)} onClick={() => setFilter(f)}
            className={`chip shrink-0 border py-1.5 ${filter === f ? 'border-accent text-accent' : 'border-line text-muted'}`}>
            {f !== null && f !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${loadOuts.find(l => l.id === f)?.status === 'open' ? 'bg-ok' : 'bg-muted'}`} />}
            {label(f)}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-warn">Registro non disponibile: esegui la migration 0003 su Supabase. ({error})</p>}
      {!error && rows.length === 0 && <p className="text-sm text-muted">Nessuna attività registrata qui.</p>}

      {grouped.map(([day, list]) => (
        <section key={day}>
          <h2 className="eyebrow text-muted mb-2">{day} · {list.length} azioni</h2>
          <ol className="relative border-l border-line ml-1.5 space-y-2.5">
            {list.map(r => (
              <li key={r.id} className="pl-4 text-sm relative">
                <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${dot(r.action)}`} />
                <span className="tabular-nums text-muted text-xs mr-2">{fmtTime(r.at)}</span>{r.message}
              </li>
            ))}
          </ol>
        </section>
      ))}

      {manual && (
        <Modal eyebrow="Copia per Claude" title="Copia il registro" onClose={() => setManual(null)}>
          <textarea id="log-text" readOnly value={manual} onFocus={e => e.currentTarget.select()} className="field min-h-64 text-xs font-mono" />
          <p className="text-xs text-muted">Tieni premuto sul testo, seleziona tutto e copia.</p>
        </Modal>
      )}
    </div>
  )
}

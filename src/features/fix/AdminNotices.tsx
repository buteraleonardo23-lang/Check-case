import { Link } from 'react-router-dom'
import { dateOf } from '../../lib/status'
import { useAuth } from '../auth/AuthProvider'
import { useLoadOut } from '../cases/LoadOutProvider'

/** Banner per gli admin: resta finché ci sono cose da sistemare dagli smontaggi precedenti. */
export default function AdminNotices() {
  const { isAdmin } = useAuth()
  const { openIssues, moves, dbOutdated } = useLoadOut()
  if (!isAdmin) return null

  if (dbOutdated) return (
    <div className="mx-5 mb-4 rounded-2xl border border-warn/50 bg-warn/10 p-4 text-sm">
      <p className="eyebrow text-warn">Database da aggiornare</p>
      <p className="mt-1">Esegui <b>supabase/migrations/0003_log_e_da_sistemare.sql</b> nello SQL Editor di Supabase per attivare registro e “Da sistemare”.</p>
    </div>
  )

  const misplaced = openIssues.filter(i => i.kind === 'misplaced').length
  const missing = openIssues.filter(i => i.kind === 'missing' && i.status === 'open').length
  const lost = openIssues.filter(i => i.status === 'lost').length
  const pendingMoves = moves.filter(m => m.status === 'pending').length
  if (!misplaced && !missing && !lost && !pendingMoves) return null
  const last = openIssues[0]?.load_out_date

  const parts = [
    missing && { n: missing, t: missing === 1 ? 'non trovato' : 'non trovati', c: 'text-bad' },
    lost && { n: lost, t: 'da ricomprare', c: 'text-bad' },
    misplaced && { n: misplaced, t: 'nel case sbagliato', c: 'text-warn' },
    pendingMoves && { n: pendingMoves, t: pendingMoves === 1 ? 'spostamento deciso' : 'spostamenti decisi', c: 'text-accent' },
  ].filter(Boolean) as { n: number; t: string; c: string }[]

  return (
    <Link to="/da-sistemare" className="rise mx-5 mb-4 flex items-center gap-3 rounded-2xl border border-warn/40 bg-gradient-to-r from-warn/15 to-bad/10 p-4 active:scale-[0.99] transition">
      <span className="w-10 h-10 shrink-0 rounded-full bg-warn text-ink flex items-center justify-center text-lg font-black">!</span>
      <span className="flex-1 min-w-0">
        <span className="eyebrow text-warn">Da sistemare{last ? ` · smontaggio del ${dateOf(last)}` : ''}</span>
        <span className="flex flex-wrap gap-x-3 text-sm mt-0.5">
          {parts.map(p => <span key={p.t}><b className={`tabular-nums ${p.c}`}>{p.n}</b> {p.t}</span>)}
        </span>
      </span>
      <span className="text-muted text-xl">›</span>
    </Link>
  )
}

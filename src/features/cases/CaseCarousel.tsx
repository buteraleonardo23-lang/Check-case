import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Ring from '../../components/Ring'
import { usePhotoUrl } from '../../lib/photos'
import { timeOf } from '../../lib/status'
import type { Case } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/AuthProvider'
import { caseProgress, useLoadOut } from './LoadOutProvider'
import AdminNotices from '../fix/AdminNotices'

function CaseCard({ c, focus }: { c: Case; focus: number }) {
  const { items, status, closures, moves } = useLoadOut()
  const photo = usePhotoUrl(c.photo_path)
  const p = caseProgress(c.id, items, status)
  const closed = closures.has(c.id)
  const pendingIn = moves.filter(m => m.status === 'pending' && (m.to_case_id === c.id || m.from_case_id === c.id)).length
  // focus: 1 = card al centro, 0 = lontana
  const scale = 0.9 + 0.1 * focus

  return (
    <Link to={`/case/${c.id}`} data-card
      style={{ transform: `scale(${scale})`, opacity: 0.45 + 0.55 * focus }}
      className="snap-center shrink-0 w-[min(78vw,360px)] aspect-[3/4.3] max-h-[66svh] rounded-[28px] overflow-hidden relative border border-line bg-panel flex flex-col transition-[transform,opacity] duration-150 ease-out shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)]">
      {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-ink/95" />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: c.color ?? 'var(--color-accent)' }} />

      <div className="relative p-5 flex items-start justify-between">
        <span className="title text-[88px] drop-shadow-[0_4px_20px_rgba(0,0,0,.6)]" style={{ color: c.color ?? undefined }}>{c.code}</span>
        <div className="flex flex-col items-end gap-2">
          {closed && <span className="chip bg-ok text-ink font-bold">✓ Chiuso</span>}
          {pendingIn > 0 && <span className="chip bg-accent/20 text-accent border border-accent/40">⇄ {pendingIn} da spostare</span>}
        </div>
      </div>

      <div className="relative mt-auto p-5 flex items-end gap-4">
        <div className="flex-1 min-w-0">
          <p className="eyebrow">Case {c.code}</p>
          <h2 className="title text-[26px] mt-1 line-clamp-2 break-words">{c.name}</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-sm">
            <span className="text-fog tabular-nums">{p.green}/{p.total} dentro</span>
            {p.orange > 0 && <span className="text-warn tabular-nums">{p.orange} altrove</span>}
            {p.red > 0 && <span className="text-bad tabular-nums">{p.red} mancano</span>}
          </div>
        </div>
        <div className="relative shrink-0">
          <Ring green={p.green} orange={p.orange} total={p.total} size={64} />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
            {p.total ? Math.round((p.green / p.total) * 100) : 0}%
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function CaseCarousel() {
  const { cases, items, status, closures, loadOut, loading, startLoadOut } = useLoadOut()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const scroller = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<number[]>([])

  // calcolo quanto ogni card è vicina al centro → effetto "palco"
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const mid = el.scrollLeft + el.clientWidth / 2
        const cards = [...el.querySelectorAll<HTMLElement>('[data-card]')]
        setFocus(cards.map(card => {
          const center = card.offsetLeft + card.offsetWidth / 2
          return Math.max(0, 1 - Math.abs(center - mid) / card.offsetWidth)
        }))
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); cancelAnimationFrame(raf) }
  }, [cases.length, loadOut])

  if (loading) return <p className="p-6 text-muted">Caricamento…</p>

  if (!loadOut) return (
    <div className="pt-4">
    <AdminNotices />
    <div className="px-6 pt-16 text-center space-y-5 rise">
      <p className="eyebrow">Nessuno smontaggio in corso</p>
      <h1 className="title text-4xl">Pronti a<br />smontare?</h1>
      {isAdmin
        ? <button onClick={() => startLoadOut().catch(e => toast(e.message, 'bad'))} className="btn-primary">Inizia smontaggio</button>
        : <p className="text-muted">Aspetta che un admin lo avvii.</p>}
    </div>
    </div>
  )

  const all = [...status.values()]
  const safe = all.filter(s => s.status !== 'red').length
  const active = focus.length ? focus.indexOf(Math.max(...focus)) : 0

  return (
    <div className="pt-2 rise">
      <header className="px-5 pb-4">
        <p className="eyebrow">Smontaggio in corso · dalle {timeOf(loadOut.started_at)}</p>
        <div className="flex items-end justify-between gap-4 mt-2">
          <h1 className="title text-5xl whitespace-nowrap">I case</h1>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{safe}<span className="text-muted text-base">/{items.length}</span></p>
            <p className="text-xs text-muted">oggetti al sicuro · {closures.size}/{cases.length} chiusi</p>
          </div>
        </div>
      </header>

      <AdminNotices />
      <div ref={scroller} className="relative flex gap-1 overflow-x-auto snap-x snap-mandatory no-scrollbar px-[max(11vw,calc(50vw-180px))] py-2">
        {cases.map((c, i) => <CaseCard key={c.id} c={c} focus={focus[i] ?? (i === 0 ? 1 : 0)} />)}
      </div>

      <div className="flex justify-center gap-1.5 mt-3" aria-hidden="true">
        {cases.map((c, i) => (
          <span key={c.id} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-accent' : 'w-1.5 bg-line'}`} />
        ))}
      </div>
      <p className="text-center text-xs text-muted mt-3">Scorri i case · tocca per aprire</p>
    </div>
  )
}

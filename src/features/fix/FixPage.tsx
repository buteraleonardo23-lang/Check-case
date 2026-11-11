import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { shareOrCopy } from '../../lib/share'
import { dateOf } from '../../lib/status'
import type { IssueAction, LoadOutIssue } from '../../lib/types'
import { useLoadOut } from '../cases/LoadOutProvider'

const resolutionText: Record<string, string> = {
  fixed: 'rimesso a posto', reassigned: 'lasciato nel nuovo case', found: 'ritrovato',
  replaced: 'ricomprato', dismissed: 'ignorato',
}

export default function FixPage() {
  const lo = useLoadOut()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [manualText, setManualText] = useState<string | null>(null)

  const missing = lo.openIssues.filter(i => i.kind === 'missing' && i.status === 'open')
  const lost = lo.openIssues.filter(i => i.status === 'lost')
  const misplaced = lo.openIssues.filter(i => i.kind === 'misplaced')
  const pendingMoves = lo.moves.filter(m => m.status === 'pending')
  const resolved = lo.issues.filter(i => i.status === 'resolved').slice(0, 15)
  const name = (i: LoadOutIssue) => lo.itemById.get(i.item_id)?.name ?? '?'
  const code = (id: string | null) => (id && lo.caseById.get(id)?.code) || '—'

  const missingByCase = useMemo(() => {
    const m = new Map<string, LoadOutIssue[]>()
    for (const i of missing) m.set(i.expected_case_id ?? '', [...(m.get(i.expected_case_id ?? '') ?? []), i])
    return [...m.entries()].sort((a, b) => code(a[0]).localeCompare(code(b[0])))
  }, [missing]) // eslint-disable-line

  const act = async (ids: string[], action: IssueAction, msg: string) => {
    setBusy(true)
    try { await lo.resolveIssues(ids, action); toast(msg, 'ok') } catch (e) { toast((e as Error).message, 'bad') }
    setBusy(false)
  }

  const askTeam = async () => {
    const lines = missing.map(i => {
      const c = i.expected_case_id ? lo.caseById.get(i.expected_case_id) : null
      return `• ${name(i)}${c ? ` (case ${c.code} ${c.name})` : ''}`
    })
    const text = `Ciao ragazzi! Dopo lo smontaggio del ${dateOf(missing[0].load_out_date)} non risultano segnati questi oggetti:\n${lines.join('\n')}\n\nQualcuno li ha visti o si è dimenticato di segnarli?`
    const r = await shareOrCopy(text)
    if (r === 'copied') toast('Messaggio copiato: incollalo su WhatsApp', 'ok')
    else if (r === 'manual') setManualText(text)
  }

  if (lo.dbOutdated) return (
    <div className="px-5 pt-2"><p className="eyebrow">Da sistemare</p>
      <p className="mt-4 text-muted">Prima esegui la migration 0003 su Supabase (vedi il banner nella schermata Case).</p></div>
  )

  const nothing = !missing.length && !lost.length && !misplaced.length && !pendingMoves.length

  return (
    <div className="px-5 pt-2 space-y-7 pb-8">
      <header>
        <p className="eyebrow">Prima della prossima replica</p>
        <h1 className="title text-[40px] mt-2">Da sistemare</h1>
        <p className="text-sm text-muted mt-2">Quello che è rimasto fuori posto negli smontaggi conclusi. Le voci si chiudono da sole quando, allo smontaggio dopo, l'oggetto torna al suo posto.</p>
      </header>

      {nothing && (
        <div className="rounded-3xl border border-ok/40 bg-ok/10 p-5">
          <p className="title text-2xl text-ok">Tutto a posto</p>
          <p className="text-sm text-muted mt-1">Nessun oggetto perso o fuori posto.</p>
        </div>
      )}

      {missing.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="eyebrow text-bad">Non trovati · {missing.length}</h2>
              <p className="text-xs text-muted mt-1">Persi davvero o qualcuno si è dimenticato di segnarli?</p>
            </div>
            <button onClick={askTeam} className="btn-ghost px-4 py-2 text-sm shrink-0">Chiedi ai ragazzi</button>
          </div>
          {missingByCase.map(([caseId, list]) => {
            const c = lo.caseById.get(caseId)
            const expanded = open[caseId] ?? list.length <= 4
            return (
              <div key={caseId} className="rounded-2xl border border-line bg-panel overflow-hidden">
                <button onClick={() => setOpen({ ...open, [caseId]: !expanded })} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <span className="title text-xl" style={{ color: c?.color ?? undefined }}>{c?.code ?? '—'}</span>
                  <span className="flex-1 text-sm">{c?.name ?? 'Senza case'}</span>
                  <span className="chip bg-bad/15 text-bad tabular-nums">{list.length}</span>
                  <span className="text-muted">{expanded ? '▾' : '▸'}</span>
                </button>
                {expanded && (
                  <ul className="divide-y divide-line border-t border-line">
                    {list.map(i => (
                      <li key={i.id} className="px-4 py-3 flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-sm font-medium">{name(i)}</span>
                        <button disabled={busy} onClick={() => act([i.id], 'found', `${name(i)}: ritrovato`)} className="chip border border-ok/50 text-ok py-1.5">Trovato</button>
                        <button disabled={busy} onClick={() => act([i.id], 'lost', `${name(i)}: da ricomprare`)} className="chip border border-bad/50 text-bad py-1.5">Perso</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          {confirmDismiss ? (
            <div className="rounded-2xl border border-line p-4 space-y-3">
              <p className="text-sm">Ignorare tutti i {missing.length} non trovati? Utile dopo uno smontaggio di prova. Resta comunque traccia nel registro.</p>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => act(missing.map(i => i.id), 'dismissed', `${missing.length} voci ignorate`).then(() => setConfirmDismiss(false))} className="btn-bad flex-1 py-2.5">Ignora tutti</button>
                <button onClick={() => setConfirmDismiss(false)} className="btn-ghost flex-1 py-2.5">Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDismiss(true)} className="text-xs text-muted underline underline-offset-2">Era una prova? Ignora tutti i non trovati</button>
          )}
        </section>
      )}

      {lost.length > 0 && (
        <section className="space-y-2">
          <h2 className="eyebrow text-bad">Persi · da ricomprare · {lost.length}</h2>
          {lost.map(i => (
            <div key={i.id} className="rounded-2xl border border-bad/40 bg-bad/[0.07] p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{name(i)}</p>
                <p className="text-xs text-muted">Va nel case {code(i.expected_case_id)} · perso allo smontaggio del {dateOf(i.load_out_date)}</p>
              </div>
              <button disabled={busy} onClick={() => act([i.id], 'replaced', `${name(i)}: ricomprato`)} className="btn-ghost px-4 py-2 text-sm">Ricomprato</button>
            </div>
          ))}
        </section>
      )}

      {misplaced.length > 0 && (
        <section className="space-y-2">
          <h2 className="eyebrow text-warn">Nel case sbagliato · {misplaced.length}</h2>
          {misplaced.map(i => (
            <div key={i.id} className="rounded-2xl border border-warn/40 bg-warn/[0.06] p-4 space-y-3">
              <div>
                <p className="font-semibold">{name(i)}</p>
                <p className="text-sm">È nel <b>case {code(i.actual_case_id)}</b>, va nel <b>case {code(i.expected_case_id)}</b></p>
                <p className="text-xs text-muted">{i.placed_by_name ? `Messo da ${i.placed_by_name} · ` : ''}smontaggio del {dateOf(i.load_out_date)}</p>
              </div>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => act([i.id], 'fixed', `${name(i)}: rimesso nel ${code(i.expected_case_id)}`)} className="btn-primary flex-1 py-2.5 text-sm">Rimesso nel {code(i.expected_case_id)}</button>
                <button disabled={busy} onClick={() => act([i.id], 'reassigned', `${name(i)} ora va nel ${code(i.actual_case_id)}`)} className="btn-ghost flex-1 py-2.5 text-sm">Resta nel {code(i.actual_case_id)}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {pendingMoves.length > 0 && (
        <section className="space-y-2">
          <h2 className="eyebrow">Spostamenti decisi da fare · {pendingMoves.length}</h2>
          {pendingMoves.map(m => (
            <div key={m.id} className="rounded-2xl border border-accent/40 bg-accent/[0.06] p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{lo.itemById.get(m.item_id)?.name}</p>
                <p className="text-sm">case {code(m.from_case_id)} <span className="text-accent">→</span> {code(m.to_case_id)}</p>
                <p className="text-xs text-muted">{m.created_by_name} · {dateOf(m.created_at)}{m.note && ` · ${m.note}`}</p>
              </div>
              <button onClick={() => api.completeMove(m.id).then(lo.refresh).then(() => toast('Spostamento fatto', 'ok'))} className="btn-ghost px-4 py-2 text-sm">Fatto</button>
            </div>
          ))}
        </section>
      )}

      {resolved.length > 0 && (
        <section>
          <h2 className="eyebrow text-muted mb-2">Risolti di recente</h2>
          <ul className="space-y-1.5">
            {resolved.map(i => (
              <li key={i.id} className="text-sm text-muted flex gap-2">
                <span className="text-ok">✓</span>
                <span><span className="text-fog">{name(i)}</span> · {resolutionText[i.resolution ?? ''] ?? i.resolution}{i.resolved_at && ` il ${dateOf(i.resolved_at)}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {manualText && (
        <Modal eyebrow="Chiedi ai ragazzi" title="Copia il messaggio" onClose={() => setManualText(null)}>
          <textarea id="ask-text" readOnly value={manualText} onFocus={e => e.currentTarget.select()} className="field min-h-48 text-sm" />
          <p className="text-xs text-muted">Tieni premuto sul testo, seleziona tutto e copia.</p>
        </Modal>
      )}
    </div>
  )
}

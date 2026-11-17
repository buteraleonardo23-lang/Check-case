import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { usePhotoUrl } from '../lib/photos'
import { shrink } from '../lib/shrink'
import { layoutPhotos, type Case } from '../lib/types'
import { useToast } from './Toast'

function Photo({ path, className, alt = '' }: { path: string; className: string; alt?: string }) {
  const url = usePhotoUrl(path)
  return url ? <img src={url} alt={alt} className={className} draggable={false} /> : <div className={`${className} bg-panel-2 animate-pulse`} />
}

/** Foto "come è dentro" del case: sfogliabili; solo gli admin aggiungono o tolgono. */
export default function LayoutGallery({ c, isAdmin, onChanged }: { c: Case; isAdmin: boolean; onChanged: () => Promise<void> }) {
  const photos = layoutPhotos(c)
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const save = async (next: string[]) => {
    await api.setCasePhotos(c.id, next)
    await onChanged()
  }
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const added: string[] = []
      for (const f of Array.from(files)) added.push(await api.uploadPhoto(await shrink(f)))
      await save([...photos, ...added])
      toast(added.length === 1 ? 'Foto aggiunta' : `${added.length} foto aggiunte`, 'ok')
    } catch (e) { toast((e as Error).message, 'bad') }
    setBusy(false)
    if (input.current) input.current.value = ''
  }
  const remove = async (i: number) => {
    setBusy(true)
    try { await save(photos.filter((_, j) => j !== i)); toast('Foto tolta', 'ok'); setOpen(null) } catch (e) { toast((e as Error).message, 'bad') }
    setBusy(false); setConfirmDel(false)
  }

  if (!photos.length && !isAdmin) return null

  return (
    <section aria-label="Come è dentro">
      <div className="flex items-baseline justify-between px-5 mb-2 mt-1">
        <h2 className="eyebrow text-muted">Come è dentro{photos.length > 1 ? ` · ${photos.length} foto` : ''}</h2>
        {isAdmin && (
          <button disabled={busy} onClick={() => input.current?.click()} className="chip border border-accent/50 text-accent py-1.5">
            {busy ? 'Carico…' : '+ Foto'}
          </button>
        )}
      </div>
      <input ref={input} id={`layout-${c.id}`} type="file" accept="image/*" multiple className="sr-only" onChange={e => add(e.target.files)} />

      {photos.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar px-5">
          {photos.map((p, i) => (
            <button key={p} onClick={() => setOpen(i)} className={`snap-center shrink-0 relative rounded-2xl overflow-hidden border border-line ${photos.length > 1 ? 'w-[82%]' : 'w-full'}`}>
              <Photo path={p} alt={`Come è dentro il case ${c.code}, foto ${i + 1}`} className="w-full h-56 object-cover" />
              {photos.length > 1 && <span className="absolute top-2 right-2 chip bg-ink/80 text-fog tabular-nums">{i + 1}/{photos.length}</span>}
            </button>
          ))}
        </div>
      ) : (
        <button disabled={busy} onClick={() => input.current?.click()}
          className="mx-5 w-[calc(100%-2.5rem)] h-28 rounded-2xl border border-dashed border-line text-sm text-muted">
          + Aggiungi una foto di come va sistemato dentro
        </button>
      )}

      {open !== null && photos[open] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 text-fog">
            <span className="text-sm tabular-nums">Case {c.code} · {open + 1}/{photos.length}</span>
            <button onClick={() => { setOpen(null); setConfirmDel(false) }} className="w-10 h-10 rounded-full bg-white/10 text-2xl" aria-label="Chiudi">×</button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center relative" onClick={() => setOpen(null)}>
            <Photo path={photos[open]} className="max-w-full max-h-full object-contain" />
            {open > 0 && <button onClick={e => { e.stopPropagation(); setOpen(open - 1) }} className="absolute left-2 w-11 h-11 rounded-full bg-white/10 text-2xl" aria-label="Foto precedente">‹</button>}
            {open < photos.length - 1 && <button onClick={e => { e.stopPropagation(); setOpen(open + 1) }} className="absolute right-2 w-11 h-11 rounded-full bg-white/10 text-2xl" aria-label="Foto successiva">›</button>}
          </div>
          {isAdmin && (
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3 flex justify-center gap-2">
              {confirmDel
                ? <>
                    <button disabled={busy} onClick={() => remove(open)} className="btn-bad py-2.5">Sì, togli questa foto</button>
                    <button onClick={() => setConfirmDel(false)} className="btn-ghost py-2.5">Annulla</button>
                  </>
                : <button onClick={() => setConfirmDel(true)} className="btn-ghost py-2.5 text-sm">Togli questa foto</button>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

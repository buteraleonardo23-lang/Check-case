import type { ReactNode } from 'react'

export default function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-modal="true"
        className="rise w-full sm:max-w-md max-h-[88svh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-panel border border-line px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="title text-2xl mt-1">{title}</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-panel-2 text-2xl leading-none text-muted shrink-0" aria-label="Chiudi">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

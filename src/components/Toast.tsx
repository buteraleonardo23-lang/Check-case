import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Tone = 'info' | 'ok' | 'warn' | 'bad'
interface T { id: number; text: string; tone: Tone }
const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {})

const tones: Record<Tone, string> = {
  info: 'border-accent/50', ok: 'border-ok/60', warn: 'border-warn/60', bad: 'border-bad/60',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([])
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random()
    setList(l => [...l.slice(-2), { id, text, tone }])
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 3200)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className={`rise glass rounded-full px-5 py-2.5 text-sm font-medium border ${tones[t.tone]} shadow-xl`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)

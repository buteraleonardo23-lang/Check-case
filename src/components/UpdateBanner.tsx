import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Nuova versione dell'app pubblicata: NON ricarico da solo (si perderebbe una scheda non salvata),
 * mostro un bottone e aggiorno quando l'utente vuole.
 */
export default function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // controllo aggiornamenti ogni 30 minuti mentre l'app resta aperta
      if (reg) setInterval(() => { reg.update().catch(() => {}) }, 30 * 60_000)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-40 flex justify-center px-4 pointer-events-none">
      <div className="rise pointer-events-auto glass rounded-full pl-5 pr-2 py-2 flex items-center gap-3 shadow-2xl border-accent/50">
        <span className="text-sm">Nuova versione disponibile</span>
        <button onClick={() => updateServiceWorker(true)} className="btn-primary px-4 py-2 text-sm">Aggiorna</button>
      </div>
    </div>
  )
}

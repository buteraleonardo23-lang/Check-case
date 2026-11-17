// Usato solo nella demo "single file" (niente service worker): nessun aggiornamento da segnalare.
export function useRegisterSW(_opts?: unknown) {
  return { needRefresh: [false, () => {}] as const, offlineReady: [false, () => {}] as const, updateServiceWorker: async (_reload?: boolean) => {} }
}

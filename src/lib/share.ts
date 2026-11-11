/** Condivide (WhatsApp ecc.) se il telefono lo permette, altrimenti copia; se nemmeno quello, va mostrato a mano. */
export async function shareOrCopy(text: string, title = 'Check-case'): Promise<'shared' | 'copied' | 'manual'> {
  try {
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ title, text }); return 'shared' }
  } catch (e) { if ((e as Error).name === 'AbortError') return 'shared' }
  return copyText(text)
}

export async function copyText(text: string): Promise<'copied' | 'manual'> {
  try { await navigator.clipboard.writeText(text); return 'copied' } catch { return 'manual' }
}

import { useEffect, useState } from 'react'
import { api } from './api'

const cache = new Map<string, string>()

/** URL visualizzabile per una foto (firmato su Supabase, diretto in demo). */
export function usePhotoUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(path ? cache.get(path) ?? null : null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    if (cache.has(path)) { setUrl(cache.get(path)!); return }
    let alive = true
    api.photoUrl(path).then(u => { if (u) { cache.set(path, u); if (alive) setUrl(u) } })
    return () => { alive = false }
  }, [path])
  return url
}

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const cache = new Map<string, string>()

/** URL firmato (bucket privato) con cache in memoria. */
export function usePhotoUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(path ? cache.get(path) ?? null : null)
  useEffect(() => {
    if (!path || cache.has(path)) { setUrl(path ? cache.get(path)! : null); return }
    let alive = true
    supabase.storage.from('photos').createSignedUrl(path, 60 * 60 * 12).then(({ data }) => {
      if (data?.signedUrl) { cache.set(path, data.signedUrl); if (alive) setUrl(data.signedUrl) }
    })
    return () => { alive = false }
  }, [path])
  return url
}

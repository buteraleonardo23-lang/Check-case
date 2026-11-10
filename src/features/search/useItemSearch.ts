import Fuse from 'fuse.js'
import { useMemo } from 'react'
import type { Item } from '../../lib/types'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Ricerca fuzzy su nome + alias, senza accenti, tutta in memoria. */
export function useItemSearch(items: Item[], query: string, limit = 30) {
  const fuse = useMemo(() => new Fuse(
    items.map(i => ({ item: i, name: norm(i.name), aliases: i.aliases.map(norm) })),
    { keys: [{ name: 'name', weight: 2 }, 'aliases'], threshold: 0.38, ignoreLocation: true },
  ), [items])
  return useMemo(() => {
    const q = norm(query.trim())
    if (!q) return []
    return fuse.search(q, { limit }).map(r => r.item.item)
  }, [fuse, query, limit])
}

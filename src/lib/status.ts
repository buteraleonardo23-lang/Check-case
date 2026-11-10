import type { ItemStatus } from './types'

export const statusStyle: Record<ItemStatus, { dot: string; ring: string; label: string }> = {
  green:  { dot: 'bg-green-500',  ring: 'border-green-500/60 bg-green-500/10',  label: 'Nel case' },
  orange: { dot: 'bg-orange-500', ring: 'border-orange-500/60 bg-orange-500/10', label: 'In un altro case' },
  red:    { dot: 'bg-red-500',    ring: 'border-red-500/60 bg-red-500/10',       label: 'Manca' },
}

export const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''

import type { ItemStatus } from './types'

export const statusStyle: Record<ItemStatus, { dot: string; row: string; text: string; label: string }> = {
  green:  { dot: 'bg-ok',   row: 'border-ok/40 bg-ok/[0.07]',     text: 'text-ok',   label: 'Nel case' },
  orange: { dot: 'bg-warn', row: 'border-warn/45 bg-warn/[0.08]', text: 'text-warn', label: 'In un altro case' },
  red:    { dot: 'bg-bad',  row: 'border-bad/35 bg-bad/[0.06]',   text: 'text-bad',  label: 'Manca' },
}

export const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''

export const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export const buzz = () => { try { navigator.vibrate?.(12) } catch { /* niente vibrazione */ } }

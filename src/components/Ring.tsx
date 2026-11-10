/** Anello di avanzamento: verde = nel case, arancione = altrove. */
export default function Ring({ green, orange, total, size = 56 }: { green: number; orange: number; total: number; size?: number }) {
  const r = 22, c = 2 * Math.PI * r
  const g = total ? green / total : 0, o = total ? orange / total : 0
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" className="-rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-ok)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${g * c} ${c}`} className="transition-all duration-500" />
      {o > 0 && <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-warn)" strokeWidth="6"
        strokeDasharray={`${o * c} ${c}`} strokeDashoffset={-g * c} className="transition-all duration-500" />}
    </svg>
  )
}

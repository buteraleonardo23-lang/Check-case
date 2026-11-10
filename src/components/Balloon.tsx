/** Il palloncino blu, motivo dello spettacolo. */
export default function Balloon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 56" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="bl" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#7FE3FF" />
          <stop offset=".45" stopColor="#0BB9EA" />
          <stop offset="1" stopColor="#0A4F8F" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="18" rx="15" ry="17" fill="url(#bl)" />
      <path d="M18 34.5h4l-2 3z" fill="#0A6FA8" />
      <path d="M20 37.5c-3 5 3 8 0 12s2 5 1 6" stroke="#A1A4A5" strokeWidth="1" fill="none" />
      <ellipse cx="14" cy="11" rx="3.5" ry="5" fill="#fff" opacity=".35" transform="rotate(-25 14 11)" />
    </svg>
  )
}

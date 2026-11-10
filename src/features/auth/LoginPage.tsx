import { useState, type FormEvent } from 'react'
import Balloon from '../../components/Balloon'
import { api } from '../../lib/api'
import { demoUsers } from '../../demo/demoData'
import { useAuth } from './AuthProvider'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    setError(await signIn(username, password))
    setBusy(false)
  }

  return (
    <div className="min-h-svh flex flex-col justify-center px-6 py-10">
      <div className="w-full max-w-sm mx-auto space-y-8 rise">
        <div className="text-center">
          <Balloon className="w-14 h-20 mx-auto mb-4 drop-shadow-[0_0_24px_rgba(11,185,234,.5)]" />
          <p className="eyebrow">Smontaggio · Non serve saperlo</p>
          <h1 className="title text-5xl mt-3">Check<br />case</h1>
          <p className="text-muted mt-4 text-sm">Ogni oggetto nel suo case. Niente più fogli di carta.</p>
        </div>

        {api.demo ? (
          <div className="space-y-3">
            <p className="eyebrow text-center">Demo · entra come</p>
            <div className="grid grid-cols-2 gap-2">
              {demoUsers.map(u => (
                <button key={u.id} onClick={() => signIn(u.username, '')}
                  className="glass rounded-2xl px-4 py-3 text-left active:scale-[0.97] transition">
                  <span className="block font-semibold">{u.display_name}</span>
                  <span className={`block text-xs ${u.role === 'admin' ? 'text-accent' : 'text-muted'}`}>{u.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted text-center">Gli admin vedono dashboard e catalogo, gli operatori solo i case.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input id="username" className="field" placeholder="Username" autoCapitalize="none" autoComplete="username"
              value={username} onChange={e => setUsername(e.target.value)} />
            <input id="password" className="field" placeholder="Password" type="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} />
            {error && <p className="text-bad text-center text-sm">{error}</p>}
            <button disabled={busy || !username || !password} className="btn-primary w-full">
              {busy ? 'Accesso…' : 'Entra'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

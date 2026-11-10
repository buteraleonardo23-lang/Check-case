import { useState, type FormEvent } from 'react'
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
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-8">
          <img src="/icon.svg" alt="" className="w-20 h-20 mx-auto mb-3" />
          <h1 className="text-3xl font-bold">Check-case</h1>
          <p className="text-gray-400">Smontaggio senza perdere niente</p>
        </div>
        <input
          className="w-full rounded-xl bg-gray-900 border border-gray-700 px-4 py-4 text-lg"
          placeholder="Username" autoCapitalize="none" autoComplete="username"
          value={username} onChange={e => setUsername(e.target.value)}
        />
        <input
          className="w-full rounded-xl bg-gray-900 border border-gray-700 px-4 py-4 text-lg"
          placeholder="Password" type="password" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
        />
        {error && <p className="text-red-400 text-center">{error}</p>}
        <button disabled={busy || !username || !password}
          className="w-full rounded-xl bg-green-600 disabled:opacity-50 py-4 text-lg font-semibold">
          {busy ? 'Accesso…' : 'Entra'}
        </button>
      </form>
    </div>
  )
}

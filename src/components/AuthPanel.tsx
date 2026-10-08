import { useEffect, useRef, useState } from 'react'
import { login, signup, type AuthUser } from '../lib/auth'

type Mode = 'login' | 'signup'

interface Props {
  /** Shown at the top (e.g. "log in to sync to the cloud"). */
  initialHint?: string | null
  onDone: (user: AuthUser) => void
  onClose: () => void
}

export default function AuthPanel({ initialHint, onDone, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialHint ?? null)
  const [busy, setBusy] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    usernameRef.current?.focus()
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const action = mode === 'signup' ? signup : login
    const res = await action(username, password)
    setBusy(false)
    if (res.ok) onDone(res.user)
    else setError(res.error)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setPassword('')
  }

  return (
    <div
      className="auth-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="auth-panel" role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Log in' : 'Create an account'}>
        <button className="auth-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{mode === 'login' ? 'Log in' : 'Create an account'}</h2>
        <p className="auth-sub">
          {mode === 'login'
            ? 'Welcome back — your cloud library will load here.'
            : 'Your library lives in the cloud, keyed to your account. Friends each get their own.'}
        </p>
        {initialHint && <p className="auth-hint">{initialHint}</p>}
        <form onSubmit={(e) => void submit(e)}>
          <label className="auth-field">
            Username
            <input
              ref={usernameRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="e.g. rahim"
            />
          </label>
          <label className="auth-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary auth-submit" disabled={busy || !username || !password}>
            {busy ? 'One sec…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button className="btn-link" onClick={() => switchMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button className="btn-link" onClick={() => switchMode('login')}>
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
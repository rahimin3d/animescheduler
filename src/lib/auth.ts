/** Client for the auth endpoints. Cookies (httpOnly session) ride along automatically. */
import { API_BASE } from './api'

export interface AuthUser {
  id: string
  name: string
}

export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: string }

function isUser(v: unknown): v is AuthUser {
  return typeof v === 'object' && v !== null && typeof (v as AuthUser).id === 'string'
}

/** Read a JSON body once; null for non-JSON (e.g. Vite's SPA fallback page). */
async function readJson(res: Response): Promise<{ user?: unknown; error?: unknown } | null> {
  try {
    const body: unknown = await res.json()
    return typeof body === 'object' && body !== null ? body : null
  } catch {
    return null
  }
}

async function authenticate(
  path: string,
  username: string,
  password: string,
  failLabel: string,
): Promise<AuthResult> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    return { ok: false, error: 'Cannot reach the server — is the API deployed?' }
  }
  const body = await readJson(res)
  if (res.ok && isUser(body?.user)) return { ok: true, user: body.user }
  const error = typeof body?.error === 'string' ? body.error : `${failLabel} (${res.status}).`
  return { ok: false, error }
}

export function signup(username: string, password: string): Promise<AuthResult> {
  return authenticate('/auth/signup', username, password, 'Sign-up failed')
}

export function login(username: string, password: string): Promise<AuthResult> {
  return authenticate('/auth/login', username, password, 'Login failed')
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' })
  } catch {
    /* best-effort — the cookie/mode still flips client-side */
  }
}

/** Current session identity, or null when logged out (or API absent). */
export async function fetchMe(): Promise<AuthUser | null> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/auth/me`)
  } catch {
    return null
  }
  const body = await readJson(res)
  return isUser(body?.user) ? body.user : null
}

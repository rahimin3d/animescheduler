/**
 * Shared auth helpers for the API handlers.
 *
 * Security posture (as shipped):
 * - Passwords: PBKDF2 (SHA-256, 210k iterations, per-user 16-byte random salt)
 *   via WebCrypto — only the hash + salt are ever stored, never the password.
 * - Sessions: opaque 32-byte random token in an httpOnly, SameSite=Lax cookie;
 *   the DB stores only sha256(token), so a leaked sessions table can't be replayed.
 * - Constant-time hash comparison.
 */

export const SESSION_COOKIE = 'as_session'
export const SESSION_DAYS = 30
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60
const PBKDF2_ITERATIONS = 210_000

export interface AuthUser {
  id: string
  name: string
}

/** Structural slice of D1 as the API handlers use it. */
export interface Db {
  prepare(sql: string): {
    bind(...params: (string | number | null)[]): {
      all<T = unknown>(): Promise<{ results: T[] }>
      run(): Promise<{ success: boolean }>
      first<T = unknown>(): Promise<T | null>
    }
  }
}

export interface Env {
  DB: Db
}

export interface Ctx {
  request: Request
  env: Env
}

/* ------------------------------- encoding ------------------------------ */

export function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer)
  return toHex(new Uint8Array(digest))
}

export async function randomToken(): Promise<string> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toB64Url(bytes)
}

/* ------------------------------ passwords ------------------------------ */

export const USERNAME_RULE = 'Username must be 3–20 letters, numbers, dashes or underscores.'

/** Normalized user id for a valid username, or null when it breaks USERNAME_RULE. */
export function validateUsername(raw: string): string | null {
  const id = raw.trim().toLowerCase()
  return /^[a-z0-9_-]{3,20}$/.test(id) ? id : null
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return null
}

export async function hashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  )
  return new Uint8Array(bits)
}

export async function newPasswordRecord(password: string): Promise<{
  salt: string
  hash: string
}> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const hash = await hashPassword(password, salt)
  return { salt: toB64Url(salt), hash: toB64Url(hash) }
}

/** Constant-time byte compare — avoids crypto.subtle.timingSafeEqual, which
 *  isn't in every SubtleCrypto typing.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function verifyPassword(
  password: string,
  saltB64: string,
  hashB64: string,
): Promise<boolean> {
  try {
    const salt = fromB64Url(saltB64)
    const expected = fromB64Url(hashB64)
    const actual = await hashPassword(password, salt)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}

/* ------------------------------- sessions ------------------------------ */

export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get('Cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === SESSION_COOKIE) return rest.join('=').trim() || null
  }
  return null
}

export function sessionCookie(token: string, secure: boolean): string {
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000).toUTCString()
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}; Expires=${expires}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = await randomToken()
  const tokenHash = await sha256Hex(new TextEncoder().encode(token))
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString()
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expiresAt)
    .run()
  return token
}

export async function destroySession(db: Db, token: string | null): Promise<void> {
  if (!token) return
  const tokenHash = await sha256Hex(new TextEncoder().encode(token))
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
}

/** Resolve the logged-in user from the request cookie, or null. */
export async function resolveUser(db: Db, request: Request): Promise<AuthUser | null> {
  const token = readSessionToken(request)
  if (!token) return null
  const tokenHash = await sha256Hex(new TextEncoder().encode(token))
  const row = await db
    .prepare(
      `SELECT u.id, u.name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{ id: string; name: string; expires_at: string }>()
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
    return null
  }
  return { id: row.id, name: row.name }
}

/** Only mark cookies Secure when served over https (local dev is plain http). */
export function isSecure(request: Request): boolean {
  return request.url.startsWith('https:')
}

/** Pull username/password out of a JSON body; null when the body isn't JSON. */
export async function readCredentials(
  request: Request,
): Promise<{ username: string; password: string } | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown }
  return {
    username: typeof username === 'string' ? username : '',
    password: typeof password === 'string' ? password : '',
  }
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
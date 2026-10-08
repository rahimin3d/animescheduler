import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, login, logout, signup } from './auth'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const USER = { id: 'mia', name: 'Mia' }

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>

describe('auth client', () => {
  it('signup POSTs username + password and returns the user', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ user: USER }, 201))
    const res = await signup('mia', 'hunter2secret')
    expect(res).toEqual({ ok: true, user: USER })
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/signup')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ username: 'mia', password: 'hunter2secret' })
  })

  it('maps a 409 to its error message', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'That username is already taken — try another.' }, 409))
    const res = await login('mia', 'hunter2secret')
    expect(res).toEqual({ ok: false, error: 'That username is already taken — try another.' })
  })

  it('treats a non-JSON body (SPA fallback page) as a readable failure', async () => {
    fetchMock().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)
    const res = await login('mia', 'hunter2secret')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('Login failed')
  })

  it('reads the server error from a real (read-once) Response body', async () => {
    fetchMock().mockResolvedValue(
      new Response(JSON.stringify({ error: 'That username is already taken — try another.' }), {
        status: 409,
      }),
    )
    const res = await signup('mia', 'hunter2secret')
    expect(res).toEqual({ ok: false, error: 'That username is already taken — try another.' })
  })

  it('network failure is a friendly error, not a throw', async () => {
    fetchMock().mockRejectedValue(new TypeError('offline'))
    const res = await signup('mia', 'hunter2secret')
    expect(res).toEqual({ ok: false, error: 'Cannot reach the server — is the API deployed?' })
  })

  it('fetchMe returns null when logged out or unreachable', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ user: null }))
    expect(await fetchMe()).toBeNull()
    fetchMock().mockRejectedValue(new TypeError('offline'))
    expect(await fetchMe()).toBeNull()
  })

  it('logout is best-effort (does not throw when the call fails)', async () => {
    fetchMock().mockRejectedValue(new TypeError('offline'))
    await expect(logout()).resolves.toBeUndefined()
  })
})
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXPORT_FORMAT, STORAGE_KEY } from './statuses'
import { fetchServerState, pushState } from './api'
import type { StatusMap } from '../types'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const entry: StatusMap['1'] = {
  status: 'watching',
  episodesDone: 2,
  updatedAt: '2026-10-01T00:00:00.000Z',
  meta: { id: 1, title: 'Show 1', cover: 'm.jpg', episodes: 12, format: 'TV', season: 'FALL 2026', airingStatus: 'RELEASING', nextAiring: null },
}

const validExport = { format: EXPORT_FORMAT, version: 1, exportedAt: '2026-10-07T00:00:00.000Z', entries: { '1': entry } }

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('fetchServerState — best-effort cloud pull', () => {
  it('valid export → exists with parsed entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(validExport)))
    const s = await fetchServerState()
    expect(s.exists).toBe(true)
    if (s.exists) {
      expect(s.entries['1'].status).toBe('watching')
      expect(s.exportedAt).toBe('2026-10-07T00:00:00.000Z')
    }
  })

  it('404 (empty remote library) → exists:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'none' }, 404)))
    expect(await fetchServerState()).toEqual({ exists: false })
  })

  it('non-JSON body (Vite SPA fallback) → exists:false, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('not json')
      },
    } as unknown as Response))
    expect(await fetchServerState()).toEqual({ exists: false })
  })

  it('wrong format marker or malformed entries → exists:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ format: 'someone-else', entries: {} })),
    )
    expect(await fetchServerState()).toEqual({ exists: false })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ format: EXPORT_FORMAT, entries: { '1': { status: 'not-real' } } }),
      ),
    )
    expect(await fetchServerState()).toEqual({ exists: false })
  })

  it('network failure → exists:false (local dev stays silent)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await fetchServerState()).toEqual({ exists: false })
  })
})

describe('pushState — replace-wholesale cloud write', () => {
  it('sends the export shape and reports the saved count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, count: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await pushState({ '1': entry })
    expect(res).toEqual({ ok: true, count: 1 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/state')
    const sent = JSON.parse(init.body)
    expect(sent.format).toBe(EXPORT_FORMAT)
    expect(sent.version).toBe(1)
    expect(sent.entries['1'].status).toBe('watching')
  })

  it('server rejection → ok:false with the API message, no throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid entry rejected: 1' }, 400)),
    )
    expect(await pushState({ '1': entry })).toEqual({
      ok: false,
      error: 'invalid entry rejected: 1',
    })
  })

  it('network failure → ok:false with a clear message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await pushState({})).toEqual({ ok: false, error: 'Cannot reach the cloud API.' })
  })
})

describe('local storage untouched by sync helpers', () => {
  it('reading/validating the server never writes storage keys', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(validExport)))
    await fetchServerState()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
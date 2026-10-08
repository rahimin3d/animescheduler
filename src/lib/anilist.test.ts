import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AniListError,
  ID_CHUNK_SIZE,
  fetchMediaByIds,
  fetchSeason,
  request,
  searchAnime,
  toMeta,
} from './anilist'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const gqlMedia = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  title: { romaji: `Show ${id}`, english: null },
  coverImage: { large: `L${id}`, medium: `M${id}` },
  episodes: 12,
  format: 'TV',
  season: 'FALL',
  seasonYear: 2026,
  status: 'RELEASING',
  genres: ['Action', 'Fantasy'],
  averageScore: 78,
  nextAiringEpisode: { episode: 3, airingAt: 1_800_000_000_000 },
  ...over,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('T5 — request wrapper failure states (D5)', () => {
  it('network failure → AniListError(kind: network)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(request('Q')).rejects.toMatchObject({ kind: 'network' })
  })

  it('429 → rate-limit error (Retry-After unreadable over CORS)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 429)))
    await expect(request('Q')).rejects.toMatchObject({ kind: 'rate-limit' })
  })

  it('GraphQL errors → AniListError with the API message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ errors: [{ message: 'Invalid query' }] })),
    )
    await expect(request('Q')).rejects.toMatchObject({
      kind: 'graphql',
      message: 'Invalid query',
    })
  })

  it('HTTP 500 → http error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    await expect(request('Q')).rejects.toMatchObject({ kind: 'http' })
  })

  it('posts JSON to the AniList endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    const data = await request<{ ok: boolean }>('QUERY', { page: 1 })
    expect(data.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graphql.anilist.co')
    expect(JSON.parse(init.body)).toEqual({ query: 'QUERY', variables: { page: 1 } })
  })
})

describe('T6 — search pagination (D7)', () => {
  it('maps page results + hasNextPage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            Page: {
              pageInfo: { hasNextPage: true, total: 340 },
              media: [gqlMedia(1), gqlMedia(2)],
            },
          },
        }),
      ),
    )
    const page = await searchAnime('frieren', 1)
    expect(page.media.map((m) => m.id)).toEqual([1, 2])
    expect(page.hasNextPage).toBe(true)
    expect(page.total).toBe(340)
  })

  it('requests the exact page number passed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { Page: { pageInfo: { hasNextPage: false, total: 5 }, media: [] } } }))
    vi.stubGlobal('fetch', fetchMock)
    await searchAnime('naruto', 3)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables).toEqual({ search: 'naruto', page: 3 })
  })
})

describe('Season browse — fetchSeason (v2)', () => {
  it('requests the season/year and maps genre + score fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { Page: { pageInfo: { hasNextPage: true, total: 900 }, media: [gqlMedia(1)] } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const page = await fetchSeason(2, {
      season: 'FALL',
      seasonYear: 2026,
      genres: [],
      formats: [],
    })
    expect(page.media[0].genres).toEqual(['Action', 'Fantasy'])
    expect(page.media[0].averageScore).toBe(78)
    expect(page.total).toBe(900)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables).toEqual({
      page: 2,
      season: 'FALL',
      seasonYear: 2026,
      genre: undefined,
      format: undefined,
    })
  })

  it('passes selected genres and formats as genre_in / format_in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { Page: { pageInfo: { hasNextPage: false, total: 3 }, media: [] } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await fetchSeason(1, { season: 'FALL', seasonYear: 2026, genres: ['Isekai'], formats: ['TV'] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.genre).toEqual(['Isekai'])
    expect(body.variables.format).toEqual(['TV'])
  })
})

describe('AR-1 — batched id fetch chunks at 50', () => {
  it('120 ids → 3 requests, each ≤50 ids', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body)
      const ids: number[] = body.variables.ids
      expect(ids.length).toBeLessThanOrEqual(ID_CHUNK_SIZE)
      return Promise.resolve(
        jsonResponse({ data: { Page: { media: ids.map((id) => gqlMedia(id)) } } }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const ids = Array.from({ length: 120 }, (_, i) => i + 1)
    const metas = await fetchMediaByIds(ids)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(metas).toHaveLength(120)
  })

  it('empty id list → no requests', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchMediaByIds([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('toMeta mapping', () => {
  it('maps fields into the local snapshot shape', () => {
    const m = toMeta(gqlMedia(9) as never)
    expect(m).toEqual({
      id: 9,
      title: 'Show 9',
      cover: 'M9',
      episodes: 12,
      format: 'TV',
      season: 'FALL 2026',
      airingStatus: 'RELEASING',
      nextAiring: { episode: 3, airingAt: 1_800_000_000_000 },
      genres: ['Action', 'Fantasy'],
      averageScore: 78,
    })
  })

  it('null count and null nextAiring survive as null (D4/D2 prerequisites)', () => {
    const m = toMeta(gqlMedia(9, { episodes: null, nextAiringEpisode: null }) as never)
    expect(m.episodes).toBeNull()
    expect(m.nextAiring).toBeNull()
  })

  it('falls back romaji → english → Untitled', () => {
    const m = toMeta(
      gqlMedia(9, { title: { romaji: null, english: 'English Name' } }) as never,
    )
    expect(m.title).toBe('English Name')
  })

  it('missing genres/averageScore in legacy payloads degrade to empty/null', () => {
    const { genres: _g, averageScore: _a, ...legacy } = gqlMedia(9)
    const m = toMeta(legacy as never)
    expect(m.genres).toEqual([])
    expect(m.averageScore).toBeNull()
  })
})

describe('AniListError', () => {
  it('carries kind + message', () => {
    const e = new AniListError('network', 'boom')
    expect(e.kind).toBe('network')
    expect(e.message).toBe('boom')
    expect(e.name).toBe('AniListError')
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SeasonBrowse from './SeasonBrowse'
import { seasonLabel } from '../lib/season'
import type { MediaMeta, StatusMap } from '../types'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

/**
 * Raw GraphQL shape as AniList returns it — fetchSeason maps it via toMeta.
 * Kept in sync with the medium-cover + romaji-title convention used elsewhere.
 */
const gqlMedia = (id: number) => ({
  id,
  title: { romaji: `Season Show ${id}`, english: null },
  coverImage: { large: `L${id}`, medium: `M${id}` },
  episodes: 12,
  format: 'TV',
  season: 'FALL',
  seasonYear: 2026,
  status: 'RELEASING',
  genres: ['Action'],
  averageScore: 82,
  description: null as string | null,
  nextAiringEpisode: { episode: 5, airingAt: 1_800_000_000_000 },
})

/** Already-mapped snapshot shape for entries fixtures. */
const metaOf = (id: number): MediaMeta => ({
  id,
  title: `Season Show ${id}`,
  cover: `M${id}`,
  episodes: 12,
  format: 'TV',
  season: 'FALL 2026',
  airingStatus: 'RELEASING',
  nextAiring: null,
  genres: ['Action'],
  averageScore: 82,
})

/** Records every request body and answers SEASON_QUERY with the given hits. */
function seasonFetchMock(hits: ReturnType<typeof gqlMedia>[], hasNextPage = false) {
  const bodies: { query: string; variables: Record<string, unknown> }[] = []
  const fetchMock = vi.fn().mockImplementation(async (_url: string, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body)
    bodies.push(body)
    return jsonResponse({
      data: { Page: { pageInfo: { hasNextPage, total: 400 }, media: hits } },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, bodies }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const entries: StatusMap = {}

/** Fixed clock so season math is deterministic regardless of when tests run. */
const NOW = new Date(2026, 9, 7) // Oct 7 2026 → FALL 2026, next WINTER 2027

const renderBrowse = (props: Partial<React.ComponentProps<typeof SeasonBrowse>> = {}) =>
  render(<SeasonBrowse entries={entries} onPick={vi.fn()} now={NOW} {...props} />)

describe('SeasonBrowse — season browse page', () => {
  it('renders the current season and its cards', async () => {
    const { bodies } = seasonFetchMock([gqlMedia(1), gqlMedia(2)])
    renderBrowse()

    expect(await screen.findByText('Season Show 1')).toBeInTheDocument()
    expect(screen.getByText('Season Show 2')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `Next · ${seasonLabel({ season: 'WINTER', year: 2027 })}` }),
    ).toBeInTheDocument()

    // first request: page 1, current season, no filters (undefined vars are dropped in JSON)
    expect(bodies[0].variables).toMatchObject({
      page: 1,
      season: 'FALL',
      seasonYear: 2026,
    })
    expect('genre' in bodies[0].variables).toBe(false)
    expect('tag' in bodies[0].variables).toBe(false)
    expect('format' in bodies[0].variables).toBe(false)
  })

  it('Isekai is an AniList tag, not a genre — clicking it refetches with tag_in', async () => {
    const { bodies } = seasonFetchMock([gqlMedia(1)])
    renderBrowse()
    await screen.findByText('Season Show 1')

    fireEvent.click(screen.getByRole('button', { name: 'Isekai' }))

    await waitFor(() => {
      expect(bodies[bodies.length - 1].variables.tag).toEqual(['Isekai'])
    })
    expect('genre' in bodies[bodies.length - 1].variables).toBe(false)
    expect(bodies[bodies.length - 1].variables.page).toBe(1) // filters reset to page 1
  })

  it('mixing a genre and a tag chip sends each to its own filter', async () => {
    const { bodies } = seasonFetchMock([gqlMedia(1)])
    renderBrowse()
    await screen.findByText('Season Show 1')

    fireEvent.click(screen.getByRole('button', { name: 'Isekai' }))
    fireEvent.click(screen.getByRole('button', { name: 'Romance' }))

    await waitFor(() => {
      const vars = bodies[bodies.length - 1].variables
      expect(vars.genre).toEqual(['Romance'])
      expect(vars.tag).toEqual(['Isekai'])
    })
  })

  it('format chips segment by anime type (TV / Movie / ONA / OVA / Special)', async () => {
    const { bodies } = seasonFetchMock([gqlMedia(1)])
    renderBrowse()
    await screen.findByText('Season Show 1')

    fireEvent.click(screen.getByRole('button', { name: 'Movie' }))
    await waitFor(() => {
      expect(bodies[bodies.length - 1].variables.format).toEqual(['MOVIE'])
    })

    // clicking again removes the filter
    fireEvent.click(screen.getByRole('button', { name: 'Movie' }))
    await waitFor(() => {
      expect(bodies[bodies.length - 1].variables.format).toBeUndefined()
    })
  })

  it('next-season tab switches the request to the following quarter', async () => {
    const { bodies } = seasonFetchMock([gqlMedia(1)])
    renderBrowse()
    await screen.findByText('Season Show 1')

    fireEvent.click(
      screen.getByRole('button', { name: `Next · ${seasonLabel({ season: 'WINTER', year: 2027 })}` }),
    )

    await waitFor(() => {
      expect(bodies[bodies.length - 1].variables).toMatchObject({
        season: 'WINTER',
        seasonYear: 2027,
      })
    })
  })

  it('Load more appends the next page', async () => {
    let pageCalls = 0
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body)
      pageCalls += 1
      const isSecond = body.variables.page === 2
      return jsonResponse({
        data: {
          Page: {
            pageInfo: { hasNextPage: isSecond ? false : true, total: 40 },
            media: isSecond ? [gqlMedia(20)] : [gqlMedia(1)],
          },
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderBrowse()
    await screen.findByText('Season Show 1')

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Season Show 20')).toBeInTheDocument()
    expect(pageCalls).toBe(2)
  })

  it('failure shows a visible error with Retry (D5-style)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Cannot reach AniList'))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { Page: { pageInfo: { hasNextPage: false, total: 1 }, media: [gqlMedia(1)] } },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    renderBrowse()
    expect(await screen.findByText(/Couldn't load the season/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Season Show 1')).toBeInTheDocument()
  })

  it('picked shows render their bucket badge on the card', async () => {
    seasonFetchMock([gqlMedia(1)])
    renderBrowse({
      entries: { '1': { status: 'watching', episodesDone: 4, updatedAt: '', meta: metaOf(1) } },
    })
    expect(await screen.findByText('in: What I\'m watching')).toBeInTheDocument()
  })

  it('cards show the synopsis clamped, with More / Less for long ones', async () => {
    const long = 'A long first paragraph about the show. '.repeat(6).trim()
    seasonFetchMock([{ ...gqlMedia(1), description: `${long}<br><br>Second paragraph.` }, gqlMedia(2)])
    renderBrowse()
    await screen.findByText('Season Show 1')

    expect(screen.getByText(`${long} Second paragraph.`)).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Show the full synopsis of Season Show 1' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide the full synopsis of Season Show 1' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    // Show 2 has no description: no synopsis block, no toggle.
    expect(screen.queryByRole('button', { name: /synopsis of Season Show 2/ })).not.toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { LANDING_SEEN_KEY } from './lib/landing'
import { STORAGE_KEY, storageKeyFor } from './lib/statuses'
import type { StatusEntry, StatusMap } from './types'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const media = (id: number) => ({
  id,
  title: { romaji: `Show ${id}`, english: 'English Name' },
  cover: `https://img/${id}.jpg`,
  coverImage: { large: `L${id}`, medium: `M${id}` },
  episodes: 12,
  format: 'TV',
  season: 'FALL',
  seasonYear: 2026,
  status: 'RELEASING',
  nextAiringEpisode: { episode: 3, airingAt: 1_800_000_000_000 },
})

/** Fakes fetch: GraphQL POSTs return a Page of search hits; the auth + state
 *  endpoints route to the `cloud` fixtures (defaults: guest, no cloud). */
function mockSearchFetch(
  hits: unknown[],
  cloud?: { state?: unknown; push?: unknown; me?: unknown; login?: unknown; signup?: unknown },
) {
  const fetchMock = vi.fn().mockImplementation(
    async (_url: string, init?: { method?: string; body?: string }) => {
      if (!init) {
        // GETs
        if (_url.includes('/auth/me')) return jsonResponse(cloud?.me ?? { user: null })
        if (_url.includes('/api/state')) {
          if (cloud?.state !== undefined) return jsonResponse(cloud.state)
          return jsonResponse({ error: 'login required' }, 401)
        }
        return jsonResponse({ error: 'no API' }, 404)
      }
      if (init.method === 'PUT') {
        if (cloud?.push !== undefined) return jsonResponse(cloud.push, 200)
        return jsonResponse({ error: 'login required' }, 401)
      }
      if (init.method === 'POST' && _url.includes('/auth/signup')) {
        return jsonResponse(cloud?.signup ?? { error: 'no API' }, cloud?.signup ? 201 : 404)
      }
      if (init.method === 'POST' && _url.includes('/auth/login')) {
        return jsonResponse(cloud?.login ?? { error: 'no API' }, cloud?.login ? 200 : 404)
      }
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      const vars = (body.variables ?? {}) as Record<string, unknown>
      if ('search' in vars) {
        return jsonResponse({
          data: {
            Page: { pageInfo: { hasNextPage: false, total: hits.length }, media: hits },
          },
        })
      }
      // schedule by-ids path — empty by default
      return jsonResponse({ data: { Page: { media: [] } } })
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function seed(entries: StatusMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

const snfEntry = (id: number, episodesDone: number, episodes: number | null): StatusEntry => ({
  status: 'started-not-finished',
  episodesDone,
  updatedAt: '2026-10-01T00:00:00.000Z',
  meta: {
    id,
    title: `Show ${id}`,
    cover: `https://img/${id}.jpg`,
    episodes,
    format: 'TV',
    season: 'FALL 2026',
    airingStatus: 'RELEASING',
    nextAiring: { episode: 3, airingAt: 1_800_000_000_000 },
  },
})

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(LANDING_SEEN_KEY, '1') // app tests start past the landing page
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App — first render', () => {
  it('shows the four buckets empty', () => {
    mockSearchFetch([])
    render(<App />)
    expect(screen.getByText("What I've watched")).toBeInTheDocument()
    expect(screen.getByText('What interests me')).toBeInTheDocument()
    expect(screen.getByText("What I'm watching")).toBeInTheDocument()
    expect(screen.getByText("Started, didn't finish")).toBeInTheDocument()
  })

  it('renders saved library from localStorage on load', () => {
    mockSearchFetch([])
    seed({ '1': snfEntry(1, 2, 12) })
    render(<App />)
    const bucket = screen.getByLabelText("Started, didn't finish")
    expect(within(bucket).getByText('Show 1')).toBeInTheDocument()
    expect(within(bucket).getByText('2/12 eps')).toBeInTheDocument()
  })
})

describe('App — search flow (D5/D7)', () => {
  it('search → pick a result → it appears in the bucket', async () => {
    mockSearchFetch([media(1), media(2)])
    render(<App />)

    fireEvent.change(screen.getByLabelText('Search anime'), {
      target: { value: 'show' },
    })

    const addButton = await screen.findByLabelText('Add Show 1 to What interests me', undefined, {
      timeout: 2000,
    })
    fireEvent.click(addButton)

    const bucket = await screen.findByLabelText('What interests me')
    expect(within(bucket).getByText('Show 1')).toBeInTheDocument()
    expect(within(bucket).getByText('0/12 eps')).toBeInTheDocument()
  })

  it('zero results shows a distinct empty state', async () => {
    mockSearchFetch([])
    render(<App />)
    fireEvent.change(screen.getByLabelText('Search anime'), { target: { value: 'zzz' } })
    const empty = await screen.findByText(/No matches for/, undefined, { timeout: 2000 })
    expect(empty).toBeInTheDocument()
  })

  it('failure shows an error + Retry, search pauses until retry succeeds', async () => {
    let fail = true
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: unknown) => {
      if (fail) throw new TypeError('offline')
      const body = JSON.parse((init as { body: string }).body)
      if ('search' in body.variables) {
        return jsonResponse({
          data: {
            Page: { pageInfo: { hasNextPage: false, total: 1 }, media: [media(1)] },
          },
        })
      }
      return jsonResponse({ data: { Page: { media: [] } } })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const input = screen.getByLabelText('Search anime')
    fireEvent.change(input, { target: { value: 'show' } })

    await screen.findByText(/Couldn't reach AniList/, undefined, { timeout: 2000 })
    expect(screen.getByText(/Search is paused/)).toBeInTheDocument()
    expect(input).toBeDisabled()

    // network "recovers", user clicks Retry (banner and inline both offer it)
    fail = false
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0])

    await waitFor(() => expect(screen.queryByText(/Couldn't reach AniList/)).not.toBeInTheDocument())
    await screen.findByText('Show 1', undefined, { timeout: 2000 })
    expect(input).toBeEnabled()
  })
})

describe('App — +1 auto-advance (D4)', () => {
  it('reaching the final known episode moves to watched and toasts', async () => {
    mockSearchFetch([])
    seed({ '1': snfEntry(1, 1, 2) })
    render(<App />)

    fireEvent.click(screen.getByLabelText('Add one episode of Show 1'))

    const watched = await screen.findByLabelText("What I've watched")
    expect(within(watched).getByText('Show 1')).toBeInTheDocument()
    expect(within(watched).getByText('2/2 eps')).toBeInTheDocument()
    expect(screen.getByText(/reached its final episode/)).toBeInTheDocument()
    // started-not-finished bucket is now empty
    const snf = screen.getByLabelText("Started, didn't finish")
    expect(within(snf).queryByText('Show 1')).not.toBeInTheDocument()
  })

  it('unknown total: +1 never auto-advances', async () => {
    mockSearchFetch([])
    seed({ '1': snfEntry(1, 50, null) })
    render(<App />)
    fireEvent.click(screen.getByLabelText('Add one episode of Show 1'))
    await waitFor(() => {
      const snf = screen.getByLabelText("Started, didn't finish")
      expect(within(snf).getByText('51 eps · count unknown')).toBeInTheDocument()
    })
    expect(screen.getByLabelText("What I've watched")).not.toHaveTextContent('Show 1')
  })
})

describe('App — import rejection leaves library untouched (D3)', () => {
  it('shows a visible error and keeps existing entries', async () => {
    mockSearchFetch([])
    seed({ '1': snfEntry(1, 2, 12) })
    render(<App />)

    const input = screen.getByLabelText('Import JSON file')
    fireEvent.change(input, {
      target: {
        files: [new File(['{"format":"wrong"}'], 'bad.json', { type: 'application/json' })],
      },
    })

    const notice = await screen.findByText(/Import rejected/, undefined, { timeout: 2000 })
    expect(notice).toBeInTheDocument()

    const bucket = screen.getByLabelText("Started, didn't finish")
    expect(within(bucket).getByText('Show 1')).toBeInTheDocument()
  })

  it('valid import replaces the library', async () => {
    mockSearchFetch([])
    seed({ '1': snfEntry(1, 2, 12) })
    render(<App />)

    const exported = JSON.stringify({
      format: 'anime-scheduler-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: {
        '2': {
          status: 'watched',
          episodesDone: 24,
          updatedAt: '2026-10-01T00:00:00.000Z',
          meta: {
            id: 2,
            title: 'Show 2',
            cover: 'https://img/2.jpg',
            episodes: 24,
            format: 'TV',
            season: 'FALL 2026',
            airingStatus: 'FINISHED',
            nextAiring: null,
          },
        },
      },
    })
    const input = screen.getByLabelText('Import JSON file')
    fireEvent.change(input, {
      target: { files: [new File([exported], 'good.json', { type: 'application/json' })] },
    })

    await screen.findByText(/Library replaced from import/, undefined, { timeout: 2000 })
    await waitFor(() => {
      const watched = screen.getByLabelText("What I've watched")
      expect(within(watched).getByText('Show 2')).toBeInTheDocument()
    })
    const snf = screen.getByLabelText("Started, didn't finish")
    expect(within(snf).queryByText('Show 1')).not.toBeInTheDocument()
  })
})

async function submitAuth(username: string, password: string, buttonName = 'Log in') {
  const input = screen.getByLabelText('Username')
  fireEvent.change(input, { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: buttonName }))
}

const cloudEntries = (overrides: Record<string, StatusEntry>) => ({
  format: 'anime-scheduler-export',
  version: 1,
  exportedAt: '2026-10-07T12:00:00.000Z',
  entries: overrides,
})

describe('App — cloud sync + login (Cloudflare D1)', () => {
  it('logging in loads that account’s cloud library and switches storage keys', async () => {
    mockSearchFetch([], {
      me: { user: null },
      login: { user: { id: 'mia', name: 'Mia' } },
      state: cloudEntries({ '7': snfEntry(7, 2, 12) }),
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Log in / Sign up' }))
    await submitAuth('Mia', 'hunter2secret')

    // Signed in chip + the account's cloud library auto-loaded.
    await screen.findByText(/Mia/, undefined, { timeout: 2000 })
    await waitFor(() => {
      const bucket = screen.getByLabelText("Started, didn't finish")
      expect(within(bucket).getByText('Show 7')).toBeInTheDocument()
    })

    // Saved under the per-user key, not the guest key.
    expect(JSON.parse(localStorage.getItem(storageKeyFor('mia')) ?? '{}')).toHaveProperty('7')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).not.toHaveProperty('7')
  })

  it('wrong password surfaces the server error and stays logged out', async () => {
    mockSearchFetch([], {
      me: { user: null },
      login: { error: "That username or password didn't match." },
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Log in / Sign up' }))
    await submitAuth('mia', 'wrongpassword1')

    expect(await screen.findByText(/didn't match/, undefined, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in / Sign up' })).toBeInTheDocument()
  })

  it('signup creates an account and starts with a fresh empty library', async () => {
    mockSearchFetch([], {
      me: { user: null },
      signup: { user: { id: 'mia', name: 'Mia' } },
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Log in / Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await submitAuth('mia', 'hunter2secret', 'Create account')

    await screen.findByText(/Mia/, undefined, { timeout: 2000 })
    const bucket = screen.getByLabelText("What I've watched")
    expect(within(bucket).queryByText('Show')).not.toBeInTheDocument()
  })

  it('guest clicking Push opens the login panel and sends nothing', async () => {
    const fetchMock = mockSearchFetch([])
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '☁ Push to cloud' }))
    expect(await screen.findByRole('dialog', undefined, { timeout: 2000 })).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some((c) => (c[1] as { method?: string } | undefined)?.method === 'PUT'),
    ).toBe(false)
  })

  it('logged-in push sends the library and confirms with a toast', async () => {
    const pushMock = vi.fn()
    mockSearchFetch([], {
      me: { user: { id: 'mia', name: 'Mia' } },
      state: cloudEntries({ '1': snfEntry(1, 2, 12), '2': snfEntry(2, 5, 24) }),
    })
    // pushMock observes the PUT with a success response.
    const real = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          pushMock(init)
          return jsonResponse({ ok: true, count: 2 }, 200)
        }
        return (real as typeof fetch)(url, init)
      }),
    )

    render(<App />)

    // Session restored on load → cloud library auto-pulled → buckets populated.
    await waitFor(() => {
      const bucket = screen.getByLabelText("Started, didn't finish")
      expect(within(bucket).getByText('Show 1')).toBeInTheDocument()
    })

    const pushBtn = screen.getByRole('button', { name: '☁ Push to cloud' })
    fireEvent.click(pushBtn)
    expect(await screen.findByText(/2 shows saved to the cloud/, undefined, { timeout: 2000 })).toBeInTheDocument()
    expect(pushMock).toHaveBeenCalledTimes(1)
    const sent = JSON.parse((pushMock.mock.calls[0][0] as RequestInit).body as string)
    expect(sent.format).toBe('anime-scheduler-export')
    expect(Object.keys(sent.entries)).toHaveLength(2)
  })

  it('logout returns to the guest library', async () => {
    seed({ '1': snfEntry(1, 2, 12) })
    mockSearchFetch([], {
      me: { user: { id: 'mia', name: 'Mia' } },
      state: cloudEntries({ '7': snfEntry(7, 9, 12) }),
    })
    render(<App />)

    // Logged in with Mia's cloud library.
    await waitFor(() => {
      const bucket = screen.getByLabelText("Started, didn't finish")
      expect(within(bucket).getByText('Show 7')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    // Back to guest storage → local guest library (Show 1), not Mia's.
    await waitFor(() => {
      const bucket = screen.getByLabelText("Started, didn't finish")
      expect(within(bucket).getByText('Show 1')).toBeInTheDocument()
      expect(within(bucket).queryByText('Show 7')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Log in / Sign up' })).toBeInTheDocument()
  })
})

describe('App — removing shows (Q12)', () => {
  it('a picked search card gains a Remove that clears the bucket', async () => {
    mockSearchFetch([media(1)])
    render(<App />)

    fireEvent.change(screen.getByLabelText('Search anime'), { target: { value: 'show' } })
    const addButton = await screen.findByLabelText('Add Show 1 to What interests me', undefined, {
      timeout: 2000,
    })
    fireEvent.click(addButton)

    const bucket = await screen.findByLabelText('What interests me')
    expect(within(bucket).getByText('Show 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Show 1 from library' }))
    await waitFor(() => {
      expect(within(bucket).queryByText('Show 1')).not.toBeInTheDocument()
    })
    // Card no longer marks it picked and its Remove is gone.
    expect(screen.queryByRole('button', { name: 'Remove Show 1 from library' })).not.toBeInTheDocument()
  })

  it('Remove on a bucket card clears that entry', async () => {
    mockSearchFetch([])
    seed({ '1': snfEntry(1, 2, 12) })
    render(<App />)

    const bucket = screen.getByLabelText("Started, didn't finish")
    expect(within(bucket).getByText('Show 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Show 1' }))
    await waitFor(() => {
      expect(within(bucket).queryByText('Show 1')).not.toBeInTheDocument()
    })
  })
})
describe('Landing page', () => {
  const covers = [
    { id: 11, title: { romaji: 'Cover Show', english: null }, coverImage: { large: 'https://img/11.jpg' } },
  ]

  /** Guest, no API; GraphQL answers the landing cover query. */
  function mockLandingFetch() {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: { body?: string }) => {
      if (!init) return jsonResponse(url.includes('/auth/me') ? { user: null } : { error: 'no API' }, url.includes('/auth/me') ? 200 : 404)
      return jsonResponse({ data: { Page: { media: covers } } })
    })
    vi.stubGlobal('fetch', fetchMock)
  }

  it('first-time visitors see the landing page with live cover art', async () => {
    localStorage.removeItem(LANDING_SEEN_KEY)
    mockLandingFetch()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Your anime week, mapped.' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Cover Show' })).toHaveAttribute('src', 'https://img/11.jpg')
    expect(screen.queryByRole('tablist', { name: 'Views' })).not.toBeInTheDocument()
  })

  it('"Open the app" enters the app and is remembered', async () => {
    localStorage.removeItem(LANDING_SEEN_KEY)
    mockLandingFetch()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open the app' })[0])
    expect(screen.getByRole('tablist', { name: 'Views' })).toBeInTheDocument()
    expect(localStorage.getItem(LANDING_SEEN_KEY)).toBe('1')
  })

  it('returning visitors with a saved library skip the landing page', () => {
    localStorage.removeItem(LANDING_SEEN_KEY)
    seed({ '1': snfEntry(1, 2, 12) })
    mockLandingFetch()
    render(<App />)
    expect(screen.getByRole('tablist', { name: 'Views' })).toBeInTheDocument()
  })

  it('the footer link reopens the landing page', () => {
    mockLandingFetch()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'What is Anime Scheduler?' }))
    expect(screen.getByRole('heading', { name: 'Your anime week, mapped.' })).toBeInTheDocument()
  })
})

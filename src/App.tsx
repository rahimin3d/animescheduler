import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SearchSection, { type SearchState } from './components/SearchSection'
import BucketGrid from './components/BucketGrid'
import SeasonStrip from './components/SeasonStrip'
import SeasonBrowse from './components/SeasonBrowse'
import ScheduleView from './components/ScheduleView'
import AuthPanel from './components/AuthPanel'
import ThemeToggle from './components/ThemeToggle'
import Landing from './components/Landing'
import { fetchServerState, pushState } from './lib/api'
import { fetchMediaByIds, searchAnime } from './lib/anilist'
import { fetchMe, logout as apiLogout, type AuthUser } from './lib/auth'
import { hasSeenLanding, markLandingSeen } from './lib/landing'
import { buildWeek, scheduleMembers } from './lib/schedule'
import {
  exportEntries,
  incrementEpisode,
  loadEntries,
  parseImport,
  removeEntry,
  saveEntries,
  setEntry,
  storageKeyFor,
  type MutationResult,
} from './lib/statuses'
import type { BucketStatus, MediaMeta, StatusMap } from './types'
import { BUCKET_STATUSES } from './types'

const DEBOUNCE_MS = 300

export default function App() {
  const [initial] = useState(loadEntries)
  const [entries, setEntries] = useState<StatusMap>(initial.entries)
  const [storageNotice, setStorageNotice] = useState<string | null>(initial.notice)
  const [view, setView] = useState<'week' | 'season'>('week')
  // First-time visitors (nothing saved, never dismissed it) get the landing page.
  const [showLanding, setShowLanding] = useState(
    () => !hasSeenLanding() && Object.keys(initial.entries).length === 0,
  )
  const leaveLanding = () => {
    markLandingSeen()
    setShowLanding(false)
    window.scrollTo(0, 0)
  }

  /* ------------------------------- toast ------------------------------- */
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  /* ------------------------------- auth -------------------------------- */
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authHint, setAuthHint] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)

  // Write-through persistence — logged-in accounts save under their own storage
  // key so guest / per-user libraries never mix (P-2, Q11).
  useEffect(() => {
    saveEntries(entries, storageKeyFor(user?.id ?? null))
  }, [entries, user?.id])

  // Restore a session on load (httpOnly cookie rides along automatically).
  useEffect(() => {
    let cancelled = false
    fetchMe().then((u) => {
      if (cancelled) return
      setUser(u)
      if (u) setShowLanding(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // On login, the cloud library is the source of truth for that account:
  // auto-pull it (replacing the empty/local view) so friends see their list.
  // First-time accounts have no cloud library → fall back to the local
  // per-user store (which is empty on first ever login).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setPushing(true)
    fetchServerState()
      .then((s) => {
        if (cancelled) return
        if (s.exists) {
          setEntries(s.entries) // replace wholesale — same semantics as import
          setStorageNotice(null)
        } else {
          const stored = loadEntries(storageKeyFor(user.id))
          setEntries(stored.entries)
          setStorageNotice(stored.notice)
        }
      })
      .finally(() => {
        if (!cancelled) setPushing(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    await apiLogout() // best-effort server-side session destroy; cookie cleared
    const guest = loadEntries()
    setEntries(guest.entries)
    setStorageNotice(guest.notice)
    setUser(null)
    setToast('👋 Logged out — you’re back on the guest library.')
  }

  /* ---------------------------- cloud sync ----------------------------- */
  const handlePush = async () => {
    if (!user) {
      setAuthHint('Log in or sign up to save your library to the cloud.')
      setAuthOpen(true)
      return
    }
    setPushing(true)
    const res = await pushState(entries)
    setPushing(false)
    if (res.ok) {
      setToast(`☁️ ${res.count} shows saved to the cloud.`)
    } else {
      setToast(`☁️ Push failed: ${res.error}`)
    }
  }

  const commit = useCallback((result: MutationResult, radarTitle?: string) => {
    setEntries(result.entries)
    if (result.radarFired.length > 0 && radarTitle) {
      setToast(`🎯 Radar armed for “${radarTitle}” — sequel surfacing lands in Phase 2.`)
    }
  }, [])

  const handlePick = (meta: MediaMeta, status: BucketStatus) => {
    commit(setEntry(entries, meta, status), meta.title)
  }
  const handleMove = (id: number, status: BucketStatus) => {
    const entry = entries[String(id)]
    if (entry) commit(setEntry(entries, entry.meta, status), entry.meta.title)
  }
  const handleRemove = (id: number) => commit(removeEntry(entries, id))
  const handleIncrement = (id: number) => {
    const result = incrementEpisode(entries, id)
    const finished = result.radarFired.length > 0
    const title = result.entries[String(id)]?.meta.title ?? ''
    setEntries(result.entries)
    if (finished) {
      setToast(`🎉 ${title} reached its final episode — moved to Watched. Radar armed.`)
    }
  }

  /* ------------------------------ search ------------------------------- */
  const [query, setQuery] = useState('')
  const [req, setReq] = useState<{ q: string; n: number } | null>(null)
  const [results, setResults] = useState<MediaMeta[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const reqCounter = useRef(0)

  // Debounce (~300ms) so typing can't burn the 90 req/min budget (D5).
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setReq(null)
      setResults([])
      setPage(1)
      setHasNext(false)
      setSearchState('idle')
      setSearchError(null)
      return
    }
    const t = setTimeout(() => {
      reqCounter.current += 1
      setReq({ q, n: reqCounter.current })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!req) return
    let cancelled = false
    setSearchState('loading')
    setSearchError(null)
    searchAnime(req.q, 1)
      .then((first) => {
        if (cancelled) return
        setResults(first.media)
        setPage(1)
        setHasNext(first.hasNextPage)
        setSearchState(first.media.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSearchState('error')
        setSearchError(err instanceof Error ? err.message : 'Unknown error.')
      })
    return () => {
      cancelled = true
    }
  }, [req])

  const retrySearch = () => {
    if (req) setReq({ q: req.q, n: (reqCounter.current += 1) })
  }

  const loadMore = async () => {
    if (!req || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await searchAnime(req.q, page + 1)
      setResults((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...next.media.filter((m) => !seen.has(m.id))]
      })
      setPage((p) => p + 1)
      setHasNext(next.hasNextPage)
    } catch (err: unknown) {
      setSearchState('error')
      setSearchError(err instanceof Error ? err.message : 'Unknown error.')
    } finally {
      setLoadingMore(false)
    }
  }

  /* ----------------------------- schedule ------------------------------ */
  const memberIdsKey = useMemo(
    () =>
      scheduleMembers(entries)
        .map((e) => e.meta.id)
        .sort((a, b) => a - b)
        .join(','),
    [entries],
  )
  const [live, setLive] = useState<Record<number, MediaMeta>>({})
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [schedLoading, setSchedLoading] = useState(false)
  const [schedTick, setSchedTick] = useState(0)

  useEffect(() => {
    const ids = memberIdsKey ? memberIdsKey.split(',').map(Number) : []
    if (ids.length === 0) {
      setLive({})
      setScheduleError(null)
      return
    }
    let cancelled = false
    setSchedLoading(true)
    fetchMediaByIds(ids)
      .then((metas) => {
        if (cancelled) return
        const map: Record<number, MediaMeta> = {}
        for (const m of metas) map[m.id] = m
        setLive(map)
        setScheduleError(null)
      })
      .catch((err: unknown) => {
        // Failure keeps existing `live` (or falls back to pick-time snapshots).
        if (!cancelled) setScheduleError(err instanceof Error ? err.message : 'Unknown error.')
      })
      .finally(() => {
        if (!cancelled) setSchedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [memberIdsKey, schedTick])

  const viewEntries = useMemo(() => {
    if (Object.keys(live).length === 0) return entries
    const merged: StatusMap = { ...entries }
    for (const [id, meta] of Object.entries(live)) {
      const e = merged[id]
      if (e) merged[id] = { ...e, meta }
    }
    return merged
  }, [entries, live])

  const week = useMemo(() => buildWeek(viewEntries, new Date()), [viewEntries])

  /* --------------------------- import / export -------------------------- */
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleExport = () => {
    const blob = new Blob([exportEntries(entries)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `anime-scheduler-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const res = parseImport(text)
    if (res.ok) {
      // Replace wholesale (D3): what you exported is exactly what you restore.
      setEntries(res.entries)
      setImportError(null)
      setToast('✅ Library replaced from import.')
    } else {
      setImportError(res.error) // stored map untouched
    }
  }

  /* ------------------------------ derived ------------------------------- */
  const lastUpdated = useMemo(() => {
    const stamps = Object.values(entries).map((e) => e.updatedAt)
    if (stamps.length === 0) return null
    const max = stamps.reduce((a, b) => (a > b ? a : b))
    return new Date(max).toLocaleString()
  }, [entries])

  const offline = searchError !== null || scheduleError !== null
  const retryAll = () => {
    if (searchError) retrySearch()
    if (scheduleError) setSchedTick((t) => t + 1)
  }

  const authPanel = authOpen && (
    <AuthPanel
      initialHint={authHint}
      onDone={(u) => {
        setUser(u)
        setAuthOpen(false)
      }}
      onClose={() => setAuthOpen(false)}
    />
  )

  if (showLanding) {
    return (
      <>
        <Landing
          onStart={leaveLanding}
          onLogin={() => {
            leaveLanding()
            setAuthHint(null)
            setAuthOpen(true)
          }}
        />
        {authPanel}
      </>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Anime Scheduler</h1>
          <p className="tagline">search → pick → your week, mapped</p>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          {user ? (
            <span className="user-chip" title={`Signed in as ${user.name}`}>
              👤 {user.name}
              <button className="btn btn-ghost" onClick={() => void handleLogout()}>
                Log out
              </button>
            </span>
          ) : (
            <button
              className="btn"
              onClick={() => {
                setAuthHint(null)
                setAuthOpen(true)
              }}
            >
              Log in / Sign up
            </button>
          )}
          <button className="btn" onClick={() => void handlePush()} disabled={pushing}>
            {pushing ? 'Syncing…' : '☁ Push to cloud'}
          </button>
          <button className="btn" onClick={handleExport} disabled={Object.keys(entries).length === 0}>
            Export JSON
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Import JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImportFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {importError && (
        <div className="notice notice-error" role="alert">
          ⚠ Import rejected: {importError} Your library was not changed.{' '}
          <button className="btn btn-ghost" onClick={() => setImportError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {storageNotice && (
        <div className="notice notice-warn" role="alert">
          ⚠ {storageNotice}{' '}
          <button className="btn btn-ghost" onClick={() => setStorageNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {offline && (
        <div className="notice notice-offline" role="status">
          ⚠ AniList unreachable — showing saved data
          {lastUpdated ? `, last updated ${lastUpdated}` : ''}. Search is paused until retry
          succeeds.
          <button className="btn btn-primary" onClick={retryAll}>
            Retry
          </button>
        </div>
      )}

      <nav className="tabs" role="tablist" aria-label="Views">
        <button
          role="tab"
          aria-selected={view === 'week'}
          className={view === 'week' ? 'is-on' : ''}
          onClick={() => setView('week')}
        >
          My week
        </button>
        <button
          role="tab"
          aria-selected={view === 'season'}
          className={view === 'season' ? 'is-on' : ''}
          onClick={() => setView('season')}
        >
          This season
        </button>
      </nav>

      {view === 'week' ? (
        <>
          <SearchSection
            query={query}
            onQueryChange={setQuery}
            results={results}
            state={searchState}
            errorMessage={searchError}
            hasNext={hasNext}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
            onRetry={retryAll}
            paused={searchState === 'error'}
            entries={entries}
            onPick={handlePick}
            onRemove={handleRemove}
          />

          <SeasonStrip entries={entries} />

          <main className="buckets">
            {BUCKET_STATUSES.map((s) => (
              <BucketGrid
                key={s}
                status={s}
                entries={entries}
                onMove={handleMove}
                onIncrement={handleIncrement}
                onRemove={handleRemove}
              />
            ))}
          </main>

          <ScheduleView
            week={week}
            loading={schedLoading}
            error={scheduleError}
            onRetry={() => setSchedTick((t) => t + 1)}
            lastUpdated={lastUpdated}
          />
        </>
      ) : (
        <SeasonBrowse entries={entries} onPick={handlePick} onRemove={handleRemove} />
      )}

      <footer className="app-footer">
        <p>
          Local-first · guests stay in the browser · log in to save your list to Cloudflare D1 ·
          catalog via AniList GraphQL
        </p>
        <p>
          <button className="footer-link" onClick={() => setShowLanding(true)}>
            What is Anime Scheduler?
          </button>
        </p>
      </footer>

      {authPanel}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

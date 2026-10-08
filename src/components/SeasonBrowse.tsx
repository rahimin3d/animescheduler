import { useEffect, useState } from 'react'
import { fetchSeason } from '../lib/anilist'
import { currentSeason, nextSeason, GENRE_CHIPS, FORMAT_OPTIONS, seasonLabel } from '../lib/season'
import type { BucketStatus, MediaMeta, StatusMap } from '../types'
import MediaCard from './MediaCard'

type BrowseState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

interface Props {
  entries: StatusMap
  onPick: (meta: MediaMeta, status: BucketStatus) => void
  onRemove?: (id: number) => void
  /** Injectable clock for deterministic tests (defaults to the real date). */
  now?: Date
}

function Chip({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      className={`chip${active ? ' is-on' : ''}`}
      aria-pressed={active}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

export default function SeasonBrowse({ entries, onPick, onRemove, now }: Props) {
  const [showNext, setShowNext] = useState(false)
  const [genres, setGenres] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  const [results, setResults] = useState<MediaMeta[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [state, setState] = useState<BrowseState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const base = currentSeason(now ?? new Date())
  const next = nextSeason(base)
  const target = showNext ? next : base
  const genresKey = genres.join('|')
  const formatsKey = formats.join('|')

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    fetchSeason(1, { season: target.season, seasonYear: target.year, genres, formats })
      .then((first) => {
        if (cancelled) return
        setResults(first.media)
        setPage(1)
        setHasNext(first.hasNextPage)
        setState(first.media.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState('error')
        setError(err instanceof Error ? err.message : 'Unknown error.')
      })
    return () => {
      cancelled = true
    }
  }, [target.season, target.year, genresKey, formatsKey, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = await fetchSeason(page + 1, {
        season: target.season,
        seasonYear: target.year,
        genres,
        formats,
      })
      setResults((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...next.media.filter((m) => !seen.has(m.id))]
      })
      setPage((p) => p + 1)
      setHasNext(next.hasNextPage)
    } catch (err: unknown) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unknown error.')
    } finally {
      setLoadingMore(false)
    }
  }

  const activeGenres = new Set(genres)

  return (
    <section className="season-browse" aria-label="Season browse">
      <header className="season-head">
        <div className="season-tabs" role="group" aria-label="Choose season">
          <button
            className={`season-tab${!showNext ? ' is-on' : ''}`}
            onClick={() => setShowNext(false)}
            aria-pressed={!showNext}
          >
            {seasonLabel(base)}
          </button>
          <button
            className={`season-tab${showNext ? ' is-on' : ''}`}
            onClick={() => setShowNext(true)}
            aria-pressed={showNext}
          >
            Next · {seasonLabel(next)}
          </button>
        </div>
        <p className="season-hint">Filter by genre (isekai first, obviously) or format, then add straight to your lists.</p>
      </header>

      <div className="facet-row" role="group" aria-label="Filter by format">
        <span className="facet-label">Type</span>
        <Chip label="All" active={formats.length === 0} onToggle={() => setFormats([])} />
        {FORMAT_OPTIONS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            active={formats.includes(f.value)}
            onToggle={() => toggle(setFormats, f.value)}
          />
        ))}
      </div>

      <div className="facet-row facet-genres" role="group" aria-label="Filter by genre">
        <span className="facet-label">Genre</span>
        {GENRE_CHIPS.map((g) => (
          <Chip
            key={g}
            label={g}
            active={activeGenres.has(g)}
            onToggle={() => toggle(setGenres, g)}
          />
        ))}
        {genres.length > 0 && (
          <button className="chip chip-clear" onClick={() => setGenres([])}>
            Clear
          </button>
        )}
      </div>

      {state === 'error' && (
        <div className="state-block state-error" role="alert">
          <p>
            <strong>Couldn&apos;t load the season.</strong> {error}
          </p>
          <button className="btn btn-primary" onClick={() => setTick((t) => t + 1)}>
            Retry
          </button>
        </div>
      )}
      {state === 'empty' && (
        <div className="state-block state-empty" role="status">
          <p>
            Nothing in {seasonLabel(target)} matches those filters — try clearing a chip.
          </p>
        </div>
      )}
      {state === 'loading' && results.length === 0 && (
        <p className="sched-loading">Loading {seasonLabel(target)}…</p>
      )}

      {results.length > 0 && (
        <>
          <ul className="result-grid season-grid">
            {results.map((m) => (
              <MediaCard key={m.id} meta={m} entries={entries} onPick={onPick} onRemove={onRemove} />
            ))}
          </ul>
          {hasNext && (
            <div className="load-more-row">
              <button
                className="btn btn-primary"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
import type { BucketStatus, MediaMeta, StatusMap } from '../types'
import MediaCard from './MediaCard'

export type SearchState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  results: MediaMeta[]
  state: SearchState
  errorMessage: string | null
  hasNext: boolean
  loadingMore: boolean
  onLoadMore: () => void
  onRetry: () => void
  /** Search stays paused while AniList is unreachable (D5 offline rule). */
  paused: boolean
  entries: StatusMap
  onPick: (meta: MediaMeta, status: BucketStatus) => void
  onRemove?: (id: number) => void
}

export default function SearchSection({
  query,
  onQueryChange,
  results,
  state,
  errorMessage,
  hasNext,
  loadingMore,
  onLoadMore,
  onRetry,
  paused,
  entries,
  onPick,
  onRemove,
}: Props) {
  const showEmpty = state === 'empty' && query.trim().length > 0
  const showError = state === 'error'

  return (
    <section className="search-section" aria-label="Search the AniList catalog">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          placeholder={paused ? 'Search paused — retry when AniList is back' : 'Search any anime…'}
          value={query}
          disabled={paused}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search anime"
        />
        {state === 'loading' && <span className="search-spinner" aria-label="Searching" />}
      </div>

      {/* Failure and "no match" never look alike (D5). */}
      {showError && (
        <div className="state-block state-error" role="alert">
          <p>
            <strong>Couldn&apos;t reach AniList.</strong> {errorMessage}
          </p>
          <button onClick={onRetry} className="btn btn-primary">
            Retry
          </button>
        </div>
      )}
      {showEmpty && (
        <div className="state-block state-empty" role="status">
          <p>
            No matches for <em>“{query.trim()}”</em> — try another title.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <ul className="result-grid">
            {results.map((m) => (
              <MediaCard key={m.id} meta={m} entries={entries} onPick={onPick} onRemove={onRemove} />
            ))}
          </ul>
          {hasNext && (
            <div className="load-more-row">
              <button
                className="btn btn-primary"
                onClick={onLoadMore}
                disabled={loadingMore}
                aria-label="Load more results"
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

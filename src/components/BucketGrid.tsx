import type { BucketStatus, StatusMap } from '../types'
import { BUCKET_STATUSES, BUCKET_LABELS } from '../types'

interface Props {
  status: BucketStatus
  entries: StatusMap
  onMove: (id: number, status: BucketStatus) => void
  onIncrement: (id: number) => void
  onRemove: (id: number) => void
}

function byRecency(entries: StatusMap): StatusMap[string][] {
  return Object.values(entries).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export default function BucketGrid({ status, entries, onMove, onIncrement, onRemove }: Props) {
  const rows = byRecency(entries).filter((e) => e.status === status)
  const isStarted = status === 'started-not-finished'

  return (
    <section className={`bucket bucket-${status}`} aria-label={BUCKET_LABELS[status]}>
      <header className="bucket-head">
        <h2>
          <span className="bucket-dot" aria-hidden="true" />
          {BUCKET_LABELS[status]}
        </h2>
        <span className="bucket-count">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="bucket-empty">
          {isStarted
            ? 'Nothing in limbo — good discipline.'
            : 'Search above and add something.'}
        </p>
      ) : (
        <ul className="bucket-grid">
          {rows.map((entry) => {
            const eps = entry.meta.episodes
            return (
              <li key={entry.meta.id} className="bucket-card">
                <img
                  src={entry.meta.cover}
                  alt=""
                  loading="lazy"
                  width={112}
                  height={158}
                  className="cover"
                />
                <div className="bucket-card-body">
                  <h3 title={entry.meta.title}>{entry.meta.title}</h3>
                  <p className="episode-line">
                    {eps !== null ? `${entry.episodesDone}/${eps} eps` : `${entry.episodesDone} eps · count unknown`}
                  </p>
                  {isStarted && (
                    <button
                      className="btn btn-plus"
                      onClick={() => onIncrement(entry.meta.id)}
                      aria-label={`Add one episode of ${entry.meta.title}`}
                    >
                      +1 episode
                    </button>
                  )}
                  <div className="card-actions">
                    <select
                      value={status}
                      onChange={(e) => onMove(entry.meta.id, e.target.value as BucketStatus)}
                      aria-label={`Move ${entry.meta.title} to another bucket`}
                    >
                      {BUCKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {BUCKET_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-remove"
                      onClick={() => onRemove(entry.meta.id)}
                      aria-label={`Remove ${entry.meta.title}`}
                      title="Remove from library"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

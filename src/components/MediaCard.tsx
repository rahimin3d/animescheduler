import { useId, useState } from 'react'
import type { BucketStatus, MediaMeta, StatusMap } from '../types'
import { BUCKET_LABELS, BUCKET_STATUSES } from '../types'

const SHORT_LABEL: Record<BucketStatus, string> = {
  watched: 'Watched',
  interested: 'Interested',
  watching: 'Watching',
  'started-not-finished': 'Started',
}

/** Short synopses fit in the clamp; only longer ones get a More/Less toggle. */
const SYNOPSIS_TOGGLE_AT = 160

/** Clamped to three lines; "More" expands it into its full paragraphs. */
function Synopsis({ text, title }: { text: string; title: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const paragraphs = text.split(/\n\n+/)
  const long = text.length > SYNOPSIS_TOGGLE_AT
  return (
    <div className="synopsis">
      <div id={id} className={open ? 'synopsis-full' : 'synopsis-clamp'}>
        {open ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p>{paragraphs.join(' ')}</p>}
      </div>
      {long && (
        <button
          className="synopsis-toggle"
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${open ? 'Hide' : 'Show'} the full synopsis of ${title}`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}

interface Props {
  meta: MediaMeta
  entries: StatusMap
  onPick: (meta: MediaMeta, status: BucketStatus) => void
  /** Show a Remove action on already-picked cards. */
  onRemove?: (id: number) => void
}

/** One catalogue card with cover + pick row — shared by search and season browse. */
export default function MediaCard({ meta, entries, onPick, onRemove }: Props) {
  const current = entries[String(meta.id)]
  return (
    <li className={`result-card${current ? ' is-picked' : ''}`}>
      <img
        src={meta.cover}
        alt=""
        loading="lazy"
        width={112}
        height={158}
        className="cover"
      />
      <div className="result-body">
        <div className="card-title-row">
          <h3 title={meta.title}>{meta.title}</h3>
          {typeof meta.averageScore === 'number' && meta.averageScore > 0 && (
            <span className="score-badge" title="AniList average score">
              {Math.round(meta.averageScore)}
            </span>
          )}
        </div>
        <p className="result-meta">
          {[meta.format, meta.episodes ? `${meta.episodes} eps` : null, meta.season]
            .filter(Boolean)
            .join(' · ') || 'Anime'}
        </p>
        {meta.genres && meta.genres.length > 0 && (
          <p className="result-genres">{meta.genres.slice(0, 3).join(' · ')}</p>
        )}
        {meta.synopsis && <Synopsis text={meta.synopsis} title={meta.title} />}
        {current && (
          <div className="picked-row">
            <p className="picked-badge">in: {BUCKET_LABELS[current.status]}</p>
            {onRemove && (
              <button
                className="btn btn-remove btn-remove-card"
                onClick={() => onRemove(meta.id)}
                aria-label={`Remove ${meta.title} from library`}
                title="Remove from library"
              >
                Remove
              </button>
            )}
          </div>
        )}
        <div className="pick-row">
          {BUCKET_STATUSES.map((s) => (
            <button
              key={s}
              className={`btn btn-pick${current?.status === s ? ' is-active' : ''}`}
              onClick={() => onPick(meta, s)}
              aria-label={`Add ${meta.title} to ${BUCKET_LABELS[s]}`}
            >
              {SHORT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
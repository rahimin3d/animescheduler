import type { StatusMap } from '../types'
import { seasonWatching } from '../lib/schedule'

function airLine(meta: { airingStatus: string | null; nextAiring: { episode: number; airingAt: number } | null }): string | null {
  if (meta.airingStatus !== 'RELEASING') return meta.airingStatus === 'FINISHED' ? 'finished' : 'not airing'
  if (!meta.nextAiring) return 'airing'
  const when = new Date(meta.nextAiring.airingAt)
  return `Ep ${meta.nextAiring.episode} · ${when.toLocaleDateString(undefined, { weekday: 'short' })} ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/** "What I'm watching this season" (Step 3): watching bucket, currently-airing first. */
export default function SeasonStrip({ entries }: { entries: StatusMap }) {
  const rows = seasonWatching(entries)
  if (rows.length === 0) return null
  return (
    <section className="season-strip" aria-label="What I'm watching this season">
      <header className="bucket-head">
        <h2>
          <span className="bucket-dot dot-watching" aria-hidden="true" />
          What I&apos;m watching this season
        </h2>
        <span className="bucket-count">{rows.length}</span>
      </header>
      <ul className="season-row">
        {rows.map((e) => (
          <li key={e.meta.id} className={`season-chip${e.meta.airingStatus === 'RELEASING' ? ' is-airing' : ''}`}>
            <img src={e.meta.cover} alt="" loading="lazy" width={56} height={79} className="cover" />
            <div>
              <p className="season-title" title={e.meta.title}>
                {e.meta.title}
              </p>
              <p className="season-air">{airLine(e.meta)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

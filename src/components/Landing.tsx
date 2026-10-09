import { useEffect, useState } from 'react'
import { fetchSeasonCovers, type CoverArt } from '../lib/anilist'
import { currentSeason, seasonLabel } from '../lib/season'
import { BUCKET_LABELS, type BucketStatus } from '../types'
import ThemeToggle from './ThemeToggle'

interface Props {
  onStart: () => void
  onLogin: () => void
  /** Injectable clock for deterministic tests (defaults to the real date). */
  now?: Date
}

/** Six covers for the hero, three more for the "watching" tile. */
const HERO_COVERS = 6
const COVER_COUNT = 9

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Search',
    body: "Find any show in AniList's full catalog, from this season's premieres to older classics.",
  },
  {
    title: 'Sort',
    body: 'Put each show in one of four lists with a click. Move it or remove it any time.',
  },
  {
    title: 'Plan your week',
    body: 'Airing shows you watch or want to watch land on a Monday to Sunday calendar, in your local time.',
  },
]

const LISTS: { status: BucketStatus; body: string }[] = [
  {
    status: 'watching',
    body: 'Tick off episodes as you go. Reach the finale and the show moves to Watched by itself.',
  },
  {
    status: 'interested',
    body: 'Your shortlist. Anything here that is airing also appears on your weekly calendar.',
  },
  { status: 'watched', body: 'Everything you have finished, in one place.' },
  { status: 'started-not-finished', body: 'Paused or dropped. No judgement.' },
]

export default function Landing({ onStart, onLogin, now }: Props) {
  const season = currentSeason(now ?? new Date())
  const [covers, setCovers] = useState<CoverArt[]>([])
  const heroCovers = covers.slice(0, HERO_COVERS)
  const tileCovers = covers.slice(HERO_COVERS)

  useEffect(() => {
    let cancelled = false
    fetchSeasonCovers(season.season, season.year, COVER_COUNT)
      .then((c) => {
        if (!cancelled) setCovers(c)
      })
      .catch(() => {
        /* AniList unreachable: the hero simply renders without artwork */
      })
    return () => {
      cancelled = true
    }
  }, [season.season, season.year])

  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="Landing">
        <span className="landing-wordmark">Anime Scheduler</span>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <button className="btn" onClick={onLogin}>
            Log in
          </button>
        </div>
      </nav>

      <header className={`landing-hero${heroCovers.length > 0 ? ' has-art' : ''}`}>
        <div className="landing-hero-copy">
          <h1>Your anime week, mapped.</h1>
          <p className="landing-lead">
            Search any show, sort it into your lists, and see when new episodes air in your time
            zone.
          </p>
          <div className="landing-ctas">
            <button className="btn btn-solid" onClick={onStart}>
              Open the app
            </button>
            <a className="btn" href="#how-it-works">
              How it works
            </a>
          </div>
        </div>
        {heroCovers.length > 0 && (
          <figure className="landing-art">
            <ul className="cover-stack">
              {heroCovers.map((c, i) => (
                <li key={c.id} style={{ '--i': i } as React.CSSProperties}>
                  <img src={c.image} alt={c.title} loading="eager" />
                </li>
              ))}
            </ul>
            <figcaption>Popular in {seasonLabel(season)}, live from AniList</figcaption>
          </figure>
        )}
      </header>

      <section id="how-it-works" className="landing-steps" aria-labelledby="steps-title">
        <h2 id="steps-title">How it works</h2>
        <ol>
          {STEPS.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-lists" aria-labelledby="lists-title">
        <h2 id="lists-title">Four lists, one for every show</h2>
        <div className="list-bento">
          {LISTS.map((l) => (
            <article key={l.status} className={`list-tile tile-${l.status}`}>
              {l.status === 'watching' && tileCovers.length > 0 && (
                <div className="tile-covers">
                  {tileCovers.map((c) => (
                    <img key={c.id} src={c.image} alt={c.title} loading="lazy" />
                  ))}
                </div>
              )}
              <h3>{BUCKET_LABELS[l.status]}</h3>
              <p>{l.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band" aria-label="More features">
        <div>
          <h2>Browse the season</h2>
          <p>
            See everything airing this season and next. Filter by genre, isekai included, or by
            format: TV, movie, ONA, OVA or special.
          </p>
        </div>
        <div>
          <h2>Keep it your way</h2>
          <p>
            Use it as a guest and your lists stay in this browser. Make a free account to save them
            to the cloud and open them on any device.
          </p>
        </div>
      </section>

      <section className="landing-final">
        <h2>Ready when you are.</h2>
        <p>No account needed to start.</p>
        <button className="btn btn-solid" onClick={onStart}>
          Open the app
        </button>
      </section>

      <footer className="app-footer">
        <p>Catalog and artwork via AniList</p>
      </footer>
    </div>
  )
}

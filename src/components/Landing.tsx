import { useEffect, useRef, useState } from 'react'
import { fetchLandingArt, type CoverArt, type LandingArt } from '../lib/anilist'
import { currentSeason, seasonLabel } from '../lib/season'
import { BUCKET_LABELS, type BucketStatus } from '../types'
import ThemeToggle from './ThemeToggle'

interface Props {
  /** Logged-in visitors get "Open the app" in the nav instead of "Log in". */
  signedIn?: boolean
  /** Enter the app; with a title, the app opens with that show searched. */
  onStart: (query?: string) => void
  onLogin: () => void
  /** Injectable clock for deterministic tests (defaults to the real date). */
  now?: Date
}

const TRENDING_COUNT = 10
const SEASON_COUNT = 30
/** Enough tiles to fill the widest hero wall; covers repeat to reach it. */
const WALL_TILES = 48

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

/** Decorative wall of season covers behind the hero (HBO-style splash). */
function CoverWall({ covers }: { covers: CoverArt[] }) {
  const tiles = Array.from({ length: WALL_TILES }, (_, i) =>
    covers.length > 0 ? covers[i % covers.length] : null,
  )
  return (
    <div className="cover-wall" aria-hidden="true">
      <div className="cover-wall-grid">
        {tiles.map((c, i) => (
          <div
            key={i}
            className={`wall-tile${i % 9 === 2 ? ' is-feature' : ''}`}
            style={c?.color ? { backgroundColor: c.color } : undefined}
          >
            {c && <img src={c.image} alt="" loading={i < 24 ? 'eager' : 'lazy'} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Netflix-style ranked row; each card opens the app searching that show. */
function TrendingRow({ shows, onOpen }: { shows: CoverArt[]; onOpen: (title: string) => void }) {
  const rowRef = useRef<HTMLOListElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateEdges = () => {
    const row = rowRef.current
    if (!row) return
    setAtStart(row.scrollLeft <= 4)
    setAtEnd(row.scrollLeft + row.clientWidth >= row.scrollWidth - 4)
  }

  useEffect(updateEdges, [shows])

  const page = (dir: 1 | -1) => {
    const row = rowRef.current
    row?.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section className="landing-trending" aria-labelledby="trending-title">
      <div className="trending-head">
        <h2 id="trending-title">Trending now</h2>
        <div className="trending-arrows">
          <button className="arrow-btn" onClick={() => page(-1)} disabled={atStart} aria-label="Scroll back">
            ‹
          </button>
          <button className="arrow-btn" onClick={() => page(1)} disabled={atEnd} aria-label="Scroll forward">
            ›
          </button>
        </div>
      </div>
      <ol className="trending-row" ref={rowRef} onScroll={updateEdges}>
        {shows.map((s, i) => (
          <li key={s.id} className={i + 1 >= 10 ? 'rank-wide' : undefined}>
            <span className="rank" aria-hidden="true">
              {i + 1}
            </span>
            <button
              className="trend-card"
              onClick={() => onOpen(s.title)}
              title={s.title}
              aria-label={`${i + 1}. ${s.title}. Find it in the app`}
              style={s.color ? { backgroundColor: s.color } : undefined}
            >
              <img src={s.image} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function Landing({ signedIn = false, onStart, onLogin, now }: Props) {
  const season = currentSeason(now ?? new Date())
  const [art, setArt] = useState<LandingArt | null>(null)
  const [artFailed, setArtFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchLandingArt(season.season, season.year, TRENDING_COUNT, SEASON_COUNT)
      .then((a) => {
        if (!cancelled) setArt(a)
      })
      .catch(() => {
        // AniList unreachable: the page still explains the app, just without artwork.
        if (!cancelled) setArtFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [season.season, season.year])

  const tileCovers = art?.season.slice(0, 3) ?? []

  return (
    <div className="landing">
      <header className="landing-hero">
        {!artFailed && <CoverWall covers={art?.season ?? []} />}

        <nav className="landing-nav" aria-label="Landing">
          <span className="landing-wordmark">Anime Scheduler</span>
          <div className="landing-nav-actions">
            <ThemeToggle />
            {signedIn ? (
              <button className="btn" onClick={() => onStart()}>
                Open the app
              </button>
            ) : (
              <button className="btn" onClick={onLogin}>
                Log in
              </button>
            )}
          </div>
        </nav>

        <div className="landing-hero-copy">
          <h1>Your anime week, mapped.</h1>
          <p className="landing-lead">
            Search any show, sort it into your lists, and see when new episodes air in your time
            zone.
          </p>
          <div className="landing-ctas">
            <button className="btn btn-solid" onClick={() => onStart()}>
              Open the app
            </button>
            <a className="btn" href="#how-it-works">
              How it works
            </a>
          </div>
        </div>
      </header>

      <div className="landing-inner">
        {art && art.trending.length > 0 && (
          <TrendingRow shows={art.trending} onOpen={(title) => onStart(title)} />
        )}

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
              See everything airing in {seasonLabel(season)} and next season. Filter by genre,
              isekai included, or by format: TV, movie, ONA, OVA or special.
            </p>
          </div>
          <div>
            <h2>Keep it your way</h2>
            <p>
              Use it as a guest and your lists stay in this browser. Make a free account to save
              them to the cloud and open them on any device.
            </p>
          </div>
        </section>

        <section className="landing-final">
          <h2>Ready when you are.</h2>
          <p>No account needed to start.</p>
          <button className="btn btn-solid" onClick={() => onStart()}>
            Open the app
          </button>
        </section>

        <footer className="app-footer">
          <p>Catalog, rankings and artwork via AniList</p>
        </footer>
      </div>
    </div>
  )
}

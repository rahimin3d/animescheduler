import type { WeekSchedule } from '../lib/schedule'

interface Props {
  week: WeekSchedule
  loading: boolean
  /** Non-null when the live airing fetch failed (D5 schedule branch). */
  error: string | null
  onRetry: () => void
  lastUpdated: string | null
}

function fmtDayTime(airingAt: number): string {
  return new Date(airingAt).toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Row({ title, cover, episode, airingAt }: { title: string; cover: string; episode: number | null; airingAt: number }) {
  return (
    <li className="sched-row">
      <img src={cover} alt="" loading="lazy" width={40} height={56} className="cover thumb" />
      <div>
        <p className="sched-title" title={title}>
          {title}
        </p>
        <p className="sched-air">
          {episode !== null ? `Ep ${episode} · ` : ''}
          {fmtDayTime(airingAt)} <span className="tz-note">local</span>
        </p>
      </div>
    </li>
  )
}

export default function ScheduleView({ week, loading, error, onRetry, lastUpdated }: Props) {
  const total = week.days.reduce((n, d) => n + d.rows.length, 0)
  const hasAnything = total > 0 || week.later.length > 0
  const range = `${week.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} → ${week.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return (
    <section className="schedule" aria-label="This week's schedule">
      <header className="schedule-head">
        <div>
          <h2>
            This week <span className="sched-range">{range} · local time</span>
          </h2>
          <p className="sched-sub">Your watching + interested shows that are currently airing.</p>
        </div>
        {week.nextUp && (
          <div className="next-up" aria-label="Next up">
            <span className="next-up-label">Next up</span>
            <span className="next-up-title">{week.nextUp.title}</span>
            <span className="next-up-when">
              {week.nextUp.episode !== null ? `Ep ${week.nextUp.episode} · ` : ''}
              {week.nextUp.airingAt !== null
                ? new Date(week.nextUp.airingAt).toLocaleString(undefined, {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'time TBA'}
            </span>
          </div>
        )}
      </header>

      {error && !hasAnything && (
        <div className="state-block state-error" role="alert">
          <p>
            <strong>Couldn&apos;t load airing times.</strong> {error}
          </p>
          <button className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {error && hasAnything && (
        <div className="offline-note" role="status">
          ⚠ Showing saved airing times — AniList unreachable.
          {lastUpdated && <> Last updated: {lastUpdated}.</>}
        </div>
      )}

      {loading && !hasAnything && <p className="sched-loading">Loading airing times…</p>}

      {!loading && !error && !hasAnything && (
        <p className="state-block state-empty">
          Nothing from your watching/interested lists is airing this week — add currently-airing
          shows from search.
        </p>
      )}

      {hasAnything && (
        <>
          <div className="week-grid">
            {week.days.map((day) => {
              const date = new Date(week.start)
              date.setDate(date.getDate() + day.index)
              return (
                <div key={day.label} className={`day-col${day.rows.length > 0 ? ' has-rows' : ''}`}>
                  <h3 className="day-label">
                    {day.label} <span className="day-date">{date.getDate()}</span>
                  </h3>
                  {day.rows.length === 0 ? (
                    <p className="day-empty">—</p>
                  ) : (
                    <ul>
                      {day.rows.map((r) => (
                        <Row key={r.id} title={r.title} cover={r.cover} episode={r.episode} airingAt={r.airingAt ?? 0} />
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
          {week.later.length > 0 && (
            <div className="later-block">
              <h3 className="day-label">Later / TBA</h3>
              <ul className="later-list">
                {week.later.map((r) => (
                  <li key={r.id} className="sched-row">
                    <img src={r.cover} alt="" loading="lazy" width={40} height={56} className="cover thumb" />
                    <div>
                      <p className="sched-title" title={r.title}>
                        {r.title}
                      </p>
                      <p className="sched-air">
                        {r.episode !== null ? `Ep ${r.episode} next · ` : ''}
                        {r.airingAt
                          ? new Date(r.airingAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            }) + ' local'
                          : 'air date TBA'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

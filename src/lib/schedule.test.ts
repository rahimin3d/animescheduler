import { describe, expect, it } from 'vitest'
import { buildWeek, isWithinWeek, scheduleMembers, seasonWatching, weekBounds } from './schedule'
import type { MediaMeta, StatusEntry, StatusMap } from '../types'
import type { BucketStatus } from '../types'

function entry(
  id: number,
  status: BucketStatus,
  over: Partial<MediaMeta> = {},
  updatedAt = '2026-10-01T00:00:00.000Z',
): StatusEntry {
  return {
    status,
    episodesDone: 0,
    updatedAt,
    meta: {
      id,
      title: `Show ${id}`,
      cover: '',
      episodes: 12,
      format: 'TV',
      season: 'FALL 2026',
      airingStatus: 'RELEASING',
      nextAiring: { episode: 2, airingAt: 0 },
      ...over,
    },
  }
}

function toMap(list: StatusEntry[]): StatusMap {
  const map: StatusMap = {}
  for (const e of list) map[String(e.meta.id)] = e
  return map
}

/** A fixed mid-week instant: Wednesday 2026-10-07 12:00 local. */
const MID_WEEK = new Date(2026, 9, 7, 12, 0, 0)

describe('T2 — local week window (D6)', () => {
  it('week runs local Monday 00:00 → Sunday 23:59:59.999', () => {
    const { start, end } = weekBounds(MID_WEEK)
    expect(start.getDay()).toBe(1) // Monday
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(end.getDay()).toBe(0) // Sunday
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
    expect(end.getTime() - start.getTime()).toBeLessThanOrEqual(7 * 24 * 3600 * 1000)
  })

  it('a Monday-before-Sunday date resolves to its own week', () => {
    const monday = new Date(2026, 9, 5, 9, 0, 0) // Monday 00:00 is start
    const { start, end } = weekBounds(monday)
    expect(start.getTime()).toBe(new Date(2026, 9, 5, 0, 0, 0, 0).getTime())
    expect(end.getTime()).toBe(new Date(2026, 9, 11, 23, 59, 59, 999).getTime())
  })

  it('Sunday late night belongs to that week, Monday 00:00 does not', () => {
    const { start, end } = weekBounds(MID_WEEK)
    const sunday2359 = new Date(2026, 9, 11, 23, 59, 0).getTime()
    const monday0000 = new Date(2026, 9, 12, 0, 0, 0).getTime()
    expect(isWithinWeek(sunday2359, start, end)).toBe(true)
    expect(isWithinWeek(monday0000, start, end)).toBe(false)
  })

  it('rows file under the local calendar day they land on', () => {
    const wed2230 = new Date(2026, 9, 7, 22, 30).getTime() // Wednesday local
    const tue0030 = new Date(2026, 9, 6, 0, 30).getTime() // Tuesday local
    const map = toMap([
      entry(1, 'watching', { nextAiring: { episode: 3, airingAt: wed2230 } }),
      entry(2, 'interested', { nextAiring: { episode: 5, airingAt: tue0030 } }),
    ])
    const week = buildWeek(map, MID_WEEK)
    expect(week.days[2].rows.map((r) => r.id)).toEqual([1]) // Wed
    expect(week.days[1].rows.map((r) => r.id)).toEqual([2]) // Tue
    expect(week.later).toEqual([])
  })

  it('rows outside the week go to later; unknown air time too', () => {
    const nextMonth = new Date(2026, 10, 3, 20, 0).getTime()
    const map = toMap([
      entry(1, 'watching', { nextAiring: { episode: 3, airingAt: nextMonth } }),
      entry(2, 'watching', { nextAiring: null }),
    ])
    const week = buildWeek(map, MID_WEEK)
    expect(week.later.map((r) => r.id).sort()).toEqual([1, 2])
    expect(week.nextUp).toBeNull()
  })
})

describe('T2 — schedule membership (D2)', () => {
  it('watching + interested ∩ RELEASING are members', () => {
    const map = toMap([
      entry(1, 'watching'),
      entry(2, 'interested'),
      entry(3, 'watched'),
      entry(4, 'started-not-finished'),
      entry(5, 'watching', { airingStatus: 'FINISHED' }),
      entry(6, 'interested', { airingStatus: 'NOT_YET_RELEASED' }),
    ])
    const members = scheduleMembers(map).map((e) => e.meta.id).sort()
    expect(members).toEqual([1, 2]) // UPCOMING/FINISHED excluded in v1
  })

  it('nextUp is the earliest in-week episode and days sort chronologically', () => {
    const fri = new Date(2026, 9, 9, 21, 0).getTime()
    const tue = new Date(2026, 9, 6, 19, 0).getTime()
    const map = toMap([
      entry(1, 'watching', { nextAiring: { episode: 3, airingAt: fri } }),
      entry(2, 'watching', { nextAiring: { episode: 8, airingAt: tue } }),
    ])
    const week = buildWeek(map, MID_WEEK)
    expect(week.nextUp?.id).toBe(2)
    expect(week.days[1].rows[0].id).toBe(2)
    expect(week.days[4].rows[0].id).toBe(1)
  })
})

describe('season watching strip (Step 3)', () => {
  it('sorts currently-airing first, then alphabetically', () => {
    const map = toMap([
      entry(1, 'watching', { airingStatus: 'FINISHED' }),
      entry(2, 'watching', { airingStatus: 'RELEASING' }),
      entry(3, 'watching', { airingStatus: 'RELEASING' }),
      entry(4, 'interested'),
    ])
    const rows = seasonWatching(map).map((e) => e.meta.id)
    expect(rows).toEqual([2, 3, 1]) // airing first (alpha), finished last; interested excluded
  })
})

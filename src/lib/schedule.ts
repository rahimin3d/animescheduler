import type { StatusEntry, StatusMap } from '../types'

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** D6: "this week" = local Monday 00:00 → local Sunday 23:59:59.999. */
export function weekBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now)
  const day = start.getDay() // 0 = Sun … 6 = Sat
  const daysSinceMonday = (day + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function localDayIndex(airingAt: number): number {
  // D6: local day everywhere — a time files under the local calendar day it lands on.
  const d = new Date(airingAt)
  return (d.getDay() + 6) % 7
}

export function isWithinWeek(airingAt: number, start: Date, end: Date): boolean {
  return airingAt >= start.getTime() && airingAt <= end.getTime()
}

/**
 * D2: schedule membership = manual watching OR interested ∩ currently airing.
 * "Currently airing" is AniList status RELEASING (v1 note: UPCOMING excluded).
 */
export function scheduleMembers(entries: StatusMap): StatusEntry[] {
  return Object.values(entries).filter(
    (e) =>
      (e.status === 'watching' || e.status === 'interested') &&
      e.meta.airingStatus === 'RELEASING',
  )
}

export interface ScheduleRow {
  id: number
  title: string
  cover: string
  episode: number | null
  airingAt: number | null
}

export interface DayColumn {
  index: number
  label: string
  rows: ScheduleRow[]
}

export interface WeekSchedule {
  start: Date
  end: Date
  days: DayColumn[]
  /** Rows with no in-week air time (unknown time, or airs later). */
  later: ScheduleRow[]
  /** Chronologically next episode across the week. */
  nextUp: ScheduleRow | null
}

function toRow(e: StatusEntry): ScheduleRow {
  return {
    id: e.meta.id,
    title: e.meta.title,
    cover: e.meta.cover,
    episode: e.meta.nextAiring?.episode ?? null,
    airingAt: e.meta.nextAiring?.airingAt ?? null,
  }
}

/**
 * Build the local-week view: each row with a known in-week air time files
 * under the local calendar day it lands on, sorted by next-up (earliest first).
 */
export function buildWeek(entries: StatusMap, now: Date): WeekSchedule {
  const { start, end } = weekBounds(now)
  const days: DayColumn[] = DAY_LABELS.map((label, index) => ({ index, label, rows: [] }))
  const later: ScheduleRow[] = []

  const members = scheduleMembers(entries)
  const rows: ScheduleRow[] = members.map(toRow)

  for (const row of rows) {
    if (row.airingAt !== null && isWithinWeek(row.airingAt, start, end)) {
      days[localDayIndex(row.airingAt)].rows.push(row)
    } else {
      later.push(row)
    }
  }

  for (const day of days) {
    day.rows.sort((a, b) => (a.airingAt ?? 0) - (b.airingAt ?? 0))
  }
  later.sort((a, b) => (a.airingAt ?? Infinity) - (b.airingAt ?? Infinity))

  const allInWeek = days.flatMap((d) => d.rows)
  const nextUp = allInWeek.length > 0 ? allInWeek[0] : null
  return { start, end, days, later, nextUp }
}

/** "What I'm watching this season" (Step 3): watching bucket, currently-airing first. */
export function seasonWatching(entries: StatusMap): StatusEntry[] {
  const watching = Object.values(entries).filter((e) => e.status === 'watching')
  return watching.sort((a, b) => {
    const aAiring = a.meta.airingStatus === 'RELEASING' ? 0 : 1
    const bAiring = b.meta.airingStatus === 'RELEASING' ? 0 : 1
    if (aAiring !== bAiring) return aAiring - bAiring
    return a.meta.title.localeCompare(b.meta.title)
  })
}

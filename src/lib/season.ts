/** AniList MediaSeason enum (one quarter of the anime calendar). */
export type AniListSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'

export interface SeasonTarget {
  season: AniListSeason
  year: number
}

const SEASON_ORDER: AniListSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

export function seasonLabel({ season, year }: SeasonTarget): string {
  const t = season.charAt(0) + season.slice(1).toLowerCase()
  return `${t} ${year}`
}

/** Current anime season for any local date — anime seasons start Jan/Apr/Jul/Oct:
 *  Jan–Mar WINTER, Apr–Jun SPRING, Jul–Sep SUMMER, Oct–Dec FALL,
 *  and the year is always the calendar year the season premieres in (Dec 2026 → FALL 2026). */
export function currentSeason(now: Date): SeasonTarget {
  const m = now.getMonth() // 0=Jan
  const season: AniListSeason = m <= 2 ? 'WINTER' : m <= 5 ? 'SPRING' : m <= 8 ? 'SUMMER' : 'FALL'
  return { season, year: now.getFullYear() }
}

/** Next season after the current one (FALL 2026 → WINTER 2027). */
export function nextSeason(current: SeasonTarget): SeasonTarget {
  const idx = SEASON_ORDER.indexOf(current.season)
  const next = SEASON_ORDER[(idx + 1) % 4]
  const year = next === 'WINTER' ? current.year + 1 : current.year
  return { season: next, year }
}

/** Format filter options ("segment by anime type"). */
export type AniListFormat = 'TV' | 'MOVIE' | 'ONA' | 'OVA' | 'SPECIAL'

export const FORMAT_OPTIONS: { value: AniListFormat; label: string }[] = [
  { value: 'TV', label: 'TV' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'ONA', label: 'ONA' },
  { value: 'OVA', label: 'OVA' },
  { value: 'SPECIAL', label: 'Special' },
]

/** Curated genre chips — isekai first because that's the fun part. */
export const GENRE_CHIPS: string[] = [
  'Isekai',
  'Action',
  'Adventure',
  'Fantasy',
  'Comedy',
  'Romance',
  'Drama',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Thriller',
  'Mystery',
  'Horror',
  'Mecha',
  'Sports',
  'Music',
  'Magic',
  'School',
]
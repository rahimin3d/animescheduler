import type { MediaMeta } from '../types'

const ENDPOINT = 'https://graphql.anilist.co'
/** AniList caps id_in at 50 per request (AR-1). */
export const ID_CHUNK_SIZE = 50
/** Results per search / season page. */
export const SEARCH_PER_PAGE = 20

export type ErrorKind = 'network' | 'rate-limit' | 'graphql' | 'http'

export class AniListError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'AniListError'
  }
}

/** The one request wrapper (CQ-2): every AniList call goes through here. */
export async function request<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new AniListError('network', 'Cannot reach AniList — you may be offline.')
  }
  if (res.status === 429) {
    // Retry-After is not readable over CORS; surface a plain rate-limit error.
    throw new AniListError('rate-limit', 'Rate limited by AniList — wait a moment and retry.')
  }
  if (!res.ok) {
    throw new AniListError('http', `AniList responded ${res.status}.`)
  }
  let json: { data?: T; errors?: { message: string }[] }
  try {
    json = await res.json()
  } catch {
    throw new AniListError('http', 'AniList returned an unreadable response.')
  }
  if (json.errors && json.errors.length > 0) {
    throw new AniListError('graphql', json.errors[0].message)
  }
  if (json.data === undefined) {
    throw new AniListError('graphql', 'AniList returned no data.')
  }
  return json.data
}

const MEDIA_FRAGMENT = `
  id
  title { romaji english }
  coverImage { large medium }
  episodes
  format
  season
  seasonYear
  status
  genres
  averageScore
  nextAiringEpisode { episode airingAt }
`

interface GqlMedia {
  id: number
  title: { romaji: string | null; english: string | null }
  coverImage: { large: string; medium: string }
  episodes: number | null
  format: string | null
  season: string | null
  seasonYear: number | null
  status: string
  genres: string[] | null
  averageScore: number | null
  nextAiringEpisode: { episode: number; airingAt: number } | null
}

export function toMeta(m: GqlMedia): MediaMeta {
  return {
    id: m.id,
    title: m.title.romaji ?? m.title.english ?? 'Untitled',
    cover: m.coverImage.medium,
    episodes: m.episodes,
    format: m.format,
    season: m.season && m.seasonYear ? `${m.season} ${m.seasonYear}` : m.season,
    airingStatus: m.status,
    nextAiring: m.nextAiringEpisode
      ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt }
      : null,
    genres: m.genres ?? [],
    averageScore: m.averageScore ?? null,
  }
}

interface GqlPage {
  Page: { pageInfo: { hasNextPage: boolean; total: number }; media: GqlMedia[] }
}

function toSearchPage({ Page }: GqlPage): SearchPage {
  return {
    media: Page.media.map(toMeta),
    hasNextPage: Page.pageInfo.hasNextPage,
    total: Page.pageInfo.total,
  }
}

export interface SearchPage {
  media: MediaMeta[]
  hasNextPage: boolean
  total: number
}

const SEARCH_QUERY = `
  query ($search: String!, $page: Int!) {
    Page(page: $page, perPage: ${SEARCH_PER_PAGE}) {
      pageInfo { hasNextPage total }
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FRAGMENT} }
    }
  }
`

/** D7: every search is one explicit page; hasNextPage drives the Load more button. */
export async function searchAnime(search: string, page: number): Promise<SearchPage> {
  return toSearchPage(await request<GqlPage>(SEARCH_QUERY, { search, page }))
}

const BY_IDS_QUERY = `
  query ($ids: [Int]) {
    Page(perPage: ${ID_CHUNK_SIZE}) {
      media(id_in: $ids, type: ANIME) { ${MEDIA_FRAGMENT} }
    }
  }
`

/** One batched fetch for the schedule, chunked ≤50 ids per request (AR-1). */
export async function fetchMediaByIds(ids: number[]): Promise<MediaMeta[]> {
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + ID_CHUNK_SIZE))
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const data = await request<{ Page: { media: GqlMedia[] } }>(BY_IDS_QUERY, {
        ids: chunk,
      })
      return data.Page.media.map(toMeta)
    }),
  )
  return results.flat()
}

/* ------------------------- season browse (v2) ------------------------- */

const SEASON_QUERY = `
  query (
    $page: Int!
    $season: MediaSeason
    $seasonYear: Int
    $genre: [String]
    $tag: [String]
    $format: [MediaFormat]
  ) {
    Page(page: $page, perPage: ${SEARCH_PER_PAGE}) {
      pageInfo { hasNextPage total }
      media(
        season: $season
        seasonYear: $seasonYear
        type: ANIME
        sort: POPULARITY_DESC
        genre_in: $genre
        tag_in: $tag
        format_in: $format
      ) { ${MEDIA_FRAGMENT} }
    }
  }
`

export interface SeasonFilters {
  season: string
  seasonYear: number
  /** AniList genres (see ANILIST_GENRES); a show must have all of them. */
  genres: string[]
  /** AniList tags such as Isekai; a show must have all of them. */
  tags: string[]
  formats: string[]
}

/** Per-season catalogue page — "this season" browse for the schedule-keeper. */
export async function fetchSeason(
  page: number,
  { season, seasonYear, genres, tags, formats }: SeasonFilters,
): Promise<SearchPage> {
  const data = await request<GqlPage>(SEASON_QUERY, {
    page,
    season,
    seasonYear,
    genre: genres.length > 0 ? genres : undefined,
    tag: tags.length > 0 ? tags : undefined,
    format: formats.length > 0 ? formats : undefined,
  })
  return toSearchPage(data)
}

/* ---------------------------- landing covers ---------------------------- */

export interface CoverArt {
  id: number
  title: string
  image: string
}

const COVERS_QUERY = `
  query ($season: MediaSeason, $seasonYear: Int, $perPage: Int) {
    Page(perPage: $perPage) {
      media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        id
        title { romaji english }
        coverImage { large }
      }
    }
  }
`

/** Large cover art for the season's most popular shows (landing page visual). */
export async function fetchSeasonCovers(
  season: string,
  seasonYear: number,
  perPage: number,
): Promise<CoverArt[]> {
  const data = await request<{
    Page: {
      media: { id: number; title: { romaji: string | null; english: string | null }; coverImage: { large: string } }[]
    }
  }>(COVERS_QUERY, { season, seasonYear, perPage })
  return data.Page.media.map((m) => ({
    id: m.id,
    title: m.title.english ?? m.title.romaji ?? 'Untitled',
    image: m.coverImage.large,
  }))
}

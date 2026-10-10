/** The four buckets ARE the four statuses (v1 decision, D1/Step 3). */
export type BucketStatus = 'watched' | 'interested' | 'watching' | 'started-not-finished'

export const BUCKET_STATUSES: BucketStatus[] = [
  'watched',
  'interested',
  'watching',
  'started-not-finished',
]

export const BUCKET_LABELS: Record<BucketStatus, string> = {
  watched: "What I've watched",
  interested: 'What interests me',
  watching: "What I'm watching",
  'started-not-finished': "Started, didn't finish",
}

/** Local metadata snapshot captured at pick time (D5 offline rule). */
export interface MediaMeta {
  id: number
  title: string
  cover: string
  /** AniList episode count; null when unknown (D4: null never auto-advances). */
  episodes: number | null
  format: string | null
  /** e.g. "FALL 2025" */
  season: string | null
  /** AniList airing status: FINISHED | RELEASING | NOT_YET_RELEASED | CANCELLED | HIATUS */
  airingStatus: string | null
  nextAiring: { episode: number; airingAt: number } | null
  /** AniList genres (kept for season-browse facets; older snapshots may lack it). */
  genres?: string[]
  /** AniList average score 0-100 (season-browse badge; older snapshots may lack it). */
  averageScore?: number | null
  /** Plain-text synopsis, paragraphs split by blank lines (older snapshots lack it). */
  synopsis?: string | null
}

export interface StatusEntry {
  status: BucketStatus
  episodesDone: number
  /** ISO timestamp of last change — drives recency sort. */
  updatedAt: string
  meta: MediaMeta
}

/** Persisted shape: {mediaId → {status, episodesDone, updatedAt, meta}} */
export type StatusMap = Record<string, StatusEntry>

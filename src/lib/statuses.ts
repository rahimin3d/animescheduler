import type { BucketStatus, MediaMeta, StatusEntry, StatusMap } from '../types'
import { BUCKET_STATUSES } from '../types'

export const STORAGE_KEY = 'animeScheduler.entries'
export const BACKUP_KEY = 'animeScheduler.backup'

/** Per-user storage keys — logged-in accounts never mix with guest or each other. */
export function storageKeyFor(userId: string | null): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
}

export interface LoadResult {
  entries: StatusMap
  /** Set when the stored map was corrupt and had to be reset (AR-2). */
  notice: string | null
}

function isEntry(v: unknown): v is StatusEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Partial<StatusEntry>
  return (
    typeof e.status === 'string' &&
    BUCKET_STATUSES.includes(e.status as BucketStatus) &&
    typeof e.episodesDone === 'number' &&
    typeof e.updatedAt === 'string' &&
    typeof e.meta === 'object' &&
    e.meta !== null &&
    typeof (e.meta as MediaMeta).id === 'number' &&
    typeof (e.meta as MediaMeta).title === 'string'
  )
}

export function isValidStatusMap(v: unknown): v is StatusMap {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  return Object.values(v).every(isEntry)
}

/** Hydrate once at init (P-2): corrupt data → backup raw value + notice, start clean. */
export function loadEntries(key: string = STORAGE_KEY): LoadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return { entries: {}, notice: null }
  }
  if (raw === null) return { entries: {}, notice: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isValidStatusMap(parsed)) return { entries: parsed, notice: null }
    throw new Error('shape mismatch')
  } catch {
    try {
      localStorage.setItem(BACKUP_KEY, raw)
    } catch {
      /* backup best-effort */
    }
    return {
      entries: {},
      notice: 'Saved data was unreadable — a backup was kept and your library started fresh.',
    }
  }
}

export function saveEntries(entries: StatusMap, key: string = STORAGE_KEY): void {
  localStorage.setItem(key, JSON.stringify(entries))
}

export interface MutationResult {
  entries: StatusMap
  /** Media ids whose completion should arm the sequel radar. */
  radarFired: number[]
}

function withEntry(
  entries: StatusMap,
  id: string,
  next: StatusEntry,
  radarFired: number[],
): MutationResult {
  return { entries: { ...entries, [id]: next }, radarFired }
}

/** Assign or move a show to a bucket; captures/refreshes the meta snapshot. */
export function setEntry(
  entries: StatusMap,
  meta: MediaMeta,
  status: BucketStatus,
): MutationResult {
  const id = String(meta.id)
  const prev = entries[id]
  const next: StatusEntry = {
    status,
    episodesDone: prev?.episodesDone ?? 0,
    updatedAt: new Date().toISOString(),
    meta: { ...meta },
  }
  // Manual move to watched always fires the radar (D4), regardless of count.
  const radarFired = status === 'watched' && prev?.status !== 'watched' ? [meta.id] : []
  return withEntry(entries, id, next, radarFired)
}

export function removeEntry(entries: StatusMap, id: number): MutationResult {
  const key = String(id)
  if (!(key in entries)) return { entries, radarFired: [] }
  const next = { ...entries }
  delete next[key]
  return { entries: next, radarFired: [] }
}

/**
 * +1 episode (D4 completion matrix):
 * - count known (non-null): reaching the final episode auto-advances to watched + fires radar
 * - count null: increment only, never auto-advance
 * - below final: increment only
 */
export function incrementEpisode(entries: StatusMap, id: number): MutationResult {
  const key = String(id)
  const entry = entries[key]
  if (!entry) return { entries, radarFired: [] }
  const episodesDone = entry.episodesDone + 1
  const finalCount = entry.meta.episodes
  const reachesFinal = finalCount !== null && episodesDone >= finalCount
  const next: StatusEntry = {
    ...entry,
    episodesDone,
    updatedAt: new Date().toISOString(),
    status: reachesFinal ? 'watched' : entry.status,
  }
  return withEntry(entries, key, next, reachesFinal ? [entry.meta.id] : [])
}

/* ---------------- Import / export (D3: replace wholesale) ---------------- */

export const EXPORT_FORMAT = 'anime-scheduler-export'

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: 1
  exportedAt: string
  entries: StatusMap
}

export function exportEntries(entries: StatusMap): string {
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  }
  return JSON.stringify(file, null, 2)
}

export type ImportResult =
  | { ok: true; entries: StatusMap }
  | { ok: false; error: string }

/**
 * Parse an import file. A malformed or non-export file is rejected and the
 * stored map stays untouched — the caller only replaces on ok:true (D3).
 */
export function parseImport(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not a valid JSON file.' }
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as ExportFile).format !== EXPORT_FORMAT
  ) {
    return { ok: false, error: 'Not an Anime Scheduler export file.' }
  }
  const entries = (parsed as ExportFile).entries
  if (!isValidStatusMap(entries)) {
    return { ok: false, error: 'Export file is malformed — entries are invalid.' }
  }
  return { ok: true, entries }
}

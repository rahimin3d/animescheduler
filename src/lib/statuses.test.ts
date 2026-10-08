import { beforeEach, describe, expect, it } from 'vitest'
import {
  BACKUP_KEY,
  STORAGE_KEY,
  exportEntries,
  incrementEpisode,
  isValidStatusMap,
  loadEntries,
  parseImport,
  removeEntry,
  saveEntries,
  setEntry,
} from './statuses'
import type { MediaMeta, StatusMap } from '../types'
import { BUCKET_STATUSES } from '../types'

function meta(id: number, over: Partial<MediaMeta> = {}): MediaMeta {
  return {
    id,
    title: `Show ${id}`,
    cover: `https://img/${id}.jpg`,
    episodes: 12,
    format: 'TV',
    season: 'FALL 2026',
    airingStatus: 'RELEASING',
    nextAiring: { episode: 3, airingAt: 1_800_000_000_000 },
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('T1 — status map transitions', () => {
  it('picks a show into a bucket with a meta snapshot (D5 schema)', () => {
    const { entries, radarFired } = setEntry({}, meta(1), 'watching')
    const e = entries['1']
    expect(e.status).toBe('watching')
    expect(e.episodesDone).toBe(0)
    expect(e.meta.title).toBe('Show 1')
    expect(typeof e.updatedAt).toBe('string')
    expect(radarFired).toEqual([])
  })

  it('moves between buckets and keeps episodesDone', () => {
    let { entries } = setEntry({}, meta(1), 'watching')
    entries = incrementEpisode(entries, 1).entries
    entries = setEntry(entries, meta(1), 'started-not-finished').entries
    expect(entries['1'].status).toBe('started-not-finished')
    expect(entries['1'].episodesDone).toBe(1)
  })

  it('the four buckets ARE the four statuses — paused/dropped are not separate buckets', () => {
    expect(BUCKET_STATUSES).toEqual([
      'watched',
      'interested',
      'watching',
      'started-not-finished',
    ])
    expect(BUCKET_STATUSES).not.toContain('paused')
    expect(BUCKET_STATUSES).not.toContain('dropped')
  })

  it('removes an entry', () => {
    const { entries } = setEntry({}, meta(1), 'interested')
    const after = removeEntry(entries, 1)
    expect(after.entries).toEqual({})
    expect(after.radarFired).toEqual([])
  })
})

describe('T4 — +1 completion / radar matrix (D4)', () => {
  it('below final: increments only, no auto-advance, no radar', () => {
    const { entries } = setEntry({}, meta(1, { episodes: 12 }), 'started-not-finished')
    const r = incrementEpisode(entries, 1)
    expect(r.entries['1'].episodesDone).toBe(1)
    expect(r.entries['1'].status).toBe('started-not-finished')
    expect(r.radarFired).toEqual([])
  })

  it('reaching final with known count: auto-advances to watched + fires radar', () => {
    let { entries } = setEntry({}, meta(1, { episodes: 2 }), 'started-not-finished')
    entries = incrementEpisode(entries, 1).entries // 1/2
    const r = incrementEpisode(entries, 1) // 2/2 → done
    expect(r.entries['1'].status).toBe('watched')
    expect(r.entries['1'].episodesDone).toBe(2)
    expect(r.radarFired).toEqual([1])
  })

  it('null count: increments forever, never auto-advances', () => {
    let { entries } = setEntry({}, meta(1, { episodes: null }), 'started-not-finished')
    for (let i = 0; i < 50; i++) {
      const r = incrementEpisode(entries, 1)
      expect(r.entries['1'].status).toBe('started-not-finished')
      expect(r.radarFired).toEqual([])
      entries = r.entries
    }
    expect(entries['1'].episodesDone).toBe(50)
  })

  it('manual move to watched fires radar regardless of count', () => {
    const { entries } = setEntry({}, meta(1, { episodes: null }), 'started-not-finished')
    const r = setEntry(entries, meta(1, { episodes: null }), 'watched')
    expect(r.radarFired).toEqual([1])
  })

  it('re-picking the already-watched status does not re-fire radar', () => {
    let { entries } = setEntry({}, meta(1), 'watched')
    const r = setEntry(entries, meta(1), 'watched')
    expect(r.radarFired).toEqual([])
    entries = r.entries
    expect(entries['1'].status).toBe('watched')
  })

  it('moving to a non-watched bucket never fires radar', () => {
    const { entries } = setEntry({}, meta(1), 'watched')
    const r = setEntry(entries, meta(1), 'interested')
    expect(r.radarFired).toEqual([])
  })
})

describe('T3 — import/export (D3: replace wholesale)', () => {
  it('round-trips export → import', () => {
    const { entries } = setEntry({}, meta(7), 'watching')
    const res = parseImport(exportEntries(entries))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.entries).toEqual(entries)
  })

  it('valid import replaces the whole map — old keys are gone', () => {
    const { entries: seeded } = setEntry({}, meta(1), 'watched')
    const exported = JSON.parse(exportEntries(setEntry({}, meta(2), 'interested').entries))
    const res = parseImport(JSON.stringify(exported))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(Object.keys(res.entries)).toEqual(['2'])
      expect(seeded['1']).toBeDefined() // sanity: seed existed before replace
    }
  })

  it('malformed JSON is rejected', () => {
    const res = parseImport('{nope')
    expect(res).toEqual({ ok: false, error: 'Not a valid JSON file.' })
  })

  it('valid JSON that is not an export file is rejected', () => {
    const res = parseImport(JSON.stringify({ entries: { '1': { status: 'watched' } } }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Not an Anime Scheduler export/)
  })

  it('export-shaped file with invalid entries is rejected', () => {
    const res = parseImport(
      JSON.stringify({ format: 'anime-scheduler-export', entries: { '1': { status: 'nope' } } }),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/malformed/)
  })

  it('a rejected import leaves the stored map untouched', () => {
    const { entries } = setEntry({}, meta(1), 'watching')
    saveEntries(entries)
    const res = parseImport('not json at all')
    expect(res.ok).toBe(false)
    // caller never calls saveEntries on failure — storage still holds original
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(entries)
  })

  it('export includes the format marker', () => {
    const parsed = JSON.parse(exportEntries({}))
    expect(parsed.format).toBe('anime-scheduler-export')
    expect(parsed.entries).toEqual({})
  })
})

describe('AR-2 — corrupt localStorage: backup + notice', () => {
  it('corrupt JSON → backup key written, notice returned, empty library', () => {
    localStorage.setItem(STORAGE_KEY, '{broken json!!')
    const res = loadEntries()
    expect(res.entries).toEqual({})
    expect(res.notice).toMatch(/backup/i)
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{broken json!!')
  })

  it('valid JSON but wrong shape also counts as corrupt', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['not', 'a', 'map']))
    const res = loadEntries()
    expect(res.entries).toEqual({})
    expect(res.notice).not.toBeNull()
  })

  it('valid data loads with no notice', () => {
    const { entries } = setEntry({}, meta(3), 'interested')
    saveEntries(entries)
    const res = loadEntries()
    expect(res.entries).toEqual(entries)
    expect(res.notice).toBeNull()
  })

  it('missing storage → empty, no notice', () => {
    const res = loadEntries()
    expect(res.entries).toEqual({})
    expect(res.notice).toBeNull()
  })
})

describe('isValidStatusMap', () => {
  it('accepts a real map and rejects junk', () => {
    const { entries } = setEntry({}, meta(1), 'watched')
    expect(isValidStatusMap(entries)).toBe(true)
    expect(isValidStatusMap(null)).toBe(false)
    expect(isValidStatusMap([])).toBe(false)
    expect(isValidStatusMap({ 1: { status: 'watched' } })).toBe(false)
  })
})

describe('recency ordering data', () => {
  it('updatedAt increases on mutation (drives started-not-finished sort)', async () => {
    const { entries } = setEntry({}, meta(1), 'started-not-finished')
    const first = entries['1'].updatedAt
    await new Promise((r) => setTimeout(r, 5))
    const later = incrementEpisode(entries, 1).entries
    expect(later['1'].updatedAt > first).toBe(true)
  })
})

describe('type sanity', () => {
  it('StatusMap keys are stringified ids', () => {
    const { entries } = setEntry({}, meta(42), 'watching')
    expect(Object.keys(entries)).toEqual(['42'])
    const map: StatusMap = entries
    expect(map['42'].meta.id).toBe(42)
  })
})

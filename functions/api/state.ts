/**
 * Cloudflare Worker route — the tiny API in front of the D1 database.
 *
 * Auth-required: every schedule row belongs to the logged-in user (from the
 * httpOnly session cookie). Guests get 401 and simply don't see the cloud —
 * the frontend stays local-first for them.
 *
 * Contract mirrors the local export format (see src/lib/statuses.ts):
 *   GET /api/state  → { format, version, exportedAt, entries }  (404 when empty)
 *   PUT /api/state  → body is that same object; replaces the library wholesale
 */

import { json, resolveUser, type Ctx } from '../_lib/auth'

const VALID_STATUSES = new Set(['watched', 'interested', 'watching', 'started-not-finished'])

type ValidEntry = { status: string; episodesDone: number; updatedAt: string; meta: { id: number } }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validEntry(e: unknown): e is ValidEntry {
  if (!isRecord(e)) return false
  return (
    typeof e.status === 'string' &&
    VALID_STATUSES.has(e.status) &&
    typeof e.episodesDone === 'number' &&
    Number.isInteger(e.episodesDone) &&
    e.episodesDone >= 0 &&
    typeof e.updatedAt === 'string' &&
    isRecord(e.meta) &&
    typeof e.meta.id === 'number'
  )
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const user = await resolveUser(ctx.env.DB, ctx.request)
  if (!user) return json({ error: 'login required' }, 401)

  const { results } = await ctx.env.DB.prepare(
    'SELECT media_id, status, episodes_done, updated_at, meta FROM schedule WHERE user_id = ?',
  )
    .bind(user.id)
    .all<{
      media_id: number
      status: string
      episodes_done: number
      updated_at: string
      meta: string
    }>()

  if (results.length === 0) return json({ error: 'no library saved yet' }, 404)

  const entries: Record<string, unknown> = {}
  for (const row of results) {
    let meta: unknown
    try {
      meta = JSON.parse(row.meta)
    } catch {
      continue // skip rows we can't read rather than failing the whole fetch
    }
    entries[String(row.media_id)] = {
      status: row.status,
      episodesDone: row.episodes_done,
      updatedAt: row.updated_at,
      meta,
    }
  }
  return json({
    format: 'anime-scheduler-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  })
}

export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const user = await resolveUser(ctx.env.DB, ctx.request)
  if (!user) return json({ error: 'login required' }, 401)

  let body: unknown
  try {
    body = await ctx.request.json()
  } catch {
    return json({ error: 'request body is not valid JSON' }, 400)
  }
  const entries = isRecord(body) && isRecord(body.entries) ? body.entries : null
  if (!entries) return json({ error: 'body must be an export object with an entries map' }, 400)

  const clean: [string, ValidEntry][] = []
  for (const [id, entry] of Object.entries(entries)) {
    if (!/^\d+$/.test(id) || !validEntry(entry)) {
      return json({ error: `invalid entry rejected: ${id} — library not changed` }, 400)
    }
    clean.push([id, entry])
  }

  // Replace wholesale — mirrors the local import semantics (D3).
  await ctx.env.DB.prepare('DELETE FROM schedule WHERE user_id = ?').bind(user.id).run()
  const insert = ctx.env.DB.prepare(
    'INSERT INTO schedule (user_id, media_id, status, episodes_done, updated_at, meta) VALUES (?, ?, ?, ?, ?, ?)',
  )
  for (const [id, entry] of clean) {
    await insert
      .bind(user.id, Number(id), entry.status, entry.episodesDone, entry.updatedAt, JSON.stringify(entry.meta))
      .run()
  }
  return json({ ok: true, count: clean.length })
}
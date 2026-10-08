import type { StatusMap } from '../types'
import { EXPORT_FORMAT, exportEntries, isValidStatusMap } from './statuses'

/** Same-origin /api by default; override with VITE_API_BASE for cross-origin deploys. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '')

export type ServerState =
  | { exists: true; entries: StatusMap; exportedAt: string }
  | { exists: false }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Best-effort pull of the cloud library. Never throws: any failure — no deploy
 * yet, offline, Vite's SPA fallback returning index.html for /api/state — simply
 * reports exists:false so the app stays local-first.
 */
export async function fetchServerState(): Promise<ServerState> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/state`)
  } catch {
    return { exists: false }
  }
  if (res.status === 404) return { exists: false } // empty remote library
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { exists: false }
  }
  if (isRecord(body) && body.format === EXPORT_FORMAT && isValidStatusMap(body.entries)) {
    return {
      exists: true,
      entries: body.entries,
      exportedAt: typeof body.exportedAt === 'string' ? body.exportedAt : '',
    }
  }
  return { exists: false }
}

export type PushResult = { ok: true; count: number } | { ok: false; error: string }

/** Replace the cloud library wholesale with the current one (mirrors local D3). */
export async function pushState(entries: StatusMap): Promise<PushResult> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: exportEntries(entries),
    })
  } catch {
    return { ok: false, error: 'Cannot reach the cloud API.' }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (res.ok && isRecord(body) && body.ok === true) {
    return { ok: true, count: typeof body.count === 'number' ? body.count : 0 }
  }
  const message =
    isRecord(body) && typeof body.error === 'string'
      ? body.error
      : `Cloud API responded ${res.status}.`
  return { ok: false, error: message }
}
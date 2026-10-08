-- 0001_init.sql
-- Auth-ready from day one: every schedule row is scoped by user_id so
-- friend logins (Phase 3, Cloudflare Access OTP) slot in with no rework.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedule (
  user_id       TEXT    NOT NULL,
  media_id      INTEGER NOT NULL,
  status        TEXT    NOT NULL,
  episodes_done INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT    NOT NULL,
  meta          TEXT    NOT NULL, -- JSON snapshot of the MediaMeta used offline
  PRIMARY KEY (user_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_user ON schedule(user_id);
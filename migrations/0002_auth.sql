-- 0002_auth.sql
-- Username + password login (Option 1). Passwords are PBKDF2 hashed in the
-- worker with a per-user random salt — no plain text is ever stored.

ALTER TABLE users ADD COLUMN pw_salt TEXT;
ALTER TABLE users ADD COLUMN pw_hash TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,               -- sha256 of the opaque cookie token
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
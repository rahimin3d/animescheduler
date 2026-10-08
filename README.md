# Anime Scheduler

Search the full AniList catalog, slot shows into four buckets, browse the current & next season by genre (isekai first), and get a local-time weekly schedule of what's airing from your watchlist.

- **Local-first**: guests stay in `localStorage`. **Logged-in accounts** use Cloudflare D1 (per-user keys) with PBKDF2-hashed passwords, httpOnly session cookies, and per-user isolated libraries. The browser still keeps a local working copy for offline rendering — that's the v1 offline contract, not unencrypted plaintext at rest in a "website file".
- **Catalog**: [AniList](https://anilist.co) public GraphQL API (90 req/min budget; typing is debounced, id fetches are batched ≤50).
- **The four buckets ARE the four statuses**: watched / interested / watching / started-not-finished (paused + dropped share the last one).
- **This season tab**: current + next season browse, genre chips (isekai…), format filter (TV / Movie / ONA / OVA / Special), popularity-sorted, Load more.
- **Remove anytime**: an explicit **Remove** button on picked search/season cards and on every bucket card.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173 — pure local, no account needed
```

## Authentication (in-app)

- **Signup / Login / Logout** under the header (`Log in / Sign up`). Each account is stored in D1 (`users` + `sessions`).
- **Passwords**: hashed with PBKDF2 (SHA-256, 210k iterations, per-user 16-byte random salt) via WebCrypto — never stored or transmitted in plaintext.
- **Sessions**: opaque 32-byte tokens; D1 keeps only `sha256(token)` in an httpOnly, SameSite=Lax cookie (`as_session`), 30-day expiry. `Secure` is only set on `https:`.
- **Isolation**: every `schedule` row is keyed by `user_id` — friends can't see each other's libraries.
- **Guest mode**: stays 100% local in `localStorage` (`animeScheduler.entries`); clicking **Push to cloud** while logged out opens the login panel. When logged in, cloud is authoritative (auto-pull on login), saves write to `animeScheduler.entries:<userId>`, and **☁ Push to cloud** writes to D1.
- **Exports**: the **Export JSON** button still produces an opt-in backup file on your machine. No forced "text file" storage — it's a user-initiated download. D1 is encrypted at rest by Cloudflare.

## Run the cloud API locally (D1)

```sh
npm run d1:migrate:local   # creates the local D1 schema in .wrangler/state
npm run api:dev            # builds, then serves the site + API (/api/state, /api/auth/*) on :8788, D1-backed
```

GET /api/state` returns your library in export shape (404 until first push);
`PUT /api/state` replaces it wholesale. The app checks for a cloud library on
load and offers to pull it (banner), and has a **☁ Push to cloud** button.
No API running? The app stays local-first and silently ignores the cloud.

## Deploy (free Cloudflare Workers + D1) — one-time, needs your account

The app deploys as one Worker (`worker/index.ts`): it serves the built SPA from
`dist/` and routes `/api/*` to the handlers in `functions/`.

```sh
npx wrangler login                     # browser OAuth into your Cloudflare account
npx wrangler d1 create anime-scheduler # prints a database_id
# paste that id into wrangler.toml (the `database_id` line)
npx wrangler d1 migrations apply anime-scheduler --remote  # create tables in the cloud
npm run deploy                          # builds + publishes to *.workers.dev
```

After that, `npm run api:dev` and `npm run d1:migrate:remote` work end-to-end
against your live database.

### Friends (Phase 3)
The schema keys every row by `user_id` (default `"me"`) — the function at
`functions/api/state.ts` swaps `DEFAULT_USER` for the authenticated id when
login lands (Cloudflare Access email OTP works on the free tier). No rework.

## Test / Build

```sh
npm test         # Vitest + React Testing Library (unit + component + cloud-sync)
npm run build    # typecheck + Vite build
```

## Rules baked in (eng-review decisions)

- Schedule membership = manual **watching** or **interested** ∩ currently airing (`status == RELEASING`), this week = **local** Mon 00:00 → Sun 23:59.
- **+1 episode** auto-advances to watched when the total is known and reached; an unknown total never auto-advances; a manual move to watched always arms the sequel radar (Phase 2).
- Import **replaces** the whole map — malformed files are rejected, your library stays untouched (same semantics as a cloud push/pull).
- AniList down → saved snapshots still render with an offline notice + last-updated; search pauses until Retry succeeds.
- Corrupt storage → a backup key is kept and the library starts fresh with a notice.
- Search is paginated (20/page) with a **Load more** button; methods/state are covered by unit + component tests.
# Security model (LongboxLens)

## Auth — server only

- Accounts live only in `/api/auth`, backed by Redis (Vercel KV).
  Passwords are PBKDF2 (100k rounds, SHA-512, per-user salt). Sessions
  are random 32-byte tokens in Redis (`session:<token>`, 30-day TTL).
- There is deliberately **no** client-side / localStorage auth. An earlier
  version stored a reversible base64 "hash" in `lbl_users`; it was removed
  in Nov 2026. A one-time migration in `public/app.js` moves a pre-fix
  local account to the server on next sign-in, then deletes the local
  record. Do not reintroduce local auth.
- Redis is resolved in `lib/redis.js`, which accepts both
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and the Vercel KV
  names `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Live, only the KV names
  exist. If Redis is not configured, auth and sync fail closed (503) —
  they never fall back to insecure local behaviour.
- **The linked KV store is dead (found 2026-11-15):** its Upstash host
  no longer resolves in DNS, so the database behind `KV_REST_API_URL`
  has been deleted. Until a new store is created in the Vercel dashboard
  (Storage → Create Database → KV) and linked to this project, auth
  answers 503 by design. Do NOT deploy this to production before the
  store is recreated — sign-in would stop working entirely. When the
  store is unreachable, Redis calls fail fast (`retry: false`) and the
  rate limiter falls back to in-memory; nothing fails open.

## Protected APIs — all require a Bearer session token

| Route | Limit (per user) |
| --- | --- |
| `POST /api/identify` | 10/min, 100/day; image max 3 MB decoded |
| `GET /api/ebay-search` | 30/min, 300/day |
| `POST /api/upload-image` | images only (JPEG/PNG/WebP), max 5 MB, server-generated filename |
| `GET/POST /api/sync` | session only |
| `POST /api/auth` | 10/min, 100/day per IP (login/register) |

- Rate limits in `lib/rateLimit.js` use Redis when available and an
  in-memory fallback when it is not. They never silently skip.
- `/api/identify` corrections accept only allow-listed fields, capped in
  length, on a valid row id. Note: `scan_cache` has no `user_id` column,
  so a signed-in user can correct any cached row — acceptable for a
  single-user tool, but add ownership before opening sign-ups to others.
- No API sets a wildcard CORS header. The app is same-origin.

## Cron cleanup

- `GET /api/cleanup-blobs` requires `CRON_SECRET` to be set in Vercel
  and presented as `Authorization: Bearer <CRON_SECRET>`. Without it the
  endpoint always refuses (503). Set `CRON_SECRET` to a long random
  string in Vercel env vars; Vercel Cron sends it automatically.

## Removed

- `/api/debug` was deleted — it exposed which secrets were configured.
  Use `vercel env ls` (names only) instead.

## Known gaps (not yet fixed)

- `scan_cache` has no TTL / cleanup and no per-user ownership (see above).
- The "Upgrade to Pro" button in the scanner only flips the local
  session plan — there is no server-side plan or payment behind it.
- Secrets stay server-side: `GEMINI_API_KEY`, `EBAY_CLIENT_ID` /
  `EBAY_CLIENT_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`. Never
  put them in client code or chat.

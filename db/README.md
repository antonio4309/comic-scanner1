# Caching (Neon Postgres)

Two caches cut Gemini and eBay API costs to near-zero on repeat lookups:

- **`scan_cache`** — perceptual-hash (dHash) cache of identified covers. A repeat
  scan of the same cover (Hamming distance ≤ 6) returns the stored result and
  **skips Gemini entirely**.
- **`price_cache`** — 24h-TTL cache of eBay sold-price lookups, keyed by book
  identity (`bookKey` + grade context). A second lookup of the same book within
  24h makes **zero eBay calls**.

Both are best-effort: if the database is unreachable or `DATABASE_URL` is unset,
the routes log a warning and fall through to live identification / live eBay.

## One-time setup

1. **Add Neon Postgres** to the project via the Vercel Marketplace
   (Vercel → Storage → Neon). This sets the `DATABASE_URL` env var automatically.
2. **Install deps** (already in package.json): `npm install` pulls in
   `sharp` and `@neondatabase/serverless`.
3. **Create the tables** — either:
   - Run the migration locally:
     ```bash
     vercel env pull .env.local        # or export DATABASE_URL=...
     node --env-file=.env.local db/migrate.mjs
     ```
   - **or** paste `db/schema.sql` into the Neon SQL editor and run it.

That's it. Redeploy and the routes start using the caches.

## How it works in the routes

- `api/identify.js`: hashes the incoming image, queries `scan_cache` for the
  nearest cover; distance ≤ 6 → returns cached result with `cached: true`.
  Otherwise runs Gemini and stores `(phash, result)`.
- `api/ebay-search.js`: builds a cache key from `bookKey(title, issue, publisher)`
  plus a grade context (raw vs `CGC 9.8` vs newsstand — these price differently),
  and wraps the live lookup with `lib/priceCache.js`.
- The UI shows a small **⚡ Instant** badge when a response has `cached: true`.

## Notes

- `bit_count(...)` (Hamming distance) needs Postgres 14+. Neon is well above that.
- `sharp` ships native binaries; Vercel installs the Linux build at deploy time.

-- LongboxLens cache schema (Neon Postgres)
-- Run via: node db/migrate.mjs   (needs DATABASE_URL)
-- or paste this into the Neon SQL editor.

CREATE TABLE IF NOT EXISTS scan_cache (
  id SERIAL PRIMARY KEY,
  phash BIGINT NOT NULL,
  result JSONB NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_cache_phash ON scan_cache (phash);

CREATE TABLE IF NOT EXISTS price_cache (
  book_key TEXT PRIMARY KEY,
  prices JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2026-11-15: scan-cache ownership + TTL. user_id is the session userId
-- of whoever first scanned the cover (NULL = written before ownership
-- existed, grandfathered as correctable by anyone). expires_at bounds
-- growth: rows live SCAN_CACHE_TTL_DAYS (default 180) and are swept by
-- the daily /api/cleanup-blobs cron. The app also applies these lazily
-- at runtime (lib/migrateCache.js) for existing deployments, since
-- DATABASE_URL is only in Vercel and can't be pulled locally.
ALTER TABLE scan_cache ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE scan_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '180 days');
CREATE INDEX IF NOT EXISTS idx_scan_cache_user_id ON scan_cache (user_id);
CREATE INDEX IF NOT EXISTS idx_scan_cache_expires_at ON scan_cache (expires_at);

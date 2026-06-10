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

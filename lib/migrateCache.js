// Scan-cache schema upgrades, applied lazily at runtime.
//
// Why lazy: DATABASE_URL lives only in Vercel (the CLI redacts it on
// `vercel env pull`), so the documented `node db/migrate.mjs` path can't
// be run from a dev machine against the live database. The same ALTERs
// also live in db/schema.sql for fresh databases; this module applies
// them idempotently to an existing database, once per serverless cold
// start, before any code touches the new columns.
//
// The statements are safe to run repeatedly (IF NOT EXISTS) and safe to
// run concurrently (a duplicate-column error is caught and ignored).
// If they fail (e.g. DB unreachable), callers degrade gracefully:
// cache lookups fall through to live identification and corrections
// fail closed instead of writing to a half-migrated table.
import { getSql } from './db.js';

let ensured = null;

export async function ensureScanCacheSchema(sql) {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await sql`ALTER TABLE scan_cache ADD COLUMN IF NOT EXISTS user_id TEXT`;
      await sql`ALTER TABLE scan_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '180 days')`;
      await sql`CREATE INDEX IF NOT EXISTS idx_scan_cache_user_id ON scan_cache (user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_scan_cache_expires_at ON scan_cache (expires_at)`;
      console.log('[scan-cache] schema ensured (user_id, expires_at)');
      return true;
    } catch (e) {
      console.warn('[scan-cache] schema ensure failed, cache will degrade gracefully:', e.message);
      return false;
    }
  })();
  return ensured;
}

// TTL for new scan-cache rows, in days. Env-tunable; the DB default
// (180 days, see above) is only a backstop for rows written outside the
// app. Identifications don't go stale the way prices do, so 180 days
// bounds growth without re-running Gemini on every repeat scan.
export function scanCacheTtlDays() {
  const n = Number(process.env.SCAN_CACHE_TTL_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 3650) : 180;
}

export function scanCacheExpiresAt() {
  return new Date(Date.now() + scanCacheTtlDays() * 24 * 60 * 60 * 1000).toISOString();
}

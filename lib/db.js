// Shared Neon Postgres client (HTTP, serverless-friendly).
// Returns null when DATABASE_URL is not configured so callers can fall
// through to live behaviour instead of crashing.
import { neon } from '@neondatabase/serverless';

let _sql = null;

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_sql) {
    try {
      _sql = neon(url);
    } catch (e) {
      console.warn('[db] failed to init Neon client:', e.message);
      return null;
    }
  }
  return _sql;
}

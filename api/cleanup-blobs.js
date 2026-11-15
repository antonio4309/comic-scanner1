// Deletes comic images older than 24h from Vercel Blob storage, and sweeps
// expired cache rows from Neon (scan_cache past its TTL, price_cache
// older than its 24h TTL). Called by the Vercel Cron in vercel.json
// (daily 03:00).
//
// SECURITY FIX: this used to run for anyone when CRON_SECRET was unset
// (`if (process.env.CRON_SECRET && ...)`), and CRON_SECRET was never set
// in Vercel — so anyone on the internet could delete every image older
// than a day. It now fails closed: without CRON_SECRET configured the
// endpoint always refuses, and a caller must present it as a Bearer
// token. Set CRON_SECRET in Vercel (Production) to any long random
// string; Vercel Cron sends it automatically on scheduled runs.
import { list, del } from '@vercel/blob';
import { getSql } from '../lib/db.js';
import { ensureScanCacheSchema } from '../lib/migrateCache.js';

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET) {
    return res.status(503).json({
      error:
        'Cleanup is disabled — CRON_SECRET is not configured. Set it in Vercel env vars to enable the scheduled cleanup.',
    });
  }
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  let deleted = 0;
  let cursor;

  do {
    const result = await list({ prefix: 'comic-images/', cursor, limit: 1000 });
    const old = result.blobs.filter(
      (b) => new Date(b.uploadedAt).getTime() < cutoffMs
    );
    if (old.length) {
      await del(old.map((b) => b.url));
      deleted += old.length;
    }
    cursor = result.cursor;
  } while (cursor);

  // Sweep expired cache rows. Best-effort: blob cleanup above still runs
  // if the DB is down. The scan_cache columns are ensured first (the
  // same lazy migration identify.js runs) so a fresh deploy can't sweep
  // before the table has expires_at.
  let scanExpired = 0;
  let priceStale = 0;
  const sql = getSql();
  if (sql) {
    try {
      await ensureScanCacheSchema(sql);
      const s = await sql`WITH d AS (DELETE FROM scan_cache WHERE expires_at < now() RETURNING id) SELECT count(*)::int AS n FROM d`;
      scanExpired = s?.[0]?.n ?? 0;
      const p = await sql`WITH d AS (DELETE FROM price_cache WHERE fetched_at < now() - interval '24 hours' RETURNING book_key) SELECT count(*)::int AS n FROM d`;
      priceStale = p?.[0]?.n ?? 0;
      console.log(`[cleanup] swept ${scanExpired} expired scan_cache row(s), ${priceStale} stale price_cache row(s)`);
    } catch (e) {
      console.warn('[cleanup] cache sweep failed (blobs still cleaned):', e.message);
    }
  }

  return res.status(200).json({
    deleted,
    scanExpired,
    priceStale,
    message: `Deleted ${deleted} image(s) older than 24h, ${scanExpired} expired scan-cache row(s), ${priceStale} stale price-cache row(s)`,
  });
}

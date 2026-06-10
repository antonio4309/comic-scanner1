// 24h-TTL cache for eBay sold-price lookups, keyed by book identity.
// Wraps a live fetch function: on a fresh cache hit it returns the stored
// prices (zero eBay calls); on miss it runs the fetch, upserts, and returns.
// Fully graceful: any DB problem falls through to a live fetch.
import { getSql } from './db.js';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @param {string} cacheKey  identity key (see bookKey + grade context)
 * @param {() => Promise<object>} fetchFn  live eBay lookup, returns the price payload
 * @returns {Promise<object>} the payload with a `cached: true|false` flag added
 */
export async function getCachedPrice(cacheKey, fetchFn) {
  const sql = getSql();

  if (sql && cacheKey) {
    try {
      const rows = await sql`
        SELECT prices, fetched_at FROM price_cache WHERE book_key = ${cacheKey} LIMIT 1`;
      if (rows.length) {
        const age = Date.now() - new Date(rows[0].fetched_at).getTime();
        if (age < TTL_MS) {
          return { ...rows[0].prices, cached: true };
        }
      }
    } catch (e) {
      console.warn('[priceCache] read failed, falling through to live:', e.message);
    }
  }

  const fresh = await fetchFn();

  // Only cache real, found results — leave "no data" misses uncached so we retry.
  if (sql && cacheKey && fresh && fresh.found !== false) {
    try {
      await sql`
        INSERT INTO price_cache (book_key, prices, fetched_at)
        VALUES (${cacheKey}, ${JSON.stringify(fresh)}::jsonb, now())
        ON CONFLICT (book_key) DO UPDATE
          SET prices = EXCLUDED.prices, fetched_at = now()`;
    } catch (e) {
      console.warn('[priceCache] write failed:', e.message);
    }
  }

  return { ...fresh, cached: false };
}

// Per-key rate limiting.
//
// SECURITY FIX: the old identify limiter skipped limiting entirely when
// Redis was not configured ("fail open"), and live Redis was never
// configured under the names the code looked for — so there was no limit
// at all on the Gemini endpoint. This limiter uses Redis when available
// and a best-effort in-memory fallback (per serverless instance) when it
// is not. It never silently skips the limit.
//
// Limits are per authenticated user (callers pass `rl:<route>:<userId>`);
// auth attempts use per-IP keys instead (see api/auth.js).
import { getRedis } from './redis.js';

const mem = new Map(); // key -> { minStart, minCount, dayStart, dayCount }

function memCheck(key, minuteLimit, dayLimit) {
  const now = Date.now();
  const entry = mem.get(key) || {
    minStart: now,
    minCount: 0,
    dayStart: now,
    dayCount: 0,
  };
  if (now - entry.minStart >= 60000) {
    entry.minStart = now;
    entry.minCount = 0;
  }
  if (now - entry.dayStart >= 86400000) {
    entry.dayStart = now;
    entry.dayCount = 0;
  }
  entry.minCount += 1;
  entry.dayCount += 1;
  mem.set(key, entry);
  // Prune the map so a long-lived instance cannot grow it without bound.
  if (mem.size > 10000) {
    for (const [k, v] of mem) {
      if (now - v.dayStart >= 86400000) mem.delete(k);
    }
  }
  if (entry.minCount > minuteLimit) return { limited: true, retry: 60 };
  if (entry.dayCount > dayLimit) return { limited: true, retry: 3600 };
  return null;
}

// Returns null when the call is allowed, or { limited: true, retry }
// (seconds) when the caller must back off.
export async function checkRateLimit(key, minuteLimit, dayLimit) {
  const redis = getRedis();
  if (!redis) return memCheck(key, minuteLimit, dayLimit);
  try {
    const now = new Date();
    const minuteKey = `rl:${key}:min:${Math.floor(now.getTime() / 60000)}`;
    const dayKey = `rl:${key}:day:${now.toISOString().slice(0, 10)}`;
    const [minCount, dayCount] = await Promise.all([
      redis.incr(minuteKey),
      redis.incr(dayKey),
    ]);
    if (minCount === 1) await redis.expire(minuteKey, 90); // 90s safety margin
    if (dayCount === 1) await redis.expire(dayKey, 90000); // 25h safety margin
    if (minCount > minuteLimit) return { limited: true, retry: 60 };
    if (dayCount > dayLimit) return { limited: true, retry: 3600 };
    return null;
  } catch (e) {
    console.warn('[rateLimit] Redis failed, using in-memory fallback:', e.message);
    return memCheck(key, minuteLimit, dayLimit);
  }
}

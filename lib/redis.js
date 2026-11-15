// Shared Redis client (Vercel KV / Upstash).
//
// SECURITY FIX: the Vercel KV integration provisions KV_REST_API_URL /
// KV_REST_API_TOKEN, but the API routes were written against
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Live, neither
// UPSTASH_* var exists, so every Redis feature silently failed open:
// rate limits were skipped and server auth / sync were unusable, which
// pushed the app onto a reversible localStorage "auth" fallback.
// Accept both names (Upstash names first) so the provisioned store is
// actually used. Returns null when nothing is configured — callers must
// fail closed (503), never silently proceed without it.
import { Redis } from '@upstash/redis';

let _redis = null;
let _tried = false;

export function getRedis() {
  if (_tried) return _redis;
  _tried = true;
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    // retry: false — a down/slow store must fail fast and closed (callers
    // turn Redis errors into 401/503 or an in-memory rate limit), not hang
    // the request in a retry loop until the function times out.
    _redis = new Redis({ url, token, retry: false });
  } catch (e) {
    console.warn('[redis] failed to init client:', e.message);
    _redis = null;
  }
  return _redis;
}

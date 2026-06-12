// Helpers for the plain Vercel functions in /api/*.js to authorise against the
// Better Auth session cookie and enforce per-tier scan quotas. (Brief 3)
import { createHmac } from 'crypto';
import { auth } from './auth.js';
import { getSql } from './db.js';

// Monthly scan quota by billing tier. Server-enforced — the client only displays.
export const TIER_QUOTA = { free: 25, hobbyist: 200, seller: 1500 };
export const ANON_TRIAL_LIMIT = 3; // logged-out trial scans (signed cookie)

export function quotaForTier(tier) {
  return TIER_QUOTA[tier] || TIER_QUOTA.free;
}

// Current billing period as 'YYYY-MM' (UTC).
export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

// Convert a Node req.headers object into a WHATWG Headers instance so
// better-auth can read the session cookie.
function toHeaders(req) {
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (v == null) continue;
    h.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  }
  return h;
}

// Returns { user, session } or null. Never throws.
export async function getAuthSession(req) {
  try {
    return await auth.api.getSession({ headers: toHeaders(req) });
  } catch {
    return null;
  }
}

// Atomically increment this user's scan count for the current period and return
// the post-increment usage, or a structured over-quota result. Server-side only.
// { ok:true, used, limit, tier, period } | { ok:false, overQuota:true, ... }
export async function meterScan(userId, tier) {
  const sql = getSql();
  const period = currentPeriod();
  const limit = quotaForTier(tier);
  if (!sql) {
    // No DB configured → fail open (don't block scanning on infra gaps).
    return { ok: true, used: 0, limit, tier, period, metered: false };
  }
  // Upsert + increment in one statement; RETURNING gives the new count.
  const rows = await sql`
    INSERT INTO usage (user_id, period, scans_used)
    VALUES (${userId}, ${period}, 1)
    ON CONFLICT (user_id, period)
    DO UPDATE SET scans_used = usage.scans_used + 1
    RETURNING scans_used`;
  const used = Number(rows[0]?.scans_used || 0);
  if (used > limit) {
    // Roll the increment back so the meter shows exactly `limit`, not limit+N.
    try {
      await sql`UPDATE usage SET scans_used = ${limit} WHERE user_id = ${userId} AND period = ${period}`;
    } catch {}
    return { ok: false, overQuota: true, used: limit, limit, tier, period };
  }
  return { ok: true, used, limit, tier, period, metered: true };
}

// Read-only usage snapshot for the meter UI.
export async function readUsage(userId, tier) {
  const sql = getSql();
  const period = currentPeriod();
  const limit = quotaForTier(tier);
  let used = 0;
  if (sql) {
    try {
      const rows = await sql`SELECT scans_used FROM usage WHERE user_id = ${userId} AND period = ${period}`;
      used = Number(rows[0]?.scans_used || 0);
    } catch {}
  }
  return { used, limit, tier, period, remaining: Math.max(0, limit - used) };
}

// ── Anonymous trial: up to ANON_TRIAL_LIMIT scans, tracked in a signed cookie ──
// The signature stops a logged-out visitor from simply editing the count; the
// only bypass is clearing cookies, which is fine for a 3-scan teaser.
const TRIAL_COOKIE = 'lbl_trial';
const trialSecret = () => process.env.BETTER_AUTH_SECRET || 'lbl-dev-trial-secret';

function signTrial(count) {
  return createHmac('sha256', trialSecret()).update('trial:' + count).digest('hex').slice(0, 24);
}

// Read + verify the trial count from the request cookies (0 if absent/tampered).
export function readTrialCount(req) {
  const raw = req.headers?.cookie || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + TRIAL_COOKIE + '=([^;]+)'));
  if (!m) return 0;
  const [count, sig] = decodeURIComponent(m[1]).split('.');
  const n = parseInt(count, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return sig === signTrial(n) ? n : 0;
}

// Set-Cookie value persisting the new trial count (httpOnly, 1 year).
export function makeTrialCookie(count) {
  const value = `${count}.${signTrial(count)}`;
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${TRIAL_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax;${secure}`;
}

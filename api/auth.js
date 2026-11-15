// Server auth — the ONLY auth authority. Passwords are PBKDF2-hashed
// (100k rounds, sha512, per-user salt) and stored in Redis; sessions are
// random 32-byte tokens in Redis with a 30-day TTL.
//
// SECURITY FIXES (Nov 2026):
// - Redis is resolved via lib/redis.js, which accepts the Vercel KV names
//   (KV_REST_API_URL / KV_REST_API_TOKEN) as well as the UPSTASH_* names
//   the code used to look for. Live, only the KV names exist, so auth
//   previously could never work and the clients fell back to a reversible
//   base64 "password hash" in localStorage. That fallback is removed.
// - When Redis is not configured the endpoint now fails closed (503)
//   instead of crashing or letting a client-side fallback take over.
// - Login/register attempts are rate-limited per IP (auth is the one
//   route that must work before a session exists).
// - Password length (>= 6) and email format are enforced server-side,
//   not just in the browser.
// - No CORS headers: this API is same-origin only. A wildcard CORS
//   header on an auth endpoint lets any website call it from a victim's
//   browser.
import { pbkdf2Sync, randomBytes } from 'crypto';
import { getRedis } from '../lib/redis.js';
import { checkRateLimit } from '../lib/rateLimit.js';

const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function hashPw(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

function verifyPw(pw, stored) {
  if (typeof stored !== 'string') return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex') === hash;
}

function makeToken() {
  return randomBytes(32).toString('hex');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const redis = getRedis();
  if (!redis) {
    return res.status(503).json({
      error:
        'Auth is unavailable — the server session store (Redis / Vercel KV) is not configured. Sign-in is disabled rather than falling back to insecure local auth.',
    });
  }

  try {
    return await handleAuth(req, res, redis);
  } catch (e) {
    // The session store itself failed (e.g. its database was deleted —
    // the KV host no longer resolves). Fail closed with a clear 503,
    // never a bare 500 and never a silent fallback to local auth.
    console.warn('[auth] session store error:', e.message);
    return res.status(503).json({
      error:
        'Auth is temporarily unavailable — the session store could not be reached. Please try again later.',
    });
  }
}

async function handleAuth(req, res, redis) {

  const { action, name, email, password, newPassword } = req.body || {};

  if (action === 'verify') {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const sess = await redis.get(`session:${token}`);
    if (!sess) return res.status(401).json({ error: 'Session expired' });
    return res.status(200).json(sess);
  }

  if (action === 'change-password') {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const sess = await redis.get(`session:${token}`);
    if (!sess) return res.status(401).json({ error: 'Session expired' });
    const user = await redis.get(`user:${sess.email}`);
    if (!user || !verifyPw(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ error: 'New password too short' });
    user.passwordHash = hashPw(newPassword);
    await redis.set(`user:${sess.email}`, user);
    return res.status(200).json({ ok: true });
  }

  if (action === 'delete-account') {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const sess = await redis.get(`session:${token}`);
    if (!sess) return res.status(401).json({ error: 'Session expired' });
    await redis.del(`user:${sess.email}`);
    await redis.del(`inventory:${sess.userId}`);
    await redis.del(`session:${token}`);
    return res.status(200).json({ ok: true });
  }

  // Login / register: rate-limit per IP before touching credentials.
  const limited = await checkRateLimit(`auth:${clientIp(req)}`, 10, 100);
  if (limited) {
    res.setHeader('Retry-After', String(limited.retry));
    return res
      .status(429)
      .json({ error: 'Too many sign-in attempts — wait a moment and try again.' });
  }

  if (!email || !password)
    return res.status(400).json({ error: 'Missing email or password' });
  if (!isValidEmail(email))
    return res.status(400).json({ error: 'Enter a valid email address.' });
  const emailKey = `user:${email.toLowerCase().trim()}`;

  if (action === 'register') {
    if (password.length < 6)
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters.' });
    const existing = await redis.get(emailKey);
    if (existing)
      return res
        .status(400)
        .json({ error: 'An account with that email already exists.' });
    const userId = randomBytes(8).toString('hex');
    const user = {
      id: userId,
      name: (name || '').trim() || email.split('@')[0],
      email: email.toLowerCase().trim(),
      passwordHash: hashPw(password),
      plan: 'free',
      features: ['export', 'lookup'],
      createdAt: Date.now(),
    };
    await redis.set(emailKey, user);
    const token = makeToken();
    const sessData = {
      userId,
      name: user.name,
      email: user.email,
      plan: user.plan,
      features: user.features,
    };
    await redis.set(`session:${token}`, sessData, { ex: TOKEN_TTL_SEC });
    return res.status(200).json({ token, ...sessData });
  }

  if (action === 'login') {
    const user = await redis.get(emailKey);
    if (!user || !verifyPw(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    const token = makeToken();
    const sessData = {
      userId: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      features: user.features,
    };
    await redis.set(`session:${token}`, sessData, { ex: TOKEN_TTL_SEC });
    return res.status(200).json({ token, ...sessData });
  }

  return res.status(400).json({ error: 'Invalid action' });
}

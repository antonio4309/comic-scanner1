// Server session helpers. Sessions live only in Redis
// (`session:<token>`), created by /api/auth with PBKDF2-hashed passwords.
// There is no local / client-side session authority: a token the server
// cannot find in Redis is not a session.
import { getRedis } from './redis.js';

export async function getSession(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const redis = getRedis();
  if (!redis) return null;
  try {
    const sess = await redis.get(`session:${token}`);
    return sess || null;
  } catch (e) {
    console.warn('[session] lookup failed:', e.message);
    return null;
  }
}

// Use at the top of every authenticated route. Sends 401 and returns null
// when there is no valid session; otherwise returns the session object.
export async function requireSession(req, res) {
  const sess = await getSession(req);
  if (!sess) {
    res.status(401).json({ error: 'Not authenticated — please sign in again.' });
    return null;
  }
  return sess;
}

// Inventory sync (server copy of the user's comics).
// Authenticated only — a Bearer session token from /api/auth is required.
// Fails closed (503) when Redis is not configured instead of silently
// pretending the sync worked; the client keeps localStorage as its cache
// and retries later.
import { getRedis } from '../lib/redis.js';
import { requireSession } from '../lib/session.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const redis = getRedis();
  if (!redis) {
    return res.status(503).json({
      error: 'Sync is unavailable — the server session store (Redis / Vercel KV) is not configured.',
    });
  }

  const sess = await requireSession(req, res);
  if (!sess) return; // 401 already sent

  try {
    if (req.method === 'GET') {
      const inventory = (await redis.get(`inventory:${sess.userId}`)) || [];
      return res.status(200).json({ inventory });
    }

    if (req.method === 'POST') {
      const { inventory } = req.body || {};
      if (!Array.isArray(inventory))
        return res.status(400).json({ error: 'Expected inventory array' });
      if (inventory.length > 5000)
        return res.status(400).json({ error: 'Inventory too large' });
      // Strip base64 thumbnails — they are UI-only, imageUrl covers actual photos
      const toStore = inventory.map(({ thumb, ...rest }) => rest);
      await redis.set(`inventory:${sess.userId}`, toStore);
      return res.status(200).json({ ok: true });
    }
  } catch (e) {
    // The session store itself failed — fail closed, the client keeps its
    // localStorage copy and retries later.
    console.warn('[sync] session store error:', e.message);
    return res.status(503).json({
      error: 'Sync is temporarily unavailable — the session store could not be reached.',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

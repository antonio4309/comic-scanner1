import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

async function getSession(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return redis.get(`session:${auth.slice(7)}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sess = await getSession(req);
  if (!sess) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const inventory = await redis.get(`inventory:${sess.userId}`) || [];
    return res.status(200).json({ inventory });
  }

  if (req.method === 'POST') {
    const { inventory } = req.body || {};
    if (!Array.isArray(inventory)) return res.status(400).json({ error: 'Expected inventory array' });
    // Strip base64 thumbnails — they are UI-only, imageUrl covers actual photos
    const toStore = inventory.map(({ thumb, ...rest }) => rest);
    await redis.set(`inventory:${sess.userId}`, toStore);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

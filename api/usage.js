// Read-only scan-usage snapshot for the meter UI (Brief 3).
// The client only DISPLAYS this; the quota itself is enforced in /api/identify.
import { getAuthSession, readUsage } from '../lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getAuthSession(req);
  if (!session?.user?.id) return res.status(401).json({ error: 'Not authenticated' });

  const tier = session.user.tier || 'free';
  const usage = await readUsage(session.user.id, tier);
  return res.status(200).json(usage);
}

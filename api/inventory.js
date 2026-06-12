// Per-user inventory, scoped to the Better Auth session user (Brief 3).
// Replaces the old Redis-backed /api/sync. Same client contract:
//   GET  → { inventory: [...] }            (this user's comics)
//   POST { inventory: [...] }  → replaces  (upsert by client id + prune)
import { getSql } from '../lib/db.js';
import { getAuthSession } from '../lib/session.js';

// Map a client comic object to the promoted columns we report on.
function promote(c) {
  const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  return {
    client_id: String(c.id),
    title: c.title || null,
    issue: c.issue || null,
    publisher: c.publisher || null,
    year: c.year || null,
    condition: c.condition || null,
    grade: c.conditionGrade || c.slabGrade || null,
    purchase_price: num(c.costPrice),
    est_value: num(c.ebayPrice),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = await getAuthSession(req);
  if (!session?.user?.id) return res.status(401).json({ error: 'Not authenticated' });
  const userId = session.user.id;

  const sql = getSql();
  if (!sql) return res.status(500).json({ error: 'Database not configured' });

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT data FROM inventory WHERE user_id = ${userId} ORDER BY created_at ASC`;
      const inventory = rows.map((r) => r.data).filter(Boolean);
      return res.status(200).json({ inventory });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load inventory: ' + e.message });
    }
  }

  if (req.method === 'POST') {
    const { inventory } = req.body || {};
    if (!Array.isArray(inventory)) return res.status(400).json({ error: 'Expected inventory array' });
    try {
      // Strip UI-only base64 thumbnails; imageUrl covers real photos.
      const comics = inventory.map(({ thumb, ...rest }) => rest).filter((c) => c && c.id != null);
      const ids = comics.map((c) => String(c.id));

      // Upsert each comic, keyed by (user_id, client_id).
      for (const c of comics) {
        const p = promote(c);
        await sql`
          INSERT INTO inventory
            (user_id, client_id, title, issue, publisher, year, condition, grade, purchase_price, est_value, data)
          VALUES
            (${userId}, ${p.client_id}, ${p.title}, ${p.issue}, ${p.publisher}, ${p.year},
             ${p.condition}, ${p.grade}, ${p.purchase_price}, ${p.est_value}, ${JSON.stringify(c)}::jsonb)
          ON CONFLICT (user_id, client_id) DO UPDATE SET
            title = EXCLUDED.title, issue = EXCLUDED.issue, publisher = EXCLUDED.publisher,
            year = EXCLUDED.year, condition = EXCLUDED.condition, grade = EXCLUDED.grade,
            purchase_price = EXCLUDED.purchase_price, est_value = EXCLUDED.est_value, data = EXCLUDED.data`;
      }

      // Prune rows the client no longer has (a delete on the client).
      if (ids.length) {
        await sql`DELETE FROM inventory WHERE user_id = ${userId} AND client_id <> ALL(${ids})`;
      } else {
        await sql`DELETE FROM inventory WHERE user_id = ${userId}`;
      }
      return res.status(200).json({ ok: true, count: comics.length });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save inventory: ' + e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

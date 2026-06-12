// TEMP (Brief 3 migration) — returns the runtime DATABASE_URL so the migration
// can be run against Neon. Gated by the BETTER_AUTH_SECRET via header.
// DELETE this immediately after migrating.
export default function handler(req, res) {
  const token = req.headers['x-migrate-token'];
  if (!token || token !== process.env.BETTER_AUTH_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.status(200).json({ url: process.env.DATABASE_URL || null });
}

import { list, del } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Vercel Cron Jobs send: Authorization: Bearer <CRON_SECRET>
  // Manual calls must supply the same header
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  let deleted = 0;
  let cursor;

  do {
    const result = await list({ prefix: 'comic-images/', cursor, limit: 1000 });
    const old = result.blobs.filter(b => new Date(b.uploadedAt).getTime() < cutoffMs);
    if (old.length) {
      await del(old.map(b => b.url));
      deleted += old.length;
    }
    cursor = result.cursor;
  } while (cursor);

  return res.status(200).json({ deleted, message: `Deleted ${deleted} image(s) older than 24h` });
}

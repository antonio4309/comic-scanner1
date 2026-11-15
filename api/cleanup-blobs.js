// Deletes comic images older than 24h from Vercel Blob storage.
// Called by the Vercel Cron in vercel.json (daily 03:00).
//
// SECURITY FIX: this used to run for anyone when CRON_SECRET was unset
// (`if (process.env.CRON_SECRET && ...)`), and CRON_SECRET was never set
// in Vercel — so anyone on the internet could delete every image older
// than a day. It now fails closed: without CRON_SECRET configured the
// endpoint always refuses, and a caller must present it as a Bearer
// token. Set CRON_SECRET in Vercel (Production) to any long random
// string; Vercel Cron sends it automatically on scheduled runs.
import { list, del } from '@vercel/blob';

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET) {
    return res.status(503).json({
      error:
        'Cleanup is disabled — CRON_SECRET is not configured. Set it in Vercel env vars to enable the scheduled cleanup.',
    });
  }
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  let deleted = 0;
  let cursor;

  do {
    const result = await list({ prefix: 'comic-images/', cursor, limit: 1000 });
    const old = result.blobs.filter(
      (b) => new Date(b.uploadedAt).getTime() < cutoffMs
    );
    if (old.length) {
      await del(old.map((b) => b.url));
      deleted += old.length;
    }
    cursor = result.cursor;
  } while (cursor);

  return res
    .status(200)
    .json({ deleted, message: `Deleted ${deleted} image(s) older than 24h` });
}

// Uploads a comic cover photo to Vercel Blob (public URL, used as the
// comic's imageUrl).
//
// SECURITY FIXES: this used to accept uploads from anyone, with no size
// or type check and a client-supplied filename — a free public file host
// paid for by this project. It now requires a signed-in session, accepts
// images only (JPEG/PNG/WebP, max 5 MB), and ignores the client filename
// — the stored name is server-generated.
import { put } from '@vercel/blob';
import { requireSession } from '../lib/session.js';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const sess = await requireSession(req, res);
  if (!sess) return; // 401 already sent

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error:
        'Vercel Blob not connected. Go to your Vercel project → Storage → Create a Blob store and link it to this project.',
    });
  }

  const contentType = req.headers['content-type'] || '';
  const ext = ALLOWED_TYPES[contentType.split(';')[0].trim().toLowerCase()];
  if (!ext) {
    return res.status(400).json({
      error: 'Only JPEG, PNG and WebP images are accepted.',
    });
  }

  try {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        return res
          .status(413)
          .json({ error: 'Image is too large (max 5 MB).' });
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (!buffer.length)
      return res.status(400).json({ error: 'No image data received' });

    // Server-generated name: user id + timestamp + random suffix, so a
    // crafted filename can never traverse directories or overwrite
    // another user's file.
    const filename = `comic-images/${sess.userId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const blob = await put(filename, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Blob upload error:', err);
    return res.status(500).json({ error: 'Image upload failed: ' + err.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

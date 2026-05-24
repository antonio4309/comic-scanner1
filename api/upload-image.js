import { put } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-filename');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'Vercel Blob not connected. Go to your Vercel project → Storage → Create a Blob store and link it to this project.' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (!buffer.length) return res.status(400).json({ error: 'No image data received' });

    const filename = req.headers['x-filename'] || `comic-${Date.now()}.jpg`;

    const blob = await put(`comic-images/${filename}`, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: req.headers['content-type'] || 'image/jpeg'
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Blob upload error:', err);
    return res.status(500).json({ error: 'Image upload failed: ' + err.message });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

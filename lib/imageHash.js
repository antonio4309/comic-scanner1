// Perceptual hashing + book identity helpers.
import sharp from 'sharp';

// 64-bit dHash (difference hash).
// Grayscale → resize to 9x8 → compare each pixel to its right neighbour,
// row-wise, producing 8 rows x 8 comparisons = 64 bits.
// Returns a signed 64-bit BigInt so it maps cleanly onto Postgres BIGINT.
export async function dHash(buffer) {
  const W = 9, H = 8;
  const { data, info } = await sharp(buffer)
    .grayscale()
    .resize(W, H, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels || 1; // grayscale raw may still report 3 channels
  const px = (row, col) => data[(row * W + col) * ch]; // first channel = luma

  let hash = 0n;
  let bit = 0n;
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W - 1; col++) {
      if (px(row, col) > px(row, col + 1)) hash |= (1n << bit);
      bit++;
    }
  }
  return BigInt.asIntN(64, hash);
}

// Normalised key for a book's identity: lowercase, strip punctuation,
// collapse whitespace, join with "|". e.g. bookKey('Amazing Spider-Man','#300','Marvel Comics')
// => "amazing spiderman|300|marvel comics"
export function bookKey(title, issue, publisher) {
  const norm = (s) =>
    String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[^\w\s]/g, '')   // strip punctuation (# - : etc.)
      .replace(/\s+/g, ' ')
      .trim();
  return [norm(title), norm(issue), norm(publisher)].join('|');
}

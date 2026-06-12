// Whatnot CSV export — a SELLER-tier feature, gated server-side (Brief 3).
// Builds the CSV from the user's own server-side inventory so the gate can't be
// bypassed by editing client JS. Mirrors buildCSV() in public/app.js.
import { getSql } from '../lib/db.js';
import { getAuthSession } from '../lib/session.js';

function csvCell(value) {
  const s = String(value == null ? '' : value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function getWhatnotPrice(c) {
  if (c.priceOverride != null) return c.priceOverride;
  const base = c.customPrice != null ? c.customPrice : c.ebayPrice;
  if (!base || base <= 0) return null;
  return Math.ceil(base * 1.15);
}
function getSubcategory(year) {
  const y = Number(year);
  if (!y || Number.isNaN(y)) return 'Modern Comics';
  return y < 1985 ? 'Vintage Comics' : 'Modern Comics';
}
function toWhatnotCondition(condition, isSlabbed) {
  if (isSlabbed) return 'Like New';
  const c = (condition || '').toLowerCase();
  if (c.includes('near mint') || c.includes('mint')) return 'Like New';
  if (c.includes('very fine')) return 'Like New';
  if (c.includes('fine')) return 'Good';
  if (c.includes('very good')) return 'Good';
  if (c.includes('good')) return 'Good';
  if (c.includes('fair') || c.includes('poor')) return 'Acceptable';
  return 'Good';
}

function buildCSV(comics) {
  const headers = [
    'Category','Subcategory','Title','Description','Quantity','Type','Price',
    'Shipping Profile','Offerable','Hazmat','Condition','Cost Per Item','Sku',
    'Image URL 1','Image URL 2','Image URL 3','Image URL 4','Image URL 5','Image URL 6','Image URL 7','Image URL 8',
  ];
  const rows = [headers];
  for (const c of comics) {
    const title = `${c.title || 'Unknown'}${c.issue && c.issue !== 'Unknown' ? ' #' + c.issue : ''}`.trim();
    const keyText = (c.firstAppearance && c.firstAppearance !== 'Unknown')
      ? c.firstAppearance
      : ((c.keyInfo && c.keyInfo !== 'Unknown') ? c.keyInfo : '');
    const pubYear = [
      c.publisher && c.publisher !== 'Unknown' ? c.publisher : '',
      c.year && c.year !== 'Unknown' ? c.year : '',
    ].filter(Boolean).join(' ');
    const descParts = [
      keyText,
      c.isVariant && c.variantDetails ? c.variantDetails : '',
      pubYear,
      c.importantCharacters && c.importantCharacters !== 'Unknown' ? `Features ${c.importantCharacters}` : '',
    ].filter(Boolean).join(' · ') || 'Comic book listing';
    const price = c.listingType === 'Auction' && c.startingBid != null
      ? c.startingBid
      : (getWhatnotPrice(c) || '');
    const shippingProfile = c.isSlabbed ? 'Graded slab' : c.isBundle ? 'Bulk comics lot' : 'Bagged and boarded raw comic';
    rows.push([
      'Comics & Manga', getSubcategory(c.year), title, descParts,
      c.qty || 1, c.listingType || 'Buy it Now', price,
      shippingProfile, 'Yes', 'Not Hazmat',
      toWhatnotCondition(c.condition, c.isSlabbed), '', '',
      c.imageUrl || '', '', '', '', '', '', '', '',
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getAuthSession(req);
  if (!session?.user?.id) return res.status(401).json({ error: 'Not authenticated' });

  // ── The gate: Whatnot CSV export is a seller-tier feature. ──
  const tier = session.user.tier || 'free';
  if (tier !== 'seller') {
    return res.status(403).json({
      error: 'Whatnot CSV export is a Seller-plan feature.',
      tier, requiredTier: 'seller', upgradeUrl: '/pricing',
    });
  }

  const sql = getSql();
  if (!sql) return res.status(500).json({ error: 'Database not configured' });

  try {
    const dbRows = await sql`SELECT data FROM inventory WHERE user_id = ${session.user.id} ORDER BY created_at ASC`;
    const comics = dbRows.map((r) => r.data).filter(Boolean);
    if (!comics.length) return res.status(400).json({ error: 'No comics to export' });

    const csv = buildCSV(comics);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="whatnot_comics_${stamp}.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: 'Export failed: ' + e.message });
  }
}

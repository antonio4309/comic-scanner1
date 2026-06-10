import { bookKey } from '../lib/imageHash.js';
import { getCachedPrice } from '../lib/priceCache.js';

// ── LISTING CLASSIFICATION ────────────────────────────────────────────────────

function classifyListing(title = '') {
  const t = title.toLowerCase();

  if (/\b(facsimile|replica|reproduction|reprint)\b/.test(t)) return 'REPRINT';
  if (/\b(lot|bundle|collection)\b/.test(t) || /\bset of \d/i.test(t)) return 'LOT';
  if (/\b(poster|shirt|t-shirt|figure|funko|dvd|blu-ray|sticker|magnet|badge|digital|pdf|empty|custom)\b/.test(t)) return 'MERCH';

  // Only classify as graded if the grading company is NOT negated
  // e.g. "raw not CGC" or "ungraded no CGC" should stay RAW
  const negated = /\b(not|un|no|raw|ungraded)\b.{0,10}(cgc|cbcs|pgx|slab|graded)\b/.test(t)
    || /\b(cgc|cbcs|pgx|slab|graded).{0,10}\b(not|free|without)\b/.test(t);

  if (!negated) {
    if (/\bcgc\b/.test(t)) return 'CGC';
    if (/\bcbcs\b/.test(t)) return 'CBCS';
    if (/\bpgx\b/.test(t)) return 'PGX';
    if (/\b(slab|slabbed)\b/.test(t)) return 'GRADED';
  }

  return 'RAW';
}

function isValidListing(title, searchType) {
  const type = classifyListing(title);
  if (type === 'REPRINT' || type === 'LOT' || type === 'MERCH') return false;
  if (searchType === 'RAW')  return type === 'RAW';
  if (searchType === 'CGC')  return type === 'CGC';
  if (searchType === 'CBCS') return type === 'CBCS';
  if (searchType === 'PGX')  return type === 'PGX';
  return true;
}

// ── QUERY BUILDER ─────────────────────────────────────────────────────────────

const CORE_NEG = '-lot -reprint -facsimile -poster -figure -funko -shirt -dvd -digital';

function san(str) {
  return String(str || '').replace(/"/g, '').trim();
}

function buildQueries({ q, title, issue, year, edition, isSlabbed, slabCompany, slabGrade }) {
  const hasStructured = title && title !== 'Unknown' && issue && issue !== 'Unknown';

  if (!hasStructured) {
    const base = san(q || '');
    if (isSlabbed) {
      const co = (san(slabCompany) || 'CGC').toUpperCase();
      return [{ query: `${base} ${CORE_NEG}`, type: co }];
    }
    return [
      { query: `${base} ${CORE_NEG}`, type: 'RAW' },
      { query: san(q || ''), type: 'RAW' },
    ];
  }

  const t = `"${san(title)}"`;
  const i = `"${san(issue)}"`;
  const y = year && year !== 'Unknown' ? san(year) : '';

  // Graded slab
  if (isSlabbed && slabCompany) {
    const co = san(slabCompany).toUpperCase();
    const gr = san(slabGrade);
    if (gr) {
      return [
        { query: `${t} ${i} "${co} ${gr}" ${CORE_NEG}`, type: co },
        { query: `${t} ${i} ${co} ${gr} ${CORE_NEG}`, type: co },
      ];
    }
    return [{ query: `${t} ${i} ${co} ${CORE_NEG}`, type: co }];
  }

  // Newsstand
  if (edition === 'Newsstand') {
    return [
      { query: `${t} ${i} ${y} newsstand ${CORE_NEG}`.trim(), type: 'RAW' },
      { query: `${t} ${i} newsstand ${CORE_NEG}`.trim(), type: 'RAW' },
    ];
  }

  // Canadian Price Variant
  if (edition === 'Canadian Price Variant') {
    return [
      { query: `${t} ${i} ${y} canadian ${CORE_NEG}`.trim(), type: 'RAW' },
      { query: `${t} ${i} ${y} ${CORE_NEG}`.trim(), type: 'RAW' },
    ];
  }

  // Standard raw
  return [
    { query: `${t} ${i} ${y} comic ${CORE_NEG}`.trim(), type: 'RAW' },
    { query: `${t} ${i} ${CORE_NEG}`.trim(), type: 'RAW' },
  ];
}

// ── RECENCY WEIGHT ────────────────────────────────────────────────────────────

function recencyWeight(endDate) {
  if (!endDate) return 0.5;
  const days = (Date.now() - new Date(endDate).getTime()) / 86400000;
  if (days <= 7)  return 1.0;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.5;
  return 0.2;
}

// ── IQR OUTLIER REMOVAL ───────────────────────────────────────────────────────

function removeOutliers(prices) {
  if (prices.length < 4) return prices;
  const s = [...prices].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  const fence = (q3 - q1) * 1.5;
  return prices.filter(p => p >= q1 - fence && p <= q3 + fence);
}

// ── WEIGHTED MEDIAN ───────────────────────────────────────────────────────────

function weightedMedian(items) {
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((s, i) => s + i.w, 0);
  let cum = 0;
  for (const item of sorted) {
    cum += item.w;
    if (cum >= total / 2) return item.price;
  }
  return sorted[sorted.length - 1].price;
}

// ── STATS + CONFIDENCE ────────────────────────────────────────────────────────

function calculateStats(results) {
  const weighted = results
    .map(r => ({ price: Number(r.price), w: recencyWeight(r.endDate) }))
    .filter(r => r.price > 0.5 && r.price < 100000 && !isNaN(r.price));

  if (!weighted.length) return null;

  const rawPrices = weighted.map(r => r.price);
  const cleanPrices = removeOutliers(rawPrices);
  const lo = Math.min(...cleanPrices);
  const hi = Math.max(...cleanPrices);
  const clean = weighted.filter(r => r.price >= lo && r.price <= hi);

  if (!clean.length) return null;

  const sorted = clean.map(i => i.price).sort((a, b) => a - b);
  const marketPrice = weightedMedian(clean);
  const avg = clean.reduce((s, i) => s + i.price, 0) / clean.length;
  const avgW = clean.reduce((s, i) => s + i.w, 0) / clean.length;

  const n = clean.length;
  const sizeScore = Math.min(n / 15, 1) * 50;
  const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0];
  const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1];
  const spread = marketPrice > 0 ? (p75 - p25) / marketPrice : 1;
  const varianceScore = Math.max(0, 1 - spread * 2) * 30;
  const recencyScore = avgW * 20;
  const confidence = Math.min(Math.round(sizeScore + varianceScore + recencyScore), 100);

  return {
    count: n,
    prices: sorted,
    marketPrice: +marketPrice.toFixed(2),
    median: +marketPrice.toFixed(2),
    average: +avg.toFixed(2),
    min: +sorted[0].toFixed(2),
    max: +sorted[sorted.length - 1].toFixed(2),
    confidence,
  };
}

// ── OAUTH TOKEN ───────────────────────────────────────────────────────────────

async function getOAuthToken(scope = 'https://api.ebay.com/oauth/api_scope') {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
  });
  const d = await r.json();
  return d.access_token || null;
}

// ── SOLD DATA: MARKETPLACE INSIGHTS API ──────────────────────────────────────
// Real sold transaction data. Requires buy.marketplace.insights OAuth scope,
// which needs explicit approval from eBay Developer Support.
// This replaces the decommissioned Finding API (findCompletedItems).

async function searchSoldInsights(query, type) {
  try {
    const token = await getOAuthToken('https://api.ebay.com/oauth/api_scope/buy.marketplace.insights');
    if (!token) return null; // Scope not granted yet — fall through silently

    const url = `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search` +
      `?q=${encodeURIComponent(query)}&limit=50&category_ids=259104`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return (data.itemSales || []).map(item => ({
      title:        item.title || '',
      price:        Number(item.lastSoldPrice?.value || item.price?.value || 0),
      currency:     item.lastSoldPrice?.currency || 'GBP',
      url:          item.itemWebUrl || '',
      image:        item.image?.imageUrl || '',
      condition:    item.condition || '',
      endDate:      item.itemEndDate || item.lastSoldDate || '',
      country:      item.itemLocation?.country || '',
      location:     '',
      shippingCost: null,
      sold:         true,
    }));
  } catch {
    return null;
  }
}

// ── ACTIVE LISTINGS: BROWSE API ───────────────────────────────────────────────
// Fallback when sold data is unavailable. Prices are asking prices, not sold.
// Confidence is capped at 30 to reflect this uncertainty.

async function searchActive(query) {
  const token = await getOAuthToken('https://api.ebay.com/oauth/api_scope');
  if (!token) return null;

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=30&category_ids=259104`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
      },
    }
  );

  if (!res.ok) return null;
  const data = await res.json();

  return (data.itemSummaries || []).map(item => ({
    title:        item.title || '',
    price:        Number(item.price?.value || 0),
    currency:     item.price?.currency || 'GBP',
    url:          item.itemWebUrl || '',
    image:        item.image?.imageUrl || '',
    condition:    item.condition || '',
    endDate:      '',
    country:      '',
    location:     '',
    shippingCost: null,
    sold:         false,
  }));
}

// ── HANDLER ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'eBay OAuth credentials not configured (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)' });
  }

  const { q, title, issue, year, edition, isSlabbed, slabCompany, slabGrade, publisher } = req.query;
  if (!q && !title) return res.status(400).json({ error: 'Missing search query' });

  const params = {
    q: q || '',
    title: title || '',
    issue: issue || '',
    year: year || '',
    edition: edition || '',
    isSlabbed: isSlabbed === '1' || isSlabbed === 'true',
    slabCompany: slabCompany || '',
    slabGrade: slabGrade || '',
    publisher: publisher || '',
  };

  // Build a cache key from book identity + grade context (raw vs CGC 9.8 vs
  // newsstand price very differently, so they must cache separately).
  const gradeCtx = params.isSlabbed
    ? `slab:${(params.slabCompany || 'cgc').toLowerCase()} ${params.slabGrade || ''}`.trim()
    : (params.edition && params.edition !== 'Unknown' ? `ed:${params.edition.toLowerCase()}` : 'raw');
  const hasIdent = params.title && params.title !== 'Unknown' && params.issue && params.issue !== 'Unknown';
  const cacheKey = (hasIdent
    ? bookKey(params.title, params.issue, params.publisher)
    : 'q|' + String(params.q || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
  ) + '|' + gradeCtx;

  try {
    const payload = await getCachedPrice(cacheKey, () => liveLookup(params));
    if (payload.cached) console.log('[price-cache] HIT', cacheKey, '— zero eBay calls');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[ebay] handler error:', err.message);
    return res.status(502).json({ error: 'eBay fetch failed: ' + err.message });
  }
}

// ── LIVE eBay LOOKUP (called on cache miss) ───────────────────────────────────
// Returns the price payload object (found:false or found:true). No caching here.
async function liveLookup(params) {
  const queries = buildQueries(params);
  const primaryType = queries[0]?.type || 'RAW';

  {
    let bestResults = [];
    let usedQuery = '';
    let isSoldData = false;

    // 1. Try Marketplace Insights (real sold data — requires scope approval)
    for (const { query, type } of queries) {
      const raw = await searchSoldInsights(query, type);
      if (raw === null) break; // Scope not available — skip to active listings
      const filtered = raw.filter(r => r.price > 0 && isValidListing(r.title, type));
      if (filtered.length >= 3) { bestResults = filtered; usedQuery = query; isSoldData = true; break; }
      if (filtered.length > bestResults.length) { bestResults = filtered; usedQuery = query; isSoldData = true; }
    }

    // 2. Fall back to Browse API active listings
    if (!bestResults.length) {
      for (const { query, type } of queries) {
        const raw = await searchActive(query);
        if (!raw) break;
        const filtered = raw.filter(r => r.price > 0 && isValidListing(r.title, type));
        if (filtered.length >= 3) { bestResults = filtered; usedQuery = query; break; }
        if (filtered.length > bestResults.length) { bestResults = filtered; usedQuery = query; }
      }
    }

    const stats = calculateStats(bestResults);

    if (!stats) {
      return {
        found: false,
        query: params.q || '',
        usedQuery,
        gradeBucket: primaryType,
        source: 'No usable eBay results',
        results: [],
      };
    }

    // Cap confidence for active-listing estimates (asking price ≠ sold price)
    const confidence = isSoldData ? stats.confidence : Math.min(stats.confidence, 30);

    return {
      found: true,
      query: params.q || '',
      usedQuery,
      gradeBucket: primaryType,
      source: isSoldData ? 'eBay UK sold listings' : 'eBay UK active listings (estimate)',
      count: stats.count,
      prices: stats.prices,
      marketPrice: stats.marketPrice,
      median: stats.median,
      average: stats.average,
      min: stats.min,
      max: stats.max,
      confidence,
      currency: 'GBP',
      whatnotPrice: Math.ceil(stats.marketPrice * 1.15),
      lastSold: (() => {
        const r = bestResults.find(x => x.sold && x.price > 0);
        if (!r) return null;
        return {
          title:        r.title,
          price:        r.price,
          url:          r.url,
          endDate:      r.endDate,
          country:      r.country,
          location:     r.location,
          shippingCost: r.shippingCost,
        };
      })(),
      results: bestResults.slice(0, 10).map(r => ({
        title:        r.title,
        price:        r.price,
        url:          r.url,
        image:        r.image,
        endDate:      r.endDate,
        country:      r.country,
        location:     r.location,
        shippingCost: r.shippingCost,
        sold:         r.sold,
      })),
    };
  }
}

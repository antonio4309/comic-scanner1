// ── LISTING CLASSIFICATION ────────────────────────────────────────────────────

function classifyListing(title = '') {
  const t = title.toLowerCase();

  // Always-bad categories
  if (/\b(facsimile|replica|reproduction)\b/.test(t)) return 'REPRINT';
  if (/\breprint\b/.test(t)) return 'REPRINT';
  if (/\b(lot|bundle|collection)\b/.test(t) || /\bset of \d/i.test(t)) return 'LOT';
  if (/\b(poster|shirt|t-shirt|figure|funko|pop!?|dvd|blu-ray|sticker|magnet|badge|digital|pdf|empty|custom)\b/.test(t)) return 'MERCH';

  // Grade companies
  if (/\bcgc\b/.test(t)) return 'CGC';
  if (/\bcbcs\b/.test(t)) return 'CBCS';
  if (/\bpgx\b/.test(t)) return 'PGX';
  if (/\b(slab|slabbed|graded)\b/.test(t)) return 'GRADED';

  return 'RAW';
}

// Returns true if the listing is valid for the given search type
function isValidListing(title, searchType) {
  const type = classifyListing(title);
  if (type === 'REPRINT' || type === 'LOT' || type === 'MERCH') return false;
  if (searchType === 'RAW') return type === 'RAW';
  if (searchType === 'CGC') return type === 'CGC';
  if (searchType === 'CBCS') return type === 'CBCS';
  if (searchType === 'PGX') return type === 'PGX';
  return true;
}

// ── QUERY BUILDER ─────────────────────────────────────────────────────────────

const BASE_NEG = '-lot -bundle -"set of" -reprint -facsimile -poster -figure -funko -shirt -dvd -digital -pdf -sticker';
const GRADE_NEG = '-cgc -cbcs -pgx -slab -graded';

function san(str) {
  return String(str || '').replace(/"/g, '').trim();
}

function buildQueries({ q, title, issue, year, edition, isSlabbed, slabCompany, slabGrade }) {
  const hasStructured = title && title !== 'Unknown' && issue && issue !== 'Unknown';

  if (!hasStructured) {
    const base = san(q || '');
    if (isSlabbed) {
      const co = san(slabCompany).toUpperCase() || 'CGC';
      return [{ query: `${base} -lot -reprint -facsimile`, type: co }];
    }
    return [{ query: `${base} ${GRADE_NEG} -lot -reprint -facsimile`, type: 'RAW' }];
  }

  const t = `"${san(title)}"`;
  const i = `"${san(issue)}"`;
  const y = year && year !== 'Unknown' ? san(year) : '';

  // Graded comic
  if (isSlabbed && slabCompany) {
    const co = san(slabCompany).toUpperCase();
    const gr = san(slabGrade);
    const queries = [];
    if (gr) {
      queries.push({ query: `${t} ${i} "${co} ${gr}" ${BASE_NEG}`, type: co });
      queries.push({ query: `${t} ${i} ${co} ${gr} ${BASE_NEG}`, type: co });
    } else {
      queries.push({ query: `${t} ${i} ${co} ${BASE_NEG}`, type: co });
    }
    return queries;
  }

  // Newsstand edition
  if (edition === 'Newsstand') {
    return [
      { query: `${t} ${i} ${y} newsstand ${GRADE_NEG} ${BASE_NEG}`.trim(), type: 'RAW' },
      { query: `${t} ${i} newsstand ${GRADE_NEG} ${BASE_NEG}`.trim(), type: 'RAW' },
    ];
  }

  // Canadian Price Variant
  if (edition === 'Canadian Price Variant') {
    return [
      { query: `${t} ${i} ${y} canadian ${GRADE_NEG} ${BASE_NEG}`.trim(), type: 'RAW' },
      { query: `${t} ${i} ${y} ${GRADE_NEG} ${BASE_NEG}`.trim(), type: 'RAW' },
    ];
  }

  // Standard raw comic
  return [
    { query: `${t} ${i} ${y} ${GRADE_NEG} ${BASE_NEG}`.trim(), type: 'RAW' },
    { query: `${t} ${i} ${GRADE_NEG} ${BASE_NEG}`.trim(), type: 'RAW' },
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
  const cleanSet = new Set(cleanPrices);
  // Keep only items whose price survived outlier removal
  const clean = weighted.filter(r => {
    const min = Math.min(...cleanPrices);
    const max = Math.max(...cleanPrices);
    return r.price >= min && r.price <= max && cleanSet.has(r.price);
  });

  if (!clean.length) return null;

  const sorted = clean.map(i => i.price).sort((a, b) => a - b);
  const marketPrice = weightedMedian(clean);
  const avg = clean.reduce((s, i) => s + i.price, 0) / clean.length;
  const avgW = clean.reduce((s, i) => s + i.w, 0) / clean.length;

  // Confidence: size (0-50) + variance (0-30) + recency (0-20)
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

// ── EBAY FINDING API (SOLD ONLY) ──────────────────────────────────────────────

async function searchSold(query, appId) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const url = [
    'https://svcs.ebay.co.uk/services/search/FindingService/v1',
    '?OPERATION-NAME=findCompletedItems',
    '&SERVICE-VERSION=1.13.0',
    `&SECURITY-APPNAME=${appId}`,
    '&RESPONSE-DATA-FORMAT=JSON',
    '&GLOBAL-ID=EBAY-GB',
    '&siteid=3',
    `&keywords=${encodeURIComponent(query)}`,
    '&categoryId=259104',
    '&itemFilter(0).name=SoldItemsOnly',
    '&itemFilter(0).value=true',
    '&itemFilter(1).name=EndTimeFrom',
    `&itemFilter(1).value=${since}`,
    '&itemFilter(2).name=LocatedIn',
    '&itemFilter(2).value=GB',
    '&sortOrder=StartTimeNewest',
    '&paginationInput.entriesPerPage=50',
  ].join('');

  const r = await fetch(url);
  if (!r.ok) throw new Error(`eBay Finding API returned ${r.status}`);
  const data = await r.json();
  const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

  return items.map(item => ({
    title: item.title?.[0] || '',
    price: Number(item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 0),
    currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'GBP',
    url: item.viewItemURL?.[0] || '',
    image: item.galleryURL?.[0] || '',
    condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
    endDate: item.listingInfo?.[0]?.endTime?.[0] || '',
    sold: true,
  }));
}

// ── HANDLER ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const appId = process.env.EBAY_APP_ID;
  if (!appId) return res.status(500).json({ error: 'EBAY_APP_ID not configured' });

  const { q, title, issue, year, edition, isSlabbed, slabCompany, slabGrade } = req.query;
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
  };

  const queries = buildQueries(params);
  const primaryType = queries[0]?.type || 'RAW';

  try {
    let bestResults = [];
    let usedQuery = '';

    for (const { query, type } of queries) {
      const raw = await searchSold(query, appId);
      const filtered = raw.filter(r => r.price > 0 && isValidListing(r.title, type));

      if (filtered.length >= 3) {
        bestResults = filtered;
        usedQuery = query;
        break;
      }
      // Keep the largest set seen so far as fallback
      if (filtered.length > bestResults.length) {
        bestResults = filtered;
        usedQuery = query;
      }
    }

    const stats = calculateStats(bestResults);

    if (!stats) {
      return res.status(200).json({
        found: false,
        query: q || '',
        usedQuery,
        gradeBucket: primaryType,
        source: 'No usable eBay sold results',
        results: [],
      });
    }

    return res.status(200).json({
      found: true,
      query: q || '',
      usedQuery,
      gradeBucket: primaryType,
      source: 'eBay UK sold listings',
      count: stats.count,
      prices: stats.prices,
      marketPrice: stats.marketPrice,
      median: stats.median,
      average: stats.average,
      min: stats.min,
      max: stats.max,
      confidence: stats.confidence,
      currency: 'GBP',
      whatnotPrice: Math.ceil(stats.marketPrice * 1.15),
      results: bestResults.slice(0, 10).map(r => ({
        title: r.title,
        price: r.price,
        url: r.url,
        image: r.image,
        endDate: r.endDate,
      })),
    });
  } catch (err) {
    console.error('eBay pricing error:', err);
    return res.status(502).json({ error: 'eBay fetch failed: ' + err.message });
  }
}

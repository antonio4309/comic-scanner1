// ── LISTING CLASSIFICATION ────────────────────────────────────────────────────

function classifyListing(title = '') {
  const t = title.toLowerCase();

  if (/\b(facsimile|replica|reproduction|reprint)\b/.test(t)) return 'REPRINT';
  if (/\b(lot|bundle|collection)\b/.test(t) || /\bset of \d/i.test(t)) return 'LOT';
  if (/\b(poster|shirt|t-shirt|figure|funko|dvd|blu-ray|sticker|magnet|badge|digital|pdf|empty|custom)\b/.test(t)) return 'MERCH';

  // Only classify as graded if the grade company is NOT negated
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
  if (searchType === 'RAW') return type === 'RAW';
  if (searchType === 'CGC') return type === 'CGC';
  if (searchType === 'CBCS') return type === 'CBCS';
  if (searchType === 'PGX') return type === 'PGX';
  return true;
}

// ── QUERY BUILDER ─────────────────────────────────────────────────────────────
// Keep query short — eBay truncates long keyword strings.
// Negative keywords in the query handle the obvious junk; the classifier
// handles graded vs raw after we receive results.

const CORE_NEG = '-lot -reprint -facsimile -poster -figure -funko -shirt -dvd -digital';

function san(str) {
  return String(str || '').replace(/"/g, '').trim();
}

function buildQueries({ q, title, issue, year, edition, isSlabbed, slabCompany, slabGrade }) {
  const hasStructured = title && title !== 'Unknown' && issue && issue !== 'Unknown';

  if (!hasStructured) {
    // Fall back to the AI-generated search query
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

// ── EBAY FINDING API (SOLD) ───────────────────────────────────────────────────

async function searchSold(query, appId) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const url = [
    'https://svcs.ebay.com/services/search/FindingService/v1',
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
    '&sortOrder=StartTimeNewest',
    '&paginationInput.entriesPerPage=50',
  ].join('');

  console.log('[ebay] Finding API query:', query.slice(0, 120));
  const r = await fetch(url);
  console.log('[ebay] Finding API status:', r.status);
  if (!r.ok) {
    const body = await r.text();
    console.error('[ebay] Finding API error body:', body.slice(0, 600));
    throw new Error(`eBay Finding API returned ${r.status}`);
  }
  const data = await r.json();
  const ack = data?.findCompletedItemsResponse?.[0]?.ack?.[0];
  const errMsg = data?.findCompletedItemsResponse?.[0]?.errorMessage?.[0]?.error?.[0]?.message?.[0];
  console.log('[ebay] Finding API ack:', ack, errMsg ? '| error: ' + errMsg : '');
  const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

  return items.map(item => {
    const shipInfo = item.shippingInfo?.[0];
    const shipCostRaw = shipInfo?.shippingServiceCost?.[0]?.['__value__'];
    const shipType = shipInfo?.shippingType?.[0] || '';
    const shippingCost = shipType === 'Free' ? 0
      : shipCostRaw != null ? Number(shipCostRaw)
      : null;

    return {
      title: item.title?.[0] || '',
      price: Number(item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 0),
      currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'GBP',
      url: item.viewItemURL?.[0] || '',
      image: item.galleryURL?.[0] || '',
      condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
      endDate: item.listingInfo?.[0]?.endTime?.[0] || '',
      country: item.country?.[0] || '',
      location: item.location?.[0] || '',
      shippingCost,
      sold: true,
    };
  });
}

// Scrape eBay completed-items search page (no API key required)
async function searchSoldScrape(query) {
  try {
    const params = new URLSearchParams({
      _nkw: query,
      LH_Sold: '1',
      LH_Complete: '1',
      _sop: '13',   // newest first
      _ipg: '50',
      _sacat: '259104',
    });
    const url = `https://www.ebay.co.uk/sch/i.html?${params}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    console.log('[ebay] Scrape status:', r.status, 'url:', url.slice(0, 120));
    if (!r.ok) return null;
    const html = await r.text();
    console.log('[ebay] Scrape HTML length:', html.length);

    // Extract items — eBay embeds structured s-item blocks in the HTML for SEO
    const items = [];
    // Split on item boundaries (each sold result has data-viewport)
    const blocks = html.split(/s-item__info|s-item clearfix/);

    for (const block of blocks) {
      // Title
      const titleM = block.match(/s-item__title[^>]*>([^<]{5,120})<\/span>/);
      // Price in GBP
      const priceM = block.match(/£([\d,]+\.\d{2})/);
      // Date sold
      const dateM = block.match(/SOLD\s+([\w]+ \d+,?\s*\d*)/i) || block.match(/(\d+ [A-Za-z]+ \d{4})/);
      // Item URL
      const urlM = block.match(/href="(https:\/\/www\.ebay\.co\.uk\/itm\/[^"]+)"/);

      if (!priceM) continue;
      const price = parseFloat(priceM[1].replace(',', ''));
      if (!price || price < 0.5) continue;

      const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title || title.toLowerCase().includes('shop on ebay')) continue;

      items.push({
        title,
        price,
        currency: 'GBP',
        url: urlM ? urlM[1] : '',
        image: '',
        condition: '',
        endDate: dateM ? dateM[1] : '',
        country: 'GB',
        location: '',
        shippingCost: null,
        sold: true,
      });
    }

    console.log('[ebay] Scrape extracted', items.length, 'items');
    return items.length > 0 ? items : null;
  } catch (e) {
    console.warn('[ebay] Scrape error:', e.message);
    return null;
  }
}

// Helper: get OAuth application token
async function getOAuthToken(scope = 'https://api.ebay.com/oauth/api_scope') {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) { console.warn('[ebay] OAuth: missing CLIENT_ID or CLIENT_SECRET'); return null; }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
  });
  const d = await tokenRes.json();
  const shortScope = scope.split('/').pop();
  if (!d.access_token) {
    console.warn(`[ebay] OAuth token failed (scope=${shortScope}):`, d.error, d.error_description);
  } else {
    console.log(`[ebay] OAuth token OK (scope=${shortScope})`);
  }
  return d.access_token || null;
}

// Marketplace Insights API — returns actual SOLD items via OAuth
// (requires buy.marketplace.insights scope — may need special eBay approval)
async function searchSoldInsights(query) {
  try {
    const token = await getOAuthToken('https://api.ebay.com/oauth/api_scope/buy.marketplace.insights');
    if (!token) return null;

    const url = `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search` +
      `?q=${encodeURIComponent(query)}&limit=50&category_ids=259104`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
      },
    });
    console.log('[ebay] Marketplace Insights status:', res.status);
    if (!res.ok) return null;

    const data = await res.json();
    return (data.itemSales || []).map(item => ({
      title: item.title || '',
      price: Number(item.lastSoldPrice?.value || item.price?.value || 0),
      currency: item.lastSoldPrice?.currency || 'GBP',
      url: item.itemWebUrl || '',
      image: item.image?.imageUrl || '',
      condition: item.condition || '',
      endDate: item.itemEndDate || item.lastSoldDate || '',
      country: item.itemLocation?.country || '',
      location: '',
      shippingCost: null,
      sold: true,
    }));
  } catch (e) {
    console.warn('[ebay] Marketplace Insights error:', e.message);
    return null;
  }
}

// Active listings as last-resort fallback (lower confidence, clearly labelled)
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
  const data = await res.json();
  return (data.itemSummaries || []).map(item => ({
    title: item.title || '',
    price: Number(item.price?.value || 0),
    currency: item.price?.currency || 'GBP',
    url: item.itemWebUrl || '',
    image: item.image?.imageUrl || '',
    condition: item.condition || '',
    endDate: '',
    sold: false,
  }));
}

// ── HANDLER ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // EBAY_APP_ID and EBAY_CLIENT_ID are the same credential — fall back gracefully
  const appId = process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID;
  console.log('[ebay] appId source:', process.env.EBAY_APP_ID ? 'EBAY_APP_ID' : process.env.EBAY_CLIENT_ID ? 'EBAY_CLIENT_ID (fallback)' : 'MISSING');
  if (!appId) return res.status(500).json({ error: 'No eBay App ID configured (set EBAY_APP_ID or EBAY_CLIENT_ID)' });

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
    let isSoldData = true;

    // Try sold listings first (Finding API — may not be available on all accounts)
    let soldApiWorking = true;
    for (const { query, type } of queries) {
      try {
        const raw = await searchSold(query, appId);
        const filtered = raw.filter(r => r.price > 0 && isValidListing(r.title, type));
        if (filtered.length >= 3) {
          bestResults = filtered;
          usedQuery = query;
          break;
        }
        if (filtered.length > bestResults.length) {
          bestResults = filtered;
          usedQuery = query;
        }
      } catch (soldErr) {
        console.warn('[ebay] sold search failed (rate limit / sandbox key?):', soldErr.message);
        soldApiWorking = false;
        break; // stop trying sold queries, go straight to active fallback
      }
    }

    // Marketplace Insights API fallback — real sold data via OAuth
    if (!bestResults.length) {
      for (const { query, type } of queries) {
        const raw = await searchSoldInsights(query);
        if (!raw) break; // API not available for this account
        const filtered = raw.filter(r => r.price > 0 && isValidListing(r.title, type));
        console.log('[ebay] Insights results:', raw.length, '| filtered:', filtered.length);
        if (filtered.length >= 3) {
          bestResults = filtered; usedQuery = query; break;
        }
        if (filtered.length > bestResults.length) {
          bestResults = filtered; usedQuery = query;
        }
      }
      if (bestResults.length) isSoldData = true; // insights gives real sold data
    }

    // Scrape eBay completed-items page — no API key needed
    if (!bestResults.length) {
      for (const { query, type } of queries) {
        const raw = await searchSoldScrape(query);
        if (!raw) break;
        const filtered = raw.filter(r => r.price > 0 && isValidListing(r.title, type));
        console.log('[ebay] Scrape filtered:', filtered.length, '/', raw.length);
        if (filtered.length >= 2) {
          bestResults = filtered; usedQuery = query; isSoldData = true; break;
        }
        if (filtered.length > bestResults.length) {
          bestResults = filtered; usedQuery = query; isSoldData = true;
        }
      }
    }

    // Active listing fallback — last resort
    if (!bestResults.length) {
      isSoldData = false;
      for (const { query, type } of queries) {
        const raw = await searchActive(query);
        if (!raw) break;
        const filtered = raw.filter(r => r.price > 0 && isValidListing(r.title, type));
        if (filtered.length >= 3) {
          bestResults = filtered; usedQuery = query; break;
        }
        if (filtered.length > bestResults.length) {
          bestResults = filtered; usedQuery = query;
        }
      }
    }

    console.log('[ebay] bestResults count:', bestResults.length, '| isSoldData:', isSoldData, '| usedQuery:', usedQuery.slice(0, 80));
    const stats = calculateStats(bestResults);

    if (!stats) {
      return res.status(200).json({
        found: false,
        query: q || '',
        usedQuery,
        gradeBucket: primaryType,
        source: 'No usable eBay results',
        results: [],
      });
    }

    // Cap confidence for active-listing estimates
    const confidence = isSoldData ? stats.confidence : Math.min(stats.confidence, 30);

    return res.status(200).json({
      found: true,
      query: q || '',
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
          title: r.title,
          price: r.price,
          url: r.url,
          endDate: r.endDate,
          country: r.country,
          location: r.location,
          shippingCost: r.shippingCost,
        };
      })(),
      results: bestResults.slice(0, 10).map(r => ({
        title: r.title,
        price: r.price,
        url: r.url,
        image: r.image,
        endDate: r.endDate,
        country: r.country,
        location: r.location,
        shippingCost: r.shippingCost,
        sold: r.sold,
      })),
    });
  } catch (err) {
    console.error('[ebay] HANDLER ERROR:', err.message);
    console.error('[ebay] stack:', err.stack);
    return res.status(502).json({ error: 'eBay fetch failed: ' + err.message });
  }
}

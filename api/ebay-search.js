function isBadListing(title = '') {
  const lower = title.toLowerCase();
  const badWords = [
    'facsimile', 'reprint', 'poster', 'print', 'shirt', 't-shirt', 'figure',
    'funko', 'pop', 'dvd', 'blu-ray', 'sticker', 'card', 'magnet', 'badge'
  ];
  return badWords.some(word => lower.includes(word));
}

function calculateStats(results) {
  let prices = results
    .map(r => Number(r.price))
    .filter(p => !Number.isNaN(p) && p > 1 && p < 100000)
    .sort((a, b) => a - b);

  if (!prices.length) return null;

  // Drop one extreme high/low outlier when there are enough results.
  const trimmed = prices.length > 8 ? prices.slice(1, prices.length - 1) : prices;
  const mid = Math.floor(trimmed.length / 2);
  const median = trimmed.length % 2 === 0
    ? (trimmed[mid - 1] + trimmed[mid]) / 2
    : trimmed[mid];
  const avg = trimmed.reduce((s, p) => s + p, 0) / trimmed.length;

  return {
    prices: trimmed,
    median: Number(median.toFixed(2)),
    average: Number(avg.toFixed(2)),
    min: Number(trimmed[0].toFixed(2)),
    max: Number(trimmed[trimmed.length - 1].toFixed(2))
  };
}

async function searchWithBrowseAPI(searchTerm) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Could not get eBay token');

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchTerm)}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB'
      }
    }
  );

  const data = await res.json();
  const items = data.itemSummaries || [];

  return items.map(item => ({
    title: item.title || '',
    price: Number(item.price?.value || 0),
    currency: item.price?.currency || 'GBP',
    url: item.itemWebUrl || '',
    image: item.image?.imageUrl || '',
    condition: item.condition || ''
  }));
}

async function searchWithFindingAPI(searchTerm) {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) return null;

  const ebayUrl = [
    'https://svcs.ebay.co.uk/services/search/FindingService/v1',
    '?OPERATION-NAME=findCompletedItems',
    '&SERVICE-VERSION=1.0.0',
    `&SECURITY-APPNAME=${appId}`,
    '&RESPONSE-DATA-FORMAT=JSON',
    '&GLOBAL-ID=EBAY-GB',
    '&siteid=3',
    `&keywords=${encodeURIComponent(searchTerm)}`,
    '&categoryId=259104',
    '&itemFilter(0).name=SoldItemsOnly',
    '&itemFilter(0).value=true',
    '&sortOrder=EndTimeSoonest',
    '&paginationInput.entriesPerPage=50'
  ].join('');

  const response = await fetch(ebayUrl);
  if (!response.ok) throw new Error(`eBay Finding API returned ${response.status}`);
  const data = await response.json();

  const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

  return items.map(item => ({
    title: item.title?.[0] || '',
    price: Number(item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 0),
    currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'GBP',
    url: item.viewItemURL?.[0] || '',
    image: item.galleryURL?.[0] || '',
    condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
    endTime: item.listingInfo?.[0]?.endTime?.[0] || ''
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, condition } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing search query' });

  const searchTerm = `${q} comic -facsimile -reprint -poster -print -shirt -figure -funko`.trim();

  try {
    let source = 'eBay Browse API active listings';
    let results = await searchWithBrowseAPI(searchTerm);

    if (!results) {
      source = 'eBay Finding API sold listings';
      results = await searchWithFindingAPI(condition ? `${searchTerm} ${condition}` : searchTerm);
    }

    if (!results) {
      return res.status(500).json({ error: 'No eBay credentials configured. Add EBAY_CLIENT_ID + EBAY_CLIENT_SECRET or EBAY_APP_ID.' });
    }

    results = results
      .filter(r => r.price > 0 && !isBadListing(r.title))
      .slice(0, 30);

    const stats = calculateStats(results);

    if (!stats) {
      return res.status(200).json({ found: false, source, results: [] });
    }

    return res.status(200).json({
      found: true,
      source,
      count: stats.prices.length,
      median: stats.median,
      average: stats.average,
      min: stats.min,
      max: stats.max,
      currency: 'GBP',
      results: results.slice(0, 10)
    });
  } catch (err) {
    console.error('eBay fetch error:', err);
    return res.status(502).json({ error: 'Failed to fetch from eBay: ' + err.message });
  }
}

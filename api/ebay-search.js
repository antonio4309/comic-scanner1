function isBadListing(title = '') {
  const lower = title.toLowerCase();

  const badWords = [
    'facsimile',
    'reprint',
    'poster',
    'print',
    'shirt',
    't-shirt',
    'figure',
    'funko',
    'pop',
    'dvd',
    'blu-ray',
    'sticker',
    'card',
    'magnet',
    'badge',
    'cgc',
    'cbcs',
    'slab',
    'graded',
    '9.8',
    '9.6',
    '9.4',
    'pgx',
    'lot',
    'bundle',
    'set of'
  ];

  return badWords.some(word => lower.includes(word));
}

function cleanSearchQuery(q = '') {
  return q
    .replace(/#/g, '')
    .replace(/\band\b/gi, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateStats(results) {
  let prices = results
    .map(r => Number(r.price))
    .filter(p => !Number.isNaN(p) && p > 1 && p < 100000)
    .sort((a, b) => a - b);

  if (!prices.length) return null;

  if (prices.length > 6) {
    prices = prices.slice(1, prices.length - 1);
  }

  const mid = Math.floor(prices.length / 2);

  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];

  const average =
    prices.reduce((sum, price) => sum + price, 0) / prices.length;

  const conservativeIndex = Math.floor(prices.length * 0.35);
  const marketPrice = prices[conservativeIndex] || median;

  return {
    prices,
    median: Number(median.toFixed(2)),
    average: Number(average.toFixed(2)),
    marketPrice: Number(marketPrice.toFixed(2)),
    min: Number(prices[0].toFixed(2)),
    max: Number(prices[prices.length - 1].toFixed(2))
  };
}

async function searchSoldWithFindingAPI(searchTerm) {
  const appId = process.env.EBAY_APP_ID;

  if (!appId) return null;

  const ebayUrl = [
    'https://svcs.ebay.co.uk/services/search/FindingService/v1',
    '?OPERATION-NAME=findCompletedItems',
    '&SERVICE-VERSION=1.13.0',
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

  if (!response.ok) {
    throw new Error(`Finding API returned ${response.status}`);
  }

  const data = await response.json();

  const items =
    data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

  return items.map(item => ({
    title: item.title?.[0] || '',
    price: Number(
      item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 0
    ),
    currency:
      item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'GBP',
    url: item.viewItemURL?.[0] || '',
    image: item.galleryURL?.[0] || '',
    condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
    sold: true
  }));
}

async function searchActiveWithBrowseAPI(searchTerm) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch(
    'https://api.ebay.com/identity/v1/oauth2/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body:
        'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error('Could not get eBay token');
  }

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
      searchTerm
    )}&limit=50`,
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
    condition: item.condition || '',
    sold: false
  }));
}

function filterResults(results = []) {
  return results
    .filter(r => {
      if (!r.price || r.price <= 0) return false;
      if (isBadListing(r.title)) return false;
      return true;
    })
    .slice(0, 30);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const { q } = req.query;

  if (!q) {
    return res.status(400).json({
      error: 'Missing search query'
    });
  }

  const cleaned = cleanSearchQuery(q);

  const searches = [
    `${cleaned} comic`,
    cleaned,
    `${cleaned} raw comic`,
    `${cleaned} marvel comic`,
    `${cleaned} dc comic`
  ];

  try {
    let finalResults = [];
    let usedQuery = '';
    let source = '';

    for (const search of searches) {
      const soldResults = await searchSoldWithFindingAPI(search);

      if (soldResults) {
        const filteredSold = filterResults(soldResults);

        if (filteredSold.length >= 1) {
          finalResults = filteredSold;
          usedQuery = search;
          source = 'eBay UK sold listings';
          break;
        }
      }
    }

    if (!finalResults.length) {
      for (const search of searches) {
        const activeResults = await searchActiveWithBrowseAPI(search);

        if (activeResults) {
          const filteredActive = filterResults(activeResults);

          if (filteredActive.length >= 3) {
            finalResults = filteredActive;
            usedQuery = search;
            source = 'eBay UK active listings fallback';
            break;
          }
        }
      }
    }

    const stats = calculateStats(finalResults);

    if (!stats) {
      return res.status(200).json({
        found: false,
        query: cleaned,
        tried: searches,
        source: 'No usable eBay results',
        results: []
      });
    }

    return res.status(200).json({
      found: true,
      query: cleaned,
      usedQuery,
      source,
      count: stats.prices.length,
      prices: stats.prices,
      median: stats.median,
      average: stats.average,
      marketPrice: stats.marketPrice,
      min: stats.min,
      max: stats.max,
      currency: 'GBP',
      whatnotPrice: Math.ceil(stats.marketPrice * 1.15),
      results: finalResults.slice(0, 10)
    });
  } catch (err) {
    console.error('eBay fetch error:', err);

    return res.status(502).json({
      error: 'Failed to fetch from eBay: ' + err.message
    });
  }
}
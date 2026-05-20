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
    '9.8',
    '9.6',
    'slab',
    'graded'
  ];

  return badWords.some(word => lower.includes(word));
}

function cleanSearchQuery(q = '') {
  return q
    .replace(/#/g, '')
    .replace(/\band\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateStats(results) {
  let prices = results
    .map(r => Number(r.price))
    .filter(p => !Number.isNaN(p) && p > 1 && p < 100000)
    .sort((a, b) => a - b);

  if (!prices.length) return null;

  // remove extreme outliers
  if (prices.length > 6) {
    prices = prices.slice(1, prices.length - 1);
  }

  // conservative comic pricing
  const index = Math.floor(prices.length * 0.3);

  const median = prices[index];

  const avg =
    prices.reduce((s, p) => s + p, 0) /
    prices.length;

  return {
    prices,
    median: Number(median.toFixed(2)),
    average: Number(avg.toFixed(2)),
    min: Number(prices[0].toFixed(2)),
    max: Number(
      prices[prices.length - 1].toFixed(2)
    )
  };
}

async function searchWithBrowseAPI(searchTerm) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret =
    process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret)
    return null;

  const auth = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString('base64');

  const tokenRes = await fetch(
    'https://api.ebay.com/identity/v1/oauth2/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type':
          'application/x-www-form-urlencoded'
      },
      body:
        'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error(
      'Could not get eBay token'
    );
  }

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
      searchTerm
    )}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'X-EBAY-C-MARKETPLACE-ID':
          'EBAY_GB'
      }
    }
  );

  const data = await res.json();

  const items = data.itemSummaries || [];

  return items.map(item => ({
    title: item.title || '',
    price: Number(
      item.price?.value || 0
    ),
    currency:
      item.price?.currency || 'GBP',
    url: item.itemWebUrl || '',
    image:
      item.image?.imageUrl || '',
    condition:
      item.condition || ''
  }));
}

export default async function handler(
  req,
  res
) {
  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res
      .status(405)
      .json({
        error: 'Method not allowed'
      });
  }

  const { q } = req.query;

  if (!q) {
    return res
      .status(400)
      .json({
        error: 'Missing search query'
      });
  }

  const cleaned =
    cleanSearchQuery(q);

  const searches = [
    `${cleaned} comic`,
    cleaned,
    `${cleaned} marvel`,
    `${cleaned} dc`,
    `${cleaned} raw comic`
  ];

  try {
    let finalResults = [];
    let usedQuery = '';

    for (const search of searches) {
      const results =
        await searchWithBrowseAPI(search);

      if (!results) continue;

      const filtered = results
        .filter(
          r =>
            r.price > 0 &&
            !isBadListing(r.title)
        )
        .slice(0, 30);

      if (filtered.length >= 3) {
        finalResults = filtered;
        usedQuery = search;
        break;
      }
    }

    const stats =
      calculateStats(finalResults);

    if (!stats) {
      return res.status(200).json({
        found: false,
        query: cleaned,
        tried: searches,
        results: []
      });
    }

    return res.status(200).json({
      found: true,
      query: cleaned,
      usedQuery,
      count: stats.prices.length,
      median: stats.median,
      average: stats.average,
      min: stats.min,
      max: stats.max,
      currency: 'GBP',

      whatnotPrice: Math.ceil(
        stats.median * 1.15
      ),

      results: finalResults.slice(
        0,
        10
      )
    });
  } catch (err) {
    console.error(
      'eBay fetch error:',
      err
    );

    return res.status(502).json({
      error:
        'Failed to fetch from eBay: ' +
        err.message
    });
  }
}
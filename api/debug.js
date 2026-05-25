// Debug endpoint — shows which env vars are present (NOT their values)
// NOTE: eBay Finding API decommissioned May 2025. EBAY_APP_ID no longer needed.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown',
    note: 'Finding API decommissioned. Using Browse API (active) + Marketplace Insights (sold, pending scope).',
    env: {
      EBAY_CLIENT_ID: process.env.EBAY_CLIENT_ID
        ? `SET (length=${process.env.EBAY_CLIENT_ID.length})`
        : 'NOT SET — required for eBay OAuth',
      EBAY_CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET
        ? 'SET'
        : 'NOT SET — required for eBay OAuth',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY
        ? 'SET'
        : 'NOT SET — required for comic identification',
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL
        ? 'SET'
        : 'NOT SET — required for auth and rate limiting',
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN
        ? 'SET'
        : 'NOT SET',
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN
        ? 'SET'
        : 'NOT SET — required for photo storage',
    },
  });
}

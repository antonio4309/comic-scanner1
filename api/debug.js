// Temporary debug endpoint — shows which env vars are present (NOT their values)
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const appId = process.env.EBAY_APP_ID || '';

  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown',
    env: {
      EBAY_APP_ID: appId
        ? `SET (length=${appId.length}, starts="${appId.slice(0, 14)}...")`
        : 'NOT SET',
      EBAY_CLIENT_ID: process.env.EBAY_CLIENT_ID
        ? `SET (length=${(process.env.EBAY_CLIENT_ID).length})`
        : 'NOT SET',
      EBAY_CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET
        ? 'SET'
        : 'NOT SET',
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL
        ? 'SET'
        : 'NOT SET',
    },
  });
}

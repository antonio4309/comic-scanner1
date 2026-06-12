// TEMP diagnostic (Brief 3 debugging) — reports which env vars the running
// deployment can see. Booleans / lengths only; never returns secret values.
// Remove once auth is confirmed working.
export default function handler(req, res) {
  const db = process.env.DATABASE_URL || '';
  res.status(200).json({
    vercelEnv: process.env.VERCEL_ENV || null,        // 'preview' | 'production' | 'development'
    nodeEnv: process.env.NODE_ENV || null,
    hasSecret: !!process.env.BETTER_AUTH_SECRET,
    secretLen: (process.env.BETTER_AUTH_SECRET || '').length,
    hasDbUrl: !!db,
    dbPooled: /-pooler/.test(db),                      // Neon pooled host?
    hasApiKey: !!process.env.BETTER_AUTH_API_KEY,
    hasAuthUrl: !!process.env.BETTER_AUTH_URL,
    authUrl: process.env.BETTER_AUTH_URL || null,
  });
}

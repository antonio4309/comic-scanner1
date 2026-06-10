// Run the cache schema against the Neon database in DATABASE_URL.
//   node db/migrate.mjs
// Safe to run repeatedly (uses IF NOT EXISTS).
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is not set. Add the Neon integration in Vercel, then pull the env (e.g. `vercel env pull .env.local`) or set DATABASE_URL in your shell.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const sql = neon(url);

// The Neon HTTP driver runs one statement per call, so split the file.
const statements = readFileSync(join(here, 'schema.sql'), 'utf8')
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

try {
  for (const stmt of statements) {
    await sql.query(stmt);
    console.log('✓', stmt.split('\n')[0].slice(0, 70));
  }
  console.log('\nDone — scan_cache and price_cache are ready.');
} catch (e) {
  console.error('✗ Migration failed:', e.message);
  process.exit(1);
}

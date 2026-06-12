// Better Auth server instance (Brief 3) — self-hosted on the existing Neon DB.
//
// Phase 1: email + password. Phase 2 will add Google sign-in and Resend-powered
// verification / password-reset emails (hooks left commented below).
//
// The same instance is used two ways:
//   • app/api/auth/[...all]/route.ts mounts the HTTP handler (sign-in/up/out…).
//   • The plain Vercel functions in /api/*.js call auth.api.getSession(...) to
//     authorise requests (see lib/session.js).
import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

// One pool per cold start, reused across warm invocations.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Origins we accept auth requests from. VERCEL_URL is the per-deployment domain
// (covers preview deployments); BETTER_AUTH_URL is the stable production URL.
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'http://localhost:3000',
].filter(Boolean);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
  trustedOrigins,

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,            // signing up logs you straight in
    minPasswordLength: 8,
    requireEmailVerification: false, // flips to true in Phase 2 once Resend is wired
    // Phase 2 (needs RESEND_API_KEY + verified domain):
    // sendResetPassword: async ({ user, url }) => sendEmail(user.email, 'Reset your LongboxLens password', url),
  },

  // Phase 2 (needs a Google OAuth client):
  // socialProviders: {
  //   google: {
  //     clientId: process.env.GOOGLE_CLIENT_ID,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  //   },
  // },

  user: {
    // Server-owned billing tier. input:false → clients can never set it; only
    // our own server code (e.g. the Brief 4 webhook) updates it.
    additionalFields: {
      tier: { type: 'string', required: false, defaultValue: 'free', input: false },
    },
    deleteUser: { enabled: true }, // lets a signed-in user delete their own account
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days, matching the old Redis tokens
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  advanced: {
    // Lets the cookie work on the Vercel *.vercel.app preview domains too.
    defaultCookieAttributes: { sameSite: 'lax' },
  },
});

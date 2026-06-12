# Brief 3 — Auth + Per-User Inventory + Scan Metering (setup)

This branch (`brief3-auth-metering`) swaps the old Redis auth for **Better Auth**
on the existing Neon Postgres DB, moves inventory into Postgres, and enforces a
monthly scan quota server-side.

**Nothing works until the env vars below are set and the migrations are run.**
Do this on a Vercel **Preview** deploy first — production login keeps working on
`main` until you merge.

---

## Phase 1 (this branch) — what's live

- Better Auth email + password (`/api/auth/*`), cookie sessions.
- Per-user inventory in Postgres (`/api/inventory`), replacing `/api/sync`.
- Scan metering: free **25** / hobbyist **200** / seller **1500** per month,
  enforced in `/api/identify`. Logged-out visitors get **3** trial scans via a
  signed cookie.
- Usage meter + over-quota upgrade screen in the app.
- One-time localStorage → DB import on first login.
- Whatnot CSV export gated to the **seller** tier (`/api/export-csv`).

## Phase 2 (later) — not in this branch yet

- Google sign-in (needs a Google OAuth client).
- Password-reset / verification emails via Resend (needs account + domain).

The hooks for both are stubbed and commented in `lib/auth.js`.

---

## 1. Environment variables

Add in **Vercel → Project → Settings → Environment Variables** (Preview +
Production), and to a local `.env.local` for running the migration:

| Var                  | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`       | already set (Brief 1, Neon)                                       |
| `BETTER_AUTH_SECRET` | a 32-byte random string — generate with `openssl rand -base64 32`|
| `BETTER_AUTH_URL`    | your production URL, e.g. `https://longboxlens.vercel.app`        |

On preview deployments the auth URL is auto-derived from `VERCEL_URL`, so
`BETTER_AUTH_URL` only needs to be the stable production origin.

## 2. Run the migrations (creates the tables)

```bash
vercel env pull .env.local          # pulls DATABASE_URL + BETTER_AUTH_SECRET locally

# a) Better Auth core tables (user / session / account / verification, incl. tier):
npx @better-auth/cli@latest migrate --config lib/auth.js -y

# b) App tables (inventory + usage) — paste db/schema_brief3.sql into the Neon
#    SQL editor, OR:
node --env-file=.env.local db/migrate.mjs    # if you point it at schema_brief3.sql
```

`db/schema_brief3.sql` references `"user"(id)`, so run (a) before (b).

## 3. Setting a user's tier (until Brief 4 billing exists)

Tier is server-owned (clients can't change it). To make yourself a seller for
testing, in the Neon SQL editor:

```sql
UPDATE "user" SET tier = 'seller' WHERE email = 'you@example.com';
-- tiers: 'free' (25), 'hobbyist' (200), 'seller' (1500)
```

---

## Verifying the acceptance criteria

- **Sign up / out**: use the app on the preview URL.
- **Two users isolated**: register two accounts, add comics to each, confirm
  each only sees their own (`/api/inventory` is cookie-scoped).
- **26th scan blocked server-side** (bypassing the client): sign in, then
  ```bash
  # grab the cookie from the browser devtools (better-auth.session_token)
  for i in $(seq 1 26); do
    curl -s -o /dev/null -w "%{http_code}\n" \
      -X POST https://<preview>/api/identify \
      -H 'Content-Type: application/json' \
      -H 'Cookie: better-auth.session_token=<token>' \
      --data '{"base64":"<any small jpeg base64>"}'
  done
  ```
  The 26th request returns **402** with `{ overQuota: true }`.
- **Import no-dupe**: log in with localStorage comics present → accept import →
  log out and back in → it does not re-import (guarded by `lbl_imported_<uid>`
  and the empty-server check).

## Notes / deliberate choices

- **Clean cutover**: old Redis accounts are not migrated; `api/auth.js` and
  `api/sync.js` were removed. Everyone re-registers under Better Auth.
- Scans are counted **up front** (cache hits and re-scans included) so the cap
  is predictable and unbypassable; not refunded if Gemini later errors.
- The logged-out **3-scan trial is enforced server-side** (signed cookie). The
  client UI still gates the scanner behind login for now — wiring a
  "try without an account" entry into the scanner is a small follow-up.

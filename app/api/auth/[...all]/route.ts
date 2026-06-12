// Mounts every Better Auth endpoint at /api/auth/* (sign-in, sign-up, sign-out,
// get-session, callbacks, …). Node runtime — better-auth + pg need it.
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const runtime = 'nodejs';
export const { GET, POST } = toNextJsHandler(auth);

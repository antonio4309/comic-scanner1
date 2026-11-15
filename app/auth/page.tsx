'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { SignInPage, AuthMode } from '@/components/ui/sign-in';

// ── Auth (server-only) ──────────────────────────────────────────────────────
// SECURITY FIX (Nov 2026): this page used to "log in" entirely in the
// browser, storing a reversible base64 "hash" (btoa(password + suffix))
// in localStorage — anyone with the stored value had the password.
// Accounts now live only in /api/auth (PBKDF2, Redis sessions). This page
// just calls it and stores the returned session token, which /scan.html
// verifies with the server before opening the app.
interface SessionRecord {
  userId: string;
  email: string;
  name: string;
  features: string[];
  plan?: string;
  token?: string;
}

function saveSession(session: SessionRecord): void {
  localStorage.setItem('lbl_session', JSON.stringify(session));
}

async function callAuth(
  action: 'login' | 'register',
  body: Record<string, string>,
): Promise<{ ok: true; session: SessionRecord } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'Sign-in failed.' };
    const session: SessionRecord = {
      userId: data.userId,
      email: data.email,
      name: data.name,
      features: data.features,
      plan: data.plan,
      token: data.token,
    };
    saveSession(session);
    return { ok: true, session };
  } catch {
    return { ok: false, error: 'Connection error. Check your internet and try again.' };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = (searchParams.get('mode') === 'register' ? 'register' : 'login') as AuthMode;
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleModeChange = useCallback((m: AuthMode) => {
    setMode(m);
    setError(null);
    // Keep URL in sync (optional, no hard navigation)
    const url = new URL(window.location.href);
    url.searchParams.set('mode', m);
    window.history.replaceState(null, '', url.toString());
  }, []);

  const handleSignIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!email || !password) {
        setError('Please enter your email and password.');
        return;
      }
      const result = await callAuth('login', { email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Session is saved; navigate to the scanner app
      router.push('/scan.html');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleRegister = useCallback(async (name: string, email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!name.trim()) { setError('Please enter your name.'); return; }
      if (!email)        { setError('Please enter your email.'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

      const result = await callAuth('register', { name, email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Session is saved; navigate to the scanner app
      router.push('/scan.html');
    } finally {
      setLoading(false);
    }
  }, [router]);

  return (
    <SignInPage
      mode={mode}
      onModeChange={handleModeChange}
      onSignIn={handleSignIn}
      onRegister={handleRegister}
      onGoogleSignIn={() => {
        setError('Google sign-in coming soon. Please use email and password for now.');
      }}
      error={error}
      loading={loading}
    />
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthPageInner />
    </Suspense>
  );
}

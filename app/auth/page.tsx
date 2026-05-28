'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { SignInPage, AuthMode } from '@/components/ui/sign-in';

// ── Auth helpers (mirrors app.js logic exactly) ───────────────────────────────

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  features: string[];
  plan?: string;
}

interface SessionRecord {
  userId: string;
  email: string;
  name: string;
  features: string[];
  plan?: string;
}

function hashPw(pw: string): string {
  // Same algorithm as app.js
  return btoa(unescape(encodeURIComponent(pw + '_lbl_2026')));
}

function getUsers(): UserRecord[] {
  try {
    return JSON.parse(localStorage.getItem('lbl_users') || '[]');
  } catch {
    return [];
  }
}

function saveUsers(users: UserRecord[]): void {
  localStorage.setItem('lbl_users', JSON.stringify(users));
}

function saveSession(session: SessionRecord): void {
  localStorage.setItem('lbl_session', JSON.stringify(session));
}

function authLogin(
  email: string,
  password: string,
): { ok: true; session: SessionRecord } | { ok: false; error: string } {
  const users = getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { ok: false, error: 'No account found with that email.' };
  if (user.passwordHash !== hashPw(password)) return { ok: false, error: 'Incorrect password.' };
  const session: SessionRecord = {
    userId: user.id,
    email: user.email,
    name: user.name,
    features: user.features,
    plan: user.plan,
  };
  saveSession(session);
  return { ok: true, session };
}

function authRegister(
  name: string,
  email: string,
  password: string,
): { ok: true; session: SessionRecord } | { ok: false; error: string } {
  const users = getUsers();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'An account with that email already exists.' };
  }
  const user: UserRecord = {
    id: Date.now().toString(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash: hashPw(password),
    features: ['export', 'lookup'],
    plan: 'free',
  };
  users.push(user);
  saveUsers(users);
  const session: SessionRecord = {
    userId: user.id,
    email: user.email,
    name: user.name,
    features: user.features,
    plan: user.plan,
  };
  saveSession(session);
  return { ok: true, session };
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
      const result = authLogin(email, password);
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

      const result = authRegister(name, email, password);
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

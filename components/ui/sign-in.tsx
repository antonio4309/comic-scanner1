'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, BookOpen, TrendingUp, FileSpreadsheet, Star } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuthMode = 'login' | 'register';

export interface SignInPageProps {
  mode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  onSignIn?: (email: string, password: string, remember: boolean) => Promise<void> | void;
  onRegister?: (name: string, email: string, password: string) => Promise<void> | void;
  onGoogleSignIn?: () => void;
  error?: string | null;
  loading?: boolean;
}

// ── Feature bullets shown in the right panel ──────────────────────────────────

const FEATURES = [
  {
    icon: BookOpen,
    label: 'AI Comic Identification',
    desc: 'Instant title, issue, publisher and grade from a photo.',
  },
  {
    icon: TrendingUp,
    label: 'Live UK eBay Pricing',
    desc: 'Real sold-listing data pulled fresh every search.',
  },
  {
    icon: FileSpreadsheet,
    label: 'Whatnot CSV Export',
    desc: 'One-click export with all required seller fields.',
  },
  {
    icon: Star,
    label: 'Key Issue Detection',
    desc: 'Flags first appearances, variants and census rarity.',
  },
] as const;

// ── GlassInput ────────────────────────────────────────────────────────────────

function GlassInput({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(212,197,193,0.12)] bg-[rgba(248,246,242,0.04)] backdrop-blur-sm transition-colors focus-within:border-[rgba(255,142,62,0.55)] focus-within:bg-[rgba(255,142,62,0.06)]">
      {children}
    </div>
  );
}

// ── FeatureCard ───────────────────────────────────────────────────────────────

function FeatureCard({
  icon: Icon,
  label,
  desc,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  delay: string;
}) {
  return (
    <div
      className={`animate-testimonial ${delay} flex items-start gap-3 rounded-2xl bg-[rgba(14,8,7,0.55)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] p-4`}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,142,62,0.15)] border border-[rgba(255,142,62,0.25)]">
        <Icon className="h-4 w-4 text-[#ff8e3e]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#f8f6f2] leading-tight">{label}</p>
        <p className="mt-0.5 text-xs text-[#8c7b78] leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const SignInPage: React.FC<SignInPageProps> = ({
  mode = 'login',
  onModeChange,
  onSignIn,
  onRegister,
  onGoogleSignIn,
  error,
  loading = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Controlled form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(false);

  const isLogin = mode === 'login';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLogin) {
      onSignIn?.(email, password, remember);
    } else {
      onRegister?.(name, email, password);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row font-sans w-full overflow-hidden bg-[#0e0807]">

      {/* ── Left: form ─────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center p-8 md:p-12 relative z-10">
        {/* Subtle radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(255,142,62,0.07) 0%, transparent 70%)',
          }}
        />

        <div className="w-full max-w-[400px] relative">

          {/* Logo */}
          <div className="animate-element animate-delay-50 mb-10 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(255,142,62,0.12)] border border-[rgba(255,142,62,0.25)]">
              <BookOpen className="h-5 w-5 text-[#ff8e3e]" />
            </div>
            <span className="font-semibold text-[#f8f6f2] tracking-tight">
              Longbox<span className="text-[#ff8e3e]">Lens</span>
            </span>
          </div>

          {/* Heading */}
          <h1 className="animate-element animate-delay-100 text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-[#f8f6f2] mb-2">
            {isLogin ? 'Welcome back' : 'Create your archive'}
          </h1>
          <p className="animate-element animate-delay-150 text-sm text-[#8c7b78] mb-8">
            {isLogin
              ? 'Sign in to access your collection and live market data.'
              : 'Free account. Your comics, priced and ready to sell.'}
          </p>

          {/* Mode tabs */}
          <div className="animate-element animate-delay-200 flex rounded-xl border border-[rgba(212,197,193,0.1)] bg-[rgba(248,246,242,0.03)] p-1 mb-7 gap-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange?.(m)}
                className={[
                  'flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200',
                  mode === m
                    ? 'bg-[#ff8e3e] text-[#1a0800] shadow-sm'
                    : 'text-[#8c7b78] hover:text-[#f8f6f2]',
                ].join(' ')}
              >
                {m === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Name (register only) */}
            {!isLogin && (
              <div className="animate-element animate-delay-250">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8c7b78]">
                  Full name
                </label>
                <GlassInput>
                  <input
                    type="text"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full bg-transparent text-sm text-[#f8f6f2] placeholder-[#8c7b78] p-3.5 rounded-xl focus:outline-none"
                  />
                </GlassInput>
              </div>
            )}

            {/* Email */}
            <div className={`animate-element ${isLogin ? 'animate-delay-250' : 'animate-delay-300'}`}>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8c7b78]">
                Email address
              </label>
              <GlassInput>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  className="w-full bg-transparent text-sm text-[#f8f6f2] placeholder-[#8c7b78] p-3.5 rounded-xl focus:outline-none"
                />
              </GlassInput>
            </div>

            {/* Password */}
            <div className={`animate-element ${isLogin ? 'animate-delay-300' : 'animate-delay-350'}`}>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8c7b78]">
                Password
              </label>
              <GlassInput>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isLogin ? 'Enter your password' : 'Min 6 characters'}
                    required
                    minLength={6}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    className="w-full bg-transparent text-sm text-[#f8f6f2] placeholder-[#8c7b78] p-3.5 pr-12 rounded-xl focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3 flex items-center"
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4 text-[#8c7b78] hover:text-[#f8f6f2] transition-colors" />
                      : <Eye className="h-4 w-4 text-[#8c7b78] hover:text-[#f8f6f2] transition-colors" />}
                  </button>
                </div>
              </GlassInput>
            </div>

            {/* Confirm password (register only) */}
            {!isLogin && (
              <div className="animate-element animate-delay-400">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8c7b78]">
                  Confirm password
                </label>
                <GlassInput>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      name="confirm"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      required
                      autoComplete="new-password"
                      className="w-full bg-transparent text-sm text-[#f8f6f2] placeholder-[#8c7b78] p-3.5 pr-12 rounded-xl focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      {showConfirm
                        ? <EyeOff className="h-4 w-4 text-[#8c7b78] hover:text-[#f8f6f2] transition-colors" />
                        : <Eye className="h-4 w-4 text-[#8c7b78] hover:text-[#f8f6f2] transition-colors" />}
                    </button>
                  </div>
                </GlassInput>
              </div>
            )}

            {/* Remember / forgot */}
            {isLogin && (
              <div className="animate-element animate-delay-350 flex items-center justify-between text-sm">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="custom-checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="text-[#d4c5c1] text-xs">Keep me signed in</span>
                </label>
                <span className="text-xs text-[#ff8e3e] hover:underline cursor-pointer transition-colors">
                  Forgot password?
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3.5 py-2.5 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={[
                'animate-element w-full rounded-xl py-3.5 text-sm font-semibold text-[#1a0800] transition-all duration-200',
                isLogin ? 'animate-delay-400' : 'animate-delay-450',
                loading
                  ? 'cursor-not-allowed bg-[#ff8e3e]/50'
                  : 'bg-[#ff8e3e] hover:bg-[#ffaa6b] active:scale-[0.99] shadow-[0_4px_20px_rgba(255,142,62,0.25)]',
              ].join(' ')}
            >
              {loading
                ? 'Please wait...'
                : isLogin
                  ? 'Enter Archive'
                  : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div className={`animate-element ${isLogin ? 'animate-delay-450' : 'animate-delay-500'} relative my-6 flex items-center`}>
            <span className="flex-1 border-t border-[rgba(212,197,193,0.1)]" />
            <span className="px-4 text-xs text-[#8c7b78]">or continue with</span>
            <span className="flex-1 border-t border-[rgba(212,197,193,0.1)]" />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={onGoogleSignIn}
            className={`animate-element ${isLogin ? 'animate-delay-500' : 'animate-delay-600'} w-full flex items-center justify-center gap-3 rounded-xl border border-[rgba(212,197,193,0.12)] bg-[rgba(248,246,242,0.03)] py-3.5 text-sm font-medium text-[#d4c5c1] hover:bg-[rgba(248,246,242,0.07)] hover:border-[rgba(212,197,193,0.2)] transition-all duration-200`}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Footer */}
          <p className={`animate-element ${isLogin ? 'animate-delay-600' : 'animate-delay-700'} mt-7 text-center text-xs text-[#8c7b78]`}>
            {isLogin ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => onModeChange?.('register')}
                  className="text-[#ff8e3e] hover:underline transition-colors"
                >
                  Create a free account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => onModeChange?.('login')}
                  className="text-[#ff8e3e] hover:underline transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </section>

      {/* ── Right: hero panel ──────────────────────────────────────── */}
      <section className="hidden md:flex flex-1 relative overflow-hidden p-4">
        {/* Background image */}
        <div
          className="animate-slide-right animate-delay-200 absolute inset-4 rounded-3xl bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=1600&q=80')",
          }}
        >
          {/* Dark overlay */}
          <div
            className="absolute inset-0 rounded-3xl"
            style={{
              background:
                'linear-gradient(165deg, rgba(14,8,7,0.7) 0%, rgba(14,8,7,0.45) 45%, rgba(14,8,7,0.85) 100%)',
            }}
          />
        </div>

        {/* Panel content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-8 w-full">
          {/* Top: headline */}
          <div className="animate-element animate-delay-400">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,142,62,0.3)] bg-[rgba(255,142,62,0.1)] px-3 py-1 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff8e3e] animate-pulse" />
              <span className="text-xs font-medium text-[#ff8e3e]">Live UK eBay data</span>
            </div>
            <h2 className="text-3xl font-semibold text-[#f8f6f2] leading-tight max-w-xs tracking-tight">
              Your collection.<br />
              <span className="text-[#ff8e3e]">Professionally</span> valued.
            </h2>
            <p className="mt-3 text-sm text-[#8c7b78] max-w-xs leading-relaxed">
              AI identification, real market prices, and one-click Whatnot export built for serious sellers and collectors.
            </p>
          </div>

          {/* Bottom: feature cards */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {FEATURES.map((f, i) => (
              <FeatureCard
                key={f.label}
                icon={f.icon}
                label={f.label}
                desc={f.desc}
                delay={`animate-delay-${600 + i * 100}`}
              />
            ))}
          </div>
        </div>
      </section>

    </div>
  );
};

// ── Google Icon ───────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
    </svg>
  );
}

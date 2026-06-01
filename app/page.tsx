"use client";

import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Features } from "@/components/blocks/features-8";

/* ─── Data ─────────────────────────────────────────────────────── */

const COMICS = [
  { title: "Amazing Spider-Man", issue: "#300", grade: "9.8", price: "£2,400", bg: "#c0392b" },
  { title: "X-Men",              issue: "#266", grade: "9.4", price: "£340",   bg: "#2980b9" },
  { title: "Green Lantern",      issue: "#76",  grade: "8.5", price: "£890",   bg: "#27ae60" },
  { title: "Batman",             issue: "#181", grade: "7.0", price: "£1,200", bg: "#8e44ad" },
  { title: "Incredible Hulk",    issue: "#181", grade: "9.6", price: "£5,600", bg: "#16a085" },
  { title: "New Mutants",        issue: "#98",  grade: "9.2", price: "£780",   bg: "#d35400" },
];

const TICKER_ITEMS = [
  "ASM #300 → £2,400",
  "X-Men #266 → £340",
  "New Mutants #98 → £780",
  "Batman #227 → £1,850",
  "Hulk #181 → £5,600",
  "FF #48 → £3,200",
  "Daredevil #1 → £4,100",
  "X-Men #1 → £8,900",
  "Iron Man #128 → £420",
  "Thor #337 → £290",
];

const STEPS = [
  {
    num: "01",
    label: "POINT & SCAN",
    title: "Aim your camera at any comic",
    body: "Hold up any comic — raw, slabbed, bagged. LongboxLens detects the cover in under a second using Gemini Vision AI.",
  },
  {
    num: "02",
    label: "AI IDENTIFIES",
    title: "Title, issue, variant, grade — instant",
    body: "Our model cross-references the Grand Comics Database and CGC census to pinpoint the exact printing and estimate condition.",
  },
  {
    num: "03",
    label: "LIVE VALUATION",
    title: "Real eBay UK sold prices",
    body: "We pull live sold-listing data from eBay UK so the number you see reflects what collectors actually pay today.",
  },
  {
    num: "04",
    label: "EXPORT & SELL",
    title: "One tap to a Whatnot CSV",
    body: "Export your scanned lot as a ready-to-upload Whatnot listing file. Title, condition, price — already filled.",
  },
];

const TESTIMONIALS = [
  {
    quote: "I scanned 200 comics from a car boot sale in 20 minutes. Walked away knowing exactly which ones to keep.",
    name: "Marcus T.",
    tag: "Dealer, Manchester",
  },
  {
    quote: "The CGC slab detection alone is worth it. I used to Google every single barcode. Now it's instant.",
    name: "Priya S.",
    tag: "Collector, London",
  },
  {
    quote: "Sold my first Whatnot lot the same day I discovered LongboxLens. The CSV export is genuinely brilliant.",
    name: "Dan F.",
    tag: "Seller, Birmingham",
  },
];

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13s2-2 5-2 5 2 5 2 2-2 5-2 5 2 5 2"/>
        <rect x="2" y="6" width="20" height="12" rx="2"/>
      </svg>
    ),
    title: "CGC Slab Detection",
    body: "Recognises slabbed comics and reads the label grade automatically. No manual input.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "Under 3 Seconds",
    body: "From camera frame to valuation. Faster than you can flip to the back cover.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/>
      </svg>
    ),
    title: "Collection Dashboard",
    body: "Every scan is logged with grade, value and condition. Your full collection at a glance.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
    title: "Whatnot CSV Export",
    body: "One tap produces a Whatnot-ready CSV. Titles, conditions, prices — done.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    title: "eBay UK Live Prices",
    body: "Pulls from real sold listings, not guesses. Always current, always UK market.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Works Offline",
    body: "Scan first, sync later. Your data stays on device until you choose to export.",
  },
];

/* ─── Sub-components ────────────────────────────────────────────── */

function AppMockup() {
  return (
    <div className="w-full h-full flex flex-col bg-[#0e0807] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#ff8e3e]" />
          <span className="text-[#ff8e3e] font-bold text-xs tracking-wide">LongboxLens</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#8c7b78]">6 comics</span>
          <div className="px-3 py-1 rounded-full text-[10px] font-semibold"
            style={{ background: "linear-gradient(90deg,#ff8e3e,#ffb627)", color: "#0e0807" }}>
            + Scan
          </div>
        </div>
      </div>
      <div className="flex gap-6 px-4 py-2 border-b border-white/5 flex-shrink-0">
        <div>
          <div className="text-[9px] text-[#8c7b78] uppercase tracking-wider">Total Value</div>
          <div className="text-xs font-bold text-[#05df72]">£11,210</div>
        </div>
        <div>
          <div className="text-[9px] text-[#8c7b78] uppercase tracking-wider">Top Grade</div>
          <div className="text-xs font-bold text-[#ff8e3e]">9.8 NM/MT</div>
        </div>
        <div>
          <div className="text-[9px] text-[#8c7b78] uppercase tracking-wider">eBay Avg</div>
          <div className="text-xs font-bold text-[#f8f6f2]">£1,868</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 overflow-y-auto flex-1">
        {COMICS.map((c, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-white/5 bg-[#21160f] flex flex-col">
            <div className="h-16 flex items-center justify-center flex-shrink-0" style={{ background: c.bg + "44" }}>
              <div className="w-8 h-10 rounded shadow-md flex items-end justify-center pb-1" style={{ background: c.bg }}>
                <div className="w-6 h-0.5 bg-white/30 rounded" />
              </div>
            </div>
            <div className="p-1.5 flex flex-col gap-0.5">
              <div className="text-[8px] text-[#d4c5c1] font-medium truncate leading-tight">{c.title}</div>
              <div className="text-[7px] text-[#8c7b78]">{c.issue}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[8px] text-[#ff8e3e] font-bold">{c.grade}</span>
                <span className="text-[8px] text-[#05df72] font-semibold">{c.price}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-around px-4 py-2 border-t border-white/10 flex-shrink-0">
        {["Collection", "Scan", "Export"].map((tab, i) => (
          <button key={tab}
            className={`text-[9px] font-semibold px-3 py-1 rounded-full transition-all ${
              i === 0 ? "text-[#ff8e3e] bg-[#ff8e3e]/10" : "text-[#8c7b78]"
            }`}>
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <>
      <style>{`
        /* Grid background */
        .lbl-grid-bg {
          background-image:
            linear-gradient(to right,  rgba(255,142,62,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,142,62,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        /* Radial fade over grid */
        .lbl-radial-fade {
          background: radial-gradient(ellipse 70% 60% at 50% 0%, transparent 0%, #0e0807 75%);
        }
        /* Amber glow blob */
        .lbl-glow-blob {
          background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,142,62,0.22) 0%, transparent 70%);
          filter: blur(40px);
        }
        /* Scanner line */
        @keyframes scanLine {
          0%   { top: 0%; opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .lbl-scanner-line {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, #ff8e3e, transparent);
          animation: scanLine 2.8s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        .lbl-scanner-blur {
          position: absolute; left: 0; right: 0; height: 60px;
          background: linear-gradient(180deg, rgba(255,142,62,0.14) 0%, transparent 100%);
          animation: scanLine 2.8s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        /* Ticker scroll */
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .lbl-ticker-track {
          animation: tickerScroll 28s linear infinite;
          will-change: transform;
        }
        /* Loading bar shimmer */
        @keyframes barShimmer {
          0%   { width: 0%; }
          60%  { width: 85%; }
          75%  { width: 88%; }
          100% { width: 100%; }
        }
        @keyframes shimmerGlow {
          0%   { opacity: 0.5; }
          50%  { opacity: 1; }
          100% { opacity: 0.5; }
        }
        .lbl-bar-fill {
          animation: barShimmer 3.2s cubic-bezier(0.4,0,0.2,1) infinite alternate,
                     shimmerGlow 1.6s ease-in-out infinite;
          background: linear-gradient(90deg, #ff8e3e, #ffb627, #ff8e3e);
          background-size: 200% 100%;
        }
        /* Fade-in on scroll (CSS-only approximation) */
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .lbl-fade-up { animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .lbl-delay-1 { animation-delay: 0.1s; }
        .lbl-delay-2 { animation-delay: 0.22s; }
        .lbl-delay-3 { animation-delay: 0.34s; }
        .lbl-delay-4 { animation-delay: 0.46s; }
        /* Step number glow */
        .lbl-step-num {
          font-variant-numeric: tabular-nums;
          text-shadow: 0 0 24px rgba(255,142,62,0.5);
        }
        /* Monospace operator */
        .lbl-mono {
          font-family: 'Space Mono', 'Courier New', monospace;
        }
      `}</style>

      <main className="bg-[#0e0807] min-h-screen overflow-x-hidden text-[#f8f6f2]">

        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-xl">
          <span className="text-[#ff8e3e] font-bold text-sm tracking-wide">LongboxLens</span>
          <div className="hidden md:flex gap-5 text-sm text-[#d4c5c1]">
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Reviews</a>
          </div>
          <a href="/auth"
            className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(90deg,#ff8e3e,#ffb627)", color: "#0e0807" }}>
            Open App
          </a>
        </nav>

        {/* ── Hero ────────────────────────────────────────────── */}
        <div className="relative" style={{
          backgroundImage: "url('/hero-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}>
          {/* Dark overlay — keep text readable but let image show */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "linear-gradient(180deg, rgba(14,8,7,0.35) 0%, rgba(14,8,7,0.5) 50%, rgba(14,8,7,0.92) 85%, #0e0807 100%)",
          }} />
          {/* Grid texture */}
          <div className="lbl-grid-bg absolute inset-0 pointer-events-none" style={{ opacity: 0.25 }} />
          {/* Amber glow blob */}
          <div className="absolute pointer-events-none" style={{
            top: 0, left: "50%", transform: "translateX(-50%)",
            width: 900, height: 600,
            background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,142,62,0.16) 0%, transparent 70%)",
            filter: "blur(40px)",
          }} />

          <ContainerScroll
            titleComponent={
              <div className="flex flex-col items-center gap-5 pt-20 pb-8 relative z-10">
                {/* Badge */}
                <div className="lbl-fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-medium lbl-mono"
                  style={{
                    background: "rgba(255,142,62,0.08)",
                    borderColor: "rgba(255,142,62,0.3)",
                    color: "#ff8e3e",
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff8e3e] animate-pulse inline-block" />
                  AI-POWERED COMIC VALUATION
                </div>

                {/* Headline */}
                <div className="lbl-fade-up lbl-delay-1 text-center">
                  <h1 className="text-5xl md:text-[5.5rem] font-extrabold leading-none tracking-tight text-[#f8f6f2]">
                    Know what your
                  </h1>
                  <h1 className="text-5xl md:text-[5.5rem] font-extrabold leading-none tracking-tight mt-1"
                    style={{ color: "#ff8e3e" }}>
                    comics are worth.
                  </h1>
                  <h1 className="text-5xl md:text-[5.5rem] font-extrabold leading-none tracking-tight text-[#f8f6f2]/30 mt-1"
                    style={{ textDecoration: "line-through", textDecorationColor: "rgba(255,142,62,0.4)" }}>
                    Without the guesswork.
                  </h1>
                </div>

                {/* Sub */}
                <p className="lbl-fade-up lbl-delay-2 text-[#8c7b78] text-lg md:text-xl max-w-xl text-center leading-relaxed">
                  Point your camera, get live eBay UK valuations. CGC slab detection, condition grading, Whatnot CSV export.
                </p>

                {/* CTA row */}
                <div className="lbl-fade-up lbl-delay-3 flex gap-4 mt-2">
                  <a href="/auth"
                    className="px-8 py-3.5 rounded-full font-bold text-base transition-all hover:opacity-90 active:scale-95 shadow-lg"
                    style={{
                      background: "linear-gradient(90deg, #ff8e3e 0%, #ffb627 100%)",
                      color: "#0e0807",
                      boxShadow: "0 0 32px rgba(255,142,62,0.35)",
                    }}>
                    Start Scanning Free
                  </a>
                  <a href="#how"
                    className="px-8 py-3.5 rounded-full border border-white/15 text-[#d4c5c1] font-semibold text-base hover:bg-white/5 transition-colors">
                    See How It Works
                  </a>
                </div>

                {/* Social proof micro */}
                <div className="lbl-fade-up lbl-delay-4 flex items-center gap-3 text-xs text-[#5c4542]">
                  <span>Free to start</span>
                  <span className="w-1 h-1 rounded-full bg-[#5c4542]" />
                  <span>No credit card</span>
                  <span className="w-1 h-1 rounded-full bg-[#5c4542]" />
                  <span>Works on any device</span>
                </div>
              </div>
            }
          >
            <AppMockup />
          </ContainerScroll>
        </div>

        {/* ── Ticker stripe ────────────────────────────────────── */}
        <div className="relative overflow-hidden border-y border-white/5 py-3 bg-[#0e0807]">
          <div className="flex lbl-ticker-track whitespace-nowrap select-none">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-4 px-6 text-sm lbl-mono text-[#ff8e3e]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff8e3e]/50 inline-block" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ── Scanner demo strip ───────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <div className="rounded-2xl border border-white/8 bg-[#100a06] overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff6568]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffb627]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#05df72]" />
              </div>
              <span className="text-xs lbl-mono text-[#5c4542]">LONGBOXLENS // SCAN ACTIVE</span>
              <span className="text-xs lbl-mono text-[#ff8e3e]">● LIVE</span>
            </div>

            <div className="grid md:grid-cols-2">
              {/* Camera feed simulation */}
              <div className="relative h-56 md:h-72 border-b md:border-b-0 md:border-r border-white/8 overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #120c08 0%, #1a0e09 50%, #120c08 100%)",
                }}>
                {/* Grid overlay */}
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: "linear-gradient(to right, rgba(255,142,62,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,142,62,0.04) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }} />
                {/* Scan line */}
                <div className="lbl-scanner-blur" style={{ top: 0 }} />
                <div className="lbl-scanner-line" style={{ top: 0 }} />
                {/* Corner brackets */}
                {[
                  "top-3 left-3 border-t-2 border-l-2",
                  "top-3 right-3 border-t-2 border-r-2",
                  "bottom-3 left-3 border-b-2 border-l-2",
                  "bottom-3 right-3 border-b-2 border-r-2",
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-5 h-5 border-[#ff8e3e]/60 ${cls}`} />
                ))}
                {/* Comic silhouette */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-28 rounded-lg border border-[#ff8e3e]/20 bg-[#ff8e3e]/5 flex items-end justify-center pb-2">
                    <div className="text-[8px] lbl-mono text-[#ff8e3e]/50">COVER</div>
                  </div>
                </div>
                {/* HUD label */}
                <div className="absolute bottom-3 left-3 text-[10px] lbl-mono text-[#ff8e3e]/70">
                  OCR_PRECISION // FPS:60
                </div>
                <div className="absolute top-3 right-3 text-[10px] lbl-mono text-[#ff8e3e]/50 bg-[#ff8e3e]/10 px-2 py-0.5 rounded">
                  DETECTING
                </div>
              </div>

              {/* Result panel */}
              <div className="p-5 flex flex-col gap-4">
                <div className="text-xs lbl-mono text-[#5c4542] uppercase tracking-widest">Detection Result</div>
                <div>
                  <div className="text-xl font-bold text-[#f8f6f2]">Amazing Spider-Man</div>
                  <div className="text-sm text-[#8c7b78] mt-0.5">Issue #300 — First Black Suit / Venom</div>
                </div>

                {/* Grade */}
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded-lg text-sm font-bold lbl-mono bg-[#ff8e3e]/10 border border-[#ff8e3e]/20 text-[#ff8e3e]">
                    9.4 NM
                  </div>
                  <div className="text-xs text-[#8c7b78]">Estimated condition</div>
                </div>

                {/* Loading bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] lbl-mono text-[#5c4542] uppercase tracking-wider">eBay UK Lookup</span>
                    <span className="text-[10px] lbl-mono text-[#ff8e3e]">LIVE</span>
                  </div>
                  <div className="h-1.5 bg-[#21160f] rounded-full overflow-hidden">
                    <div className="lbl-bar-fill h-full rounded-full" />
                  </div>
                </div>

                {/* Price */}
                <div className="flex items-end gap-3 pt-1">
                  <div className="text-3xl font-extrabold text-[#05df72]">£1,980</div>
                  <div className="text-sm text-[#8c7b78] pb-1">avg. sold price (90 days)</div>
                </div>

                {/* Specs */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-white/5 pt-3">
                  {[
                    ["Publisher", "Marvel Comics"],
                    ["Year", "1988"],
                    ["Key Issue", "Yes — Venom #1"],
                    ["CGC Pop 9.4", "312"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[#5c4542] lbl-mono uppercase tracking-wider text-[9px]">{k}</div>
                      <div className="text-[#d4c5c1] font-medium">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section id="how" className="max-w-5xl mx-auto px-6 py-16">
          <div className="mb-12 text-center">
            <div className="text-xs lbl-mono text-[#ff8e3e] tracking-widest uppercase mb-3">The Process</div>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-[#f8f6f2]">
              Four steps. Seconds each.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
            {STEPS.map((step, i) => (
              <div key={i}
                className="bg-[#0e0807] p-8 flex flex-col gap-4 hover:bg-[#130d08] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="text-5xl font-extrabold lbl-step-num lbl-mono text-[#ff8e3e]/20">
                    {step.num}
                  </div>
                  <span className="text-[10px] lbl-mono text-[#ff8e3e] bg-[#ff8e3e]/10 border border-[#ff8e3e]/20 px-2.5 py-1 rounded-full tracking-widest">
                    {step.label}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#f8f6f2] leading-snug mb-2">{step.title}</h3>
                  <p className="text-sm text-[#8c7b78] leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Second ticker (dark variant) ─────────────────────── */}
        <div className="relative overflow-hidden py-3 bg-[#100a06] border-y border-white/5">
          <div className="flex whitespace-nowrap select-none"
            style={{ animation: "tickerScroll 22s linear infinite reverse" }}>
            {[
              "SCAN IN SECONDS",
              "LIVE EBAY UK PRICES",
              "CGC SLAB DETECTION",
              "WHATNOT CSV EXPORT",
              "FREE TO START",
              "WORKS ON ANY DEVICE",
            ].flatMap((t, i) => [
              <span key={`t-${i}`} className="inline-flex items-center gap-5 px-6 text-sm lbl-mono text-[#5c4542] uppercase tracking-widest">
                <span className="w-1 h-1 rounded-full bg-[#5c4542] inline-block" />
                {t}
              </span>,
              <span key={`t2-${i}`} className="inline-flex items-center gap-5 px-6 text-sm lbl-mono text-[#5c4542] uppercase tracking-widest">
                <span className="w-1 h-1 rounded-full bg-[#5c4542] inline-block" />
                {t}
              </span>,
            ])}
          </div>
        </div>

        {/* ── Features bento grid ──────────────────────────────── */}
        <div id="features">
          <Features />
        </div>

        {/* ── Testimonials ─────────────────────────────────────── */}
        <section id="testimonials" className="max-w-5xl mx-auto px-6 py-16">
          <div className="mb-12 text-center">
            <div className="text-xs lbl-mono text-[#ff8e3e] tracking-widest uppercase mb-3">Real Collectors</div>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-[#f8f6f2]">
              They know their numbers now.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <div key={i}
                className="rounded-2xl p-6 border border-white/5 bg-[#100a06] flex flex-col justify-between gap-6">
                <p className="text-[#d4c5c1] leading-relaxed text-sm">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <div className="font-bold text-[#f8f6f2] text-sm">{t.name}</div>
                  <div className="text-xs text-[#5c4542] lbl-mono">{t.tag}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Big CTA ──────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-16 mb-8">
          <div className="relative rounded-3xl overflow-hidden border border-[#ff8e3e]/20 text-center p-16">
            {/* Grid bg */}
            <div className="lbl-grid-bg absolute inset-0 opacity-40" />
            {/* Glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[500px] h-[200px] rounded-full"
                style={{ background: "radial-gradient(ellipse, rgba(255,142,62,0.15) 0%, transparent 70%)", filter: "blur(30px)" }} />
            </div>

            <div className="relative z-10">
              <div className="text-xs lbl-mono text-[#ff8e3e] tracking-widest uppercase mb-5">Ready to start?</div>
              <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 text-[#f8f6f2]">
                Your collection has<br />
                <span style={{ color: "#ff8e3e" }}>hidden value.</span>
              </h2>
              <p className="text-[#8c7b78] max-w-md mx-auto mb-8 leading-relaxed">
                Start scanning for free. No credit card, no commitment. Find out what you actually own.
              </p>
              <a href="/auth"
                className="inline-block px-10 py-4 rounded-full font-bold text-lg transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: "linear-gradient(90deg, #ff8e3e 0%, #ffb627 100%)",
                  color: "#0e0807",
                  boxShadow: "0 0 48px rgba(255,142,62,0.4)",
                }}>
                Start Scanning Free
              </a>
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="border-t border-white/5 px-6 py-8">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-[#ff8e3e] font-bold">LongboxLens</span>
            <div className="flex gap-6 text-sm text-[#5c4542]">
              <a href="#how" className="hover:text-[#8c7b78] transition-colors">How it works</a>
              <a href="#features" className="hover:text-[#8c7b78] transition-colors">Features</a>
              <a href="#testimonials" className="hover:text-[#8c7b78] transition-colors">Reviews</a>
              <a href="/auth" className="hover:text-[#8c7b78] transition-colors">App</a>
            </div>
            <span className="text-xs text-[#5c4542] lbl-mono">© 2025 LONGBOXLENS</span>
          </div>
        </footer>

      </main>
    </>
  );
}

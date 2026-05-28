"use client";

import { ContainerScroll } from "@/components/ui/container-scroll-animation";

const COMICS = [
  { title: "Amazing Spider-Man", issue: "#300", grade: "9.8", price: "£2,400", bg: "#c0392b" },
  { title: "X-Men", issue: "#266", grade: "9.4", price: "£340", bg: "#2980b9" },
  { title: "Green Lantern", issue: "#76", grade: "8.5", price: "£890", bg: "#27ae60" },
  { title: "Batman", issue: "#181", grade: "7.0", price: "£1,200", bg: "#8e44ad" },
  { title: "Incredible Hulk", issue: "#181", grade: "9.6", price: "£5,600", bg: "#16a085" },
  { title: "New Mutants", issue: "#98", grade: "9.2", price: "£780", bg: "#d35400" },
];

function AppMockup() {
  return (
    <div className="w-full h-full flex flex-col bg-[#0e0807] overflow-hidden">
      {/* Top bar */}
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

      {/* Stats strip */}
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

      {/* Comics grid */}
      <div className="grid grid-cols-3 gap-2 p-3 overflow-y-auto flex-1">
        {COMICS.map((c, i) => (
          <div
            key={i}
            className="rounded-xl overflow-hidden border border-white/5 bg-[#21160f] flex flex-col"
          >
            {/* Cover */}
            <div
              className="h-16 flex items-center justify-center flex-shrink-0"
              style={{ background: c.bg + "44" }}
            >
              <div
                className="w-8 h-10 rounded shadow-md flex items-end justify-center pb-1"
                style={{ background: c.bg }}
              >
                <div className="w-6 h-0.5 bg-white/30 rounded" />
              </div>
            </div>
            {/* Info */}
            <div className="p-1.5 flex flex-col gap-0.5">
              <div className="text-[8px] text-[#d4c5c1] font-medium truncate leading-tight">
                {c.title}
              </div>
              <div className="text-[7px] text-[#8c7b78]">{c.issue}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[8px] text-[#ff8e3e] font-bold">{c.grade}</span>
                <span className="text-[8px] text-[#05df72] font-semibold">{c.price}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom tab bar */}
      <div className="flex items-center justify-around px-4 py-2 border-t border-white/10 flex-shrink-0">
        {["Collection", "Scan", "Export"].map((tab, i) => (
          <button
            key={tab}
            className={`text-[9px] font-semibold px-3 py-1 rounded-full transition-all ${
              i === 0
                ? "text-[#ff8e3e] bg-[#ff8e3e]/10"
                : "text-[#8c7b78]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="bg-[#0e0807] min-h-screen overflow-x-hidden">
      {/* Floating nav */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-xl">
        <span className="text-[#ff8e3e] font-bold text-sm tracking-wide">LongboxLens</span>
        <div className="hidden md:flex gap-5 text-sm text-[#d4c5c1]">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#about" className="hover:text-white transition-colors">About</a>
        </div>
        <a
          href="/auth"
          className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: "linear-gradient(90deg,#ff8e3e,#ffb627)", color: "#0e0807" }}
        >
          Open App
        </a>
      </nav>

      {/* Hero + ContainerScroll — starts from top of page */}
      <ContainerScroll
        titleComponent={
          <div className="flex flex-col items-center gap-5 pt-20 pb-8">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-medium"
              style={{
                background: "rgba(255,142,62,0.08)",
                borderColor: "rgba(255,142,62,0.25)",
                color: "#ff8e3e",
              }}
            >
              <span>✦</span> AI-Powered Comic Valuation
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-[#f8f6f2] leading-tight tracking-tight">
              Scan. Value.{" "}
              <span
                style={{
                  background: "linear-gradient(90deg, #ff8e3e 0%, #ffb627 55%, #ff6b35 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Sell.
              </span>
            </h1>

            <p className="text-[#d4c5c1] text-lg md:text-xl max-w-2xl text-center leading-relaxed">
              Point your camera at any comic book. Get instant eBay UK valuations,
              CGC slab detection, and export your collection to Whatnot in seconds.
            </p>

            <div className="flex gap-4 mt-2">
              <a
                href="/auth"
                className="px-8 py-3.5 rounded-full font-semibold text-base transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: "linear-gradient(90deg, #ff8e3e 0%, #ffb627 100%)",
                  color: "#0e0807",
                }}
              >
                Start Scanning Free
              </a>
              <a
                href="#features"
                className="px-8 py-3.5 rounded-full border border-white/20 text-[#f8f6f2] font-semibold text-base hover:bg-white/5 transition-colors"
              >
                See How It Works
              </a>
            </div>
          </div>
        }
      >
        <AppMockup />
      </ContainerScroll>

      {/* Features section */}
      <section id="features" className="max-w-5xl mx-auto px-6 py-24 grid md:grid-cols-3 gap-8">
        {[
          {
            icon: "⚡",
            title: "Instant AI Scan",
            body: "Gemini Vision identifies title, issue, variant, and grade from a single photo in under 3 seconds.",
          },
          {
            icon: "💷",
            title: "Live eBay UK Prices",
            body: "Real sold-listings data so you know exactly what your comics fetch on the UK market today.",
          },
          {
            icon: "📦",
            title: "Whatnot CSV Export",
            body: "One tap to export your scanned lot as a ready-to-upload Whatnot listing CSV. Sell faster.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl p-6 border border-white/5 bg-[#181009] flex flex-col gap-3"
          >
            <div className="text-3xl">{f.icon}</div>
            <h3 className="text-[#f8f6f2] font-bold text-lg">{f.title}</h3>
            <p className="text-[#8c7b78] text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8 flex items-center justify-between max-w-5xl mx-auto">
        <span className="text-[#ff8e3e] font-bold text-sm">LongboxLens</span>
        <span className="text-[#5c4542] text-xs">© 2025 LongboxLens. All rights reserved.</span>
      </footer>
    </main>
  );
}

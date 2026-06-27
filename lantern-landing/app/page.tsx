"use client";

import { FormEvent, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { Logo } from "@/app/components/Logo";
import { useAuth } from "@/app/components/AuthProvider";
import { supabase } from "@/lib/supabase";

const problems = [
  {
    before: "Sort by price",
    after:
      "See the real cost: seat pitch, connection risk, total travel time, and what the savings actually cost you.",
  },
  {
    before: 'Pick "city centre"',
    after:
      "Match neighborhoods to what you care about — walkability, quiet, food scene, or proximity to your plans.",
  },
  {
    before: "Check each attraction separately",
    after:
      "Get activities ranked by fit: opening hours, distance from your hotel, traveler type, and real review signals.",
  },
  {
    before: "Build a manual day plan",
    after:
      "Generate a geo-optimized itinerary that respects opening hours, eliminates backtracking, and fits your pace.",
  },
];

const steps = [
  {
    n:    "01",
    head: "Search with context",
    body: "Enter your destination, dates, and what you care about. No account needed to start.",
  },
  {
    n:    "02",
    head: "Get ranked options",
    body: "Flights, hotels, and activities scored by fit — with plain-English reasoning for every recommendation.",
  },
  {
    n:    "03",
    head: "Build your trip",
    body: "Save picks, generate a geo-optimized day plan, and export a complete trip document ready to act on.",
  },
];

const betaItems = [
  "AI flight comparison",
  "Neighborhood-matched hotel rankings",
  "Activity curation by traveler type",
  "AI itinerary routing",
];

const PREVIEW_FLIGHTS = [
  { airline: "ANA",    sub: "NH 8 · 13h 30m · 1 stop",   price: "$1,247", score: 94, isBest: true  },
  { airline: "United", sub: "UA 837 · 14h 15m · 1 stop",  price: "$1,089", score: 71, isBest: false },
  { airline: "Delta",  sub: "DL 295 · 16h 05m · 2 stops", price: "$978",   score: 68, isBest: false },
];

function FlightPreviewCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_4px_32px_rgba(0,0,0,0.08)]">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <p className="text-sm font-bold text-gray-900">JFK → NRT</p>
          <p className="font-mono text-[10px] text-gray-700">Sep 12 · Economy · 3 results</p>
        </div>
        <span className="rounded-md bg-teal-50 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-teal-600 ring-1 ring-inset ring-teal-200">
          AI Ranked
        </span>
      </div>

      {/* Flight rows */}
      <div className="divide-y divide-gray-100">
        {PREVIEW_FLIGHTS.map((f) => (
          <div
            key={f.airline}
            className={[
              "flex items-center justify-between gap-4 px-5 py-4",
              f.isBest ? "bg-teal-50/70" : "bg-white",
            ].join(" ")}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-bold text-gray-900">{f.airline}</p>
                {f.isBest && (
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-teal-700">
                    AI PICK
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-gray-700">{f.sub}</p>
            </div>

            <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[11px] font-bold text-gray-700">{f.score}</p>
                <div className="relative h-[3px] w-12 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={
                      f.isBest
                        ? "absolute inset-y-0 left-0 rounded-full bg-teal-500"
                        : "absolute inset-y-0 left-0 rounded-full bg-gray-300"
                    }
                    style={{ width: `${(f.score / 94) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-[13px] font-semibold text-gray-700">{f.price}</p>
            </div>
          </div>
        ))}
      </div>

      {/* AI reasoning footer */}
      <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
        <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-teal-600">
          AI Reasoning
        </p>
        <p className="text-[11px] leading-relaxed text-gray-700">
          ANA scores highest on seat pitch, single-connection routing, and on-time
          reliability — worth the $158 premium over United.
        </p>
      </div>
    </div>
  );
}

function ComingSoonBanner() {
  const params = useSearchParams();
  if (!params.get("coming_soon")) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center">
      <p className="text-sm text-amber-800">
        <span className="font-semibold">Features coming soon.</span>{" "}
        <a href="#waitlist" className="underline underline-offset-2 hover:text-amber-900">
          Join the waitlist for early access.
        </a>
      </p>
    </div>
  );
}

export default function Page() {
  const { user, loading: authLoading } = useAuth();
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState("");
  const [isOwner,   setIsOwner]   = useState(false);

  useEffect(() => {
    const expectedKey = process.env.NEXT_PUBLIC_DEMO_KEY ?? "";
    const storedKey   = (() => { try { return localStorage.getItem("travelgrab_demo_access_v1"); } catch { return null; } })();
    const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ENABLED === "true";
    setIsOwner(demoEnabled || (!!expectedKey && storedKey === expectedKey));
  }, []);

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function handleWaitlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    try {
      const res = await fetch("https://formspree.io/f/mqeoypvz", {
        method:  "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body:    JSON.stringify({ email: clean, source: "travelgrab-landing" }),
      });
      if (!res.ok) { setError("Something went wrong. Please try again."); return; }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    /* Light theme scoped to landing page — globals.css keeps dark defaults for product pages */
    <main className="min-h-screen bg-white text-[#0A0A0A] [color-scheme:light]">
      <Suspense><ComingSoonBanner /></Suspense>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2.5">
            <Logo size={32} className="flex-shrink-0" />
            <span className="text-sm font-bold tracking-tight text-gray-900">{BRAND_NAME}</span>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-sm text-gray-700 transition hover:text-gray-900">How it works</a>
          </nav>

          {!authLoading && user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-gray-600 sm:block truncate max-w-[160px]">
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-900"
              >
                Log out
              </button>
            </div>
          ) : isOwner ? (
            <div className="flex items-center gap-3">
              <a href="/auth/login" className="hidden text-sm text-gray-700 transition hover:text-gray-900 sm:block">
                Log in
              </a>
              <a
                href="/auth/signup"
                className="rounded-lg bg-lantern-mint px-4 py-2 text-sm font-bold text-[#0A0A0A] transition hover:bg-lantern-mint/85 active:scale-[0.97]"
              >
                Sign up
              </a>
            </div>
          ) : null}
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 pt-16 sm:px-8 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_480px] lg:gap-16">

            {/* Left: headline + CTA */}
            <div>
              <p className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.18em] text-teal-600">
                Intelligent trip planning
              </p>

              <h1 className="text-[clamp(2.8rem,6vw,5rem)] font-black leading-[0.9] tracking-[-0.04em] text-gray-900">
                The travel advisor<br className="hidden sm:block" />
                in your browser.
              </h1>

              <p className="mt-7 max-w-[44ch] text-lg leading-[1.65] text-gray-700">
                Flights ranked beyond price. Hotels matched to your neighborhood.
                Itineraries built around geography. Reasoning behind every pick.
              </p>

              <div className="mt-10">
                <a
                  href="#waitlist"
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-lantern-mint px-6 text-sm font-bold text-[#0A0A0A] shadow-[0_2px_12px_rgba(0,0,0,0.10)] transition hover:bg-lantern-mint/85 active:scale-[0.98]"
                >
                  Join waitlist
                </a>
              </div>
            </div>

            {/* Right: travel photography */}
            <div className="relative overflow-hidden rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=960&q=85"
                alt="View from airplane window above the clouds at sunset"
                className="w-full object-cover lg:h-[460px]"
              />
              {/* Subtle caption overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent px-5 pb-4 pt-12">
                <p className="font-mono text-[10px] uppercase tracking-wider text-white/70">
                  Book smarter, not cheaper
                </p>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* ── Why it matters ───────────────────────────────────────────────────── */}
      <section className="border-t border-gray-200 bg-gray-50 px-6 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">

          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-gray-700">
            Why it matters
          </p>
          <h2 className="mb-16 max-w-[28ch] text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            Every trip decision has hidden costs.
          </h2>

          <div className="grid border border-gray-200 sm:grid-cols-2">
            {problems.map((p, i) => (
              <div
                key={p.before}
                className={[
                  "bg-white p-6 sm:p-8",
                  i % 2 === 1 ? "border-l border-gray-200" : "",
                  i >= 2      ? "border-t border-gray-200" : "",
                ].join(" ")}
              >
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-gray-700">
                  Instead of
                </p>
                <p className="mb-5 text-sm font-semibold text-gray-700 line-through decoration-gray-200">
                  {p.before}
                </p>
                <p className="text-[15px] leading-relaxed text-gray-600">
                  {p.after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-gray-200 px-6 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">

          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-gray-700">
            How it works
          </p>
          <h2 className="mb-16 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Three steps to a better trip.
          </h2>

          <div className="grid border border-gray-200 sm:grid-cols-3">
            {steps.map((s, i) => (
              <div
                key={s.n}
                className={[
                  "bg-white p-6 sm:p-8",
                  i > 0 ? "border-t border-gray-200 sm:border-t-0 sm:border-l" : "",
                ].join(" ")}
              >
                <p className="mb-5 font-mono text-2xl font-bold text-gray-100">{s.n}</p>
                <h3 className="mb-2 text-[15px] font-bold text-gray-900">{s.head}</h3>
                <p className="text-sm leading-relaxed text-gray-700">{s.body}</p>
              </div>
            ))}
          </div>

          {/* Live product preview */}
          <div className="mt-12">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-gray-700">
              Live example — AI-ranked flights
            </p>
            <FlightPreviewCard />
          </div>
        </div>
      </section>

      {/* ── Waitlist ─────────────────────────────────────────────────────────── */}
      <section id="waitlist" className="border-t border-gray-200 px-6 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-16 lg:grid-cols-[1fr_0.8fr] lg:items-start">

            <div>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-gray-700">
                Private beta
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Get early access.
              </h2>
              <p className="mt-4 max-w-[42ch] text-gray-700">
                {BRAND_NAME} is in private beta. The complete product goes live soon.
                Get notified first.
              </p>
              <ul className="mt-8 flex flex-col gap-2.5">
                {betaItems.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-gray-700">
                    <span className="font-mono text-teal-500">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-7">
              <p className="text-[15px] font-bold text-gray-900">Join the waitlist</p>
              <p className="mt-1.5 text-sm text-gray-700">
                No spam. We'll let you know when it opens.
              </p>

              {submitted ? (
                <div className="mt-8 py-4">
                  <p className="font-semibold text-teal-600">You're on the list.</p>
                  <p className="mt-1 text-sm text-gray-700">
                    We'll reach out when {BRAND_NAME} launches publicly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleWaitlist} noValidate className="mt-6 flex flex-col gap-3">
                  <label htmlFor="waitlist-email" className="sr-only">Email address</label>
                  <input
                    id="waitlist-email"
                    type="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-700 transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 [color-scheme:light]"
                  />
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-lantern-mint py-3 text-sm font-bold text-[#0A0A0A] shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition hover:bg-lantern-mint/85 active:scale-[0.98]"
                  >
                    Join waitlist
                  </button>
                  <p className="text-center text-xs text-gray-700">
                    We use your email only to notify you about {BRAND_NAME}.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white px-6 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size={22} className="flex-shrink-0 opacity-50" />
            <span className="text-sm font-semibold text-gray-700">{BRAND_NAME}</span>
          </div>
          <p className="text-xs text-gray-700">
            © {new Date().getFullYear()} {BRAND_NAME}
          </p>
          <nav className="flex gap-6" aria-label="Footer navigation">
            <a href="#how-it-works" className="text-xs text-gray-700 transition hover:text-gray-700">How it works</a>
            <a href="#waitlist"     className="text-xs text-gray-700 transition hover:text-gray-700">Waitlist</a>
          </nav>
        </div>
      </footer>

    </main>
  );
}

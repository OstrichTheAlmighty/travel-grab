"use client";

import { FormEvent, useState } from "react";
import { BRAND_NAME } from "@/lib/brand";

const features = [
  {
    icon: "✈️",
    title: "Smarter flight choices",
    desc: "Price, layovers, timing, seat pitch, airline reliability, and airport tradeoffs — weighted into a single ranked recommendation with plain-English reasoning.",
  },
  {
    icon: "🏨",
    title: "Hotel rankings by fit, not commission",
    desc: "Hotels scored by location, walkability, guest reviews, and neighborhood match for your trip style — not which OTA pays the highest referral fee.",
  },
  {
    icon: "📍",
    title: "Activities worth your time",
    desc: "Advisor-curated activities ranked by traveler type, opening hours, and distance from your hotel — so you stop wasting time on things that don't fit.",
  },
  {
    icon: "🗓️",
    title: "AI-optimized itinerary routing",
    desc: "Day-by-day schedules built around geography, opening hours, and your pace preference. No backtracking. No dead afternoons.",
  },
  {
    icon: "⭐",
    title: "Review insights without tab-hopping",
    desc: "Synthesized review signals across platforms surfaced inline — so you know what guests really say without opening fifteen browser tabs.",
  },
  {
    icon: "📋",
    title: "Booking-ready trip plan",
    desc: "A complete trip document with your chosen flight, hotel, saved activities, and daily schedule — ready to export or share.",
  },
];

const tradeoffs = [
  {
    label: "Cheap flight, expensive mistake",
    desc: "A 1-stop at $200 less often means a tight 80-min connection, 34 extra minutes of flying, and a 31\" seat instead of 34\". The savings evaporate fast.",
  },
  {
    label: "Central hotel, wrong neighborhood",
    desc: "\"City centre\" can mean tourist-trap prices and noise. The quieter district two metro stops away might score higher on every metric that matters to you.",
  },
  {
    label: "Top-rated activity, wrong fit",
    desc: "A 4.9-star food tour isn't worth your afternoon if it leaves at 10am and your flight lands at noon. Context kills the best-reviewed option constantly.",
  },
  {
    label: "Back-to-back sights, no breathing room",
    desc: "Packing six attractions into day one sounds efficient until you spend two hours backtracking across the city. Geography-aware scheduling fixes this.",
  },
  {
    label: "Information scattered, decisions paralyzed",
    desc: "When flights are on one tab, hotels on another, and reviews on three more, most people either over-research or give up and pick something random.",
  },
];

const trustItems = [
  "No account required",
  "AI explains every recommendation",
  "Covers flights, hotels, activities, and itinerary",
];

export default function Page() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleWaitlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");

    try {
      const response = await fetch("https://formspree.io/f/mqeoypvz", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: clean,
          source: "travelgrab-landing",
        }),
      });

      if (!response.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-transparent bg-transparent backdrop-blur-0 transition-all duration-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 sm:px-8 lg:px-12">
          <a href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/travelgrab-logo.svg"
              alt="TravelGrab"
              width={36}
              height={36}
              className="h-9 w-9 flex-shrink-0 object-contain"
            />
            <span className="text-sm font-bold tracking-tight text-white">{BRAND_NAME}</span>
          </a>

          <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            <a href="#how-it-works" className="transition hover:text-white">How it works</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#waitlist" className="transition hover:text-white">Waitlist</a>
          </nav>

          <a
            href="#waitlist"
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-ink transition hover:bg-lantern-mint"
          >
            Join waitlist
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative px-6 pb-8 pt-16 sm:px-8 sm:pt-24 lg:px-12 lg:pt-32">
        {/* grid texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_10%,transparent_80%)]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        <div className="mx-auto max-w-4xl text-center">
          {/* eyebrow */}
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-lantern-violet/30 bg-lantern-violet/10 px-4 py-2 text-sm font-semibold text-lantern-violet">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-lantern-mint"
            />
            Private beta · Waitlist open
          </div>

          <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Plan the trip that{" "}
            <span className="bg-gradient-to-r from-lantern-mint via-lantern-blue to-lantern-violet bg-clip-text text-transparent">
              actually
            </span>{" "}
            fits you.
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-white/62 sm:text-xl">
            {BRAND_NAME} helps you choose better flights, smarter hotels, worthwhile
            activities, and an itinerary that saves time instead of wasting it.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#waitlist"
              className="inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-lantern-violet to-lantern-blue px-8 text-sm font-bold text-white shadow-glow transition hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]"
            >
              Join the waitlist
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <a
              href="#how-it-works"
              className="inline-flex h-14 items-center rounded-full border border-white/30 bg-white/[0.06] px-8 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/[0.10] active:scale-[0.98]"
            >
              See how it works
            </a>
          </div>

          {/* trust strip */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {trustItems.map((t) => (
              <div key={t} className="flex items-center gap-2 text-sm text-white/44">
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-lantern-mint/30 bg-lantern-mint/12 text-[9px] text-lantern-mint"
                >
                  ✓
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* ── Product preview ── */}
        <div className="mx-auto mt-16 max-w-[680px]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-panel/90 shadow-card backdrop-blur">
            {/* header */}
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/38">
                {BRAND_NAME} decision engine
              </p>
              <span className="rounded-full border border-lantern-violet/28 bg-lantern-violet/10 px-3 py-1 text-xs font-bold text-lantern-violet">
                AI active
              </span>
            </div>

            {/* four section rows */}
            <PreviewRow
              icon="✈️"
              label="Flights"
              primary="JFK → NRT · ANA nonstop"
              secondary="$1,240 · Ranked #1 — saves 3h 35m vs cheapest option"
              badge="Best overall"
              badgeColor="text-lantern-mint border-lantern-mint/25 bg-lantern-mint/8"
            />
            <PreviewRow
              icon="🏨"
              label="Hotels"
              primary="Shinjuku Granbell Hotel · Shinjuku"
              secondary="$189/night · 4.6★ · AI score 92/100 · Great fit for first-timers"
              badge="Best overall"
              badgeColor="text-lantern-blue border-lantern-blue/25 bg-lantern-blue/8"
            />
            <PreviewRow
              icon="📍"
              label="Activities"
              primary="Senso-ji Temple at dusk · Asakusa"
              secondary="4.9★ · 45 min · 12 min walk from hotel · Opens 6am"
              badge="Saved"
              badgeColor="text-lantern-gold border-lantern-gold/25 bg-lantern-gold/8"
            />
            <div className="border-b border-white/8 last:border-0 px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-base flex-shrink-0">🗓️</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-white/38 uppercase tracking-wider mb-0.5">Itinerary</p>
                    <p className="text-sm font-semibold text-white/88 truncate">Day 1 · 5 stops · geo-optimized</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-white/40">Senso-ji → Ueno → Akihabara → Shibuya → Shinjuku</span>
                    </div>
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold text-lantern-violet border-lantern-violet/25 bg-lantern-violet/8">
                  AI plan
                </span>
              </div>
            </div>

            {/* AI explanation footer */}
            <div className="flex items-start gap-3 border-t border-white/8 px-5 py-4 bg-white/[0.02]">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-lantern-violet/16 text-sm">
                ✦
              </div>
              <p className="text-sm leading-relaxed text-white/56">
                <span className="font-semibold text-lantern-violet">Why these picks:</span>{" "}
                ANA saves 3.5h vs the cheaper United routing. The Shinjuku hotel puts you 12 min from all Day 1 stops. Senso-ji at dusk avoids the 9am tourist rush.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            {/* left: copy */}
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-lantern-blue">
                Why {BRAND_NAME}
              </p>
              <h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                Every trip decision<br className="hidden sm:block" /> has hidden costs.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-white/60">
                Sorting by price is a starting point, not a strategy. The cheapest flight
                costs you sleep. The most central hotel puts you in the wrong neighborhood.
                The top-rated activity doesn&apos;t fit your schedule. {BRAND_NAME} surfaces
                all of those tradeoffs and explains them before you commit.
              </p>
            </div>

            {/* right: tradeoff list */}
            <div className="flex flex-col gap-3">
              {tradeoffs.map((t) => (
                <div
                  key={t.label}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/14 hover:bg-white/[0.05]"
                >
                  <p className="mb-1 text-sm font-bold text-white/88">{t.label}</p>
                  <p className="text-sm leading-relaxed text-white/50">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="border-t border-white/8 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-lantern-mint">
            What&apos;s included
          </p>
          <h2 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            One tool for the whole trip.
          </h2>
          <p className="mt-5 max-w-xl text-lg text-white/56">
            From the first flight search to the final day plan — {BRAND_NAME} covers
            every decision with AI reasoning, not just rankings.
          </p>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition hover:border-white/14 hover:bg-white/[0.05]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xl">
                  {f.icon}
                </div>
                <h3 className="mb-2 text-base font-bold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-white/52">{f.desc}</p>
              </div>
            ))}

            {/* CTA card */}
            <div className="flex flex-col items-start justify-between rounded-2xl bg-gradient-to-br from-lantern-violet/20 to-lantern-blue/10 p-6 ring-1 ring-lantern-violet/24">
              <p className="text-base font-bold text-white">
                Get early access
              </p>
              <p className="mt-2 text-sm text-white/56">
                Join the waitlist and be first to try {BRAND_NAME} when it launches.
              </p>
              <a
                href="#waitlist"
                className="mt-6 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-bold text-ink transition hover:bg-lantern-mint"
              >
                Join waitlist →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Waitlist ── */}
      <section id="waitlist" className="border-t border-white/8 px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-lantern-gold">
                Coming soon
              </p>
              <h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                The full trip planner.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-white/58">
                {BRAND_NAME} is in private beta. The complete product — flights, hotels,
                activities, and day-by-day AI itinerary — goes live soon. Get notified first.
              </p>
              <div className="mt-8 flex flex-col gap-3 text-sm text-white/44">
                {[
                  "AI flight comparison · in beta",
                  "Neighborhood-matched hotel rankings · in beta",
                  "Activity curation by traveler type · in beta",
                  "AI itinerary routing · in beta",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-lantern-gold/60" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
              <p className="text-base font-bold text-white">Join the waitlist</p>
              <p className="mt-2 text-sm text-white/52">
                Be first to know when {BRAND_NAME} opens to the public. No spam,
                unsubscribe any time.
              </p>

              {submitted ? (
                <div className="mt-8 flex flex-col items-center gap-2 py-4 text-center">
                  <span className="text-3xl">🎉</span>
                  <p className="font-semibold text-lantern-mint">You&apos;re on the list!</p>
                  <p className="text-sm text-white/48">
                    We&apos;ll reach out when {BRAND_NAME} launches publicly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleWaitlist} noValidate className="mt-6 flex flex-col gap-3">
                  <label htmlFor="waitlist-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="waitlist-email"
                    type="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    className="w-full rounded-xl border border-white/14 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-lantern-mint/50 focus:bg-white/[0.07]"
                  />
                  {error && (
                    <p className="text-sm text-red-400">{error}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-lantern-violet to-lantern-blue py-3 text-sm font-bold text-white shadow-glow transition hover:opacity-90 active:scale-[0.98]"
                  >
                    Join the waitlist
                  </button>
                  <p className="text-center text-xs text-white/30">
                    We use your email only to notify you about {BRAND_NAME} updates.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 px-6 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/travelgrab-logo.svg"
                alt="TravelGrab"
                width={28}
                height={28}
                className="h-7 w-7 flex-shrink-0 object-contain"
              />
              <span className="text-sm font-semibold text-white/70">{BRAND_NAME}</span>
            </div>
            <p className="text-xs text-white/35 max-w-[220px]">
              AI travel decisions across flights, hotels, activities, and itinerary planning.
            </p>
          </div>
          <p className="text-sm text-white/36">
            © {new Date().getFullYear()} {BRAND_NAME}. Built for travelers who want trips that actually fit.
          </p>
          <nav className="flex gap-6 text-sm text-white/44" aria-label="Footer">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#waitlist" className="transition hover:text-white">Waitlist</a>
          </nav>
        </div>
      </footer>

    </main>
  );
}

/* ── helpers ── */

interface PreviewRowProps {
  icon: string;
  label: string;
  primary: string;
  secondary: string;
  badge: string;
  badgeColor: string;
}

function PreviewRow({ icon, label, primary, secondary, badge, badgeColor }: PreviewRowProps) {
  return (
    <div className="border-b border-white/8 last:border-0 px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base flex-shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-white/38 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-white/88 truncate">{primary}</p>
            <p className="text-xs text-white/40 mt-0.5 truncate">{secondary}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeColor}`}>
          {badge}
        </span>
      </div>
    </div>
  );
}

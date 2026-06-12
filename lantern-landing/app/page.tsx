"use client";

import { FormEvent, useState } from "react";
import { BRAND_NAME, PUBLIC_FLIGHTS_URL } from "@/lib/brand";

const features = [
  {
    icon: "📡",
    title: "Live fare search",
    desc: "Prices pulled fresh from real airline inventory. No stale cache, no bait-and-switch.",
  },
  {
    icon: "↔️",
    title: "Open-jaw trips",
    desc: "Fly into one city, home from another. Multi-city routing handled automatically.",
  },
  {
    icon: "🏙️",
    title: "Airport tradeoff analysis",
    desc: `JFK, EWR, or LGA? ${BRAND_NAME} weighs the price gap against transfer time, transit access, and terminal quality.`,
  },
  {
    icon: "💺",
    title: "Comfort scoring",
    desc: "Seat pitch, aircraft type, legroom ratings, and cabin layout — combined into a single number.",
  },
  {
    icon: "✦",
    title: "AI recommendation summary",
    desc: "Plain-English reasoning for every top pick. Know exactly why a flight earns its spot.",
  },
];

const tradeoffs = [
  {
    label: "Layover risk",
    desc: "A tight 75-minute connection can turn a $200 saving into a missed flight and a $400 rebooking fee.",
  },
  {
    label: "Red-eye timing",
    desc: "Arriving at 3 AM costs you sleep and often an extra hotel night — rarely worth the sticker discount.",
  },
  {
    label: "Airport distance",
    desc: "EWR saves $80 but adds 90 minutes each way from Midtown. The math rarely favors it.",
  },
  {
    label: "Airline reliability",
    desc: "On-time rate, cancellation policy, and seat pitch vary widely between carriers at identical prices.",
  },
  {
    label: "Total travel time",
    desc: "A nonstop at $150 more saves 4 hours each way. For any business trip, that's an easy call.",
  },
];

const trustItems = [
  "No account required",
  "Live fares, updated daily",
  "AI explains every pick",
];

export default function Page() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleWaitlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-transparent bg-transparent backdrop-blur-0 transition-all duration-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 sm:px-8 lg:px-12">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-lantern-mint to-lantern-blue shadow-[0_0_28px_rgba(119,167,255,0.28)]">
              <span className="text-sm font-black text-ink">{BRAND_NAME.charAt(0)}</span>
            </div>
            <span className="text-sm font-bold tracking-tight text-white">{BRAND_NAME}</span>
          </a>

          <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            <a href="#why" className="transition hover:text-white">Why {BRAND_NAME}</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#waitlist" className="transition hover:text-white">Waitlist</a>
          </nav>

          <a
            href={PUBLIC_FLIGHTS_URL}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-ink transition hover:bg-lantern-mint"
          >
            Try Flight Search
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
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-lantern-blue/30 bg-lantern-blue/10 px-4 py-2 text-sm font-semibold text-lantern-blue">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-lantern-mint"
            />
            AI Flight Search · Live Fares
          </div>

          <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Find the{" "}
            <span className="bg-gradient-to-r from-lantern-mint via-lantern-blue to-lantern-violet bg-clip-text text-transparent">
              best
            </span>{" "}
            flight —<br className="hidden sm:block" /> not just the cheapest one.
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-white/62 sm:text-xl">
            {BRAND_NAME} compares price, layovers, timing, airlines, airports, and comfort
            to explain which flight is actually worth booking.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href={PUBLIC_FLIGHTS_URL}
              className="inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-lantern-mint to-lantern-blue px-8 text-sm font-bold text-ink shadow-glow transition hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14M13 6l6 6-6 6"
                />
              </svg>
              Try Flight Search
            </a>
            <a
              href="#waitlist"
              className="inline-flex h-14 items-center rounded-full border border-white/14 bg-white/[0.04] px-8 text-sm font-semibold text-white/80 transition hover:border-white/24 hover:bg-white/[0.08] hover:text-white"
            >
              Join waitlist
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

        {/* ── Demo flight card ── */}
        <div className="mx-auto mt-16 max-w-[660px]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-panel/90 shadow-card backdrop-blur">
            {/* header */}
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/38">
                  Route
                </p>
                <p className="mt-0.5 text-base font-bold">
                  JFK → NRT &nbsp;·&nbsp;{" "}
                  <span className="font-normal text-white/52">Jun 20 · Economy</span>
                </p>
              </div>
              <span className="rounded-full border border-lantern-mint/28 bg-lantern-mint/10 px-3 py-1 text-xs font-bold text-lantern-mint">
                AI ranking active
              </span>
            </div>

            {/* recommended flight */}
            <div className="border-b border-white/8 bg-lantern-mint/[0.04] px-5 py-4">
              <FlightRow
                dep="11:30"
                arr="15:35+1"
                from="JFK"
                to="NRT"
                dur="14h 05m"
                stops="Nonstop · ANA"
                price="$1,240"
                badge="Best overall"
                badgeColor="text-lantern-mint border-lantern-mint/30 bg-lantern-mint/10"
              />
            </div>

            {/* alternative */}
            <div className="border-b border-white/8 px-5 py-4">
              <FlightRow
                dep="08:10"
                arr="19:50+1"
                from="EWR"
                to="NRT"
                dur="17h 40m"
                stops="1 stop · United"
                price="$890"
                badge="Cheapest"
                badgeColor="text-white/50 border-white/14 bg-white/[0.04]"
              />
            </div>

            {/* AI explanation */}
            <div className="flex items-start gap-3 px-5 py-4">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-lantern-violet/16 text-sm">
                ✦
              </div>
              <p className="text-sm leading-relaxed text-white/56">
                <span className="font-semibold text-lantern-violet">Why ANA at $1,240:</span>{" "}
                The $350 difference buys a nonstop that saves 3h 35m each way, avoids
                a tight 80-min ICN layover on the United routing, and ANA Economy offers
                34″ seat pitch vs United&apos;s 31″ on this aircraft.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why cheapest isn't best ── */}
      <section id="why" className="px-6 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            {/* left: copy */}
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-lantern-blue">
                Why {BRAND_NAME}
              </p>
              <h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                Cheapest is not<br className="hidden sm:block" /> always best.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-white/60">
                Sorting by price is a starting point, not a strategy.
                Every cheap fare has hidden costs — layover risk, red-eye arrivals,
                distant airports, cramped aircraft, or unreliable airlines. {BRAND_NAME}{" "}
                surfaces those tradeoffs and explains them in plain English before
                you book.
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
            Features
          </p>
          <h2 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Everything you need<br /> to book smart.
          </h2>
          <p className="mt-5 max-w-lg text-lg text-white/56">
            Stop comparing tabs. {BRAND_NAME} reads the tradeoffs and tells you exactly
            what you&apos;re paying for.
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
            <div className="flex flex-col items-start justify-between rounded-2xl bg-gradient-to-br from-lantern-blue/20 to-lantern-mint/10 p-6 ring-1 ring-lantern-blue/24">
              <p className="text-base font-bold text-white">
                Ready to find your best flight?
              </p>
              <p className="mt-2 text-sm text-white/56">
                No account. No credit card. Just search.
              </p>
              <a
                href={PUBLIC_FLIGHTS_URL}
                className="mt-6 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-bold text-ink transition hover:bg-lantern-mint"
              >
                Try Flight Search →
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
                AI itinerary planning.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-white/58">
                Full trip planning is on its way — days, hotels, activities, and
                meals, all scheduled by AI. Get notified when it goes live.
              </p>
              <div className="mt-8 flex flex-col gap-3 text-sm text-white/44">
                {[
                  "Flight search · available now",
                  "Hotel recommendations · in development",
                  "AI itinerary planning · coming soon",
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
                Be first to know when AI itinerary planning goes live. No spam,
                unsubscribe any time.
              </p>

              {submitted ? (
                <div className="mt-8 flex flex-col items-center gap-2 py-4 text-center">
                  <span className="text-3xl">🎉</span>
                  <p className="font-semibold text-lantern-mint">You&apos;re on the list!</p>
                  <p className="text-sm text-white/48">
                    We&apos;ll reach out when itinerary planning is ready.
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
                    className="w-full rounded-xl bg-gradient-to-r from-lantern-mint to-lantern-blue py-3 text-sm font-bold text-ink shadow-glow transition hover:opacity-90 active:scale-[0.98]"
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
          <div className="flex items-center gap-3">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-lantern-mint to-lantern-blue">
              <span className="text-xs font-black text-ink">{BRAND_NAME.charAt(0)}</span>
            </div>
            <span className="text-sm font-semibold text-white/70">{BRAND_NAME}</span>
          </div>
          <p className="text-sm text-white/36">
            © {new Date().getFullYear()} {BRAND_NAME}. Built for travelers who want more than the cheapest fare.
          </p>
          <nav className="flex gap-6 text-sm text-white/44" aria-label="Footer">
            <a href={PUBLIC_FLIGHTS_URL} className="transition hover:text-white">
              Flight Search
            </a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#waitlist" className="transition hover:text-white">Waitlist</a>
          </nav>
        </div>
      </footer>

    </main>
  );
}

/* ── helpers ── */

interface FlightRowProps {
  dep: string;
  arr: string;
  from: string;
  to: string;
  dur: string;
  stops: string;
  price: string;
  badge: string;
  badgeColor: string;
}

function FlightRow({ dep, arr, from, to, dur, stops, price, badge, badgeColor }: FlightRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      {/* departure */}
      <div className="w-16">
        <p className="text-lg font-bold">{dep}</p>
        <p className="text-xs text-white/40">{from}</p>
      </div>

      {/* middle: duration + bar */}
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <p className="text-xs text-white/36">{dur}</p>
        <div className="relative my-1.5 w-full">
          <div className="h-px w-full bg-white/14" />
          <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/30" />
          <div className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/30" />
        </div>
        <p className="text-xs text-white/36">{stops}</p>
      </div>

      {/* arrival */}
      <div className="w-16 text-right">
        <p className="text-lg font-bold">{arr}</p>
        <p className="text-xs text-white/40">{to}</p>
      </div>

      {/* price + badge */}
      <div className="w-28 shrink-0 text-right">
        <p className="text-xl font-extrabold tracking-tight">{price}</p>
        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
          {badge}
        </span>
      </div>
    </div>
  );
}

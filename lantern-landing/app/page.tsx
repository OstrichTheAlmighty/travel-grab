"use client";

import { FormEvent, useState } from "react";
import { BRAND_NAME } from "@/lib/brand";
import { Logo } from "@/app/components/Logo";

const problems = [
  {
    before: 'Sort by price',
    after:  'See the real cost: seat pitch, connection risk, total travel time, and what the savings actually cost you.',
  },
  {
    before: 'Pick "city centre"',
    after:  'Match neighborhoods to what you care about — walkability, quiet, food scene, or proximity to your plans.',
  },
  {
    before: 'Check each attraction separately',
    after:  'Get activities ranked by fit: opening hours, distance from your hotel, traveler type, and real review signals.',
  },
  {
    before: 'Build a manual day plan',
    after:  'Generate a geo-optimized itinerary that respects opening hours, eliminates backtracking, and fits your pace.',
  },
];

const steps = [
  {
    n:    '01',
    head: 'Search with context',
    body: 'Enter your destination, dates, and what you care about. No account needed to start.',
  },
  {
    n:    '02',
    head: 'Get ranked options',
    body: 'Flights, hotels, and activities scored by fit — with plain-English reasoning for every recommendation.',
  },
  {
    n:    '03',
    head: 'Build your trip',
    body: 'Save picks, generate a geo-optimized day plan, and export a complete trip document ready to act on.',
  },
];

const products = [
  { href: '/flights',    label: 'Flights',    desc: 'Compare by seat, layover, timing' },
  { href: '/hotels',     label: 'Hotels',     desc: 'Match by neighborhood + style' },
  { href: '/activities', label: 'Activities', desc: 'Ranked by fit, not just stars' },
  { href: '/itinerary',  label: 'Itinerary',  desc: 'Geo-optimized day plans' },
];

const betaItems = [
  'AI flight comparison',
  'Neighborhood-matched hotel rankings',
  'Activity curation by traveler type',
  'AI itinerary routing',
];

const PREVIEW_FLIGHTS = [
  {
    airline:  'ANA',
    sub:      'NH 8 · 13h 30m · 1 stop',
    price:    '$1,247',
    score:    94,
    isBest:   true,
  },
  {
    airline:  'United',
    sub:      'UA 837 · 14h 15m · 1 stop',
    price:    '$1,089',
    score:    71,
    isBest:   false,
  },
  {
    airline:  'Delta',
    sub:      'DL 295 · 16h 05m · 2 stops',
    price:    '$978',
    score:    68,
    isBest:   false,
  },
];

function FlightPreviewCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.09] bg-[#0C1018] shadow-[0_0_60px_rgba(143,247,208,0.05)]">

      {/* Card header */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <div>
          <p className="text-sm font-bold text-white">JFK → NRT</p>
          <p className="font-mono text-[10px] text-white/35">Sep 12 · Economy · 3 results</p>
        </div>
        <span className="rounded-md bg-lantern-violet/15 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-lantern-violet">
          AI Ranked
        </span>
      </div>

      {/* Flight rows */}
      <div className="divide-y divide-white/[0.05]">
        {PREVIEW_FLIGHTS.map((f) => (
          <div
            key={f.airline}
            className={[
              'flex items-center justify-between gap-4 px-5 py-4',
              f.isBest ? 'bg-lantern-violet/[0.05]' : '',
            ].join(' ')}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-bold text-white">{f.airline}</p>
                {f.isBest && (
                  <span className="rounded bg-lantern-violet/20 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-lantern-violet">
                    AI PICK
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-white/32">{f.sub}</p>
            </div>

            <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[11px] font-bold text-white/60">{f.score}</p>
                <div className="relative h-[3px] w-12 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={f.isBest ? 'absolute inset-y-0 left-0 rounded-full bg-lantern-mint' : 'absolute inset-y-0 left-0 rounded-full bg-white/25'}
                    style={{ width: `${(f.score / 94) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-[13px] font-semibold text-white/60">{f.price}</p>
            </div>
          </div>
        ))}
      </div>

      {/* AI reasoning footer */}
      <div className="border-t border-white/[0.07] px-5 py-4">
        <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-lantern-violet/55">
          AI Reasoning
        </p>
        <p className="text-[11px] leading-relaxed text-white/42">
          ANA scores highest on seat pitch, single-connection routing, and on-time
          reliability — worth the $158 premium over United.
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState('');

  async function handleWaitlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    try {
      const res = await fetch('https://formspree.io/f/mqeoypvz', {
        method:  'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: clean, source: 'travelgrab-landing' }),
      });
      if (!res.ok) { setError('Something went wrong. Please try again.'); return; }
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <main className="min-h-screen bg-ink text-white">

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-ink/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2.5">
            <Logo size={32} className="flex-shrink-0" />
            <span className="text-sm font-bold tracking-tight text-white">{BRAND_NAME}</span>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-sm text-white/45 transition hover:text-white">How it works</a>
            <a href="/flights"      className="text-sm text-white/45 transition hover:text-white">Flights</a>
            <a href="/hotels"       className="text-sm text-white/45 transition hover:text-white">Hotels</a>
            <a href="/activities"   className="text-sm text-white/45 transition hover:text-white">Activities</a>
          </nav>

          <a
            href="#waitlist"
            className="rounded-lg bg-lantern-mint px-4 py-2 text-sm font-bold text-ink transition hover:bg-lantern-mint/90 active:scale-[0.97]"
          >
            Join waitlist
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-24 pt-20 sm:px-8 sm:pt-28 lg:pt-36">

        {/* Subtle background arc — mirrors the logo mark at large scale */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-24 h-[600px] w-[600px] opacity-[0.035]"
          viewBox="0 0 600 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M 520,300 A 220,220 0 1,0 300,80" stroke="#8FF7D0" strokeWidth="2.5" strokeDasharray="10 8"/>
          <circle cx="520" cy="300" r="7" fill="#8FF7D0"/>
          <circle cx="300" cy="80" r="7" fill="#8FF7D0"/>
        </svg>

        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_420px] lg:gap-16">

            {/* Left: headline + CTA */}
            <div>
              <p className="mb-6 font-mono text-xs font-medium uppercase tracking-[0.18em] text-lantern-mint">
                Intelligent trip planning
              </p>

              <h1 className="text-[clamp(2.8rem,6vw,5rem)] font-black leading-[0.9] tracking-[-0.04em] text-white">
                The travel advisor<br className="hidden sm:block" />
                in your browser.
              </h1>

              <p className="mt-8 max-w-[44ch] text-lg leading-[1.65] text-white/52">
                Flights ranked beyond price. Hotels matched to your neighborhood.
                Itineraries built around geography. Reasoning behind every pick.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-5">
                <a
                  href="/flights"
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-lantern-mint px-6 text-sm font-bold text-ink shadow-[0_0_24px_rgba(143,247,208,0.15)] transition hover:bg-lantern-mint/90 active:scale-[0.98]"
                >
                  Start planning
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
                <a href="#how-it-works" className="text-sm text-white/35 transition hover:text-white/65">
                  See how it works →
                </a>
              </div>
            </div>

            {/* Right: live product preview */}
            <FlightPreviewCard />
          </div>
        </div>

        {/* Product strip */}
        <div className="mx-auto mt-20 max-w-6xl">
          <div className="grid grid-cols-2 border border-white/[0.08] sm:grid-cols-4">
            {[
              { label: 'Flights',    tag: '12-variable ranking' },
              { label: 'Hotels',     tag: 'Neighborhood matching' },
              { label: 'Activities', tag: 'Fit-first curation' },
              { label: 'Itinerary',  tag: 'Geo-optimized routes' },
            ].map((s, i) => (
              <div
                key={s.label}
                className={[
                  'px-5 py-4',
                  i > 0               ? 'border-l border-white/[0.08]'               : '',
                  i >= 2              ? 'border-t border-white/[0.08] sm:border-t-0'  : '',
                ].join(' ')}
              >
                <p className="text-[13px] font-semibold text-white">{s.label}</p>
                <p className="mt-0.5 font-mono text-[10px] text-white/30">{s.tag}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why it matters ───────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.07] px-6 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">

          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-white/30">
            Why it matters
          </p>
          <h2 className="mb-16 max-w-[28ch] text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            Every trip decision has hidden costs.
          </h2>

          <div className="grid border border-white/[0.08] sm:grid-cols-2">
            {problems.map((p, i) => (
              <div
                key={p.before}
                className={[
                  'p-6 sm:p-8',
                  i % 2 === 1                       ? 'border-l border-white/[0.08]'              : '',
                  i >= 2                            ? 'border-t border-white/[0.08]'              : '',
                ].join(' ')}
              >
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-white/25">
                  Instead of
                </p>
                <p className="mb-5 text-sm font-semibold text-white/40 line-through decoration-white/15">
                  {p.before}
                </p>
                <p className="text-[15px] leading-relaxed text-white/75">
                  {p.after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-white/[0.07] px-6 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">

          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-white/30">
            How it works
          </p>
          <h2 className="mb-16 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Three steps to a better trip.
          </h2>

          <div className="grid border border-white/[0.08] sm:grid-cols-3">
            {steps.map((s, i) => (
              <div
                key={s.n}
                className={['p-6 sm:p-8', i > 0 ? 'border-t border-white/[0.08] sm:border-t-0 sm:border-l sm:border-white/[0.08]' : ''].join(' ')}
              >
                <p className="mb-5 font-mono text-2xl font-bold text-white/12">{s.n}</p>
                <h3 className="mb-2 text-[15px] font-bold text-white">{s.head}</h3>
                <p className="text-sm leading-relaxed text-white/45">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Try it now ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.07] px-6 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">

          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-lantern-mint">
                Available now · Free beta
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Try it. No account needed.
              </h2>
              <p className="mt-4 max-w-[42ch] text-white/45">
                All four tools are live. Search real flights and hotels, explore activities,
                or build a full itinerary for any city.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col gap-2.5 sm:items-end">
              <a
                href="/flights"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-lantern-mint px-5 text-sm font-bold text-ink transition hover:bg-lantern-mint/90"
              >
                Search flights →
              </a>
              <a
                href="/hotels"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/12 px-5 text-sm font-semibold text-white/55 transition hover:border-white/25 hover:text-white/85"
              >
                Browse hotels →
              </a>
            </div>
          </div>

          <div className="mt-12 grid border border-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p, i) => (
              <a
                key={p.href}
                href={p.href}
                className={[
                  'group px-5 py-5 transition hover:bg-white/[0.03]',
                  i > 0 && i < 2  ? 'border-t border-white/[0.08] sm:border-t-0 sm:border-l sm:border-white/[0.08]' : '',
                  i >= 2          ? 'border-t border-white/[0.08] lg:border-l lg:border-white/[0.08]'               : '',
                  i === 3         ? 'border-l border-white/[0.08]'                                                   : '',
                ].join(' ')}
              >
                <p className="text-sm font-bold text-white/75 transition group-hover:text-lantern-mint">
                  {p.label} →
                </p>
                <p className="mt-1 font-mono text-[10px] text-white/28">{p.desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Waitlist ─────────────────────────────────────────────────────────── */}
      <section id="waitlist" className="border-t border-white/[0.07] px-6 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-16 lg:grid-cols-[1fr_0.8fr] lg:items-start">

            <div>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-white/30">
                Private beta
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Get early access.
              </h2>
              <p className="mt-4 max-w-[42ch] text-white/45">
                {BRAND_NAME} is in private beta. The complete product goes live soon.
                Get notified first.
              </p>
              <ul className="mt-8 flex flex-col gap-2.5">
                {betaItems.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-white/40">
                    <span className="font-mono text-lantern-mint/70">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/[0.09] bg-white/[0.02] p-7">
              <p className="text-[15px] font-bold text-white">Join the waitlist</p>
              <p className="mt-1.5 text-sm text-white/40">
                No spam. We'll let you know when it opens.
              </p>

              {submitted ? (
                <div className="mt-8 py-4">
                  <p className="font-semibold text-lantern-mint">You're on the list.</p>
                  <p className="mt-1 text-sm text-white/40">
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
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-lantern-mint/50 focus:bg-white/[0.06] [color-scheme:dark]"
                  />
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-lantern-mint py-3 text-sm font-bold text-ink shadow-[0_0_24px_rgba(143,247,208,0.12)] transition hover:bg-lantern-mint/90 active:scale-[0.98]"
                  >
                    Join waitlist
                  </button>
                  <p className="text-center text-xs text-white/22">
                    We use your email only to notify you about {BRAND_NAME}.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.07] px-6 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size={22} className="flex-shrink-0 opacity-45" />
            <span className="text-sm font-semibold text-white/45">{BRAND_NAME}</span>
          </div>
          <p className="text-xs text-white/22">
            © {new Date().getFullYear()} {BRAND_NAME}
          </p>
          <nav className="flex gap-6" aria-label="Footer navigation">
            <a href="/flights"    className="text-xs text-white/30 transition hover:text-white/70">Flights</a>
            <a href="/hotels"     className="text-xs text-white/30 transition hover:text-white/70">Hotels</a>
            <a href="/activities" className="text-xs text-white/30 transition hover:text-white/70">Activities</a>
            <a href="/itinerary"  className="text-xs text-white/30 transition hover:text-white/70">Itinerary</a>
          </nav>
        </div>
      </footer>

    </main>
  );
}

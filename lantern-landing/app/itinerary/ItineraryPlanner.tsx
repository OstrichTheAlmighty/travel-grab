"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Nav ───────────────────────────────────────────────────────────────────────

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return active ? (
    <span className="text-sm font-semibold text-lantern-violet">{label}</span>
  ) : (
    <Link href={href} className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors">
      {label}
    </Link>
  );
}

// ── Empty-state card ──────────────────────────────────────────────────────────

function EmptyCard({
  icon, title, description, cta,
}: {
  icon: string;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl border border-white/[0.08] bg-white/[0.04] flex items-center justify-center text-xl shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        className="self-start rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/55 hover:bg-white/[0.07] hover:text-white/80 transition-colors"
      >
        {cta}
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ItineraryPlanner() {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-ink text-white">

      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/travelgrab-logo.svg" alt="TravelGrab" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <NavLink href="/flights"    label="Flights"    active={pathname === "/flights"} />
          <NavLink href="/hotels"     label="Hotels"     active={pathname === "/hotels"} />
          <NavLink href="/activities" label="Activities" active={pathname === "/activities"} />
          <NavLink href="/itinerary"  label="Itinerary"  active={pathname === "/itinerary"} />
        </div>
      </nav>

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-12">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-lantern-gold/30 bg-lantern-gold/[0.08] px-4 py-1.5 text-xs font-semibold text-lantern-gold mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-lantern-gold animate-pulse" />
            Coming soon
          </div>

          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl leading-[1.05]">
            Build your itinerary.
          </h1>

          <p className="mt-4 text-lg text-white/55 leading-relaxed max-w-md">
            Turn your flight, hotel, and saved activities into an optimized day-by-day plan.
          </p>

          <button
            type="button"
            className="mt-8 inline-flex h-12 items-center gap-2.5 rounded-full bg-gradient-to-r from-lantern-mint to-lantern-blue px-8 text-sm font-bold text-ink shadow-glow transition hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="text-base">✦</span>
            Generate itinerary
          </button>

          <p className="mt-4 text-xs text-white/30">
            Start by adding a flight, hotel, and activities below.
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="border-t border-white/[0.06]" />
      </div>

      {/* Empty-state cards */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30 mb-6">
          What you&apos;ll need
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EmptyCard
            icon="✈️"
            title="Flight"
            description="Your arrival time sets the start of Day 1."
            cta="Search flights →"
          />
          <EmptyCard
            icon="🏨"
            title="Hotel"
            description="Your hotel anchors daily routes and transit estimates."
            cta="Search hotels →"
          />
          <EmptyCard
            icon="❤️"
            title="Saved activities"
            description="Heart places on the Activities page to add them here."
            cta="Browse activities →"
          />
          <EmptyCard
            icon="⚙️"
            title="Preferences"
            description="Wake time, pace, transit mode, and meal timing."
            cta="Set preferences →"
          />
        </div>

        {/* How it works */}
        <div className="mt-12 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30 mb-6">
            How it works
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Save what you want to do",
                body: "Heart activities from the Activities page. Add your flight and hotel details.",
              },
              {
                step: "02",
                title: "Set your preferences",
                body: "Tell us your wake time, pace, and how you like to get around.",
              },
              {
                step: "03",
                title: "Get a day-by-day plan",
                body: "The AI clusters activities by geography, respects opening hours, and fits meals into your day.",
              },
            ].map((item) => (
              <div key={item.step} className="flex flex-col gap-3">
                <span className="text-2xl font-black text-white/10 leading-none">{item.step}</span>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-sm text-white/40 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

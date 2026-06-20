"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PlannerOutput, PlannedDay, PlannedSlot } from "@/lib/itinerary/types";

// ── Local types ────────────────────────────────────────────────────────────────

type SavedMeta = {
  title:        string;
  category:     string;
  neighborhood: string;
  duration:     string;
  rating:       number;
  photoRef?:    string;
};

type UIPace    = "relaxed" | "balanced" | "packed";
type UITransit = "walking" | "public transit" | "taxi" | "mixed";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDuration(s: string | undefined): number {
  if (!s) return 90;
  const hr = s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*hour/i);
  if (hr) return Math.round(((+hr[1] + +hr[2]) / 2) * 60);
  const h1 = s.match(/(\d+(?:\.\d+)?)\s*hour/i);
  if (h1) return Math.round(+h1[1] * 60);
  const mr = s.match(/(\d+)\s*[-–]\s*(\d+)\s*min/i);
  if (mr) return Math.round((+mr[1] + +mr[2]) / 2);
  const m1 = s.match(/(\d+)\s*min/i);
  if (m1) return +m1[1];
  if (/half.?day/i.test(s)) return 240;
  return 90;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h < 12 ? "am" : "pm";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")}${period}`;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function mapPace(ui: UIPace): "relaxed" | "moderate" | "packed" {
  return ui === "balanced" ? "moderate" : ui;
}

function mapTransit(ui: UITransit): string {
  if (ui === "walking") return "walking";
  if (ui === "taxi") return "driving";
  return "transit";
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n - 1);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function longDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

// ── Nav ────────────────────────────────────────────────────────────────────────

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return active ? (
    <span className="text-sm font-semibold text-lantern-violet">{label}</span>
  ) : (
    <Link
      href={href}
      className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors"
    >
      {label}
    </Link>
  );
}

// ── Design tokens for slot kinds and categories ────────────────────────────────

const SLOT_STYLE: Record<string, { dot: string; border: string; bg: string }> = {
  activity:         { dot: "bg-lantern-mint",  border: "border-lantern-mint/25", bg: "bg-lantern-mint/[0.05]"  },
  meal:             { dot: "bg-lantern-gold",  border: "border-lantern-gold/25", bg: "bg-lantern-gold/[0.05]"  },
  hotel_checkin:    { dot: "bg-white/25",      border: "border-white/10",        bg: "bg-white/[0.02]"         },
  hotel_checkout:   { dot: "bg-white/25",      border: "border-white/10",        bg: "bg-white/[0.02]"         },
  airport_transfer: { dot: "bg-lantern-blue",  border: "border-lantern-blue/25", bg: "bg-lantern-blue/[0.05]"  },
  free_time:        { dot: "bg-white/15",      border: "border-white/[0.07]",    bg: "bg-white/[0.01]"         },
};

const CAT_STYLE: Record<string, string> = {
  food:        "text-lantern-gold  bg-lantern-gold/10  border-lantern-gold/20",
  nightlife:   "text-purple-400    bg-purple-400/10    border-purple-400/20",
  culture:     "text-lantern-mint  bg-lantern-mint/10  border-lantern-mint/20",
  adventure:   "text-orange-400    bg-orange-400/10    border-orange-400/20",
  nature:      "text-green-400     bg-green-400/10     border-green-400/20",
  luxury:      "text-lantern-gold  bg-lantern-gold/10  border-lantern-gold/20",
  hidden_gems: "text-pink-400      bg-pink-400/10      border-pink-400/20",
};

// ── Timeline components ────────────────────────────────────────────────────────

function TransitConnector({ slot }: { slot: PlannedSlot }) {
  const t = slot.transit!;
  const icon = t.mode === "walking" ? "🚶" : t.mode === "driving" ? "🚕" : "🚇";
  return (
    <div className="flex items-center gap-2 py-1.5 pl-[4.5rem]">
      <span className="text-xs text-white/25">
        {icon} {t.durationMinutes}m · {t.distanceKm.toFixed(1)} km
      </span>
    </div>
  );
}

function TimelineSlot({
  slot,
  savedMeta,
  isLast,
}: {
  slot:      PlannedSlot;
  savedMeta: Record<string, SavedMeta>;
  isLast:    boolean;
}) {
  // Transit-only free_time slots → connector row
  if (slot.kind === "free_time" && slot.transit) {
    return <TransitConnector slot={slot} />;
  }

  const style = SLOT_STYLE[slot.kind] ?? SLOT_STYLE.free_time;

  // Match metadata by title for neighborhood and category
  const meta =
    Object.values(savedMeta).find((m) => m.title === slot.title) ?? null;
  const cat = meta?.category ?? null;
  const nbhd = meta?.neighborhood ?? null;

  return (
    <div className="flex gap-3">
      {/* Time + dot + connector */}
      <div className="flex flex-col items-center shrink-0 w-14">
        <span className="text-[11px] font-mono text-white/30 leading-none mb-1.5">
          {formatTime(slot.startMinutes)}
        </span>
        <div className={`h-2.5 w-2.5 rounded-full border-2 border-ink shrink-0 ${style.dot}`} />
        {!isLast && <div className="flex-1 w-px bg-white/[0.07] mt-1" />}
      </div>

      {/* Card */}
      <div className={`flex-1 mb-4 rounded-xl border px-4 py-3 ${style.border} ${style.bg}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-snug">{slot.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-white/35">
                {formatDuration(slot.durationMinutes)}
              </span>
              {nbhd && (
                <>
                  <span className="text-white/15 text-xs">·</span>
                  <span className="text-[11px] text-white/35">{nbhd}</span>
                </>
              )}
            </div>
          </div>
          {cat && cat in CAT_STYLE && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${CAT_STYLE[cat]}`}
            >
              {cat}
            </span>
          )}
        </div>
        {slot.explanation && (
          <p className="mt-2 text-[11px] text-white/35 leading-relaxed line-clamp-2">
            {slot.explanation}
          </p>
        )}
      </div>
    </div>
  );
}

function DayView({
  day,
  savedMeta,
}: {
  day:       PlannedDay;
  savedMeta: Record<string, SavedMeta>;
}) {
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/25 mb-1">
          {longDate(day.date)}
        </p>
        <h2 className="text-lg font-bold text-white">
          {day.theme || `Day ${day.dayIndex + 1}`}
        </h2>
        {day.geographicArea && (
          <p className="text-sm text-white/40 mt-0.5">{day.geographicArea}</p>
        )}
        <div className="flex gap-4 mt-3">
          <span className="text-xs text-white/30">
            {day.scheduledActivityCount} activities
          </span>
          <span className="text-xs text-white/30">
            {formatDuration(day.totalActivityMinutes)} of sightseeing
          </span>
        </div>
      </div>

      <div>
        {day.slots.map((slot, i) => (
          <TimelineSlot
            key={i}
            slot={slot}
            savedMeta={savedMeta}
            isLast={i === day.slots.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Saved activity chip ────────────────────────────────────────────────────────

function SavedChip({
  id,
  meta,
}: {
  id:   string;
  meta: SavedMeta | undefined;
}) {
  const cat = meta?.category;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{meta?.title ?? id}</p>
        {meta && (
          <p className="text-[10px] text-white/30 mt-0.5 truncate">
            {meta.neighborhood}
            {meta.duration ? ` · ${meta.duration}` : ""}
          </p>
        )}
      </div>
      {cat && cat in CAT_STYLE && (
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize ${CAT_STYLE[cat]}`}
        >
          {cat}
        </span>
      )}
    </div>
  );
}

// ── Preference toggle ──────────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  cols,
}: {
  label:    string;
  options:  T[];
  value:    T;
  onChange: (v: T) => void;
  cols?:    2 | 3;
}) {
  const gridCls = cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div>
      <label className="text-xs text-white/40 block mb-2">{label}</label>
      <div className={`grid ${gridCls} gap-2`}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${
              value === opt
                ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                : "border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-white/65"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ItineraryPlanner() {
  const pathname = usePathname();

  // ── Saved activities ──────────────────────────────────────────────────────
  const [savedIds,  setSavedIds]  = useState<string[]>([]);
  const [savedMeta, setSavedMeta] = useState<Record<string, SavedMeta>>({});

  useEffect(() => {
    try {
      const ids  = localStorage.getItem("travelgrab:saved-activities");
      const meta = localStorage.getItem("travelgrab:saved-activities-data");
      if (ids)  setSavedIds(JSON.parse(ids) as string[]);
      if (meta) setSavedMeta(JSON.parse(meta) as Record<string, SavedMeta>);
    } catch { /* ignore */ }
  }, []);

  // ── Preferences ───────────────────────────────────────────────────────────
  const [destination, setDestination] = useState("");
  const [startDate,   setStartDate]   = useState(tomorrowIso());
  const [numDays,     setNumDays]     = useState(5);
  const [wakeTime,    setWakeTime]    = useState("08:00");
  const [bedTime,     setBedTime]     = useState("22:00");
  const [pace,        setPace]        = useState<UIPace>("balanced");
  const [transit,     setTransit]     = useState<UITransit>("public transit");
  const [hotelBase,   setHotelBase]   = useState("");

  // ── Generation state ──────────────────────────────────────────────────────
  const [status,      setStatus]      = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [itinerary,   setItinerary]   = useState<PlannerOutput | null>(null);
  const [genError,    setGenError]    = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);

  const endDate = addDays(startDate, numDays);

  async function generate() {
    if (!destination.trim()) return;
    setStatus("generating");
    setGenError(null);

    try {
      const activities = savedIds.map((id) => {
        const m = savedMeta[id];
        return {
          title:           m?.title        ?? id,
          category:        m?.category     ?? "culture",
          durationMinutes: parseDuration(m?.duration),
        };
      });

      const body = {
        trip: {
          startDate,
          endDate,
          numTravelers: 1,
          city:         destination.split(",")[0].trim(),
          destination:  destination.trim(),
        },
        preferences: {
          wakeTimeMinutes:      timeToMinutes(wakeTime),
          sleepTimeMinutes:     timeToMinutes(bedTime),
          pace:                 mapPace(pace),
          preferredTransitMode: mapTransit(transit),
        },
        hotel: hotelBase.trim()
          ? { name: hotelBase.trim(), checkInDate: startDate, checkOutDate: endDate }
          : undefined,
        activities,
      };

      const res = await fetch("/api/itinerary/preview", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>;
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as PlannerOutput;
      setItinerary(data);
      setSelectedDay(0);
      setStatus("ready");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-ink text-white">

      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/travelgrab-logo.svg"
              alt="TravelGrab"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <NavLink href="/flights"    label="Flights"    active={pathname === "/flights"} />
          <NavLink href="/hotels"     label="Hotels"     active={pathname === "/hotels"} />
          <NavLink href="/activities" label="Activities" active={pathname === "/activities"} />
          <NavLink href="/itinerary"  label="Itinerary"  active={pathname === "/itinerary"} />
        </div>
      </nav>

      {/* Two-column layout */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 lg:grid lg:grid-cols-[360px_1fr] lg:gap-8 lg:items-start">

        {/* ── LEFT: Form ── */}
        <aside className="space-y-5 mb-8 lg:mb-0 lg:sticky lg:top-[3.75rem]">

          {/* Saved activities */}
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Saved places</h2>
              <span className="text-[11px] text-white/30">
                {savedIds.length} {savedIds.length === 1 ? "place" : "places"}
              </span>
            </div>

            {savedIds.length === 0 ? (
              <div className="py-3 text-center">
                <p className="text-xs text-white/35">No saved places yet.</p>
                <Link
                  href="/activities"
                  className="mt-2 inline-block text-xs text-lantern-mint hover:underline"
                >
                  Browse activities →
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {savedIds.slice(0, 10).map((id) => (
                  <SavedChip key={id} id={id} meta={savedMeta[id]} />
                ))}
                {savedIds.length > 10 && (
                  <p className="text-[11px] text-white/25 text-center pt-1">
                    +{savedIds.length - 10} more
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Trip details */}
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Trip details</h2>

            <div>
              <label className="text-xs text-white/40 block mb-1.5">Destination</label>
              <input
                type="text"
                placeholder="e.g. Tokyo, Japan"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 block mb-1.5">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  min={todayIso()}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1.5">Days</label>
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={numDays}
                  onChange={(e) =>
                    setNumDays(Math.max(1, Math.min(21, parseInt(e.target.value) || 1)))
                  }
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-white/40 block mb-1.5">
                Hotel / base area{" "}
                <span className="text-white/20">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Shinjuku"
                value={hotelBase}
                onChange={(e) => setHotelBase(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
              />
            </div>
          </section>

          {/* Preferences */}
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Preferences</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 block mb-1.5">Wake time</label>
                <input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1.5">Bedtime</label>
                <input
                  type="time"
                  value={bedTime}
                  onChange={(e) => setBedTime(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
                />
              </div>
            </div>

            <ToggleGroup
              label="Travel pace"
              options={["relaxed", "balanced", "packed"] as UIPace[]}
              value={pace}
              onChange={setPace}
              cols={3}
            />

            <ToggleGroup
              label="Getting around"
              options={["walking", "public transit", "taxi", "mixed"] as UITransit[]}
              value={transit}
              onChange={setTransit}
              cols={2}
            />
          </section>

          {/* Generate CTA */}
          <button
            type="button"
            onClick={generate}
            disabled={!destination.trim() || status === "generating"}
            className="w-full inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-lantern-mint to-lantern-blue px-8 text-sm font-bold text-ink shadow-glow transition hover:opacity-90 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
          >
            {status === "generating" ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/40 border-t-ink animate-spin" />
                Planning your trip…
              </>
            ) : (
              <>
                <span className="text-base">✦</span>
                Generate itinerary
              </>
            )}
          </button>

          {savedIds.length === 0 && (
            <p className="text-[11px] text-white/25 text-center">
              Save places on the{" "}
              <Link href="/activities" className="text-lantern-mint hover:underline">
                Activities
              </Link>{" "}
              page to include them in your plan.
            </p>
          )}
        </aside>

        {/* ── RIGHT: Results ── */}
        <main className="min-h-[500px]">

          {status === "idle" && (
            <div className="flex flex-col items-center justify-center h-full min-h-[480px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
              <div className="h-14 w-14 rounded-2xl border border-white/[0.1] bg-white/[0.03] flex items-center justify-center text-2xl mb-5">
                ✦
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Build your itinerary</h1>
              <p className="text-sm text-white/40 max-w-xs leading-relaxed">
                {savedIds.length === 0
                  ? "Start by saving places on the Activities page, then fill in your trip details and hit Generate."
                  : savedIds.length < 2
                  ? "You have 1 saved place. Add a few more activities for a fuller itinerary, then enter your destination and hit Generate."
                  : `You have ${savedIds.length} saved places. Enter your destination and hit Generate to build your day-by-day plan.`}
              </p>
              {savedIds.length === 0 && (
                <Link
                  href="/activities"
                  className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-full border border-lantern-mint/30 bg-lantern-mint/[0.08] px-5 text-xs font-semibold text-lantern-mint hover:bg-lantern-mint/15 transition-colors"
                >
                  Browse activities →
                </Link>
              )}
            </div>
          )}

          {status === "generating" && (
            <div className="flex flex-col items-center justify-center h-full min-h-[480px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
              <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-lantern-mint animate-spin mb-6" />
              <p className="text-sm text-white/50">Clustering activities by geography…</p>
              <p className="text-xs text-white/25 mt-2">Usually under a second</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center h-full min-h-[480px] rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-10 text-center">
              <p className="text-sm font-semibold text-red-400 mb-2">
                Failed to generate itinerary
              </p>
              <p className="text-xs text-white/30 mb-6">{genError}</p>
              <button
                type="button"
                onClick={generate}
                className="text-xs text-lantern-mint border border-lantern-mint/30 rounded-lg px-4 py-2 hover:bg-lantern-mint/10 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {status === "ready" && itinerary && (
            <div>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-xl font-bold text-white">{destination}</h1>
                  <p className="text-sm text-white/40 mt-1">
                    {shortDate(startDate)} – {shortDate(endDate)} ·{" "}
                    {itinerary.days.length} {itinerary.days.length === 1 ? "day" : "days"} ·{" "}
                    {itinerary.meta.totalActivitiesScheduled} activities
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="shrink-0 text-xs text-white/30 hover:text-white/60 transition-colors mt-0.5"
                >
                  ← Edit
                </button>
              </div>

              {/* Day tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
                {itinerary.days.map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDay(i)}
                    className={`shrink-0 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors ${
                      selectedDay === i
                        ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                        : "border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-white/65"
                    }`}
                  >
                    <span className="block">Day {i + 1}</span>
                    <span className="block font-normal opacity-70 mt-0.5">
                      {shortDate(day.date)}
                    </span>
                  </button>
                ))}
              </div>

              {/* Selected day timeline */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.01] p-6">
                <DayView
                  day={itinerary.days[selectedDay]}
                  savedMeta={savedMeta}
                />
              </div>

              {/* Dropped activities */}
              {itinerary.meta.droppedActivities.length > 0 && (
                <div className="mt-4 rounded-xl border border-lantern-gold/20 bg-lantern-gold/[0.04] px-5 py-4">
                  <p className="text-xs font-semibold text-lantern-gold mb-2">
                    {itinerary.meta.droppedActivities.length} place
                    {itinerary.meta.droppedActivities.length === 1 ? "" : "s"} couldn&apos;t fit
                  </p>
                  <ul className="space-y-1">
                    {itinerary.meta.droppedActivities.map((d, i) => (
                      <li key={i} className="text-xs text-white/35">
                        <span className="text-white/55">{d.title}</span> — {d.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Planner notes */}
              {itinerary.meta.conflicts.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.01] px-5 py-4">
                  <p className="text-xs font-semibold text-white/30 mb-2">Notes</p>
                  <ul className="space-y-1">
                    {itinerary.meta.conflicts.map((c, i) => (
                      <li key={i} className="text-xs text-white/30">
                        {c.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>

      </div>
    </div>
  );
}

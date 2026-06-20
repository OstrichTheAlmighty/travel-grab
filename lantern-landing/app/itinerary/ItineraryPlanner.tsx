"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PlannerOutput, PlannedDay, PlannedSlot } from "@/lib/itinerary/types";

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface CityStop {
  city: string;
  days: number;
}

interface FlightInput {
  arrivalCity:       string;
  arrivalDateTime:   string;  // "YYYY-MM-DDTHH:mm"
  departureDateTime: string;
}

interface HotelInput {
  name: string;
}

interface TripStorage {
  version:              1;
  cities:               CityStop[];
  startDate:            string;
  flight:               FlightInput | null;
  hotel:                HotelInput | null;
  wakeTime:             string;
  bedTime:              string;
  pace:                 UIPace;
  transit:              UITransit;
  excludedActivityIds:  string[];
  itinerary:            PlannerOutput | null;
  itineraryGeneratedAt: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "travelgrab_itinerary_trip_v1";

const DEFAULT_TRIP: TripStorage = {
  version:              1,
  cities:               [{ city: "", days: 5 }],
  startDate:            "",
  flight:               null,
  hotel:                null,
  wakeTime:             "08:00",
  bedTime:              "22:00",
  pace:                 "balanced",
  transit:              "public transit",
  excludedActivityIds:  [],
  itinerary:            null,
  itineraryGeneratedAt: null,
};

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
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n - 1);
  return d.toISOString().slice(0, 10);
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function longDate(iso: string): string {
  if (!iso) return "";
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
    <Link href={href} className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors">
      {label}
    </Link>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const SLOT_STYLE: Record<string, { dot: string; border: string; bg: string }> = {
  activity:         { dot: "bg-lantern-mint",  border: "border-lantern-mint/25", bg: "bg-lantern-mint/[0.05]" },
  meal:             { dot: "bg-lantern-gold",  border: "border-lantern-gold/25", bg: "bg-lantern-gold/[0.05]" },
  hotel_checkin:    { dot: "bg-white/25",      border: "border-white/10",        bg: "bg-white/[0.02]"        },
  hotel_checkout:   { dot: "bg-white/25",      border: "border-white/10",        bg: "bg-white/[0.02]"        },
  airport_transfer: { dot: "bg-lantern-blue",  border: "border-lantern-blue/25", bg: "bg-lantern-blue/[0.05]" },
  free_time:        { dot: "bg-white/15",      border: "border-white/[0.07]",    bg: "bg-white/[0.01]"        },
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

// ── Timeline ──────────────────────────────────────────────────────────────────

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
  slot, savedMeta, isLast,
}: {
  slot:      PlannedSlot;
  savedMeta: Record<string, SavedMeta>;
  isLast:    boolean;
}) {
  if (slot.kind === "free_time" && slot.transit) {
    return <TransitConnector slot={slot} />;
  }

  const style = SLOT_STYLE[slot.kind] ?? SLOT_STYLE.free_time;
  const meta  = Object.values(savedMeta).find((m) => m.title === slot.title) ?? null;
  const cat   = meta?.category ?? null;
  const nbhd  = meta?.neighborhood ?? null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0 w-14">
        <span className="text-[11px] font-mono text-white/30 leading-none mb-1.5">
          {formatTime(slot.startMinutes)}
        </span>
        <div className={`h-2.5 w-2.5 rounded-full border-2 border-ink shrink-0 ${style.dot}`} />
        {!isLast && <div className="flex-1 w-px bg-white/[0.07] mt-1" />}
      </div>

      <div className={`flex-1 mb-4 rounded-xl border px-4 py-3 ${style.border} ${style.bg}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-snug">{slot.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-white/35">{formatDuration(slot.durationMinutes)}</span>
              {nbhd && (
                <>
                  <span className="text-white/15 text-xs">·</span>
                  <span className="text-[11px] text-white/35">{nbhd}</span>
                </>
              )}
            </div>
          </div>
          {cat && cat in CAT_STYLE && (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${CAT_STYLE[cat]}`}>
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

function DayView({ day, savedMeta }: { day: PlannedDay; savedMeta: Record<string, SavedMeta> }) {
  return (
    <div>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/25 mb-1">
          {longDate(day.date)}
        </p>
        <h2 className="text-lg font-bold text-white">{day.theme || `Day ${day.dayIndex + 1}`}</h2>
        {day.geographicArea && (
          <p className="text-sm text-white/40 mt-0.5">{day.geographicArea}</p>
        )}
        <div className="flex gap-4 mt-2">
          <span className="text-xs text-white/30">{day.scheduledActivityCount} activities</span>
          <span className="text-xs text-white/30">{formatDuration(day.totalActivityMinutes)} of sightseeing</span>
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

// ── Form building blocks ───────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <h2 className="text-sm font-semibold text-white mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FieldLabel({ label, note }: { label: string; note?: string }) {
  return (
    <label className="text-xs text-white/40 block mb-1.5">
      {label}
      {note && <span className="ml-1 text-white/20">{note}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors";

function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-white/35 hover:text-lantern-mint transition-colors"
    >
      {label} <span>→</span>
    </Link>
  );
}

function ToggleGroup<T extends string>({
  label, options, value, onChange, cols = 2,
}: {
  label:   string;
  options: T[];
  value:   T;
  onChange: (v: T) => void;
  cols?:   2 | 3 | 4;
}) {
  const gridCls = cols === 3 ? "grid-cols-3" : cols === 4 ? "grid-cols-4" : "grid-cols-2";
  return (
    <div>
      <FieldLabel label={label} />
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

// ── City row ───────────────────────────────────────────────────────────────────

function CityRow({
  stop, index, onUpdate, onRemove, canRemove,
}: {
  stop:     CityStop;
  index:    number;
  onUpdate: (patch: Partial<CityStop>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder={index === 0 ? "e.g. Tokyo, Japan" : "e.g. Kyoto, Japan"}
        value={stop.city}
        onChange={(e) => onUpdate({ city: e.target.value })}
        className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
      />
      <input
        type="number"
        min={1}
        max={21}
        value={stop.days}
        onChange={(e) => onUpdate({ days: Math.max(1, parseInt(e.target.value) || 1) })}
        className="w-14 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2 py-2 text-sm text-white text-center focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors"
      />
      <span className="text-[11px] text-white/30 shrink-0">d</span>
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 w-5 text-white/25 hover:text-red-400 transition-colors text-lg leading-none"
        >
          ×
        </button>
      ) : (
        <div className="w-5" />
      )}
    </div>
  );
}

// ── Activity row (include/exclude from itinerary) ─────────────────────────────

function ActivityRow({
  id, meta, excluded, onToggle,
}: {
  id:       string;
  meta:     SavedMeta | undefined;
  excluded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
        excluded
          ? "border-white/[0.04] bg-transparent opacity-40 hover:opacity-60"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]"
      }`}
    >
      <div className={`shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center transition-colors ${
        excluded ? "border-white/20 bg-transparent" : "border-lantern-mint/60 bg-lantern-mint/15"
      }`}>
        {!excluded && (
          <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2 text-lantern-mint" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l3 3 5-6" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{meta?.title ?? id}</p>
        {meta && (
          <p className="text-[10px] text-white/30 mt-0.5 truncate">
            {[meta.neighborhood, meta.duration].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {meta?.category && meta.category in CAT_STYLE && (
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize ${CAT_STYLE[meta.category]}`}>
          {meta.category}
        </span>
      )}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ItineraryPlanner() {
  const pathname = usePathname();

  // Global saved activities (written by Activities page)
  const [savedIds,  setSavedIds]  = useState<string[]>([]);
  const [savedMeta, setSavedMeta] = useState<Record<string, SavedMeta>>({});

  // Persistent trip state
  const [trip,     setTrip]     = useState<TripStorage>(DEFAULT_TRIP);
  const [hydrated, setHydrated] = useState(false);

  // Generation UI state (not persisted)
  const [genStatus,   setGenStatus]   = useState<"idle" | "generating" | "error">("idle");
  const [genError,    setGenError]    = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [saveNotice,  setSaveNotice]  = useState(false);

  // ── Load from localStorage on mount ──
  useEffect(() => {
    try {
      const ids  = localStorage.getItem("travelgrab:saved-activities");
      const meta = localStorage.getItem("travelgrab:saved-activities-data");
      if (ids)  setSavedIds(JSON.parse(ids) as string[]);
      if (meta) setSavedMeta(JSON.parse(meta) as Record<string, SavedMeta>);

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TripStorage;
        if (parsed.version === 1) {
          setTrip(parsed);
          setHydrated(true);
          return;
        }
      }
    } catch { /* ignore */ }

    setTrip((prev) => ({ ...prev, startDate: tomorrowIso() }));
    setHydrated(true);
  }, []);

  // ── Auto-save (debounced 400 ms) ──
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trip)); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [trip, hydrated]);

  // ── Helpers ──
  function updateTrip(patch: Partial<TripStorage>) {
    setTrip((prev) => ({ ...prev, ...patch }));
  }

  const totalDays       = Math.max(1, trip.cities.reduce((s, c) => s + (c.days || 0), 0));
  const primaryCity     = trip.cities[0]?.city?.trim() ?? "";
  const endDate         = addDays(trip.startDate, totalDays);
  const activeActivityIds = savedIds.filter((id) => !trip.excludedActivityIds.includes(id));

  function updateCity(i: number, patch: Partial<CityStop>) {
    updateTrip({ cities: trip.cities.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  }

  function addCity() {
    updateTrip({ cities: [...trip.cities, { city: "", days: 3 }] });
  }

  function removeCity(i: number) {
    if (trip.cities.length <= 1) return;
    updateTrip({ cities: trip.cities.filter((_, j) => j !== i) });
  }

  function toggleExclude(id: string) {
    const excl = trip.excludedActivityIds;
    updateTrip({
      excludedActivityIds: excl.includes(id) ? excl.filter((x) => x !== id) : [...excl, id],
    });
  }

  function updateFlight(patch: Partial<FlightInput>) {
    const base = trip.flight ?? { arrivalCity: "", arrivalDateTime: "", departureDateTime: "" };
    updateTrip({ flight: { ...base, ...patch } });
  }

  function saveTrip() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
      setSaveNotice(true);
      setTimeout(() => setSaveNotice(false), 2000);
    } catch { /* ignore */ }
  }

  function clearTrip() {
    const fresh = { ...DEFAULT_TRIP, startDate: tomorrowIso() };
    setTrip(fresh);
    setGenStatus("idle");
    setGenError(null);
    setSelectedDay(0);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  async function generate() {
    if (!primaryCity) return;
    setGenStatus("generating");
    setGenError(null);

    try {
      const activities = activeActivityIds.map((id) => {
        const m = savedMeta[id];
        return {
          title:           m?.title        ?? id,
          category:        m?.category     ?? "culture",
          durationMinutes: parseDuration(m?.duration),
        };
      });

      const destination = trip.cities.map((c) => c.city).filter(Boolean).join(", ");

      const body = {
        trip: {
          startDate:    trip.startDate,
          endDate,
          numTravelers: 1,
          city:         primaryCity.split(",")[0].trim(),
          destination:  destination || primaryCity,
        },
        preferences: {
          wakeTimeMinutes:      timeToMinutes(trip.wakeTime),
          sleepTimeMinutes:     timeToMinutes(trip.bedTime),
          pace:                 mapPace(trip.pace),
          preferredTransitMode: mapTransit(trip.transit),
        },
        hotel: trip.hotel?.name
          ? { name: trip.hotel.name, checkInDate: trip.startDate, checkOutDate: endDate }
          : undefined,
        outboundFlight: trip.flight?.arrivalDateTime
          ? { arrivesAt: new Date(trip.flight.arrivalDateTime).toISOString() }
          : undefined,
        returnFlight: trip.flight?.departureDateTime
          ? { departsAt: new Date(trip.flight.departureDateTime).toISOString() }
          : undefined,
        activities,
      };

      const res = await fetch("/api/itinerary/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>;
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as PlannerOutput;
      updateTrip({ itinerary: data, itineraryGeneratedAt: new Date().toISOString() });
      setSelectedDay(0);
      setGenStatus("idle");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Something went wrong.");
      setGenStatus("error");
    }
  }

  const isGenerating = genStatus === "generating";
  const hasItinerary = !!trip.itinerary;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-ink text-white">

      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center h-14 gap-6">
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

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 lg:grid lg:grid-cols-[380px_1fr] lg:gap-8 lg:items-start">

        {/* ── LEFT: Form panels ── */}
        <aside className="space-y-4 mb-8 lg:mb-0">

          {/* Saved places */}
          <SectionCard title="Saved places">
            {savedIds.length === 0 ? (
              <div className="py-2 text-center">
                <p className="text-xs text-white/35">No saved places yet.</p>
                <Link href="/activities" className="mt-2 inline-block text-xs text-lantern-mint hover:underline">
                  Browse activities →
                </Link>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-white/30">
                  Checked places are included in your itinerary.
                </p>
                <div className="space-y-1.5">
                  {savedIds.map((id) => (
                    <ActivityRow
                      key={id}
                      id={id}
                      meta={savedMeta[id]}
                      excluded={trip.excludedActivityIds.includes(id)}
                      onToggle={() => toggleExclude(id)}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-white/25">
                  {activeActivityIds.length} of {savedIds.length} included
                </p>
              </>
            )}
          </SectionCard>

          {/* Destination / cities */}
          <SectionCard title="Destination">
            <div className="space-y-2">
              {trip.cities.map((stop, i) => (
                <CityRow
                  key={i}
                  index={i}
                  stop={stop}
                  onUpdate={(patch) => updateCity(i, patch)}
                  onRemove={() => removeCity(i)}
                  canRemove={trip.cities.length > 1}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addCity}
              className="flex items-center gap-1.5 text-xs text-white/35 hover:text-lantern-mint transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Add city stop
            </button>

            <div>
              <FieldLabel label="Start date" />
              <input
                type="date"
                value={trip.startDate}
                min={todayIso()}
                onChange={(e) => updateTrip({ startDate: e.target.value })}
                className={inputCls}
              />
            </div>

            {trip.startDate && (
              <p className="text-[11px] text-white/25">
                {totalDays} {totalDays === 1 ? "day" : "days"} ·{" "}
                {shortDate(trip.startDate)} – {shortDate(endDate)}
              </p>
            )}
          </SectionCard>

          {/* Flight */}
          <SectionCard title="Flight">
            <div>
              <FieldLabel label="Outbound — arrival" />
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Arrival airport or city"
                  value={trip.flight?.arrivalCity ?? ""}
                  onChange={(e) => updateFlight({ arrivalCity: e.target.value })}
                  className={inputCls}
                />
                <input
                  type="datetime-local"
                  value={trip.flight?.arrivalDateTime ?? ""}
                  onChange={(e) => updateFlight({ arrivalDateTime: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <FieldLabel label="Return — departure" />
              <input
                type="datetime-local"
                value={trip.flight?.departureDateTime ?? ""}
                onChange={(e) => updateFlight({ departureDateTime: e.target.value })}
                className={inputCls}
              />
            </div>

            <CtaLink href="/flights" label="Search on Flights" />
          </SectionCard>

          {/* Hotel */}
          <SectionCard title="Hotel / base">
            <div>
              <FieldLabel label="Hotel name or neighborhood" note="(optional)" />
              <input
                type="text"
                placeholder="e.g. Park Hyatt Shinjuku"
                value={trip.hotel?.name ?? ""}
                onChange={(e) =>
                  updateTrip({ hotel: { name: e.target.value } })
                }
                className={inputCls}
              />
            </div>
            <CtaLink href="/hotels" label="Search on Hotels" />
          </SectionCard>

          {/* Preferences */}
          <SectionCard title="Preferences">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel label="Wake time" />
                <input
                  type="time"
                  value={trip.wakeTime}
                  onChange={(e) => updateTrip({ wakeTime: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel label="Bedtime" />
                <input
                  type="time"
                  value={trip.bedTime}
                  onChange={(e) => updateTrip({ bedTime: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <ToggleGroup
              label="Travel pace"
              options={["relaxed", "balanced", "packed"] as UIPace[]}
              value={trip.pace}
              onChange={(v) => updateTrip({ pace: v })}
              cols={3}
            />

            <ToggleGroup
              label="Getting around"
              options={["walking", "public transit", "taxi", "mixed"] as UITransit[]}
              value={trip.transit}
              onChange={(v) => updateTrip({ transit: v })}
              cols={2}
            />
          </SectionCard>

          {/* Action buttons */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={generate}
              disabled={!primaryCity || isGenerating}
              className="w-full inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-lantern-mint to-lantern-blue px-8 text-sm font-bold text-ink shadow-glow transition hover:opacity-90 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
            >
              {isGenerating ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/40 border-t-ink animate-spin" />
                  Planning your trip…
                </>
              ) : hasItinerary ? (
                <>
                  <span className="text-base">↺</span>
                  Regenerate itinerary
                </>
              ) : (
                <>
                  <span className="text-base">✦</span>
                  Generate itinerary
                </>
              )}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveTrip}
                className={`flex-1 h-9 rounded-full border text-xs font-medium transition-colors ${
                  saveNotice
                    ? "border-lantern-mint/40 text-lantern-mint"
                    : "border-white/[0.1] text-white/45 hover:text-white/75 hover:border-white/20"
                }`}
              >
                {saveNotice ? "Saved ✓" : "Save trip"}
              </button>
              <button
                type="button"
                onClick={clearTrip}
                className="flex-1 h-9 rounded-full border border-white/[0.06] text-xs font-medium text-white/30 hover:text-red-400 hover:border-red-400/20 transition-colors"
              >
                Clear trip
              </button>
            </div>

            {!primaryCity && (
              <p className="text-[11px] text-white/25 text-center">
                Enter a destination above to generate.
              </p>
            )}
          </div>
        </aside>

        {/* ── RIGHT: Itinerary output ── */}
        <main>

          {/* No itinerary, not generating */}
          {!hasItinerary && !isGenerating && genStatus !== "error" && (
            <div className="flex flex-col items-center justify-center min-h-[480px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
              <div className="h-14 w-14 rounded-2xl border border-white/[0.1] bg-white/[0.03] flex items-center justify-center text-2xl mb-5">
                ✦
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Build your itinerary</h1>
              <p className="text-sm text-white/40 max-w-xs leading-relaxed">
                {savedIds.length === 0
                  ? "Save places on the Activities page, fill in your trip details, then click Generate."
                  : activeActivityIds.length === 0
                  ? "All saved places are excluded. Check some to include them in your plan."
                  : !primaryCity
                  ? `${activeActivityIds.length} places ready. Enter a destination and click Generate.`
                  : `${activeActivityIds.length} places ready for ${primaryCity}. Click Generate to plan your days.`}
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

          {/* Generating spinner */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center min-h-[480px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
              <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-lantern-mint animate-spin mb-6" />
              <p className="text-sm text-white/50">Clustering activities by geography…</p>
              <p className="text-xs text-white/25 mt-2">Usually under a second</p>
            </div>
          )}

          {/* Error with no previous result */}
          {genStatus === "error" && !hasItinerary && (
            <div className="flex flex-col items-center justify-center min-h-[480px] rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-10 text-center">
              <p className="text-sm font-semibold text-red-400 mb-2">Failed to generate itinerary</p>
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

          {/* Itinerary result */}
          {hasItinerary && trip.itinerary && !isGenerating && (
            <div>
              {/* Result header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {trip.cities.map((c) => c.city).filter(Boolean).join(" → ") || "Your trip"}
                  </h1>
                  <p className="text-sm text-white/40 mt-1">
                    {trip.startDate && `${shortDate(trip.startDate)} – ${shortDate(endDate)} · `}
                    {trip.itinerary.days.length} {trip.itinerary.days.length === 1 ? "day" : "days"} ·{" "}
                    {trip.itinerary.meta.totalActivitiesScheduled} activities
                  </p>
                  {trip.itineraryGeneratedAt && (
                    <p className="text-[11px] text-white/20 mt-1">
                      Generated {new Date(trip.itineraryGeneratedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {genStatus === "error" && (
                  <p className="text-xs text-red-400 shrink-0 mt-1">
                    Regeneration failed — showing last result
                  </p>
                )}
              </div>

              {/* Day tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
                {trip.itinerary.days.map((day, i) => (
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
              {trip.itinerary.days[selectedDay] && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.01] p-6">
                  <DayView
                    day={trip.itinerary.days[selectedDay]}
                    savedMeta={savedMeta}
                  />
                </div>
              )}

              {/* Dropped activities */}
              {trip.itinerary.meta.droppedActivities.length > 0 && (
                <div className="mt-4 rounded-xl border border-lantern-gold/20 bg-lantern-gold/[0.04] px-5 py-4">
                  <p className="text-xs font-semibold text-lantern-gold mb-2">
                    {trip.itinerary.meta.droppedActivities.length} place
                    {trip.itinerary.meta.droppedActivities.length === 1 ? "" : "s"} couldn&apos;t fit
                  </p>
                  <ul className="space-y-1">
                    {trip.itinerary.meta.droppedActivities.map((d, i) => (
                      <li key={i} className="text-xs text-white/35">
                        <span className="text-white/55">{d.title}</span> — {d.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Planner notes */}
              {trip.itinerary.meta.conflicts.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.01] px-5 py-4">
                  <p className="text-xs font-semibold text-white/30 mb-2">Notes</p>
                  <ul className="space-y-1">
                    {trip.itinerary.meta.conflicts.map((c, i) => (
                      <li key={i} className="text-xs text-white/30">{c.description}</li>
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

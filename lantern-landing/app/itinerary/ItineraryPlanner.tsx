"use client";

import { useState, useEffect, useCallback, useId } from "react";
import Link from "next/link";

// ── Local types ───────────────────────────────────────────────────────────────

interface LatLng { lat: number; lng: number }

type SlotKind =
  | "activity"
  | "meal"
  | "hotel_checkin"
  | "hotel_checkout"
  | "airport_transfer"
  | "free_time";

interface TransitInfo { mode: string; durationMinutes: number; distanceKm: number }

interface PlannedSlot {
  kind:            SlotKind;
  startMinutes:    number;
  endMinutes:      number;
  durationMinutes: number;
  tripActivityId?: string;
  sourceId?:       string;
  title:           string;
  location?:       LatLng;
  transit?:        TransitInfo;
  explanation:     string;
  note?:           string;
}

interface PlannedDay {
  dayIndex:               number;
  date:                   string;
  theme:                  string;
  geographicArea:         string;
  slots:                  PlannedSlot[];
  scheduledActivityCount: number;
  totalActivityMinutes:   number;
}

interface PlannerOutput {
  days: PlannedDay[];
  meta: {
    solverDurationMs:         number;
    totalActivitiesScheduled: number;
    totalActivitiesDropped:   number;
    droppedActivities:        Array<{ sourceId: string; title: string; reason: string }>;
    conflicts:                Array<{ type: string; description: string; suggestion: string }>;
  };
}

interface ActivityEntry {
  id:              string;
  name:            string;
  category:        string;
  priority:        1 | 2 | 3;
  durationMinutes: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function dateLabel(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

function weekday(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", timeZone: "UTC",
  });
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconPlane({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function IconHotel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4z" />
    </svg>
  );
}

function IconMap({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function IconActivity({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconWalk({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
    </svg>
  );
}

function IconBus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" />
    </svg>
  );
}

function IconCar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
    </svg>
  );
}

function TransitIcon({ mode, className }: { mode: string; className?: string }) {
  if (mode === "walking") return <IconWalk className={className} />;
  if (mode === "driving") return <IconCar className={className} />;
  return <IconBus className={className} />;
}

// ── Slot appearance config ────────────────────────────────────────────────────

const SLOT_STYLE: Record<SlotKind, { dot: string; ring: string; bg: string; label: string }> = {
  activity:         { dot: "bg-lantern-blue",   ring: "border-lantern-blue/30",   bg: "bg-lantern-blue/[0.07]",   label: "text-lantern-blue"   },
  meal:             { dot: "bg-lantern-gold",   ring: "border-lantern-gold/30",   bg: "bg-lantern-gold/[0.06]",   label: "text-lantern-gold"   },
  hotel_checkin:    { dot: "bg-lantern-violet", ring: "border-lantern-violet/30", bg: "bg-lantern-violet/[0.06]", label: "text-lantern-violet" },
  hotel_checkout:   { dot: "bg-lantern-violet", ring: "border-lantern-violet/30", bg: "bg-lantern-violet/[0.06]", label: "text-lantern-violet" },
  airport_transfer: { dot: "bg-white/50",       ring: "border-white/12",          bg: "bg-white/[0.03]",          label: "text-white/50"       },
  free_time:        { dot: "bg-white/25",       ring: "border-white/8",           bg: "bg-white/[0.02]",          label: "text-white/40"       },
};

const SLOT_EMOJI: Record<SlotKind, string> = {
  activity:         "📍",
  meal:             "🍽️",
  hotel_checkin:    "🏨",
  hotel_checkout:   "🧳",
  airport_transfer: "✈️",
  free_time:        "🕐",
};

const CATEGORY_ICONS: Record<string, string> = {
  food: "🍜", culture: "🏛️", nature: "🌿", adventure: "⚡",
  shopping: "🛍️", nightlife: "🌃", wellness: "🧘", art: "🎨",
  entertainment: "🎭", family: "👨‍👩‍👧", luxury: "✨", other: "📍",
};

// ── Day palette (for map bubbles and tab accents) ─────────────────────────────

const DAY_COLORS = [
  "#77A7FF", "#8FF7D0", "#A78BFA", "#F6D68A",
  "#F472B6", "#34D399", "#FB923C", "#A3E635",
];

// ── Form section wrapper ──────────────────────────────────────────────────────

function Section({
  title, icon, collapsible = false, defaultOpen = true, children,
}: {
  title: string; icon: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] overflow-hidden">
      <button
        type="button"
        className={`w-full flex items-center justify-between px-5 py-4 text-left ${collapsible ? "cursor-pointer hover:bg-white/[0.03] transition" : ""}`}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        aria-expanded={collapsible ? open : undefined}
      >
        <div className="flex items-center gap-3">
          <span className="text-white/55">{icon}</span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {collapsible && (
          <IconChevronDown
            className={`h-4 w-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {(!collapsible || open) && (
        <div className="px-5 pb-5 border-t border-white/6">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

// ── Form controls ─────────────────────────────────────────────────────────────

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-white/50 mb-1.5">
      {children}
    </label>
  );
}

function Input({ id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { id?: string }) {
  return (
    <input
      id={id}
      {...props}
      className={`w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-lantern-blue/50 focus:bg-white/[0.07] ${props.className ?? ""}`}
    />
  );
}

function Select({ id, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { id?: string }) {
  return (
    <select
      id={id}
      {...props}
      className={`w-full rounded-xl border border-white/12 bg-panel px-4 py-2.5 text-sm text-white outline-none transition focus:border-lantern-blue/50 ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
}

function ToggleGroup<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              value === opt.value
                ? "bg-lantern-blue text-ink"
                : "bg-white/[0.05] text-white/50 hover:bg-white/[0.08] hover:text-white/70"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Activity entry row ────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<1 | 2 | 3, { label: string; color: string }> = {
  1: { label: "Must-do", color: "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/25" },
  2: { label: "Want to", color: "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/25" },
  3: { label: "Nice", color: "bg-white/8 text-white/45 border-white/12" },
};

function ActivityRow({
  entry, onChange, onRemove,
}: {
  entry: ActivityEntry;
  onChange: (patch: Partial<ActivityEntry>) => void;
  onRemove: () => void;
}) {
  const priorities: Array<1 | 2 | 3> = [1, 2, 3];
  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 min-w-0 space-y-1.5">
        <Input
          value={entry.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Activity name"
        />
        <div className="flex gap-1.5">
          <Select
            value={entry.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className="text-xs py-1.5"
          >
            {Object.entries(CATEGORY_ICONS).filter(([k]) => k !== "other").map(([k, icon]) => (
              <option key={k} value={k}>{icon} {k.charAt(0).toUpperCase() + k.slice(1)}</option>
            ))}
          </Select>
          <Select
            value={String(entry.durationMinutes)}
            onChange={(e) => onChange({ durationMinutes: Number(e.target.value) })}
            className="text-xs py-1.5 w-28 shrink-0"
          >
            {[30, 60, 90, 120, 150, 180, 240].map((m) => (
              <option key={m} value={m}>{formatDuration(m)}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {priorities.map((p) => {
          const meta = PRIORITY_LABELS[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ priority: p })}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition ${
                entry.priority === p ? meta.color : "bg-white/[0.03] text-white/25 border-white/8 hover:text-white/40"
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-1 text-white/25 hover:text-red-400 transition p-1 shrink-0"
        title="Remove"
      >
        <IconTrash className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Timeline slot ─────────────────────────────────────────────────────────────

function TimelineSlot({ slot, isLast }: { slot: PlannedSlot; isLast: boolean }) {
  const style = SLOT_STYLE[slot.kind];
  const isTransitConnector = slot.kind === "free_time" && slot.transit;

  if (isTransitConnector) {
    return (
      <div className="relative pl-10 py-0.5">
        <div className="absolute left-[17px] top-0 bottom-0 border-l border-dashed border-white/10" />
        <div className="flex items-center gap-2 py-2">
          <TransitIcon mode={slot.transit!.mode} className="h-3 w-3 text-white/30 shrink-0" />
          <span className="text-xs text-white/30">
            {slot.transit!.durationMinutes} min by {slot.transit!.mode}
            {slot.transit!.distanceKm > 0 && ` · ${slot.transit!.distanceKm} km`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pl-10 pb-3">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[17px] top-5 bottom-0 border-l border-white/10" />
      )}

      {/* Dot */}
      <div className={`absolute left-[11px] top-[18px] h-3 w-3 rounded-full ${style.dot} ring-2 ring-ink z-10`} />

      {/* Time label */}
      <div className="text-[10px] font-mono text-white/35 mb-1.5 pt-[14px]">
        {formatTime(slot.startMinutes)}
        {slot.durationMinutes > 0 && (
          <span className="ml-1.5 text-white/22">→ {formatTime(slot.endMinutes)}</span>
        )}
      </div>

      {/* Card */}
      <div className={`rounded-xl border ${style.ring} ${style.bg} px-4 py-3`}>
        <div className="flex items-start gap-3">
          <span className="text-base shrink-0 mt-0.5" role="img">{SLOT_EMOJI[slot.kind]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-white leading-snug">{slot.title}</p>
              <span className={`shrink-0 text-[10px] font-semibold ${style.label}`}>
                {formatDuration(slot.durationMinutes)}
              </span>
            </div>
            {slot.kind === "activity" && slot.sourceId && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-white/35 capitalize">
                  {CATEGORY_ICONS["culture"]}
                </span>
              </div>
            )}
            {slot.explanation && (
              <p className="text-xs text-white/42 mt-1.5 leading-relaxed">
                {slot.explanation}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Map preview (abstract cluster viz) ───────────────────────────────────────

function MapPreview({ days }: { days: PlannedDay[] }) {
  // Deterministic pseudo-positions for each day cluster
  const positions = days.map((_, i) => ({
    x: 15 + (i % 4) * 21 + (Math.floor(i / 4) % 2) * 10,
    y: 20 + Math.floor(i / 4) * 35 + (i % 2) * 12,
  }));

  return (
    <div className="relative h-36 rounded-xl bg-white/[0.02] border border-white/8 overflow-hidden select-none">
      {/* Grid texture */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Day bubbles */}
      {days.map((day, i) => {
        const pos = positions[i];
        const color = DAY_COLORS[i % DAY_COLORS.length];
        const actCount = day.scheduledActivityCount;
        return (
          <div
            key={i}
            className="absolute flex flex-col items-center"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)" }}
          >
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-ink shadow-lg"
              style={{ backgroundColor: color }}
            >
              {i + 1}
            </div>
            {actCount > 0 && (
              <div className="mt-0.5 text-[9px] text-white/35">{actCount} stops</div>
            )}
          </div>
        );
      })}

      {/* Label */}
      <div className="absolute bottom-2 right-3 text-[9px] text-white/20 font-medium tracking-wide uppercase">
        Geographic clusters · not to scale
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ day }: { day: PlannedDay }) {
  const actSlots = day.slots.filter((s) => s.kind === "activity");

  return (
    <div>
      {/* Day header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white leading-tight">{day.theme}</h2>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-sm text-white/45">{weekday(day.date)}, {dateLabel(day.date)}</span>
          {actSlots.length > 0 && (
            <>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="text-sm text-white/45">
                {actSlots.length} activit{actSlots.length !== 1 ? "ies" : "y"}
              </span>
            </>
          )}
          {day.totalActivityMinutes > 0 && (
            <>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="text-sm text-white/45">
                {formatDuration(day.totalActivityMinutes)} exploring
              </span>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {day.slots.map((slot, i) => (
          <TimelineSlot key={i} slot={slot} isLast={i === day.slots.length - 1} />
        ))}
        {day.slots.length === 0 && (
          <p className="text-sm text-white/35 italic pl-10">No activities scheduled for this day.</p>
        )}
      </div>
    </div>
  );
}

// ── Itinerary result ──────────────────────────────────────────────────────────

function ItineraryResult({
  output, destination,
}: {
  output: PlannerOutput; destination: string;
}) {
  const [selectedDay, setSelectedDay] = useState(0);
  const day = output.days[selectedDay];

  return (
    <div className="flex flex-col gap-6">
      {/* Top summary bar */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-white/40 mb-1">Generated itinerary</p>
            <p className="font-bold text-white text-lg">{destination}</p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <p className="text-2xl font-black text-white">{output.days.length}</p>
              <p className="text-xs text-white/40">days</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-lantern-mint">{output.meta.totalActivitiesScheduled}</p>
              <p className="text-xs text-white/40">scheduled</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-white/50">{output.meta.solverDurationMs}ms</p>
              <p className="text-xs text-white/40">computed in</p>
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts / dropped */}
      {(output.meta.conflicts.length > 0 || output.meta.totalActivitiesDropped > 0) && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-5 py-4">
          <p className="text-sm font-semibold text-amber-300 mb-2">Scheduling notes</p>
          {output.meta.conflicts.map((c, i) => (
            <div key={i} className="text-xs text-amber-200/70 mb-1">
              <span className="font-medium">{c.description}</span>
              {c.suggestion && <span className="text-amber-200/45"> — {c.suggestion}</span>}
            </div>
          ))}
          {output.meta.droppedActivities.map((d, i) => (
            <div key={i} className="text-xs text-amber-200/50 mb-0.5">
              <span className="font-medium">{d.title}</span>
              <span className="text-amber-200/35"> dropped: {d.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Map preview */}
      <MapPreview days={output.days} />

      {/* Day tabs */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        {output.days.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelectedDay(i)}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              selectedDay === i
                ? "bg-white text-ink"
                : "bg-white/[0.05] text-white/55 hover:bg-white/[0.08] hover:text-white/75"
            }`}
          >
            <span className="block text-[10px] font-normal opacity-60">
              {weekday(d.date)}
            </span>
            Day {i + 1}
          </button>
        ))}
      </div>

      {/* Active day */}
      {day && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-6">
          <DayView day={day} />
        </div>
      )}
    </div>
  );
}

// ── Empty / loading states ────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl border border-white/8 bg-white/[0.015] text-center px-8 py-16">
      <div className="h-16 w-16 rounded-2xl bg-lantern-blue/10 border border-lantern-blue/20 flex items-center justify-center text-3xl mb-5">
        🗺️
      </div>
      <h3 className="text-lg font-bold text-white mb-2">Your itinerary will appear here</h3>
      <p className="text-sm text-white/45 max-w-xs leading-relaxed">
        Fill in your trip details on the left, then click{" "}
        <span className="text-lantern-mint font-medium">Generate AI Itinerary</span>{" "}
        to get a personalized day-by-day plan.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 text-left max-w-sm w-full">
        {[
          { icon: "⏰", text: "Respects opening hours" },
          { icon: "📍", text: "Geographic clustering" },
          { icon: "🚇", text: "Real transit times" },
          { icon: "🍽️", text: "Meal timing built in" },
        ].map((item) => (
          <div key={item.text} className="flex items-center gap-2.5 text-sm text-white/40">
            <span>{item.icon}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GeneratingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl border border-lantern-blue/20 bg-lantern-blue/[0.03] text-center px-8">
      <div className="relative mb-6">
        <div className="h-16 w-16 rounded-full border-2 border-lantern-blue/30 border-t-lantern-blue animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl">✦</span>
      </div>
      <p className="text-base font-semibold text-white">Building your itinerary…</p>
      <p className="text-sm text-white/40 mt-2">
        Clustering activities · Scheduling days · Optimising routes
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl border border-red-500/20 bg-red-500/[0.03] text-center px-8 py-16">
      <div className="text-4xl mb-4">⚠️</div>
      <p className="text-base font-semibold text-white mb-2">Generation failed</p>
      <p className="text-sm text-red-300/70 max-w-xs mb-6">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-white/20 px-6 py-2 text-sm font-medium text-white hover:bg-white/[0.05] transition"
      >
        Try again
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Status = "idle" | "generating" | "ready" | "error";

let activityCounter = 0;

export default function ItineraryPlanner() {
  // ── Trip setup ──────────────────────────────────────────────────────────────
  const [destination, setDestination] = useState("Tokyo, Japan");
  const [city, setCity]               = useState("Tokyo");
  const [startDate, setStartDate]     = useState("");
  const [endDate, setEndDate]         = useState("");
  const [travelers, setTravelers]     = useState(2);

  // ── Flight ──────────────────────────────────────────────────────────────────
  const [arrivalDateTime, setArrivalDateTime]   = useState("");
  const [departureDateTime, setDepartureDateTime] = useState("");

  // ── Hotel ───────────────────────────────────────────────────────────────────
  const [hotelName, setHotelName]   = useState("");
  const [hotelCheckIn, setHotelCheckIn]   = useState("");
  const [hotelCheckOut, setHotelCheckOut] = useState("");

  // ── Activities ──────────────────────────────────────────────────────────────
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  // ── Preferences ─────────────────────────────────────────────────────────────
  const [wakeTime, setWakeTime]       = useState("08:00");
  const [bedTime, setBedTime]         = useState("22:00");
  const [pace, setPace]               = useState<"relaxed" | "moderate" | "packed">("moderate");
  const [transitMode, setTransitMode] = useState<"walking" | "transit" | "driving">("transit");
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [jetLagDays, setJetLagDays]   = useState(0);
  const [maxWalkMinutes, setMaxWalkMinutes] = useState(20);

  // ── Output ──────────────────────────────────────────────────────────────────
  const [status, setStatus]   = useState<Status>("idle");
  const [output, setOutput]   = useState<PlannerOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load saved activity count from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("travelgrab:saved-activities");
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        setSavedCount(Array.isArray(ids) ? ids.length : 0);
      }
    } catch { /* ignore */ }
  }, []);

  // Default dates: next month
  useEffect(() => {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, "0");
    const d = String(next.getDate()).padStart(2, "0");
    const base = `${y}-${m}-${d}`;
    setStartDate(base);
    setHotelCheckIn(base);
    const end = new Date(next);
    end.setDate(end.getDate() + 6);
    const e = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    setEndDate(e);
    setHotelCheckOut(e);
    setArrivalDateTime(base + "T14:00");
    setDepartureDateTime(e + "T11:00");
  }, []);

  // ── Activity management ──────────────────────────────────────────────────────

  function addActivity() {
    activityCounter++;
    setActivities((prev) => [
      ...prev,
      {
        id:              `act-${activityCounter}`,
        name:            "",
        category:        "culture",
        priority:        3,
        durationMinutes: 90,
      },
    ]);
  }

  function updateActivity(id: string, patch: Partial<ActivityEntry>) {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeActivity(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!startDate || !endDate || !destination) {
      setErrorMsg("Please enter destination, start date, and end date.");
      setStatus("error");
      return;
    }

    setStatus("generating");
    setErrorMsg(null);

    const body = {
      trip: {
        startDate,
        endDate,
        numTravelers: travelers,
        city:         city || destination.split(",")[0].trim(),
        destination,
      },
      preferences: {
        wakeTimeMinutes:      timeToMinutes(wakeTime),
        sleepTimeMinutes:     timeToMinutes(bedTime),
        pace,
        jetLagDays,
        preferredTransitMode: transitMode,
        maxWalkMinutes,
        mealsPerDay,
        breakfastDurationMin: 30,
        lunchDurationMin:     60,
        dinnerDurationMin:    75,
      },
      ...(hotelName && {
        hotel: {
          name: hotelName,
          checkInDate:  hotelCheckIn  || startDate,
          checkOutDate: hotelCheckOut || endDate,
        },
      }),
      ...(arrivalDateTime && {
        outboundFlight: { arrivesAt: new Date(arrivalDateTime).toISOString() },
      }),
      ...(departureDateTime && {
        returnFlight: { departsAt: new Date(departureDateTime).toISOString() },
      }),
      activities: activities
        .filter((a) => a.name.trim())
        .map((a) => ({
          title:           a.name.trim(),
          category:        a.category,
          priority:        a.priority,
          durationMinutes: a.durationMinutes,
        })),
    };

    try {
      const res = await fetch("/api/itinerary/preview", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const data = (await res.json()) as PlannerOutput;
      setOutput(data);
      setStatus("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }, [
    startDate, endDate, destination, city, travelers,
    wakeTime, bedTime, pace, jetLagDays, transitMode, maxWalkMinutes, mealsPerDay,
    hotelName, hotelCheckIn, hotelCheckOut,
    arrivalDateTime, departureDateTime,
    activities,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-ink text-white">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-white/8 bg-ink/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/travelgrab-logo.svg" alt="TravelGrab" width={30} height={30} className="h-7 w-7 object-contain" />
            <span className="text-sm font-bold tracking-tight text-white">TravelGrab</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-white/50 sm:flex">
            <Link href="/flights" className="hover:text-white transition">Flights</Link>
            <Link href="/hotels"  className="hover:text-white transition">Hotels</Link>
            <Link href="/activities" className="hover:text-white transition">Activities</Link>
            <Link href="/itinerary" className="text-lantern-mint font-semibold">Itinerary</Link>
          </nav>

          <div className="flex items-center gap-2">
            {savedCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-lantern-violet/15 border border-lantern-violet/25 px-3 py-1 text-xs font-semibold text-lantern-violet">
                ❤ {savedCount} saved
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Page header ── */}
      <div className="border-b border-white/8 bg-white/[0.015] px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-lantern-gold/30 bg-lantern-gold/10 px-4 py-1.5 text-xs font-semibold text-lantern-gold mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-lantern-gold animate-pulse" />
            AI Itinerary Planner · V1
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Plan your perfect trip.
          </h1>
          <p className="mt-2 text-white/50 max-w-lg">
            Fill in your trip details and preferences. The AI schedules every day around opening hours, geography, and your pace.
          </p>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 items-start">

          {/* ── Left: form ── */}
          <div className="space-y-4">

            {/* Trip setup */}
            <Section title="Trip Setup" icon={<IconMap className="h-4 w-4" />}>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="dest">Destination</Label>
                  <Input
                    id="dest"
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      setCity(e.target.value.split(",")[0].trim());
                    }}
                    placeholder="e.g. Tokyo, Japan"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="start">Start date</Label>
                    <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="end">End date</Label>
                    <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="travelers">Travelers</Label>
                  <Select id="travelers" value={travelers} onChange={(e) => setTravelers(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </Section>

            {/* Flight */}
            <Section title="Flight (optional)" icon={<IconPlane className="h-4 w-4" />} collapsible defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="arr">Arrives at destination</Label>
                  <Input
                    id="arr"
                    type="datetime-local"
                    value={arrivalDateTime}
                    onChange={(e) => setArrivalDateTime(e.target.value)}
                  />
                  <p className="text-[11px] text-white/30 mt-1">Sets your Day 1 start time</p>
                </div>
                <div>
                  <Label htmlFor="dep">Departs destination</Label>
                  <Input
                    id="dep"
                    type="datetime-local"
                    value={departureDateTime}
                    onChange={(e) => setDepartureDateTime(e.target.value)}
                  />
                  <p className="text-[11px] text-white/30 mt-1">Limits your last-day activities</p>
                </div>
              </div>
            </Section>

            {/* Hotel */}
            <Section title="Hotel (optional)" icon={<IconHotel className="h-4 w-4" />} collapsible defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="hotel">Hotel name</Label>
                  <Input
                    id="hotel"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    placeholder="e.g. Park Hyatt Tokyo"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cin">Check-in</Label>
                    <Input id="cin" type="date" value={hotelCheckIn} onChange={(e) => setHotelCheckIn(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="cout">Check-out</Label>
                    <Input id="cout" type="date" value={hotelCheckOut} onChange={(e) => setHotelCheckOut(e.target.value)} />
                  </div>
                </div>
              </div>
            </Section>

            {/* Activities */}
            <Section title="Activities" icon={<IconActivity className="h-4 w-4" />}>
              <div className="space-y-3">
                {savedCount > 0 && (
                  <div className="rounded-xl border border-lantern-violet/20 bg-lantern-violet/[0.05] px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-lantern-violet">
                        {savedCount} place{savedCount !== 1 ? "s" : ""} saved from Activities
                      </p>
                      <p className="text-[11px] text-white/35 mt-0.5">
                        Direct import coming soon — add them below by name for now
                      </p>
                    </div>
                    <span className="text-xl shrink-0">❤️</span>
                  </div>
                )}

                {activities.length === 0 && (
                  <p className="text-xs text-white/35 text-center py-2">
                    No activities yet — add places you want to visit
                  </p>
                )}

                <div className="space-y-4">
                  {activities.map((a) => (
                    <ActivityRow
                      key={a.id}
                      entry={a}
                      onChange={(patch) => updateActivity(a.id, patch)}
                      onRemove={() => removeActivity(a.id)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addActivity}
                  className="w-full rounded-xl border border-dashed border-white/15 py-2.5 text-sm text-white/40 hover:text-white/60 hover:border-white/25 transition flex items-center justify-center gap-2"
                >
                  <span className="text-lg leading-none">+</span>
                  Add activity
                </button>
              </div>
            </Section>

            {/* Preferences */}
            <Section title="Preferences" icon={<span className="text-base">⚙️</span>}>
              <div className="space-y-5">

                {/* Wake / bed time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="wake">Wake-up time</Label>
                    <Input
                      id="wake"
                      type="time"
                      value={wakeTime}
                      onChange={(e) => setWakeTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bed">Bedtime</Label>
                    <Input
                      id="bed"
                      type="time"
                      value={bedTime}
                      onChange={(e) => setBedTime(e.target.value)}
                    />
                  </div>
                </div>

                <ToggleGroup
                  label="Travel pace"
                  value={pace}
                  options={[
                    { value: "relaxed", label: "Relaxed" },
                    { value: "moderate", label: "Moderate" },
                    { value: "packed", label: "Packed" },
                  ]}
                  onChange={setPace}
                />

                <ToggleGroup
                  label="Transit preference"
                  value={transitMode}
                  options={[
                    { value: "walking", label: "Walk" },
                    { value: "transit", label: "Transit" },
                    { value: "driving", label: "Drive" },
                  ]}
                  onChange={setTransitMode}
                />

                <ToggleGroup
                  label="Meals per day"
                  value={String(mealsPerDay) as "1" | "2" | "3"}
                  options={[
                    { value: "1", label: "Dinner only" },
                    { value: "2", label: "Lunch + Dinner" },
                    { value: "3", label: "All meals" },
                  ]}
                  onChange={(v) => setMealsPerDay(Number(v))}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="jetlag">Jet lag days</Label>
                    <Select id="jetlag" value={jetLagDays} onChange={(e) => setJetLagDays(Number(e.target.value))}>
                      {[0, 1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>{n} day{n !== 1 ? "s" : ""}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="walk">Max walk time</Label>
                    <Select id="walk" value={maxWalkMinutes} onChange={(e) => setMaxWalkMinutes(Number(e.target.value))}>
                      {[10, 15, 20, 30, 45].map((n) => (
                        <option key={n} value={n}>{n} min</option>
                      ))}
                    </Select>
                  </div>
                </div>

              </div>
            </Section>

            {/* Generate CTA */}
            <button
              type="button"
              onClick={generate}
              disabled={status === "generating"}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-lantern-mint to-lantern-blue text-ink font-bold text-base shadow-glow transition hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {status === "generating" ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-ink/40 border-t-ink animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <span className="text-lg">✦</span>
                  Generate AI Itinerary
                </>
              )}
            </button>

            {/* Footer note */}
            <p className="text-center text-xs text-white/25 pb-2">
              Deterministic scheduling · No LLM needed · Instant results
            </p>
          </div>

          {/* ── Right: result ── */}
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            {status === "idle"       && <EmptyState />}
            {status === "generating" && <GeneratingState />}
            {status === "error"      && <ErrorState message={errorMsg ?? "Unknown error"} onRetry={generate} />}
            {status === "ready" && output && (
              <ItineraryResult output={output} destination={destination} />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

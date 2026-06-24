"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PlannerOutput, PlannedDay, PlannedSlot, DayWarning, DroppedActivity } from "@/lib/itinerary/types";
import {
  readTripStore, writeTripStore, updateTripStore, clearTripStore,
  TRAVEL_STYLE_LABELS, TRIP_STORE_DEFAULT,
} from "@/lib/trip-store";
import type { TravelStyle } from "@/lib/trip-store";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { RecommendationsPanel } from "./components/RecommendationsPanel";
import { SavedPlacesPanel } from "./components/SavedPlacesPanel";

// ── Types ──────────────────────────────────────────────────────────────────────

type SavedMeta = {
  title:        string;
  category:     string;
  neighborhood: string;
  duration:     string;
  rating:       number;
  photoRef?:    string;
  lat?:         number;
  lng?:         number;
  city?:        string;  // destination searched when activity was saved
};

interface AiRecommendation {
  id:            string;
  title:         string;
  city:          string;
  category:      string;
  estimatedCost: string;
  duration:      string;
  reason:        string;
  tags:          string[];
}

type UIPace    = "relaxed" | "balanced" | "packed";
type UITransit = "walking" | "public transit" | "taxi" | "mixed";

interface CityStop {
  city: string;
  days: number;
}

// Written by Hotels page ("+ Itinerary" button)
interface SelectedHotel {
  hotelId:      string;
  name:         string;
  neighborhood: string;
  address:      string;
  lat?:         number;
  lng?:         number;
  pricePerNight: number;
  currency:     string;
  rating:       number;
  imageUrl:     string;
  aiScore:      number;
}

// Written by Flights page ("+ Itinerary" button)
interface SelectedFlight {
  flightKey:          string;
  airline:            string;
  airlineCode:        string;
  flightNumber:       string;
  origin:             string;
  destination:        string;
  departTime:         string;   // "HH:MM" 24-hour
  arriveTime:         string;   // "HH:MM" 24-hour
  duration:           string;
  stops:              number;
  stopLabel:          string;
  price:              number;
  currency:           string;
  returnOrigin?:       string;
  returnDestination?:  string;
  returnDepartTime?:   string;
  returnArriveTime?:   string;
  returnDuration?:     string;
  returnStopLabel?:    string;
}

// Trip form state (persisted to travelgrab_itinerary_trip_v1)
interface TripStorage {
  version:              1;
  cities:               CityStop[];
  startDate:            string;
  // Manual flight fallback (used only if no SelectedFlight in localStorage)
  manualArrivalTime:    string;
  manualDepartureTime:  string;
  // Manual hotel fallback (used only if no SelectedHotel in localStorage)
  manualHotelName:      string;
  wakeTime:             string;
  bedTime:              string;
  pace:                 UIPace;
  transit:              UITransit;
  excludedActivityIds:  string[];
  itinerary:            PlannerOutput | null;
  itineraryGeneratedAt: string | null;
  savedActivityIds?:    string[];
  savedActivityMeta?:   Record<string, SavedMeta>;
}

type StoredTrip = {
  id:        string;
  name:      string;
  trip:      TripStorage;
  createdAt: string;
  updatedAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const TRIP_KEY   = "travelgrab_itinerary_trip_v1";
const HOTEL_KEY  = "travelgrab_selected_hotel_v1";
const FLIGHT_KEY = "travelgrab_selected_flight_v1";

const DEFAULT_TRIP: TripStorage = {
  version:              1,
  cities:               [{ city: "", days: 5 }],
  startDate:            "",
  manualArrivalTime:    "",
  manualDepartureTime:  "",
  manualHotelName:      "",
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

// ── Multi-trip storage helpers ─────────────────────────────────────────────────

function generateTripId(): string { return crypto.randomUUID(); }
function getAllTrips(): StoredTrip[] {
  try {
    const data = localStorage.getItem("travelgrab_trips_v2");
    return data ? (JSON.parse(data) as StoredTrip[]) : [];
  } catch { return []; }
}
function getCurrentTripId(): string | null {
  return localStorage.getItem("travelgrab_current_trip_id");
}
function saveAllTrips(trips: StoredTrip[]): void {
  localStorage.setItem("travelgrab_trips_v2", JSON.stringify(trips));
}
function setCurrentTripId(id: string): void {
  localStorage.setItem("travelgrab_current_trip_id", id);
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

// Format "HH:MM" 24h to "8:30 AM"
function fmt24(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${(m ?? 0).toString().padStart(2, "0")} ${period}`;
}

// ── Destination autocomplete (onboarding step 1) ──────────────────────────────

interface AutocompleteSuggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

function ItineraryDestinationInput({
  value,
  validated,
  error,
  onChange,
  onValidate,
}: {
  value: string;
  validated: boolean;
  error: string | null;
  onChange: (v: string) => void;
  onValidate: (normalized: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [open, setOpen]               = useState(false);
  const [fetching, setFetching]       = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchSuggestions(input: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const res = await fetch("/api/activities/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });
        if (!res.ok) return;
        const data = await res.json() as { suggestions: AutocompleteSuggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions?.length ?? 0) > 0);
        setActiveIdx(-1);
      } catch { /* ignore */ }
      finally { setFetching(false); }
    }, 300);
  }

  function select(s: AutocompleteSuggestion) {
    onValidate(s.text);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown")      { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && activeIdx >= 0 && suggestions[activeIdx]) {
      e.preventDefault(); select(suggestions[activeIdx]);
    } else if (e.key === "Escape")  { setOpen(false); setActiveIdx(-1); }
  }

  return (
    <div className="relative">
      <div className={`relative rounded-xl border transition-colors ${
        error ? "border-red-500/50" : validated ? "border-lantern-mint/40" : "border-white/[0.12]"
      } bg-white/[0.05]`}>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); fetchSuggestions(e.target.value); }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="e.g. Japan, Southeast Asia, Tokyo…"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent px-4 py-3.5 text-base text-white placeholder:text-white/25 focus:outline-none pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {fetching && <span className="block h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />}
          {!fetching && validated && <span className="text-lantern-mint text-sm font-bold">✓</span>}
        </div>
      </div>
      {error && <p className="text-xs text-red-400 mt-1.5 px-1">{error}</p>}
      {!error && !validated && value.trim().length > 0 && (
        <p className="text-xs text-white/30 mt-1.5 px-1">Select a destination from the suggestions.</p>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-white/[0.1] bg-[#0e1422] shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={s.placeId || i}>
              <button
                onMouseDown={(e) => { e.preventDefault(); select(s); }}
                className={`w-full text-left flex items-center gap-2 px-4 py-2.5 transition-colors ${
                  i === activeIdx ? "bg-white/[0.08] text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <span className="text-sm font-medium text-white truncate">{s.mainText}</span>
                {s.secondaryText && <span className="text-xs text-white/40 flex-shrink-0">{s.secondaryText}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

// ── Place detail (loaded lazily on modal open) ────────────────────────────────

interface PlaceDetailData {
  address?:             string;
  openNow?:             boolean;
  weekdayDescriptions?: string[];
  website?:             string;
  googleMapsUri?:       string;
  editorialSummary?:    string;
  phone?:               string;
  photos?:              Array<{ name: string }>;
  rating?:              number;
  userRatingCount?:     number;
  reviews?:             Array<{
    authorName?:    string;
    rating?:        number;
    text?:          string;
    timeAgo?:       string;
    authorPhotoUri?: string;
  }>;
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const SLOT_STYLE: Record<string, { dot: string; border: string; bg: string }> = {
  activity:           { dot: "bg-lantern-mint",   border: "border-lantern-mint/25",  bg: "bg-lantern-mint/[0.05]"  },
  meal:               { dot: "bg-lantern-gold",   border: "border-lantern-gold/25",  bg: "bg-lantern-gold/[0.05]"  },
  hotel_checkin:      { dot: "bg-white/25",       border: "border-white/10",         bg: "bg-white/[0.02]"         },
  hotel_checkout:     { dot: "bg-white/25",       border: "border-white/10",         bg: "bg-white/[0.02]"         },
  airport_transfer:   { dot: "bg-lantern-blue",   border: "border-lantern-blue/25",  bg: "bg-lantern-blue/[0.05]"  },
  intercity_transfer: { dot: "bg-lantern-violet", border: "border-lantern-violet/30",bg: "bg-lantern-violet/[0.07]"},
  free_time:          { dot: "bg-white/15",       border: "border-white/[0.07]",     bg: "bg-white/[0.01]"         },
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
  const showKm = t.coordsSource !== "estimated" && t.distanceKm > 0;
  return (
    <div className="flex items-center gap-2 py-1.5 pl-[4.5rem]">
      <span className="text-xs text-white/25">
        {icon} {t.durationMinutes}m{showKm ? ` · ${t.distanceKm.toFixed(1)} km` : ""}
      </span>
    </div>
  );
}

function TimelineSlot({
  slot, savedMeta, isLast, compact, onSlotClick, onDelete, onEditTime,
  onRename, isRenaming, renameValue, onRenameChange, onRenameCommit,
  onDragStart, onDragEnd, isDragging, onMoveUp, onMoveDown,
  onEditNotes, onEditDuration,
}: {
  slot:              PlannedSlot;
  savedMeta:         Record<string, SavedMeta>;
  isLast:            boolean;
  compact:           boolean;
  onSlotClick:       (slot: PlannedSlot) => void;
  onDelete?:         (slot: PlannedSlot) => void;
  onEditTime?:       (slot: PlannedSlot) => void;
  onRename?:         (slot: PlannedSlot) => void;
  isRenaming?:       boolean;
  renameValue?:      string;
  onRenameChange?:   (v: string) => void;
  onRenameCommit?:   () => void;
  onDragStart?:      (slot: PlannedSlot) => void;
  onDragEnd?:        () => void;
  isDragging?:       boolean;
  onMoveUp?:         () => void;
  onMoveDown?:       () => void;
  onEditNotes?:      (slot: PlannedSlot, note: string) => void;
  onEditDuration?:   (slot: PlannedSlot, minutes: number) => void;
}) {
  const [noteEdit,     setNoteEdit]     = useState<string | null>(null);
  const [durationEdit, setDurationEdit] = useState<number | null>(null);

  if (slot.kind === "free_time" && slot.transit) {
    return compact ? null : <TransitConnector slot={slot} />;
  }

  const style = SLOT_STYLE[slot.kind] ?? SLOT_STYLE.free_time;
  const meta  = Object.values(savedMeta).find((m) => m.title === slot.title) ?? null;
  const cat   = meta?.category ?? null;
  const nbhd  = meta?.neighborhood ?? null;
  const isClickable = slot.kind === "activity" || slot.kind === "intercity_transfer";

  if (compact) {
    if (slot.kind === "free_time") return null; // hide free-time in compact
    const lineColor = slot.kind === "intercity_transfer" ? "border-lantern-violet/20" : "border-white/[0.06]";
    return (
      <div
        className={`group flex items-center gap-3 py-2.5 border-b ${lineColor} select-none ${isClickable && slot.kind !== "activity" ? "cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors" : ""} ${isDragging ? "opacity-40" : ""} ${slot.kind === "activity" && onDragStart ? "cursor-grab active:cursor-grabbing" : ""}`}
        draggable={slot.kind === "activity" && !!onDragStart}
        onDragStart={slot.kind === "activity" ? (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", slot.title);
          onDragStart?.(slot);
        } : undefined}
        onDragEnd={onDragEnd}
        onClick={isClickable && slot.kind !== "activity" ? () => onSlotClick(slot) : undefined}
      >
        {onEditTime && (slot.kind === "activity" || slot.kind === "meal") ? (
          <button
            type="button"
            draggable={false}
            onClick={(e) => { e.stopPropagation(); onEditTime(slot); }}
            className="group/time flex items-center gap-1 w-16 shrink-0 text-left text-white/30 hover:text-lantern-mint transition-colors"
            title="Edit time"
          >
            <span className="text-[11px] font-mono tabular-nums underline decoration-dotted underline-offset-2">{formatTime(slot.startMinutes)}</span>
            <span className="text-[9px] opacity-40 group-hover/time:opacity-100 transition-opacity">✏</span>
          </button>
        ) : (
          <span className="text-[11px] font-mono text-white/30 w-16 shrink-0 tabular-nums">
            {formatTime(slot.startMinutes)}
          </span>
        )}
        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue ?? slot.title}
            onChange={(e) => onRenameChange?.(e.target.value)}
            onBlur={() => onRenameCommit?.()}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") onRenameCommit?.(); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent border-b border-lantern-mint text-white/80 text-[13px] outline-none min-w-0"
          />
        ) : (
          <span
            className={`flex-1 text-[13px] truncate ${slot.kind === "intercity_transfer" ? "text-lantern-violet font-medium" : "text-white/80"} ${slot.kind === "activity" && onRename ? "cursor-text" : ""}`}
            onDoubleClick={slot.kind === "activity" ? (e) => { e.stopPropagation(); onRename?.(slot); } : undefined}
            title={slot.kind === "activity" && onRename ? "Double-click to rename" : undefined}
          >
            {slot.title}
          </span>
        )}
        {slot.kind === "activity" && onRename && !isRenaming && (
          <button
            type="button"
            draggable={false}
            onClick={(e) => { e.stopPropagation(); onRename(slot); }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-white/60 hover:text-lantern-mint transition-all text-sm leading-none px-1"
            title="Rename"
          >
            ✏
          </button>
        )}
        {slot.kind === "activity" && (
          <button
            type="button"
            draggable={false}
            onClick={(e) => { e.stopPropagation(); onSlotClick(slot); }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-white/40 hover:text-lantern-mint transition-all text-sm leading-none px-0.5"
            title="View details"
          >
            ℹ
          </button>
        )}
        <span className="text-[11px] text-white/25 shrink-0">{formatDuration(slot.durationMinutes)}</span>
        {cat && cat in CAT_STYLE && (
          <span className={`shrink-0 hidden sm:inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize ${CAT_STYLE[cat]}`}>
            {cat}
          </span>
        )}
        {onDelete && slot.kind !== "intercity_transfer" && slot.kind !== "airport_transfer" && (
          <button
            type="button"
            draggable={false}
            onClick={(e) => { e.stopPropagation(); onDelete(slot); }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 transition-all text-xs leading-none px-0.5"
            title="Remove from itinerary"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // Detailed view
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0 w-14">
        {onEditTime && (slot.kind === "activity" || slot.kind === "meal") ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEditTime(slot); }}
            className="group/time flex items-center gap-1 leading-none mb-1.5 text-white/30 hover:text-lantern-mint transition-colors"
            title="Edit time"
          >
            <span className="text-[11px] font-mono underline decoration-dotted underline-offset-2">{formatTime(slot.startMinutes)}</span>
            <span className="text-[9px] opacity-40 group-hover/time:opacity-100 transition-opacity">✏</span>
          </button>
        ) : (
          <span className="text-[11px] font-mono text-white/30 leading-none mb-1.5">
            {formatTime(slot.startMinutes)}
          </span>
        )}
        <div className={`h-2.5 w-2.5 rounded-full border-2 border-ink shrink-0 ${style.dot}`} />
        {!isLast && <div className={`flex-1 w-px mt-1 ${slot.kind === "intercity_transfer" ? "bg-lantern-violet/20" : "bg-white/[0.07]"}`} />}
      </div>
      <div
        className={`group flex-1 mb-4 rounded-xl border px-4 py-3 ${style.border} ${style.bg} select-none ${isClickable ? "cursor-pointer hover:border-white/20 transition-colors" : ""} ${isDragging ? "opacity-40" : ""} ${slot.kind === "activity" && onDragStart ? "cursor-grab" : ""}`}
        draggable={slot.kind === "activity" && !!onDragStart}
        onDragStart={slot.kind === "activity" ? (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", slot.title);
          onDragStart?.(slot);
        } : undefined}
        onDragEnd={onDragEnd}
        onClick={isClickable && slot.kind !== "activity" ? () => onSlotClick(slot) : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue ?? slot.title}
                onChange={(e) => onRenameChange?.(e.target.value)}
                onBlur={() => onRenameCommit?.()}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") onRenameCommit?.(); }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-transparent border-b border-lantern-mint text-white font-semibold text-sm outline-none mb-1"
              />
            ) : (
              <p
                className={`text-sm font-semibold leading-snug ${slot.kind === "intercity_transfer" ? "text-lantern-violet" : "text-white"} ${slot.kind === "activity" && onRename ? "cursor-text" : ""}`}
                onDoubleClick={slot.kind === "activity" ? (e) => { e.stopPropagation(); onRename?.(slot); } : undefined}
                title={slot.kind === "activity" && onRename ? "Double-click to rename" : undefined}
              >
                {slot.title}
              </p>
            )}
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
          <div className="flex items-center gap-1 shrink-0">
            {cat && cat in CAT_STYLE && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize mr-1 ${CAT_STYLE[cat]}`}>
                {cat}
              </span>
            )}
            {slot.kind === "activity" && onMoveUp && (
              <button
                type="button"
                draggable={false}
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-lantern-mint hover:bg-white/[0.06] transition-all text-base"
                title="Move up"
              >
                ↑
              </button>
            )}
            {slot.kind === "activity" && onMoveDown && (
              <button
                type="button"
                draggable={false}
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-lantern-mint hover:bg-white/[0.06] transition-all text-base"
                title="Move down"
              >
                ↓
              </button>
            )}
            {slot.kind === "activity" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSlotClick(slot); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-lantern-mint hover:bg-white/[0.06] transition-all text-base"
                title="View details"
              >
                ℹ
              </button>
            )}
            {onRename && slot.kind === "activity" && !isRenaming && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRename(slot); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/50 hover:text-lantern-mint hover:bg-white/[0.06] transition-all text-base"
                title="Rename"
              >
                ✏
              </button>
            )}
            {onDelete && slot.kind !== "intercity_transfer" && slot.kind !== "airport_transfer" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(slot); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/[0.06] transition-all text-base"
                title="Remove from itinerary"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {slot.explanation && (
          <p className="mt-2 text-[11px] text-white/35 leading-relaxed line-clamp-2">
            {slot.explanation}
          </p>
        )}
        {slot.kind === "activity" && onEditNotes && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">Notes</span>
              {noteEdit === null ? (
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => { e.stopPropagation(); setNoteEdit(slot.note ?? ""); }}
                  className="text-[10px] text-white/35 hover:text-lantern-mint transition-colors"
                >
                  {slot.note ? "Edit" : "+ Add"}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" draggable={false} onClick={(e) => { e.stopPropagation(); setNoteEdit(null); }} className="text-[10px] text-white/35 hover:text-white/60 transition-colors">Cancel</button>
                  <button type="button" draggable={false} onClick={(e) => { e.stopPropagation(); onEditNotes(slot, noteEdit); setNoteEdit(null); }} className="text-[10px] text-lantern-mint font-semibold hover:opacity-80 transition-opacity">Save</button>
                </div>
              )}
            </div>
            {noteEdit === null ? (
              slot.note
                ? <p className="text-[11px] text-white/45 leading-relaxed whitespace-pre-wrap">{slot.note}</p>
                : <p className="text-[10px] text-white/20 italic">No notes</p>
            ) : (
              <textarea
                autoFocus
                value={noteEdit}
                onChange={(e) => setNoteEdit(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Add your notes…"
                rows={2}
                className="select-text w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-[11px] text-white/80 placeholder-white/20 focus:outline-none focus:border-lantern-mint/50 resize-none"
              />
            )}
          </div>
        )}
        {slot.kind === "activity" && onEditDuration && (
          <div className="mt-2 flex items-center gap-3">
            <span className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">Duration</span>
            {durationEdit === null ? (
              <>
                <span className="text-[11px] text-white/45">{slot.durationMinutes}m</span>
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => { e.stopPropagation(); setDurationEdit(slot.durationMinutes); }}
                  className="text-[10px] text-white/35 hover:text-lantern-mint transition-colors"
                >
                  Edit
                </button>
              </>
            ) : (() => {
              const clampedDur = Math.max(15, Math.min(480, durationEdit));
              const durError = slot.startMinutes + clampedDur > 1440 ? "Exceeds midnight" : null;
              return (
                <>
                  <input
                    autoFocus
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    value={durationEdit}
                    onChange={(e) => setDurationEdit(Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="select-text w-20 bg-white/[0.04] border border-white/[0.12] rounded-lg px-2 py-1 text-[11px] text-white/80 focus:outline-none focus:border-lantern-mint/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[10px] text-white/25">min</span>
                  {durError && <span className="text-red-400 text-[10px]">{durError}</span>}
                  <button type="button" draggable={false} onClick={(e) => { e.stopPropagation(); setDurationEdit(null); }} className="text-[10px] text-white/35 hover:text-white/60 transition-colors">Cancel</button>
                  <button type="button" draggable={false} disabled={!!durError} onClick={(e) => { e.stopPropagation(); if (!durError) { onEditDuration(slot, clampedDur); setDurationEdit(null); } }} className={`text-[10px] font-semibold transition-opacity ${durError ? "text-white/20 cursor-not-allowed" : "text-lantern-mint hover:opacity-80"}`}>Save</button>
                </>
              );
            })()}
          </div>
        )}
        {slot.kind === "activity" && (
          <div className="mt-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">⏰ Why this time?</p>
            <p className="text-[12px] text-white/40 italic leading-relaxed">
              {slot.timeExplanation ?? "AI-scheduled for optimal experience"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const WARNING_COLORS: Record<DayWarning["type"], string> = {
  packed:          "bg-amber-500/10 text-amber-400 border-amber-500/20",
  food_heavy:      "bg-orange-500/10 text-orange-400 border-orange-500/20",
  transit_heavy:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  late_night:      "bg-violet-500/10 text-violet-400 border-violet-500/20",
  flight_recovery: "bg-red-500/10 text-red-400 border-red-500/20",
  ai_note:         "bg-white/5 text-white/50 border-white/10",
};

function DayView({
  day, savedMeta, compact, onSlotClick, onDeleteSlot, onEditTime,
  onRename, renamingSlot, onRenameChange, onRenameCommit,
  onDragStart, onDragEnd, draggingSlot, onMoveUp, onMoveDown,
  onEditNotes, onEditDuration, onQuickAdd,
}: {
  day:               PlannedDay;
  savedMeta:         Record<string, SavedMeta>;
  compact:           boolean;
  onSlotClick:       (slot: PlannedSlot) => void;
  onDeleteSlot?:     (slot: PlannedSlot) => void;
  onEditTime?:       (slot: PlannedSlot) => void;
  onRename?:         (slot: PlannedSlot) => void;
  renamingSlot?:     { slot: PlannedSlot; value: string } | null;
  onRenameChange?:   (v: string) => void;
  onRenameCommit?:   () => void;
  onDragStart?:      (slot: PlannedSlot) => void;
  onDragEnd?:        () => void;
  draggingSlot?:     PlannedSlot | null;
  onMoveUp?:         (slot: PlannedSlot) => void;
  onMoveDown?:       (slot: PlannedSlot) => void;
  onEditNotes?:      (slot: PlannedSlot, note: string) => void;
  onEditDuration?:   (slot: PlannedSlot, minutes: number) => void;
  onQuickAdd?:       () => void;
}) {
  return (
    <div>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/25 mb-1">
          {longDate(day.date)}
        </p>
        <h2 className="text-lg font-bold text-white">{day.theme || `Day ${day.dayIndex + 1}`}</h2>
        {day.cityLabel && (
          <p className="text-sm text-white/40 mt-0.5">{day.cityLabel}</p>
        )}
        <div className="flex gap-4 mt-2">
          <span className="text-xs text-white/30">
            {day.scheduledActivityCount} {day.scheduledActivityCount === 1 ? "activity" : "activities"}
            {" · "}
            {day.slots.length - day.scheduledActivityCount} meals &amp; transfers
          </span>
        </div>
        {day.warnings && day.warnings.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 mb-1">
            {day.warnings.map((w, i) => (
              <span
                key={i}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${WARNING_COLORS[w.type] ?? WARNING_COLORS.ai_note}`}
              >
                {w.message}
              </span>
            ))}
          </div>
        )}
        {day.daySummary && (
          <p className="text-[11px] text-white/40 italic mt-2 mb-1 leading-relaxed">{day.daySummary}</p>
        )}
      </div>
      <div>
        {day.slots.map((slot, i) => (
          <TimelineSlot
            key={i}
            slot={slot}
            savedMeta={savedMeta}
            isLast={i === day.slots.length - 1}
            compact={compact}
            onSlotClick={onSlotClick}
            onDelete={onDeleteSlot}
            onEditTime={onEditTime}
            onRename={onRename}
            isRenaming={renamingSlot?.slot === slot}
            renameValue={renamingSlot?.slot === slot ? renamingSlot.value : undefined}
            onRenameChange={onRenameChange}
            onRenameCommit={onRenameCommit}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isDragging={draggingSlot === slot}
            onMoveUp={slot.kind === "activity" && i > 0 ? () => onMoveUp?.(slot) : undefined}
            onMoveDown={slot.kind === "activity" && i < day.slots.length - 1 ? () => onMoveDown?.(slot) : undefined}
            onEditNotes={onEditNotes}
            onEditDuration={onEditDuration}
          />
        ))}
        {onQuickAdd && (
          <button
            type="button"
            onClick={onQuickAdd}
            className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.08] text-white/30 hover:text-lantern-mint hover:border-lantern-mint/30 text-xs transition-colors"
          >
            <span className="text-sm leading-none">+</span> Add activity
          </button>
        )}
      </div>
    </div>
  );
}

// ── Form helpers ───────────────────────────────────────────────────────────────

function SectionCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors";

function FieldLabel({ label, note }: { label: string; note?: string }) {
  return (
    <label className="text-xs text-white/40 block mb-1.5">
      {label}
      {note && <span className="ml-1 text-white/20">{note}</span>}
    </label>
  );
}

function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs text-white/35 hover:text-lantern-mint transition-colors">
      {label} <span>→</span>
    </Link>
  );
}

function ToggleGroup<T extends string>({
  label, options, value, onChange, cols = 2,
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
        <button type="button" onClick={onRemove} className="shrink-0 w-5 text-white/25 hover:text-red-400 transition-colors text-lg leading-none">
          ×
        </button>
      ) : (
        <div className="w-5" />
      )}
    </div>
  );
}

// ── Activity row (include/exclude) ────────────────────────────────────────────

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

// ── Selected flight card ───────────────────────────────────────────────────────

function SelectedFlightCard({
  flight, onClear,
}: {
  flight:  SelectedFlight;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.gstatic.com/flights/airline_logos/70px/${flight.airlineCode}.png`}
            alt={flight.airline}
            width={18}
            height={18}
            className="rounded object-contain shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="text-xs font-semibold text-white truncate">{flight.airline}</span>
          {flight.flightNumber && (
            <span className="text-[10px] text-white/35 shrink-0">{flight.flightNumber}</span>
          )}
        </div>
        <span className="text-xs font-bold text-white/60 shrink-0">
          ${Math.round(flight.price).toLocaleString()}
        </span>
      </div>

      {/* Outbound */}
      <div className="flex items-center gap-2 rounded-lg bg-white/[0.025] border border-white/[0.05] px-3 py-2">
        <div className="text-center shrink-0">
          <div className="text-sm font-bold text-white">{fmt24(flight.departTime)}</div>
          <div className="text-[10px] font-mono text-white/40">{flight.origin}</div>
        </div>
        <div className="flex-1 text-center px-1">
          <div className="text-[10px] text-white/30">{flight.duration}</div>
          <div className="w-full h-px bg-white/10 my-1" />
          <div className="text-[10px] text-white/25">{flight.stopLabel}</div>
        </div>
        <div className="text-center shrink-0">
          <div className="text-sm font-bold text-white">{fmt24(flight.arriveTime)}</div>
          <div className="text-[10px] font-mono text-white/40">{flight.destination}</div>
        </div>
      </div>

      {/* Return if present */}
      {flight.returnDepartTime && (
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.015] border border-white/[0.04] px-3 py-2">
          <div className="text-center shrink-0">
            <div className="text-sm font-bold text-white/70">{fmt24(flight.returnDepartTime)}</div>
            <div className="text-[10px] font-mono text-white/30">{flight.returnOrigin}</div>
          </div>
          <div className="flex-1 text-center px-1">
            <div className="text-[10px] text-white/25">{flight.returnDuration}</div>
            <div className="w-full h-px bg-white/[0.07] my-1" />
            <div className="text-[10px] text-white/20">{flight.returnStopLabel}</div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-sm font-bold text-white/70">{fmt24(flight.returnArriveTime ?? "")}</div>
            <div className="text-[10px] font-mono text-white/30">{flight.returnDestination}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <CtaLink href="/flights" label="Change flight" />
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-white/25 hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Selected hotel card ────────────────────────────────────────────────────────

function SelectedHotelCard({
  hotel, onClear,
}: {
  hotel:   SelectedHotel;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {hotel.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hotel.imageUrl}
          alt={hotel.name}
          className="w-full h-24 object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="p-3.5 space-y-2">
        <div>
          <p className="text-sm font-semibold text-white leading-snug">{hotel.name}</p>
          <p className="text-[11px] text-white/40 mt-0.5">
            {hotel.neighborhood}
            {hotel.pricePerNight > 0 && ` · $${Math.round(hotel.pricePerNight)}/night`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hotel.rating > 0 && (
            <span className="text-[11px] text-white/50">
              ★ {hotel.rating.toFixed(1)}
            </span>
          )}
          {hotel.aiScore > 0 && (
            <span className="text-[11px] text-lantern-mint/70">
              TG score {hotel.aiScore}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <CtaLink href="/hotels" label="Change hotel" />
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-white/25 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ItineraryPlanner() {
  const pathname = usePathname();

  // Global saved activities
  const [savedIds,  setSavedIds]  = useState<string[]>([]);
  const [savedMeta, setSavedMeta] = useState<Record<string, SavedMeta>>({});

  // Persistent trip state
  const [trip,     setTrip]     = useState<TripStorage>(DEFAULT_TRIP);
  const [hydrated, setHydrated] = useState(false);

  // Cross-page selected hotel/flight (from Hotels/Flights pages)
  const [selectedHotel,  setSelectedHotel]  = useState<SelectedHotel | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<SelectedFlight | null>(null);

  // UI state
  const [genStatus,         setGenStatus]         = useState<"idle" | "generating" | "error">("idle");
  const [genError,          setGenError]           = useState<string | null>(null);
  const [selectedDay,       setSelectedDay]        = useState(0);
  const [compactView,       setCompactView]        = useState(false);
  const [detailSlot,        setDetailSlot]         = useState<PlannedSlot | null>(null);
  const [noteEdit,          setNoteEdit]           = useState<string | null>(null);
  const [durationEdit,      setDurationEdit]       = useState<number | null>(null);
  const [modalPlaceDetail,   setModalPlaceDetail]   = useState<PlaceDetailData | null>(null);
  const [modalDetailLoading, setModalDetailLoading] = useState(false);
  const [detailActivePhoto,  setDetailActivePhoto]  = useState(0);
  type ClaudePlacement = {
    bestFitDays?:     { dayIndex: number; city: string; reason: string }[];
    swapSuggestions?: { dayIndex: number; city: string; replaceActivityTitle: string; replaceActivityDuration: number; reason: string }[];
    cannotFit:        boolean;
    explanation:      string;
  };
  const [addActivityModal,  setAddActivityModal]   = useState<{
    activity:        DroppedActivity;
    confirmReplace?: { dayIndex: number; slot: PlannedSlot };
    placement?:      ClaudePlacement | null;
  } | null>(null);
  const [editingTime, setEditingTime] = useState<{
    dayIndex: number;
    slot:     PlannedSlot;
    value:    string; // "HH:MM" for <input type="time">
  } | null>(null);
  const [renamingSlot, setRenamingSlot] = useState<{
    dayIndex: number;
    slot:     PlannedSlot;
    value:    string;
  } | null>(null);
  const [dragging,    setDragging]    = useState<{ slot: PlannedSlot; sourceDayIndex: number } | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  // Tab navigation
  type ActiveTab = "itinerary" | "preferences" | "recommendations" | "saved" | "dropped";
  const [activeTab, setActiveTab] = useState<ActiveTab>("itinerary");

  // AI Recommendations panel
  const [aiRecs,        setAiRecs]        = useState<AiRecommendation[]>([]);
  const [aiRecsStatus,  setAiRecsStatus]  = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [aiRecsFilter,  setAiRecsFilter]  = useState("all");
  const [dismissedIds,  setDismissedIds]  = useState<Set<string>>(new Set());
  const [addedRecIds,   setAddedRecIds]   = useState<Set<string>>(new Set());

  // Personalization extras (cuisine + budget tier, stored alongside trip)
  const [cuisinePrefs, setCuisinePrefs] = useState<string[]>([]);
  const [budgetTier,   setBudgetTier]   = useState<"budget" | "moderate" | "premium">("moderate");

  const [editTripModal, setEditTripModal] = useState(false);
  const [editStart,     setEditStart]     = useState("");
  const [editCities,    setEditCities]    = useState<CityStop[]>([]);
  const [editPace,      setEditPace]      = useState<UIPace>("balanced");
  const [editTransit,   setEditTransit]   = useState<UITransit>("mixed");

  const [tripList,      setTripList]      = useState<StoredTrip[]>([]);
  const [activeTripId,  setActiveTripId]  = useState<string | null>(null);
  const [saveAsModal,   setSaveAsModal]   = useState(false);
  const [saveAsName,    setSaveAsName]    = useState("");
  const [loadDropdown,  setLoadDropdown]  = useState(false);

  const [quickAddModal, setQuickAddModal] = useState<{
    open:            boolean;
    dayIndex:        number | null;
    activityName:    string;
    durationMinutes: number;
  }>({ open: false, dayIndex: null, activityName: "", durationMinutes: 90 });

  // Onboarding state (new users see a guided wizard; existing users skip to "done")
  type ObStep = "destination" | "dates" | "style" | "recommendations" | "cities" | "done";
  const [obStep,           setObStep]           = useState<ObStep>("done");
  const [obDest,           setObDest]           = useState("");
  const [obDestValidated,  setObDestValidated]  = useState(false);
  const [obDestError,      setObDestError]      = useState<string | null>(null);
  const [obStart,          setObStart]          = useState("");
  const [obReturn,         setObReturn]         = useState("");
  const [obDuration,       setObDuration]       = useState(7);
  const [obFirstTime,      setObFirstTime]      = useState<boolean | null>(null);
  const [obStyles,         setObStyles]         = useState<TravelStyle[]>([]);
  const [obCities,         setObCities]         = useState<{ city: string; days: number; why: string }[]>([]);
  const [obSummary,        setObSummary]        = useState("");
  const [obLoading,        setObLoading]        = useState(false);
  const [obError,          setObError]          = useState<string | null>(null);

  // Tracks destinationRegion for display in the summary banner
  const obDestRef = useRef("");

  // ── Load from localStorage on mount ──
  useEffect(() => {
    try {
      // Global saved activities
      const ids  = localStorage.getItem("travelgrab:saved-activities");
      const meta = localStorage.getItem("travelgrab:saved-activities-data");
      if (ids)  setSavedIds(JSON.parse(ids) as string[]);
      if (meta) setSavedMeta(JSON.parse(meta) as Record<string, SavedMeta>);

      // 1. Try multi-trip v2 store first
      const allTrips  = getAllTrips();
      const currentId = getCurrentTripId();
      if (allTrips.length > 0 && currentId) {
        const stored = allTrips.find((t) => t.id === currentId);
        if (stored) {
          setTrip(stored.trip);
          setTripList(allTrips);
          setActiveTripId(currentId);
          // Per-trip activities override global localStorage
          if (stored.trip.savedActivityIds) {
            setSavedIds(stored.trip.savedActivityIds);
            setSavedMeta(stored.trip.savedActivityMeta ?? {});
          }
          if (stored.trip.cities[0]?.city) {
            setObDest(stored.trip.cities[0].city);
            obDestRef.current = stored.trip.cities[0].city;
            setObDestValidated(true);
          }
          setObStep("done");
          setHydrated(true);
          return;
        }
      }

      // 2. Try canonical trip store (shared with Flights/Hotels/Activities pages)
      const v2 = readTripStore();
      if (v2 && v2.cityStops.length > 0) {
        const loaded: TripStorage = {
          version:              1,
          cities:               v2.cityStops,
          startDate:            v2.startDate,
          manualArrivalTime:    v2.manualArrivalTime,
          manualDepartureTime:  v2.manualDepartureTime,
          manualHotelName:      v2.manualHotelName,
          wakeTime:             v2.wakeTime,
          bedTime:              v2.bedTime,
          pace:                 v2.pace,
          transit:              v2.transit,
          excludedActivityIds:  v2.excludedActivityIds,
          itinerary:            v2.itinerary,
          itineraryGeneratedAt: v2.itineraryGeneratedAt,
        };
        setTrip(loaded);
        // Migrate into multi-trip store
        const newId = generateTripId();
        const migrated: StoredTrip = {
          id:        newId,
          name:      v2.cityStops[0]?.city?.split(",")[0] ?? "My Trip",
          trip:      loaded,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        saveAllTrips([migrated]);
        setCurrentTripId(newId);
        setTripList([migrated]);
        setActiveTripId(newId);

        if (v2.selectedFlight) setSelectedFlight(v2.selectedFlight);
        else { const fs = localStorage.getItem(FLIGHT_KEY); if (fs) setSelectedFlight(JSON.parse(fs) as SelectedFlight); }
        const firstCity  = v2.cityStops[0]?.city ?? "";
        const firstHotel = v2.selectedHotels?.[firstCity] ?? null;
        if (firstHotel) setSelectedHotel(firstHotel);
        else { const hs = localStorage.getItem(HOTEL_KEY); if (hs) setSelectedHotel(JSON.parse(hs) as SelectedHotel); }
        if (v2.destinationRegion) { setObDest(v2.destinationRegion); obDestRef.current = v2.destinationRegion; setObDestValidated(true); }
        if (v2.travelStyles?.length) setObStyles(v2.travelStyles);
        if (v2.firstTime !== null)   setObFirstTime(v2.firstTime);
        setObStep("done");
        setHydrated(true);
        return;
      }

      // 3. Fall back to v1 single-trip key
      const hotelStored  = localStorage.getItem(HOTEL_KEY);
      const flightStored = localStorage.getItem(FLIGHT_KEY);
      if (hotelStored)  setSelectedHotel(JSON.parse(hotelStored) as SelectedHotel);
      if (flightStored) setSelectedFlight(JSON.parse(flightStored) as SelectedFlight);

      const tripStored = localStorage.getItem(TRIP_KEY);
      if (tripStored) {
        const parsed = JSON.parse(tripStored) as TripStorage;
        if (parsed.version === 1 && parsed.cities[0]?.city) {
          setTrip(parsed);
          const newId = generateTripId();
          const migrated: StoredTrip = {
            id:        newId,
            name:      parsed.cities[0].city.split(",")[0],
            trip:      parsed,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveAllTrips([migrated]);
          setCurrentTripId(newId);
          setTripList([migrated]);
          setActiveTripId(newId);
          setObStep("done");
          setHydrated(true);
          return;
        }
      }
    } catch { /* ignore */ }

    // New user — show onboarding
    setObStep("destination");
    setTrip((prev) => ({ ...prev, startDate: tomorrowIso() }));
    setHydrated(true);
  }, []);

  // ── Auto-save trip state (debounced 400 ms) ──
  useEffect(() => {
    if (!hydrated || obStep !== "done") return;
    const timer = setTimeout(() => {
      try {
        // Save into multi-trip store (activities bundled with trip)
        const storedTrips      = getAllTrips();
        const currentId        = getCurrentTripId();
        const tripWithActivity: TripStorage = { ...trip, savedActivityIds: savedIds, savedActivityMeta: savedMeta };
        if (currentId) {
          const exists  = storedTrips.some((t) => t.id === currentId);
          const now     = new Date().toISOString();
          const updated = exists
            ? storedTrips.map((t) => t.id === currentId ? { ...t, trip: tripWithActivity, updatedAt: now } : t)
            : [...storedTrips, {
                id:        currentId,
                name:      trip.cities[0]?.city?.split(",")[0] ?? "My Trip",
                trip:      tripWithActivity,
                createdAt: now,
                updatedAt: now,
              }];
          saveAllTrips(updated);
          setTripList(updated);
        }

        // Sync to canonical trip store so Flights/Hotels/Activities can read it
        const primaryCity    = trip.cities[0]?.city ?? "";
        const existing       = readTripStore();
        const existingHotels = existing?.selectedHotels ?? {};
        const updatedHotels  = selectedHotel
          ? { ...existingHotels, [primaryCity]: selectedHotel }
          : existingHotels;
        updateTripStore({
          cityStops:            trip.cities,
          startDate:            trip.startDate,
          tripLength:           trip.cities.reduce((s, c) => s + (c.days || 0), 0),
          manualArrivalTime:    trip.manualArrivalTime,
          manualDepartureTime:  trip.manualDepartureTime,
          manualHotelName:      trip.manualHotelName,
          wakeTime:             trip.wakeTime,
          bedTime:              trip.bedTime,
          pace:                 trip.pace,
          transit:              trip.transit,
          excludedActivityIds:  trip.excludedActivityIds,
          itinerary:            trip.itinerary,
          itineraryGeneratedAt: trip.itineraryGeneratedAt,
          destinationRegion:    obDestRef.current || primaryCity,
          travelStyles:         obStyles,
          firstTime:            obFirstTime,
          selectedFlight:       selectedFlight ?? null,
          selectedHotels:       updatedHotels,
        });
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [trip, savedIds, savedMeta, hydrated, obStep, obStyles, obFirstTime, selectedFlight, selectedHotel]);

  // ── Sync saved activities to canonical trip store ──
  useEffect(() => {
    if (!hydrated) return;
    updateTripStore({ savedActivities: savedIds });
  }, [savedIds, hydrated]);

  useEffect(() => { setNoteEdit(null); setDurationEdit(null); setDetailActivePhoto(0); }, [detailSlot]);

  // ── Lazy-load place details when modal opens ──
  useEffect(() => {
    if (!detailSlot?.sourceId || detailSlot.sourceId.startsWith("preview-")) {
      setModalPlaceDetail(null);
      return;
    }
    setModalDetailLoading(true);
    fetch(`/api/activities/place?id=${encodeURIComponent(detailSlot.sourceId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: {
        formattedAddress?: string; shortFormattedAddress?: string;
        regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
        websiteUri?: string; googleMapsUri?: string;
        editorialSummary?: { text?: string };
        nationalPhoneNumber?: string; internationalPhoneNumber?: string;
        photos?: Array<{ name: string }>;
        rating?: number; userRatingCount?: number;
        reviews?: Array<{
          authorAttribution?: { displayName?: string; photoUri?: string };
          rating?: number;
          text?: { text?: string };
          relativePublishTimeDescription?: string;
        }>;
      } | null) => {
        if (!data) { setModalPlaceDetail(null); return; }
        setModalPlaceDetail({
          address:             data.formattedAddress ?? data.shortFormattedAddress,
          openNow:             data.regularOpeningHours?.openNow,
          weekdayDescriptions: data.regularOpeningHours?.weekdayDescriptions,
          website:             data.websiteUri,
          googleMapsUri:       data.googleMapsUri,
          editorialSummary:    data.editorialSummary?.text,
          phone:               data.nationalPhoneNumber ?? data.internationalPhoneNumber,
          photos:              data.photos,
          rating:              data.rating,
          userRatingCount:     data.userRatingCount,
          reviews:             data.reviews?.slice(0, 5).map((r) => ({
            authorName:    r.authorAttribution?.displayName,
            authorPhotoUri: r.authorAttribution?.photoUri,
            rating:         r.rating,
            text:           r.text?.text,
            timeAgo:        r.relativePublishTimeDescription,
          })),
        });
      })
      .catch(() => { setModalPlaceDetail(null); })
      .finally(() => setModalDetailLoading(false));
  }, [detailSlot?.sourceId]);

  // ── Helpers ──
  function updateTrip(patch: Partial<TripStorage>) {
    setTrip((prev) => ({ ...prev, ...patch }));
  }

  const totalDays         = Math.max(1, trip.cities.reduce((s, c) => s + (c.days || 0), 0));
  const primaryCity       = trip.cities[0]?.city?.trim() ?? "";
  const endDate           = addDays(trip.startDate, totalDays);
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

  function clearHotel() {
    setSelectedHotel(null);
    try {
      localStorage.removeItem(HOTEL_KEY);
      updateTripStore({ selectedHotels: {} });
    } catch { /* ignore */ }
  }

  function clearFlight() {
    setSelectedFlight(null);
    try {
      localStorage.removeItem(FLIGHT_KEY);
      updateTripStore({ selectedFlight: null });
    } catch { /* ignore */ }
  }

  function clearTrip() {
    const fresh = { ...DEFAULT_TRIP, startDate: tomorrowIso() };
    setTrip(fresh);
    setGenStatus("idle");
    setGenError(null);
    setSelectedDay(0);
    try { localStorage.removeItem(TRIP_KEY); } catch { /* ignore */ }
  }

  function startNewTrip() {
    clearTrip();
    setSelectedHotel(null);
    setSelectedFlight(null);
    setObDest("");
    setObDestValidated(false);
    setObDestError(null);
    setObStart("");
    setObReturn("");
    setObDuration(7);
    setObFirstTime(null);
    setObStyles([]);
    setObCities([]);
    setObSummary("");
    setObError(null);
    obDestRef.current = "";
    clearTripStore();
    const freshId = generateTripId();
    setCurrentTripId(freshId);
    setActiveTripId(freshId);
    setObStep("destination");
  }

  function clearSavedPlaces() {
    setSavedIds([]);
    setSavedMeta({});
    try {
      localStorage.removeItem("travelgrab:saved-activities");
      localStorage.removeItem("travelgrab:saved-activities-data");
    } catch { /* ignore */ }
    updateTripStore({ savedActivities: [] });
  }

  async function loadAiRecommendations() {
    if (aiRecsStatus === "loading") return;
    setAiRecsStatus("loading");
    setAiRecs([]);
    setDismissedIds(new Set());
    setAddedRecIds(new Set());
    try {
      const res = await fetch("/api/recommendations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          preferences:    obStyles,
          cities:         trip.cities.filter((c) => c.city.trim()).map((c) => c.city),
          budget:         budgetTier,
          pace:           trip.pace,
          cuisine:        cuisinePrefs,
          existingTitles: Object.values(savedMeta).map((m) => m.title),
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json() as { recommendations: AiRecommendation[] };
      setAiRecs(data.recommendations ?? []);
      setAiRecsStatus("loaded");
    } catch {
      setAiRecsStatus("error");
    }
  }

  function addAiRecToTrip(rec: AiRecommendation) {
    const sourceId = `ai-rec-${rec.id}`;
    if (savedIds.includes(sourceId)) return;
    const meta: SavedMeta = {
      title:        rec.title,
      category:     rec.category === "hidden_gems" ? "hidden_gems" : rec.category,
      neighborhood: rec.city,
      duration:     rec.duration,
      rating:       0,
      city:         rec.city,
    };
    const newIds  = [...savedIds, sourceId];
    const newMeta = { ...savedMeta, [sourceId]: meta };
    setSavedIds(newIds);
    setSavedMeta(newMeta);
    setAddedRecIds((prev) => new Set([...prev, rec.id]));
    try {
      localStorage.setItem("travelgrab:saved-activities",      JSON.stringify(newIds));
      localStorage.setItem("travelgrab:saved-activities-data", JSON.stringify(newMeta));
    } catch { /* ignore */ }
  }

  function startOnboarding() {
    setObStep("destination");
    setObError(null);
    setObCities([]);
  }

  function toggleObStyle(style: TravelStyle) {
    setObStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  }

  async function suggestCities() {
    setObLoading(true);
    setObError(null);
    setObCities([]);
    setObSummary("");
    setObStep("recommendations");
    try {
      const res = await fetch("/api/itinerary/suggest-cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region:       obDest.trim(),
          travelStyles: obStyles,
          durationDays: obDuration,
          firstTime:    obFirstTime,
        }),
      });
      const data = await res.json() as {
        cityStops?: { city: string; days: number; why: string }[];
        summary?:   string;
        error?:     string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? "Suggestion failed");
      const stops = (data.cityStops ?? []).filter((s) => s.city && s.days > 0);
      if (stops.length === 0) throw new Error("No cities returned");
      setObCities(stops);
      setObSummary(data.summary ?? "");
      // Stay on recommendations step — user will review then click through to customize
    } catch (e) {
      setObError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setObLoading(false);
    }
  }

  function finishOnboarding() {
    const cities = obCities.map(({ city, days }) => ({ city, days }));
    const startDate = obStart || tomorrowIso();
    const tripLength = cities.reduce((s, c) => s + (c.days || 0), 0);
    // Compute returnDate: use explicit obReturn if set, else derive from startDate + tripLength
    const returnDate = obReturn || (() => {
      const d = new Date(startDate + "T00:00:00");
      d.setDate(d.getDate() + tripLength);
      return d.toISOString().slice(0, 10);
    })();
    updateTrip({ cities, startDate });
    obDestRef.current = obDest;
    // Write immediately to canonical store so other pages see it right away
    writeTripStore({
      ...TRIP_STORE_DEFAULT,
      destinationRegion: obDest,
      cityStops:         cities,
      startDate,
      returnDate,
      tripLength,
      travelStyles:      obStyles,
      firstTime:         obFirstTime,
      wakeTime:          trip.wakeTime,
      bedTime:           trip.bedTime,
      pace:              trip.pace,
      transit:           trip.transit,
      selectedFlight:    null,
      selectedHotels:    {},
      savedActivities:   [],
    });
    setObStep("done");
  }

  // ── Generate ──
  async function generate() {
    if (!primaryCity) return;
    setGenStatus("generating");
    setGenError(null);

    try {
      const activities = activeActivityIds.map((id) => {
        const m = savedMeta[id];
        const durationMinutes = parseDuration(m?.duration);
        return {
          sourceId:               id,
          title:                  m?.title    ?? id,
          category:               m?.category ?? "culture",
          estimatedDurationHours: Math.round((durationMinutes / 60) * 10) / 10,
          city:                   m?.city         ?? undefined,
          neighborhood:           m?.neighborhood ?? undefined,
          ...(durationMinutes >= 300 ? { isFullDay: true } : {}),
        };
      });

      const outboundArrivesAt = selectedFlight?.arriveTime
        ? `${trip.startDate}T${selectedFlight.arriveTime}:00`
        : trip.manualArrivalTime
          ? new Date(trip.manualArrivalTime).toISOString()
          : null;

      const returnDepartsAt = selectedFlight?.returnDepartTime
        ? `${endDate}T${selectedFlight.returnDepartTime}:00`
        : trip.manualDepartureTime
          ? new Date(trip.manualDepartureTime).toISOString()
          : null;

      const body = {
        startDate: trip.startDate,
        endDate,
        cities:    trip.cities
          .filter((c) => c.city.trim() && c.days > 0)
          .map((c, i) => ({ name: c.city, days: c.days, order: i + 1 })),
        activities,
        userPreferences: {
          pace:               mapPace(trip.pace),
          interests:          obStyles.length > 0 ? obStyles : ["culture"],
          budgetLevel:        budgetTier,
          wakeTime:           trip.wakeTime,
          cuisinePreferences: cuisinePrefs.length > 0 ? cuisinePrefs : undefined,
        },
        ...(outboundArrivesAt || returnDepartsAt ? {
          flights: {
            ...(outboundArrivesAt ? { outboundArrivesAt } : {}),
            ...(returnDepartsAt   ? { returnDepartsAt   } : {}),
            // Airport IATA codes — only available when user selected a flight
            ...(selectedFlight?.destination  ? { arrivalAirport:   selectedFlight.destination  } : {}),
            ...(selectedFlight?.returnOrigin ? { departureAirport: selectedFlight.returnOrigin } : {}),
          },
        } : {}),
      };

      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>;
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const raw  = await res.json() as PlannerOutput & { _debugCityAssignment?: unknown };
      const data = raw as PlannerOutput;

      // ── Browser-visible city assignment debug ─────────────────────────────
      // These logs appear in DevTools Console (F12 → Console tab).
      // The scheduling runs server-side so planner logs only appear in
      // Vercel function output, NOT here — but the server embeds a summary
      // in _debugCityAssignment so you can inspect it client-side.
      if (raw._debugCityAssignment) {
        const dbg = raw._debugCityAssignment as {
          cityStops:         { city: string; days: number }[];
          activityDetection: { i: number; title: string; savedCity: string | null; detectedCity: string | null; tier: string; lat: number; lng: number; hasRealCoords: boolean }[];
          dayAssignments:    { day: number; city: string; activities: string[]; totalMin: number }[];
        };

        console.group("=== ITINERARY CITY ASSIGNMENT DEBUG ===");
        console.log("City stops:", dbg.cityStops.map((s) => `${s.city} (${s.days}d)`).join(" → "));

        console.group("Activity detection (server-side tier used)");
        for (const a of dbg.activityDetection) {
          const icon = a.tier === "T4:proportional" ? "⚠️" : "✅";
          console.log(
            `${icon} [${a.tier}] "${a.title}" → detected=${a.detectedCity ?? "UNKNOWN"} ` +
            `| savedCity=${a.savedCity ?? "—"} | hasRealCoords=${a.hasRealCoords} ` +
            `| lat=${a.lat.toFixed(4)} lng=${a.lng.toFixed(4)}`,
          );
        }
        console.groupEnd();

        console.group("Day assignments");
        for (const d of dbg.dayAssignments) {
          console.log(`Day ${d.day} (${d.city}) ${d.totalMin}min: ${d.activities.join(", ") || "(no activities)"}`);
        }
        console.groupEnd();

        // City violation check (cross-reference)
        const violations: string[] = [];
        const CITY_KEYS: Record<string, string> = {
          tokyo: "tokyo", osaka: "osaka", kyoto: "kyoto",
          hiroshima: "hiroshima", nara: "nara", fukuoka: "fukuoka",
          paris: "paris", london: "london",
        };
        for (const a of dbg.activityDetection) {
          if (!a.detectedCity) continue;
          const actCityKey = CITY_KEYS[a.detectedCity.toLowerCase().split(",")[0].trim()] ?? a.detectedCity.toLowerCase();
          for (const d of dbg.dayAssignments) {
            if (!d.activities.includes(a.title)) continue;
            const dayCityKey = Object.keys(CITY_KEYS).find((k) => d.city.toLowerCase().includes(k)) ?? d.city.toLowerCase();
            if (actCityKey !== dayCityKey) {
              const msg = `[CITY-VIOLATION] Day ${d.day} (${d.city}) ← "${a.title}" (detected: ${a.detectedCity}, tier: ${a.tier})`;
              violations.push(msg);
              console.error(msg);
            }
          }
        }
        if (violations.length === 0) {
          console.log("✅ No city violations detected");
        }

        console.log(`[SCHEDULING-COMPLETE] ${dbg.activityDetection.filter((a) => a.tier !== "T4:proportional").length} confident assignments, ${dbg.activityDetection.filter((a) => a.tier === "T4:proportional").length} proportional fallbacks`);
        console.groupEnd();
      }
      // ── End debug ─────────────────────────────────────────────────────────

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

      {/* ── Onboarding wizard ── */}
      {obStep !== "done" && hydrated && (
        <div className="mx-auto max-w-lg px-4 sm:px-6 py-16">
          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-10 justify-center">
            {(["destination", "dates", "style", "recommendations", "cities"] as const).map((s, i) => {
              const steps = ["destination", "dates", "style", "recommendations", "cities"] as const;
              const stepIdx = steps.indexOf(obStep as typeof steps[number]);
              const isActive = s === obStep;
              const isDone = i < stepIdx;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full transition-colors ${
                    isActive ? "bg-lantern-mint" : isDone ? "bg-lantern-mint/40" : "bg-white/15"
                  }`} />
                  {i < 4 && <div className="h-px w-6 bg-white/10" />}
                </div>
              );
            })}
          </div>

          {/* Step: destination */}
          {obStep === "destination" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Where are you going?</h1>
                <p className="text-sm text-white/40">Enter a country, region, or city and select from suggestions.</p>
              </div>
              <ItineraryDestinationInput
                value={obDest}
                validated={obDestValidated}
                error={obDestError}
                onChange={(v) => {
                  setObDest(v);
                  setObDestValidated(false);
                  if (!v) setObDestError(null);
                }}
                onValidate={(normalized) => {
                  setObDest(normalized);
                  setObDestValidated(true);
                  setObDestError(null);
                }}
              />
              <button
                type="button"
                disabled={!obDest.trim()}
                onClick={() => {
                  if (!obDestValidated) {
                    setObDestError("Choose a destination from the suggestions.");
                    return;
                  }
                  setObDestError(null);
                  setObStep("dates");
                }}
                className="w-full h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}

          {/* Step: dates */}
          {obStep === "dates" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">When are you going?</h1>
                <p className="text-sm text-white/40">Set a start date and trip length, or pick a return date.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 block mb-1.5">Start date</label>
                  <input
                    type="date"
                    value={obStart}
                    min={todayIso()}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setObStart(newStart);
                      // Recompute return date when start changes, keeping duration fixed
                      if (newStart) {
                        const d = new Date(newStart + "T00:00:00");
                        d.setDate(d.getDate() + obDuration);
                        setObReturn(d.toISOString().slice(0, 10));
                      }
                    }}
                    className="w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1.5">
                    Trip length — <span className="text-white/60 font-semibold">{obDuration} {obDuration === 1 ? "day" : "days"}</span>
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={30}
                    value={obDuration}
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      setObDuration(n);
                      // Update return date when slider moves (if start is set)
                      if (obStart) {
                        const d = new Date(obStart + "T00:00:00");
                        d.setDate(d.getDate() + n);
                        setObReturn(d.toISOString().slice(0, 10));
                      }
                    }}
                    className="w-full accent-lantern-mint"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1.5">Return date <span className="text-white/25">(optional)</span></label>
                  <input
                    type="date"
                    value={obReturn}
                    min={obStart || todayIso()}
                    onChange={(e) => {
                      const newReturn = e.target.value;
                      setObReturn(newReturn);
                      // Compute duration from start → return
                      if (obStart && newReturn && newReturn > obStart) {
                        const start = new Date(obStart + "T00:00:00");
                        const end   = new Date(newReturn + "T00:00:00");
                        const diff  = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                        if (diff >= 1 && diff <= 30) setObDuration(diff);
                      }
                    }}
                    className="w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-lantern-mint/50 focus:outline-none focus:ring-1 focus:ring-lantern-mint/30 transition-colors [color-scheme:dark]"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setObStep("destination")} className="flex-1 h-12 rounded-full border border-white/[0.1] text-sm text-white/50 hover:text-white/80 transition-colors">
                  Back
                </button>
                <button
                  type="button"
                  disabled={!obStart}
                  onClick={() => setObStep("style")}
                  className="flex-[2] h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step: style */}
          {obStep === "style" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">How do you travel?</h1>
                <p className="text-sm text-white/40">Select all that apply — we&apos;ll use this to recommend the right cities.</p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-3">First time visiting {obDest}?</p>
                <div className="grid grid-cols-2 gap-2">
                  {([true, false] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setObFirstTime(obFirstTime === v ? null : v)}
                      className={`rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                        obFirstTime === v
                          ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                          : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80"
                      }`}
                    >
                      {v ? "Yes, first time" : "Been before"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-3">Travel style <span className="text-white/25">(pick all that apply)</span></p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(TRAVEL_STYLE_LABELS) as [TravelStyle, string][]).map(([key, label]) => {
                    const selected = obStyles.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleObStyle(key)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                          selected
                            ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                            : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {obError && <p className="text-xs text-red-400">{obError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setObStep("dates")}
                  className="flex-1 h-12 rounded-full border border-white/[0.1] text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={obStyles.length === 0}
                  onClick={() => void suggestCities()}
                  className="flex-[2] h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: AI route recommendations */}
          {obStep === "recommendations" && (
            <div className="space-y-6">
              {obLoading && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-lantern-mint animate-spin mb-6" />
                  <p className="text-base font-semibold text-white">Finding your best route…</p>
                  <p className="text-sm text-white/35 mt-2">Planning {obDuration} days in {obDest}</p>
                </div>
              )}
              {!obLoading && obError && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Something went wrong</h1>
                    <p className="text-sm text-red-400">{obError}</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setObStep("style"); setObError(null); }}
                      className="flex-1 h-12 rounded-full border border-white/[0.1] text-sm text-white/50 hover:text-white/80 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void suggestCities()}
                      className="flex-[2] h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {!obLoading && !obError && obCities.length > 0 && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Your AI route</h1>
                    {obSummary && <p className="text-sm text-white/50 leading-relaxed">{obSummary}</p>}
                  </div>
                  <div className="space-y-3">
                    {obCities.map((stop, i) => (
                      <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-white">{stop.city}</p>
                          <span className="text-xs font-semibold text-lantern-mint">{stop.days}d</span>
                        </div>
                        {stop.why && <p className="text-[11px] text-white/40 leading-relaxed">{stop.why}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/30 px-1">
                    <span>{obCities.reduce((s, c) => s + c.days, 0)} days total</span>
                    <span>{obDest}</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setObStep("style"); setObError(null); }}
                      className="flex-1 h-12 rounded-full border border-white/[0.1] text-sm text-white/50 hover:text-white/80 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setObStep("cities")}
                      className="flex-[2] h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90"
                    >
                      Customize route →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: customize route */}
          {obStep === "cities" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Customize your route</h1>
                <p className="text-sm text-white/40">Edit cities, adjust days, or add stops.</p>
              </div>
              <div className="space-y-3">
                {obCities.map((stop, i) => (
                  <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={stop.city}
                        onChange={(e) => {
                          const updated = [...obCities];
                          updated[i] = { ...stop, city: e.target.value };
                          setObCities(updated);
                        }}
                        className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => { const u=[...obCities]; u[i]={...stop,days:Math.max(1,stop.days-1)}; setObCities(u); }} className="w-7 h-7 rounded-lg border border-white/[0.1] text-white/50 hover:text-white flex items-center justify-center text-lg leading-none">−</button>
                        <span className="text-sm font-semibold text-white w-12 text-center">{stop.days}d</span>
                        <button type="button" onClick={() => { const u=[...obCities]; u[i]={...stop,days:stop.days+1}; setObCities(u); }} className="w-7 h-7 rounded-lg border border-white/[0.1] text-white/50 hover:text-white flex items-center justify-center text-lg leading-none">+</button>
                        {obCities.length > 1 && (
                          <button type="button" onClick={() => setObCities(obCities.filter((_,j)=>j!==i))} className="w-7 h-7 text-white/25 hover:text-red-400 flex items-center justify-center text-lg leading-none">×</button>
                        )}
                      </div>
                    </div>
                    {stop.why && <p className="text-[11px] text-white/35 pl-1">{stop.why}</p>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-xs text-white/30">
                <span>{obCities.reduce((s,c)=>s+c.days,0)} days total</span>
                <button
                  type="button"
                  onClick={() => setObCities([...obCities, { city: "", days: 2, why: "" }])}
                  className="text-lantern-mint/60 hover:text-lantern-mint transition-colors"
                >
                  + Add city
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setObStep("recommendations")}
                  className="flex-1 h-12 rounded-full border border-white/[0.1] text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={obCities.length === 0 || obCities.some(c => !c.city.trim())}
                  onClick={finishOnboarding}
                  className="flex-[2] h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save route
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main planner (shown after onboarding) ── */}
      {obStep === "done" && (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">

        {/* ── Tab bar ── */}
        <div className="flex gap-0 border-b border-white/[0.07] mb-5 overflow-x-auto">
          {([
            { key: "itinerary",       label: "Itinerary" },
            { key: "preferences",     label: "Preferences" },
            { key: "recommendations", label: "Recommendations" },
            { key: "saved",           label: `Saved (${activeActivityIds.length})` },
            ...(trip.itinerary ? [{ key: "dropped" as const, label: `Dropped (${trip.itinerary.meta.droppedActivities.length})` }] : []),
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                if (key === "recommendations" && aiRecsStatus === "idle" && obStyles.length > 0 && trip.cities.some((c) => c.city.trim())) {
                  void loadAiRecommendations();
                }
              }}
              className={`shrink-0 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === key
                  ? "border-lantern-mint text-white"
                  : "border-transparent text-white/35 hover:text-white/65"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Always-visible: trip + flight strip ── */}
        {(obDestRef.current || primaryCity) && (
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 mb-5 border-b border-white/[0.05]">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-sm font-semibold text-white">
                  {obDestRef.current || trip.cities.map((c) => c.city).filter(Boolean).join(" → ")}
                </p>
                <p className="text-[11px] text-white/35 mt-0.5">
                  {[
                    trip.startDate ? `${shortDate(trip.startDate)} – ${shortDate(endDate)}` : null,
                    `${totalDays}d`,
                    obStyles.length > 0 ? obStyles.map((s) => TRAVEL_STYLE_LABELS[s]).join(", ") : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              {selectedFlight && (
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.gstatic.com/flights/airline_logos/70px/${selectedFlight.airlineCode}.png`}
                    alt={selectedFlight.airline}
                    width={14}
                    height={14}
                    className="rounded object-contain shrink-0 opacity-70"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="text-[11px] font-mono text-white/40">{selectedFlight.origin}</span>
                  <span className="text-white/20 text-xs">→</span>
                  <span className="text-[11px] font-mono text-white/40">{selectedFlight.destination}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-[11px] text-white/35">{fmt24(selectedFlight.departTime)}</span>
                </div>
              )}
              {selectedHotel && (
                <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5">
                  <span className="text-[10px] text-white/25">🏨</span>
                  <span className="text-[11px] text-white/45 truncate max-w-[160px]">{selectedHotel.name}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setEditStart(trip.startDate);
                  setEditCities(trip.cities.map((c) => ({ ...c })));
                  setEditPace(trip.pace);
                  setEditTransit(trip.transit);
                  setEditTripModal(true);
                }}
                className="text-[11px] text-white/35 hover:text-lantern-mint transition-colors"
              >
                Edit trip
              </button>
              {trip.cities.some((c) => c.city.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    const cities = trip.cities.map((c) => c.city).filter(Boolean).join(",");
                    window.location.href = "/activities?cities=" + encodeURIComponent(cities);
                  }}
                  className="text-[11px] text-lantern-mint/60 hover:text-lantern-mint transition-colors"
                >
                  + Add activities
                </button>
              )}
              <button
                type="button"
                onClick={startNewTrip}
                className="text-[11px] text-white/25 hover:text-red-400 transition-colors"
              >
                New trip
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Itinerary ── */}
        {activeTab === "itinerary" && (
        <div>
          {/* Generate + save/clear actions */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              type="button"
              onClick={generate}
              disabled={!primaryCity || !trip.startDate || isGenerating}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-lantern-mint px-7 text-sm font-bold text-ink transition hover:opacity-90 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
            >
              {isGenerating ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/30 border-t-ink animate-spin" />
                  Planning your trip…
                </>
              ) : hasItinerary ? (
                <><span className="text-base">↺</span> Regenerate Itinerary</>
              ) : (
                <><span className="text-base">✦</span> Build My Itinerary</>
              )}
            </button>
            {(!primaryCity || !trip.startDate) && !isGenerating && (
              <p className="text-[11px] text-white/25">
                {!primaryCity ? "Enter a destination in Preferences." : "Add a start date in Preferences."}
              </p>
            )}
            <div className="flex gap-2 ml-auto items-center">
              <button
                type="button"
                onClick={() => { setSaveAsName(""); setSaveAsModal(true); }}
                className="h-9 rounded-full border border-white/[0.1] px-4 text-xs font-medium text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
              >
                Save as…
              </button>
              {/* Load trip dropdown */}
              {loadDropdown && (
                <div className="fixed inset-0 z-10" onClick={() => setLoadDropdown(false)} />
              )}
              <div className="relative z-20">
                <button
                  type="button"
                  onClick={() => setLoadDropdown((v) => !v)}
                  className="h-9 rounded-full border border-white/[0.1] px-4 text-xs font-medium text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
                >
                  Load trip ▾
                </button>
                {loadDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-[#0D1019] border border-white/[0.1] rounded-xl shadow-2xl min-w-[200px] overflow-hidden">
                    {tripList.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-white/30">No saved trips</p>
                    ) : (
                      tripList.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTrip(t.trip);
                            setSavedIds(t.trip.savedActivityIds ?? []);
                            setSavedMeta(t.trip.savedActivityMeta ?? {});
                            setActiveTripId(t.id);
                            setCurrentTripId(t.id);
                            setLoadDropdown(false);
                          }}
                          className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-xs transition-colors hover:bg-white/[0.05] ${
                            t.id === activeTripId ? "text-lantern-mint" : "text-white/60"
                          }`}
                        >
                          <span>{t.name}</span>
                          {t.id === activeTripId && <span className="text-white/25 text-[10px]">current</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={clearTrip}
                className="h-9 rounded-full border border-white/[0.06] px-4 text-xs font-medium text-white/30 hover:text-red-400 hover:border-red-400/20 transition-colors"
              >
                Clear trip
              </button>
            </div>
          </div>

          {/* ── Itinerary output ── */}
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
                  ? "All saved places are excluded. Check some in the Saved tab to include them."
                  : !primaryCity
                  ? `${activeActivityIds.length} places ready. Enter a destination in Preferences and click Generate.`
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

          {isGenerating && (
            <div className="flex flex-col items-center justify-center min-h-[480px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
              <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-lantern-mint animate-spin mb-6" />
              <p className="text-sm text-white/50">Clustering activities by geography…</p>
              <p className="text-xs text-white/25 mt-2">Usually under a second</p>
            </div>
          )}

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

          {hasItinerary && trip.itinerary && !isGenerating && (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {trip.cities.map((c) => c.city).filter(Boolean).join(" → ") || "Your trip"}
                  </h1>
                  <p className="text-sm text-white/40 mt-1">
                    {trip.startDate && `${shortDate(trip.startDate)} – ${shortDate(endDate)} · `}
                    {trip.itinerary.days.length} {trip.itinerary.days.length === 1 ? "day" : "days"} ·{" "}
                    {activeActivityIds.length - trip.itinerary.meta.droppedActivities.length} of {activeActivityIds.length}{" "}
                    {activeActivityIds.length === 1 ? "activity" : "activities"} scheduled
                    {trip.itinerary.meta.droppedActivities.length > 0 && (
                      <> · {trip.itinerary.meta.droppedActivities.length} dropped</>
                    )}
                  </p>
                  {trip.itineraryGeneratedAt && (
                    <p className="text-[11px] text-white/20 mt-1">
                      Generated {new Date(trip.itineraryGeneratedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {genStatus === "error" && (
                    <p className="text-xs text-red-400">Regeneration failed — showing last result</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setCompactView((v) => !v)}
                    className="text-[11px] text-white/35 hover:text-white/65 border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {compactView ? "Detailed" : "Compact"}
                  </button>
                </div>
              </div>

              {/* Day tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
                {trip.itinerary.days.map((day, i) => {
                  const cityShort = day.cityLabel ? day.cityLabel.split(",")[0].trim() : null;
                  const showCity  = cityShort && trip.cities.length > 1;
                  const isDropTarget = dragging && dragOverDay === i && dragging.sourceDayIndex !== i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedDay(i)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverDay(i); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverDay(null);
                        if (!dragging || !trip.itinerary || dragging.sourceDayIndex === i) { setDragging(null); return; }
                        const { slot, sourceDayIndex } = dragging;
                        updateTrip({
                          itinerary: {
                            ...trip.itinerary,
                            days: trip.itinerary.days.map((d) => {
                              if (d.dayIndex === sourceDayIndex) {
                                const newSlots = d.slots.filter((s) => s !== slot);
                                return { ...d, slots: newSlots, scheduledActivityCount: newSlots.filter((s) => s.kind === "activity").length };
                              }
                              if (d.dayIndex === i) {
                                const newSlots = [...d.slots, slot].sort((a, b) => a.startMinutes - b.startMinutes);
                                return { ...d, slots: newSlots, scheduledActivityCount: newSlots.filter((s) => s.kind === "activity").length };
                              }
                              return d;
                            }),
                          },
                        });
                        setSelectedDay(i);
                        setDragging(null);
                      }}
                      className={`shrink-0 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors ${
                        isDropTarget
                          ? "border-lantern-mint bg-lantern-mint/20 text-lantern-mint scale-105"
                          : selectedDay === i
                          ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                          : "border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-white/65"
                      }`}
                    >
                      <span className="block">Day {i + 1}</span>
                      <span className="block font-normal opacity-70 mt-0.5">{shortDate(day.date)}</span>
                      {showCity && (
                        <span className="block font-normal text-[9px] mt-0.5 opacity-50">{cityShort}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {trip.itinerary.days[selectedDay] && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.01] p-6">
                  <DayView
                    day={trip.itinerary.days[selectedDay]}
                    savedMeta={savedMeta}
                    compact={compactView}
                    onSlotClick={setDetailSlot}
                    onDeleteSlot={(slot) => {
                      const itin = trip.itinerary;
                      if (!itin) return;
                      const day = itin.days[selectedDay];
                      if (!day) return;
                      const newSlots = day.slots.filter((s) => s !== slot);
                      const isActivity = slot.kind === "activity";
                      const alreadyDropped = isActivity && itin.meta.droppedActivities.some((d) => d.title === slot.title);
                      const droppedEntry: DroppedActivity | null = isActivity && !alreadyDropped ? {
                        sourceId: slot.sourceId ?? slot.title,
                        title:    slot.title,
                        reason:   "Manually removed from itinerary",
                        diagnostic: {
                          type:             "pace_limited",
                          activityDuration: slot.durationMinutes,
                          belongsInCity:    day.cityLabel ?? day.geographicArea,
                        },
                      } : null;
                      updateTrip({
                        itinerary: {
                          ...itin,
                          days: itin.days.map((d) =>
                            d.dayIndex === day.dayIndex
                              ? { ...d, slots: newSlots, scheduledActivityCount: newSlots.filter((s) => s.kind === "activity").length }
                              : d
                          ),
                          meta: {
                            ...itin.meta,
                            droppedActivities: droppedEntry
                              ? [...itin.meta.droppedActivities, droppedEntry]
                              : itin.meta.droppedActivities,
                            totalActivitiesDropped: droppedEntry
                              ? itin.meta.totalActivitiesDropped + 1
                              : itin.meta.totalActivitiesDropped,
                          },
                        },
                      });
                    }}
                    onEditTime={(slot) => {
                      const h = String(Math.floor(slot.startMinutes / 60)).padStart(2, "0");
                      const m = String(slot.startMinutes % 60).padStart(2, "0");
                      setEditingTime({ dayIndex: selectedDay, slot, value: `${h}:${m}` });
                    }}
                    onDragStart={(slot) => setDragging({ slot, sourceDayIndex: selectedDay })}
                    onDragEnd={() => setDragging(null)}
                    draggingSlot={dragging?.sourceDayIndex === selectedDay ? dragging.slot : null}
                    onMoveUp={(slot) => {
                      const itin = trip.itinerary;
                      if (!itin) return;
                      const day = itin.days[selectedDay];
                      if (!day) return;
                      const idx = day.slots.indexOf(slot);
                      if (idx <= 0) return;
                      const slots = [...day.slots];
                      const a = slots[idx - 1], b = slots[idx];
                      slots[idx - 1] = { ...b, startMinutes: a.startMinutes, endMinutes: a.startMinutes + b.durationMinutes };
                      slots[idx]     = { ...a, startMinutes: b.startMinutes, endMinutes: b.startMinutes + a.durationMinutes };
                      updateTrip({ itinerary: { ...itin, days: itin.days.map((d) => d.dayIndex === day.dayIndex ? { ...d, slots } : d) } });
                    }}
                    onMoveDown={(slot) => {
                      const itin = trip.itinerary;
                      if (!itin) return;
                      const day = itin.days[selectedDay];
                      if (!day) return;
                      const idx = day.slots.indexOf(slot);
                      if (idx < 0 || idx >= day.slots.length - 1) return;
                      const slots = [...day.slots];
                      const a = slots[idx], b = slots[idx + 1];
                      slots[idx]     = { ...b, startMinutes: a.startMinutes, endMinutes: a.startMinutes + b.durationMinutes };
                      slots[idx + 1] = { ...a, startMinutes: b.startMinutes, endMinutes: b.startMinutes + a.durationMinutes };
                      updateTrip({ itinerary: { ...itin, days: itin.days.map((d) => d.dayIndex === day.dayIndex ? { ...d, slots } : d) } });
                    }}
                    onEditNotes={(slot, note) => {
                      const itin = trip.itinerary;
                      if (!itin) return;
                      updateTrip({ itinerary: { ...itin, days: itin.days.map((d) => d.dayIndex === selectedDay ? { ...d, slots: d.slots.map((s) => s === slot ? { ...s, note } : s) } : d) } });
                    }}
                    onEditDuration={(slot, minutes) => {
                      const itin = trip.itinerary;
                      if (!itin) return;
                      const timeDelta = minutes - slot.durationMinutes;
                      updateTrip({
                        itinerary: {
                          ...itin,
                          days: itin.days.map((d) => {
                            if (d.dayIndex !== selectedDay) return d;
                            const idx = d.slots.indexOf(slot);
                            return {
                              ...d,
                              slots: d.slots
                                .map((s, i) => {
                                  if (s === slot) return { ...s, durationMinutes: minutes, endMinutes: s.startMinutes + minutes };
                                  if (i > idx) return { ...s, startMinutes: s.startMinutes + timeDelta, endMinutes: s.endMinutes + timeDelta };
                                  return s;
                                })
                                .sort((a, b) => a.startMinutes - b.startMinutes),
                            };
                          }),
                        },
                      });
                    }}
                    onRename={(slot) => setRenamingSlot({ dayIndex: selectedDay, slot, value: slot.title })}
                    renamingSlot={renamingSlot}
                    onRenameChange={(value) => setRenamingSlot((prev) => prev ? { ...prev, value } : null)}
                    onRenameCommit={() => {
                      if (!renamingSlot || !trip.itinerary) return;
                      updateTrip({
                        itinerary: {
                          ...trip.itinerary,
                          days: trip.itinerary.days.map((d) => {
                            if (d.dayIndex !== renamingSlot.dayIndex) return d;
                            return {
                              ...d,
                              slots: d.slots.map((s) =>
                                s === renamingSlot.slot ? { ...s, title: renamingSlot.value } : s
                              ),
                            };
                          }),
                        },
                      });
                      setRenamingSlot(null);
                    }}
                    onQuickAdd={() => setQuickAddModal({
                      open:            true,
                      dayIndex:        selectedDay,
                      activityName:    "",
                      durationMinutes: 90,
                    })}
                  />
                </div>
              )}

              {/* Slot detail modal */}
              {detailSlot && (() => {
                const dMeta = Object.values(savedMeta).find((m) => m.title === detailSlot.title) ?? null;
                return (
                  <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
                    onClick={() => setDetailSlot(null)}
                  >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div
                      className="relative z-10 w-full max-w-lg mx-4 mb-4 sm:mb-0 rounded-3xl border border-white/10 bg-[#0D1019] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Photo carousel — prefer Places photos, fall back to savedMeta photoRef */}
                      {(() => {
                        const photos = modalPlaceDetail?.photos ?? (dMeta?.photoRef ? [{ name: dMeta.photoRef }] : []);
                        if (photos.length === 0) return null;
                        return (
                          <div className="h-44 relative overflow-hidden flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              key={photos[detailActivePhoto]?.name}
                              src={`/api/activities/photo?name=${encodeURIComponent(photos[detailActivePhoto]?.name ?? "")}&w=800`}
                              className="w-full h-full object-cover"
                              alt={detailSlot.title}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0D1019] via-[#0D1019]/20 to-transparent" />
                            {photos.length > 1 && (
                              <>
                                <button type="button" onClick={() => setDetailActivePhoto((n) => Math.max(0, n - 1))} disabled={detailActivePhoto === 0}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all disabled:opacity-20">
                                  ‹
                                </button>
                                <button type="button" onClick={() => setDetailActivePhoto((n) => Math.min(photos.length - 1, n + 1))} disabled={detailActivePhoto === photos.length - 1}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all disabled:opacity-20">
                                  ›
                                </button>
                                <div className="absolute bottom-2 right-3 bg-black/55 rounded-full px-2 py-0.5 text-[10px] text-white/70">
                                  {detailActivePhoto + 1} / {photos.length}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      <div className="overflow-y-auto flex-1">
                        <div className="p-6">
                          <button
                            type="button"
                            className="absolute top-4 right-4 z-10 text-white/40 hover:text-white/80 transition-colors text-lg leading-none"
                            onClick={() => setDetailSlot(null)}
                          >
                            ✕
                          </button>

                          {/* Title + meta */}
                          <p className="text-[11px] font-mono text-white/30 mb-1">
                            {formatTime(detailSlot.startMinutes)} — {formatDuration(detailSlot.durationMinutes)}
                          </p>
                          <h3 className="text-lg font-bold text-white mb-2">{detailSlot.title}</h3>
                          <div className="flex items-center flex-wrap gap-2 mb-3">
                            {(modalPlaceDetail?.address ?? dMeta?.neighborhood) && (
                              <span className="text-xs text-white/40">{modalPlaceDetail?.address ?? dMeta?.neighborhood}</span>
                            )}
                            {(modalPlaceDetail?.rating ?? (dMeta?.rating != null && dMeta.rating > 0 ? dMeta.rating : null)) != null && (
                              <>
                                <span className="text-white/20">·</span>
                                <span className="text-xs text-lantern-gold">
                                  ★ {(modalPlaceDetail?.rating ?? dMeta?.rating)!.toFixed(1)}
                                  {modalPlaceDetail?.userRatingCount && (
                                    <span className="text-white/30 ml-1">({modalPlaceDetail.userRatingCount.toLocaleString()})</span>
                                  )}
                                </span>
                              </>
                            )}
                            {dMeta?.category && dMeta.category in CAT_STYLE && (
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${CAT_STYLE[dMeta.category]}`}>
                                {dMeta.category}
                              </span>
                            )}
                          </div>

                          {/* Editorial summary / why visit */}
                          {(modalPlaceDetail?.editorialSummary ?? detailSlot.explanation) && (
                            <p className="text-sm text-white/50 leading-relaxed mb-3">
                              {modalPlaceDetail?.editorialSummary ?? detailSlot.explanation}
                            </p>
                          )}

                          {/* Loading indicator */}
                          {modalDetailLoading && (
                            <p className="text-[10px] text-white/25 mb-2">Loading place details…</p>
                          )}

                          {/* Hours */}
                          {modalPlaceDetail?.weekdayDescriptions && modalPlaceDetail.weekdayDescriptions.length > 0 && (
                            <details className="mb-2">
                              <summary className="text-[11px] text-white/40 cursor-pointer select-none">
                                {modalPlaceDetail.openNow === false ? "🔴 Closed now" : modalPlaceDetail.openNow ? "🟢 Open now" : "⏰ Opening hours"}
                              </summary>
                              <ul className="mt-1 space-y-0.5 pl-4">
                                {modalPlaceDetail.weekdayDescriptions.map((line, i) => (
                                  <li key={i} className="text-[10px] text-white/40">{line}</li>
                                ))}
                              </ul>
                            </details>
                          )}

                          {/* Contact & links */}
                          {(modalPlaceDetail?.phone || modalPlaceDetail?.website || modalPlaceDetail?.googleMapsUri) && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                              {modalPlaceDetail.phone && (
                                <a href={`tel:${modalPlaceDetail.phone}`} className="text-[11px] text-white/40 hover:text-white/70 transition-colors">
                                  📞 {modalPlaceDetail.phone}
                                </a>
                              )}
                              {modalPlaceDetail.website && (
                                <a href={modalPlaceDetail.website} target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] text-lantern-blue/80 hover:text-lantern-blue truncate max-w-[200px] transition-colors">
                                  🌐 {modalPlaceDetail.website.replace(/^https?:\/\/(www\.)?/, "")}
                                </a>
                              )}
                              {(modalPlaceDetail?.googleMapsUri ?? detailSlot.sourceId) && (
                                <a
                                  href={modalPlaceDetail?.googleMapsUri ?? `https://maps.google.com/?q=${encodeURIComponent(detailSlot.title)}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] text-lantern-blue/80 hover:text-lantern-blue transition-colors">
                                  🗺 Google Maps
                                </a>
                              )}
                            </div>
                          )}

                          {/* Reviews */}
                          {modalPlaceDetail?.reviews && modalPlaceDetail.reviews.length > 0 && (
                            <div className="mb-4">
                              <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-2">Reviews</p>
                              <div className="space-y-3">
                                {modalPlaceDetail.reviews.map((r, i) => (
                                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      {r.authorPhotoUri && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={r.authorPhotoUri} alt={r.authorName ?? ""} className="w-5 h-5 rounded-full object-cover" />
                                      )}
                                      <span className="text-[11px] font-medium text-white/60">{r.authorName ?? "Anonymous"}</span>
                                      {r.rating != null && (
                                        <span className="text-[10px] text-lantern-gold ml-auto">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                                      )}
                                    </div>
                                    {r.text && (
                                      <p className="text-[11px] text-white/40 leading-relaxed line-clamp-3">{r.text}</p>
                                    )}
                                    {r.timeAgo && (
                                      <p className="text-[10px] text-white/20 mt-1">{r.timeAgo}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          <div className="mt-2 border-t border-white/[0.06] pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">Notes</span>
                              {noteEdit === null ? (
                                <button
                                  type="button"
                                  onClick={() => setNoteEdit(detailSlot.note ?? "")}
                                  className="text-[11px] text-white/40 hover:text-lantern-mint transition-colors"
                                >
                                  {detailSlot.note ? "Edit" : "+ Add note"}
                                </button>
                              ) : (
                                <div className="flex gap-3">
                                  <button type="button" onClick={() => setNoteEdit(null)} className="text-[11px] text-white/40 hover:text-white/70 transition-colors">Cancel</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!trip.itinerary) return;
                                      const updated = { ...detailSlot, note: noteEdit };
                                      updateTrip({
                                        itinerary: {
                                          ...trip.itinerary,
                                          days: trip.itinerary.days.map((d) => ({
                                            ...d,
                                            slots: d.slots.map((s) => s === detailSlot ? updated : s),
                                          })),
                                        },
                                      });
                                      setDetailSlot(updated);
                                      setNoteEdit(null);
                                    }}
                                    className="text-[11px] text-lantern-mint font-semibold hover:opacity-80 transition-opacity"
                                  >
                                    Save
                                  </button>
                                </div>
                              )}
                            </div>
                            {noteEdit === null ? (
                              detailSlot.note ? (
                                <p className="text-sm text-white/50 leading-relaxed whitespace-pre-wrap">{detailSlot.note}</p>
                              ) : (
                                <p className="text-[12px] text-white/20 italic">No notes yet</p>
                              )
                            ) : (
                              <textarea
                                autoFocus
                                value={noteEdit}
                                onChange={(e) => setNoteEdit(e.target.value)}
                                placeholder="Add your notes…"
                                rows={3}
                                className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-lantern-mint/50 resize-none"
                              />
                            )}
                          </div>

                          {/* Duration */}
                          <div className="mt-4 border-t border-white/[0.06] pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">Duration</span>
                              {durationEdit === null ? (
                                <button type="button" onClick={() => setDurationEdit(detailSlot.durationMinutes)} className="text-[11px] text-white/40 hover:text-lantern-mint transition-colors">Edit</button>
                              ) : (
                                <div className="flex gap-3">
                                  <button type="button" onClick={() => setDurationEdit(null)} className="text-[11px] text-white/40 hover:text-white/70 transition-colors">Cancel</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!trip.itinerary || durationEdit === null) return;
                                      const newDur = Math.max(15, Math.min(480, durationEdit));
                                      const updated = { ...detailSlot, durationMinutes: newDur, endMinutes: detailSlot.startMinutes + newDur };
                                      updateTrip({
                                        itinerary: {
                                          ...trip.itinerary,
                                          days: trip.itinerary.days.map((d) => ({
                                            ...d,
                                            slots: d.slots.map((s) => s === detailSlot ? updated : s).sort((a, b) => a.startMinutes - b.startMinutes),
                                          })),
                                        },
                                      });
                                      setDetailSlot(updated);
                                      setDurationEdit(null);
                                    }}
                                    className="text-[11px] text-lantern-mint font-semibold hover:opacity-80 transition-opacity"
                                  >
                                    Save
                                  </button>
                                </div>
                              )}
                            </div>
                            {durationEdit === null ? (
                              <p className="text-sm text-white/50">{detailSlot.durationMinutes}m</p>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input
                                  autoFocus type="number" min={15} max={480} step={15} value={durationEdit}
                                  onChange={(e) => setDurationEdit(Number(e.target.value))}
                                  className="w-28 bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-lantern-mint/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-sm text-white/30">minutes</span>
                              </div>
                            )}
                          </div>

                          {!modalPlaceDetail?.googleMapsUri && (
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(detailSlot.title)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="mt-4 inline-flex items-center gap-1.5 text-xs text-lantern-blue hover:text-white transition-colors"
                            >
                              Open in Google Maps →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
        </div>
        )}

        {/* ── Tab: Preferences ── */}
        {activeTab === "preferences" && (
          <PreferencesPanel
            cities={trip.cities}
            startDate={trip.startDate}
            endDate={endDate}
            totalDays={totalDays}
            onUpdateCity={(i, patch) => updateCity(i, patch)}
            onAddCity={addCity}
            onRemoveCity={removeCity}
            onUpdateStartDate={(v) => updateTrip({ startDate: v })}
            wakeTime={trip.wakeTime}
            bedTime={trip.bedTime}
            pace={trip.pace}
            transit={trip.transit}
            onUpdateWakeTime={(v) => updateTrip({ wakeTime: v })}
            onUpdateBedTime={(v) => updateTrip({ bedTime: v })}
            onUpdatePace={(v) => updateTrip({ pace: v })}
            onUpdateTransit={(v) => updateTrip({ transit: v })}
            budgetTier={budgetTier}
            setBudgetTier={setBudgetTier}
            cuisinePrefs={cuisinePrefs}
            setCuisinePrefs={setCuisinePrefs}
            selectedFlight={selectedFlight}
            selectedHotel={selectedHotel}
            manualArrivalTime={trip.manualArrivalTime}
            manualDepartureTime={trip.manualDepartureTime}
            manualHotelName={trip.manualHotelName}
            onUpdateManualArrival={(v) => updateTrip({ manualArrivalTime: v })}
            onUpdateManualDeparture={(v) => updateTrip({ manualDepartureTime: v })}
            onUpdateManualHotel={(v) => updateTrip({ manualHotelName: v })}
            onClearFlight={clearFlight}
            onClearHotel={clearHotel}
            obStyles={obStyles}
            obFirstTime={obFirstTime}
            onEditTrip={startOnboarding}
          />
        )}

        {/* ── Tab: Recommendations ── */}
        {activeTab === "recommendations" && (
          <RecommendationsPanel
            aiRecs={aiRecs}
            aiRecsStatus={aiRecsStatus}
            aiRecsFilter={aiRecsFilter}
            setAiRecsFilter={setAiRecsFilter}
            dismissedIds={dismissedIds}
            setDismissedIds={setDismissedIds}
            addedRecIds={addedRecIds}
            savedIds={savedIds}
            onLoad={() => void loadAiRecommendations()}
            onAdd={addAiRecToTrip}
            hasTripInfo={obStyles.length > 0 && trip.cities.some((c) => c.city.trim())}
          />
        )}

        {/* ── Tab: Saved places ── */}
        {activeTab === "saved" && (
          <SavedPlacesPanel
            savedIds={savedIds}
            savedMeta={savedMeta}
            excludedActivityIds={trip.excludedActivityIds}
            onToggle={toggleExclude}
            onClearAll={clearSavedPlaces}
          />
        )}

        {/* ── Tab: Dropped activities ── */}
        {activeTab === "dropped" && trip.itinerary && (() => {
          const dropped = trip.itinerary.meta.droppedActivities || [];

          if (dropped.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center min-h-[220px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
                <p className="text-sm font-semibold text-white mb-1">All activities scheduled</p>
                <p className="text-xs text-white/35">Every saved place made it into the itinerary.</p>
              </div>
            );
          }

          return (
            <div className="space-y-2 max-w-2xl">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-white">{dropped.length} {dropped.length === 1 ? "activity" : "activities"} didn&apos;t fit</h2>
                <p className="text-xs text-white/35 mt-1">Click &ldquo;+ Add&rdquo; and Claude will suggest the best placement.</p>
              </div>
              {dropped.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/80 truncate">{d.title}</p>
                    <p className="text-[10px] text-white/35 mt-0.5">
                      {d.diagnostic?.activityDuration ? `${d.diagnostic.activityDuration}m` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!trip.itinerary) return;
                      setAddActivityModal({ activity: d });
                      try {
                        const res = await fetch("/api/itinerary/suggest-placement", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            activity: d,
                            itinerary: trip.itinerary,
                            tripPace: trip.pace,
                          }),
                        });
                        const placement = await res.json();
                        setAddActivityModal({ activity: d, placement });
                      } catch (err) {
                        console.error("Placement analysis failed:", err);
                        setAddActivityModal({ activity: d, placement: { cannotFit: true, explanation: "Analysis failed" } });
                      }
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-lantern-mint/30 text-lantern-mint text-xs hover:bg-lantern-mint/10 transition-colors"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

      </div>
      )}

      {/* ── Add-activity modal ── */}
      {addActivityModal && trip.itinerary && (() => {
        const { activity, placement } = addActivityModal;
        const itin = trip.itinerary;
        const durMin = activity.diagnostic?.activityDuration ?? 90;

        function addActivityToDay(dayIndex: number, swapRemoveTitle?: string) {
          const newSlot: PlannedSlot = {
            kind:            "activity",
            startMinutes:    14 * 60,
            endMinutes:      14 * 60 + durMin,
            durationMinutes: durMin,
            title:           activity.title,
            explanation:     "Added manually",
            sourceId:        activity.sourceId || undefined,
          };
          const newDropped = itin.meta.droppedActivities.filter((da) => da.title !== activity.title);
          updateTrip({
            itinerary: {
              ...itin,
              days: itin.days.map((d) => {
                if (d.dayIndex !== dayIndex) return d;
                const base = swapRemoveTitle
                  ? d.slots.filter((s) => s.title !== swapRemoveTitle)
                  : d.slots;
                return {
                  ...d,
                  slots: [...base, newSlot].sort((a, b) => a.startMinutes - b.startMinutes),
                  scheduledActivityCount: d.scheduledActivityCount + (swapRemoveTitle ? 0 : 1),
                };
              }),
              meta: {
                ...itin.meta,
                droppedActivities:        newDropped,
                totalActivitiesDropped:   newDropped.length,
                totalActivitiesScheduled: swapRemoveTitle
                  ? itin.meta.totalActivitiesScheduled
                  : itin.meta.totalActivitiesScheduled + 1,
              },
            },
          });
          setActiveTab("itinerary");
          setSelectedDay(dayIndex);
          setAddActivityModal(null);
        }

        // Loading state
        if (!placement) {
          return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
              <div className="bg-lantern-dark border border-white/[0.1] rounded-2xl p-8 max-w-md w-full mx-4">
                <p className="text-white text-center">Claude is analyzing placement options...</p>
              </div>
            </div>
          );
        }

        // Cannot fit
        if (placement.cannotFit) {
          return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
              <div className="bg-lantern-dark border border-white/[0.1] rounded-2xl p-8 max-w-md w-full mx-4">
                <p className="text-white font-semibold mb-2">Cannot fit this activity</p>
                <p className="text-white/60 text-sm mb-6">{placement.explanation}</p>
                <button
                  type="button"
                  onClick={() => setAddActivityModal(null)}
                  className="w-full px-4 py-2 bg-lantern-mint/10 border border-lantern-mint/30 text-lantern-mint rounded-lg hover:bg-lantern-mint/20 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-lantern-dark border border-white/[0.1] rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6 border-b border-white/[0.1]">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-white font-semibold">Add to itinerary</h2>
                    <p className="text-white/40 text-sm mt-1">{activity.title} · {durMin}m</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddActivityModal(null)}
                    className="text-white/40 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-3">
                {placement.bestFitDays && placement.bestFitDays.length > 0 && (
                  <div>
                    <p className="text-white/40 text-xs font-semibold uppercase mb-2">Best Options</p>
                    {placement.bestFitDays.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => addActivityToDay(suggestion.dayIndex)}
                        className="w-full text-left p-4 rounded-lg border border-lantern-mint/30 bg-white/[0.02] hover:bg-lantern-mint/10 hover:border-lantern-mint/50 transition-colors mb-2"
                      >
                        <p className="text-white font-semibold">Day {suggestion.dayIndex + 1} · {suggestion.city}</p>
                        <p className="text-lantern-mint text-sm mt-1">{suggestion.reason}</p>
                      </button>
                    ))}
                  </div>
                )}

                {placement.swapSuggestions && placement.swapSuggestions.length > 0 && (
                  <div>
                    <p className="text-white/40 text-xs font-semibold uppercase mb-2">Or Swap With</p>
                    {placement.swapSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => addActivityToDay(suggestion.dayIndex, suggestion.replaceActivityTitle)}
                        className="w-full text-left p-4 rounded-lg border border-yellow-500/30 bg-white/[0.02] hover:bg-yellow-500/10 hover:border-yellow-500/50 transition-colors mb-2"
                      >
                        <p className="text-white font-semibold">Day {suggestion.dayIndex + 1} · {suggestion.city}</p>
                        <p className="text-yellow-400 text-sm mt-1">
                          Replace &ldquo;{suggestion.replaceActivityTitle}&rdquo; ({suggestion.replaceActivityDuration}m)
                        </p>
                        <p className="text-white/40 text-xs mt-2">{suggestion.reason}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-white/[0.1]">
                <button
                  type="button"
                  onClick={() => setAddActivityModal(null)}
                  className="w-full px-4 py-2 bg-white/[0.05] border border-white/[0.1] text-white/60 rounded-lg hover:bg-white/[0.1] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit-time modal ── */}
      {editingTime && trip.itinerary && (() => {
        const [newH, newM] = (editingTime.value || "00:00").split(":").map(Number);
        const newStart = (newH || 0) * 60 + (newM || 0);
        const arrivalMinutes = selectedFlight?.arriveTime && editingTime.dayIndex === 0
          ? (() => { const [ah, am] = selectedFlight.arriveTime.split(":").map(Number); return ah * 60 + am; })()
          : null;
        const timeError = arrivalMinutes !== null && newStart < arrivalMinutes
          ? `Cannot schedule before arrival at ${fmt24(selectedFlight!.arriveTime)}`
          : null;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setEditingTime(null)}
          >
            <div
              className="bg-[#0D1019] border border-white/[0.12] rounded-2xl max-w-sm w-full p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-white font-semibold">Change start time</h2>
                  <p className="text-white/50 text-sm mt-0.5 truncate max-w-[230px]">{editingTime.slot.title}</p>
                </div>
                <button type="button" onClick={() => setEditingTime(null)} className="text-white/30 hover:text-white/70 transition-colors ml-3 shrink-0">✕</button>
              </div>

              <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[11px] text-white/35 uppercase tracking-wider">Current</span>
                <span className="text-white/60 font-mono text-sm">{formatTime(editingTime.slot.startMinutes)}</span>
              </div>

              <label className="block text-white/50 text-xs mb-2 uppercase tracking-wider">New time</label>
              <input
                type="time"
                value={editingTime.value}
                onChange={(e) => setEditingTime((prev) => prev ? { ...prev, value: e.target.value } : null)}
                className="w-full bg-white/[0.05] border border-white/[0.15] rounded-lg px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-lantern-mint/60 mb-3"
                autoFocus
              />
              {timeError && (
                <p className="text-red-400 text-xs mb-3">{timeError}</p>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setEditingTime(null)}
                  className="flex-1 px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] text-white/60 rounded-lg hover:bg-white/[0.1] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!!timeError}
                  onClick={() => {
                    if (!editingTime || !trip.itinerary || timeError) return;
                    const duration = editingTime.slot.endMinutes - editingTime.slot.startMinutes;
                    updateTrip({
                      itinerary: {
                        ...trip.itinerary,
                        days: trip.itinerary.days.map((d) => {
                          if (d.dayIndex !== editingTime.dayIndex) return d;
                          const newSlots = d.slots
                            .map((s) => s === editingTime.slot
                              ? { ...s, startMinutes: newStart, endMinutes: newStart + duration }
                              : s
                            )
                            .sort((a, b) => a.startMinutes - b.startMinutes);
                          return { ...d, slots: newSlots };
                        }),
                      },
                    });
                    setEditingTime(null);
                  }}
                  className={`flex-1 px-4 py-2.5 bg-lantern-mint text-ink font-semibold rounded-lg transition-opacity ${timeError ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"}`}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Quick-add activity modal ── */}
      {quickAddModal.open && quickAddModal.dayIndex !== null && (() => {
        const itin = trip.itinerary;
        const day  = itin?.days.find((d) => d.dayIndex === quickAddModal.dayIndex);
        const dayLabel = day
          ? `Day ${day.dayIndex + 1}${day.cityLabel ? ` · ${day.cityLabel}` : ""}`
          : `Day ${(quickAddModal.dayIndex ?? 0) + 1}`;

        function commitQuickAdd() {
          if (!itin || !quickAddModal.activityName.trim() || quickAddModal.dayIndex === null) return;
          const dur       = Math.max(15, Math.min(480, quickAddModal.durationMinutes));
          const lastEnd   = day ? Math.max(0, ...day.slots.map((s) => s.endMinutes)) : 9 * 60;
          const startMin  = lastEnd > 0 ? lastEnd + 15 : 9 * 60;
          const newSlot: PlannedSlot = {
            kind:            "activity",
            startMinutes:    startMin,
            endMinutes:      startMin + dur,
            durationMinutes: dur,
            title:           quickAddModal.activityName.trim(),
            explanation:     "",
          };
          updateTrip({
            itinerary: {
              ...itin,
              days: itin.days.map((d) => {
                if (d.dayIndex !== quickAddModal.dayIndex) return d;
                const slots = [...d.slots, newSlot].sort((a, b) => a.startMinutes - b.startMinutes);
                return { ...d, slots, scheduledActivityCount: slots.filter((s) => s.kind === "activity").length };
              }),
            },
          });
          setQuickAddModal({ open: false, dayIndex: null, activityName: "", durationMinutes: 90 });
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
               onClick={() => setQuickAddModal((m) => ({ ...m, open: false }))}>
            <div className="bg-[#0D1019] border border-white/[0.1] rounded-2xl max-w-sm w-full shadow-2xl"
                 onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-white font-semibold text-sm">Add activity</h2>
                    <p className="text-[11px] text-white/35 mt-0.5">{dayLabel}</p>
                  </div>
                  <button type="button"
                    onClick={() => setQuickAddModal((m) => ({ ...m, open: false }))}
                    className="text-white/40 hover:text-white/80 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-xl leading-none">
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white/40 block mb-1.5">Activity name</label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="e.g. Temple visit"
                      value={quickAddModal.activityName}
                      onChange={(e) => setQuickAddModal((m) => ({ ...m, activityName: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") commitQuickAdd(); }}
                      className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white text-sm placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 block mb-1.5">
                      Duration — <span className="text-white/70">{quickAddModal.durationMinutes} min</span>
                    </label>
                    <input
                      type="number"
                      min={15} max={480} step={15}
                      value={quickAddModal.durationMinutes}
                      onChange={(e) => setQuickAddModal((m) => ({ ...m, durationMinutes: Math.max(15, Math.min(480, parseInt(e.target.value) || 90)) }))}
                      className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white text-sm focus:border-lantern-mint/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button type="button"
                    disabled={!quickAddModal.activityName.trim()}
                    onClick={commitQuickAdd}
                    className="flex-1 bg-lantern-mint text-ink font-semibold rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed">
                    Add to day
                  </button>
                  <button type="button"
                    onClick={() => setQuickAddModal((m) => ({ ...m, open: false }))}
                    className="flex-1 border border-white/[0.1] text-white/60 rounded-lg px-4 py-2.5 hover:bg-white/[0.05] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Save As Modal ── */}
      {saveAsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setSaveAsModal(false)}>
          <div className="bg-[#0D1019] border border-white/[0.1] rounded-2xl max-w-sm w-full shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Save trip as</h2>
                <button type="button" onClick={() => setSaveAsModal(false)}
                  className="text-white/40 hover:text-white/80 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-xl leading-none">
                  ✕
                </button>
              </div>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Japan 2026"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveAsName.trim()) {
                    const now     = new Date().toISOString();
                    const updated = tripList.map((t) =>
                      t.id === activeTripId
                        ? { ...t, name: saveAsName.trim(), trip, updatedAt: now }
                        : t
                    );
                    const finalList = activeTripId && updated.some((t) => t.id === activeTripId)
                      ? updated
                      : [...tripList, { id: activeTripId ?? generateTripId(), name: saveAsName.trim(), trip, createdAt: now, updatedAt: now }];
                    saveAllTrips(finalList);
                    setTripList(finalList);
                    setSaveAsModal(false);
                  }
                }}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white text-sm placeholder:text-white/20 focus:border-lantern-mint/50 focus:outline-none mb-4"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={!saveAsName.trim()}
                  onClick={() => {
                    if (!saveAsName.trim()) return;
                    const now     = new Date().toISOString();
                    const updated = tripList.map((t) =>
                      t.id === activeTripId
                        ? { ...t, name: saveAsName.trim(), trip, updatedAt: now }
                        : t
                    );
                    const finalList = activeTripId && updated.some((t) => t.id === activeTripId)
                      ? updated
                      : [...tripList, { id: activeTripId ?? generateTripId(), name: saveAsName.trim(), trip, createdAt: now, updatedAt: now }];
                    saveAllTrips(finalList);
                    setTripList(finalList);
                    setSaveAsModal(false);
                  }}
                  className="flex-1 bg-lantern-mint text-ink font-semibold rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Save
                </button>
                <button type="button" onClick={() => setSaveAsModal(false)}
                  className="flex-1 border border-white/[0.1] text-white/60 rounded-lg px-4 py-2.5 hover:bg-white/[0.05] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Trip Modal ── */}
      {editTripModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setEditTripModal(false)}>
          <div className="bg-[#0D1019] border border-white/[0.1] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-white/[0.08] flex items-center justify-between sticky top-0 bg-[#0D1019] z-10">
              <div>
                <h2 className="text-white font-semibold">Edit trip</h2>
                {activeTripId && tripList.find((t) => t.id === activeTripId)?.name && (
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {tripList.find((t) => t.id === activeTripId)!.name}
                  </p>
                )}
              </div>
              <button type="button"
                onClick={() => setEditTripModal(false)}
                className="text-white/40 hover:text-white/80 transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06]">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Cities (editable) */}
              {(() => {
                const editTotal = editCities.reduce((s, c) => s + (c.days || 0), 0);
                const editEndDerived = editStart ? addDays(editStart, editTotal) : "";
                return (
                  <>
                    <div>
                      <label className="text-xs text-white/40 block mb-2">Destination</label>
                      <div className="space-y-2">
                        {editCities.map((stop, i) => (
                          <CityRow
                            key={i}
                            stop={stop}
                            index={i}
                            canRemove={editCities.length > 1}
                            onUpdate={(patch) =>
                              setEditCities((prev) => prev.map((c, j) => j === i ? { ...c, ...patch } : c))
                            }
                            onRemove={() =>
                              setEditCities((prev) => prev.filter((_, j) => j !== i))
                            }
                          />
                        ))}
                      </div>
                      <button type="button"
                        onClick={() => setEditCities((prev) => [...prev, { city: "", days: 1 }])}
                        className="mt-2 text-[11px] text-white/30 hover:text-lantern-mint transition-colors">
                        + Add city
                      </button>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-white/40 block mb-1.5">Start date</label>
                        <input type="date" value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-white text-sm focus:border-lantern-mint/50 focus:outline-none [color-scheme:dark]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/40 block mb-1.5">End date</label>
                        <input type="date" value={editEndDerived}
                          onChange={(e) => {
                            if (!editStart || !e.target.value) return;
                            const startMs = new Date(editStart + "T00:00:00").getTime();
                            const endMs   = new Date(e.target.value + "T00:00:00").getTime();
                            const newTotal = Math.round((endMs - startMs) / 86400000) + 1;
                            if (newTotal < editCities.length) return;
                            const diff = newTotal - editTotal;
                            setEditCities((prev) => {
                              const next = [...prev];
                              next[next.length - 1] = {
                                ...next[next.length - 1],
                                days: Math.max(1, next[next.length - 1].days + diff),
                              };
                              return next;
                            });
                          }}
                          className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-white text-sm focus:border-lantern-mint/50 focus:outline-none [color-scheme:dark]"
                        />
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Pace */}
              <div>
                <label className="text-xs text-white/40 block mb-2">Pace</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["relaxed", "balanced", "packed"] as const).map((p) => (
                    <button key={p} type="button"
                      onClick={() => setEditPace(p)}
                      className={`rounded-lg border py-2.5 text-xs font-medium capitalize transition-colors ${
                        editPace === p
                          ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                          : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transit */}
              <div>
                <label className="text-xs text-white/40 block mb-2">Getting around</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["walking", "public transit", "taxi", "mixed"] as const).map((t) => (
                    <button key={t} type="button"
                      onClick={() => setEditTransit(t)}
                      className={`rounded-lg border py-2.5 text-xs font-medium capitalize transition-colors ${
                        editTransit === t
                          ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                          : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80"
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/[0.08] space-y-3 sticky bottom-0 bg-[#0D1019]">
              <button type="button"
                onClick={() => {
                  updateTrip({ startDate: editStart, cities: editCities, pace: editPace, transit: editTransit });
                  setEditTripModal(false);
                }}
                className="w-full px-4 py-3 bg-lantern-mint text-ink font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Save changes
              </button>
              <button type="button"
                onClick={() => setEditTripModal(false)}
                className="w-full px-4 py-3 border border-white/[0.1] text-white/60 rounded-lg hover:bg-white/[0.05] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"use client";

import React, { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import UsageBanner from "@/app/components/UsageBanner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PlannerOutput, PlannedDay, PlannedSlot, DayWarning, DroppedActivity } from "@/lib/itinerary/types";
import {
  readTripStore, writeTripStore, updateTripStore, clearTripStore,
  TRAVEL_STYLE_LABELS, TRIP_STORE_DEFAULT,
} from "@/lib/trip-store";
import type { TravelStyle } from "@/lib/trip-store";
import type { Activity } from "@/app/activities/data/types";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { RecommendationsPanel } from "./components/RecommendationsPanel";
import { SavedPlacesPanel } from "./components/SavedPlacesPanel";
import { activityPhotoUrl, fetchGooglePlaceDetail } from "@/lib/activities/google-place-client";
import type { GooglePlaceDetail } from "@/lib/activities/google-place-details";

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

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
        error ? "border-red-500/50" : validated ? "border-teal-300" : "border-gray-200"
      } bg-gray-100`}>
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
          className="w-full bg-transparent px-4 py-3.5 text-base text-gray-900 placeholder:text-gray-700 focus:outline-none pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {fetching && <span className="block h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-white/60 animate-spin" />}
          {!fetching && validated && <span className="text-teal-600 text-sm font-bold">✓</span>}
        </div>
      </div>
      {error && <p className="text-xs text-red-400 mt-1.5 px-1">{error}</p>}
      {!error && !validated && value.trim().length > 0 && (
        <p className="text-xs text-gray-700 mt-1.5 px-1">Select a destination from the suggestions.</p>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-gray-200 bg-gray-50 shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={s.placeId || i}>
              <button
                onMouseDown={(e) => { e.preventDefault(); select(s); }}
                className={`w-full text-left flex items-center gap-2 px-4 py-2.5 transition-colors ${
                  i === activeIdx ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span className="text-sm font-medium text-gray-900 truncate">{s.mainText}</span>
                {s.secondaryText && <span className="text-xs text-gray-700 flex-shrink-0">{s.secondaryText}</span>}
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
    <span className="text-sm font-semibold text-teal-600">{label}</span>
  ) : (
    <Link href={href} className="text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors">
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
  photos?:              Array<{
    name: string;
    authorAttributions?: Array<{ displayName?: string; uri?: string }>;
  }>;
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

function toPlannerPlaceDetail(data: GooglePlaceDetail): PlaceDetailData {
  return {
    address: data.formattedAddress ?? data.shortFormattedAddress,
    openNow: data.regularOpeningHours?.openNow,
    weekdayDescriptions: data.regularOpeningHours?.weekdayDescriptions,
    website: data.websiteUri,
    googleMapsUri: data.googleMapsUri,
    phone: data.nationalPhoneNumber ?? data.internationalPhoneNumber,
    photos: data.photos,
    rating: data.rating,
    userRatingCount: data.userRatingCount,
    reviews: data.reviews?.slice(0, 5).map((review) => ({
      authorName: review.authorAttribution?.displayName,
      authorPhotoUri: review.authorAttribution?.photoUri,
      rating: review.rating,
      text: review.text?.text,
      timeAgo: review.relativePublishTimeDescription,
    })),
  };
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const SLOT_STYLE: Record<string, { dot: string; border: string; bg: string }> = {
  activity:           { dot: "bg-teal-500",    border: "border-teal-200",   bg: "bg-teal-50/60"     },
  meal:               { dot: "bg-amber-400",   border: "border-amber-200",  bg: "bg-amber-50/60"    },
  hotel_checkin:      { dot: "bg-gray-300",    border: "border-gray-200",   bg: "bg-gray-50"        },
  hotel_checkout:     { dot: "bg-gray-300",    border: "border-gray-200",   bg: "bg-gray-50"        },
  airport_transfer:   { dot: "bg-blue-400",    border: "border-blue-200",   bg: "bg-blue-50/60"     },
  intercity_transfer: { dot: "bg-teal-600",    border: "border-teal-300",   bg: "bg-teal-50"        },
  free_time:          { dot: "bg-gray-200",    border: "border-gray-100",   bg: "bg-white"          },
};

const CAT_STYLE: Record<string, string> = {
  food:        "text-amber-700  bg-amber-50  border-amber-200",
  nightlife:   "text-purple-700 bg-purple-50 border-purple-200",
  culture:     "text-teal-700   bg-teal-50   border-teal-200",
  adventure:   "text-orange-700 bg-orange-50 border-orange-200",
  nature:      "text-green-700  bg-green-50  border-green-200",
  luxury:      "text-amber-700  bg-amber-50  border-amber-200",
  hidden_gems: "text-pink-700   bg-pink-50   border-pink-200",
};

// ── Timeline ──────────────────────────────────────────────────────────────────

function TransitConnector({ slot }: { slot: PlannedSlot }) {
  const t = slot.transit!;
  const icon = t.mode === "walking" ? "🚶" : t.mode === "driving" ? "🚕" : "🚇";
  const showKm = t.coordsSource !== "estimated" && t.distanceKm > 0;
  return (
    <div className="flex items-center gap-2 py-1.5 pl-[4.5rem]">
      <span className="text-xs text-gray-700">
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
    const lineColor = slot.kind === "intercity_transfer" ? "border-teal-200" : "border-gray-200";
    return (
      <div
        className={`group flex items-center gap-3 py-2.5 border-b ${lineColor} select-none ${isClickable && slot.kind !== "activity" ? "cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors" : ""} ${isDragging ? "opacity-40" : ""} ${slot.kind === "activity" && onDragStart ? "cursor-grab active:cursor-grabbing" : ""}`}
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
            className="group/time flex items-center gap-1 w-16 shrink-0 text-left text-gray-700 hover:text-teal-600 transition-colors"
            title="Edit time"
          >
            <span className="text-[11px] font-mono tabular-nums underline decoration-dotted underline-offset-2">{formatTime(slot.startMinutes)}</span>
            <span className="text-[9px] opacity-40 group-hover/time:opacity-100 transition-opacity">✏</span>
          </button>
        ) : (
          <span className="text-[11px] font-mono text-gray-700 w-16 shrink-0 tabular-nums">
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
            className="flex-1 bg-transparent border-b border-teal-400 text-gray-700 text-[13px] outline-none min-w-0"
          />
        ) : (
          <span
            className={`flex-1 text-[13px] truncate ${slot.kind === "intercity_transfer" ? "text-teal-600 font-medium" : "text-gray-700"} ${slot.kind === "activity" && onRename ? "cursor-text" : ""}`}
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
            className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-teal-600 transition-all text-sm leading-none px-1"
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
            className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-700 hover:text-teal-600 transition-all text-sm leading-none px-0.5"
            title="View details"
          >
            ℹ
          </button>
        )}
        <span className="text-[11px] text-gray-700 shrink-0">{formatDuration(slot.durationMinutes)}</span>
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
            className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all text-xs leading-none px-0.5"
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
            className="group/time flex items-center gap-1 leading-none mb-1.5 text-gray-700 hover:text-teal-600 transition-colors"
            title="Edit time"
          >
            <span className="text-[11px] font-mono underline decoration-dotted underline-offset-2">{formatTime(slot.startMinutes)}</span>
            <span className="text-[9px] opacity-40 group-hover/time:opacity-100 transition-opacity">✏</span>
          </button>
        ) : (
          <span className="text-[11px] font-mono text-gray-700 leading-none mb-1.5">
            {formatTime(slot.startMinutes)}
          </span>
        )}
        <div className={`h-2.5 w-2.5 rounded-full border-2 border-ink shrink-0 ${style.dot}`} />
        {!isLast && <div className={`flex-1 w-px mt-1 ${slot.kind === "intercity_transfer" ? "bg-teal-100" : "bg-gray-100"}`} />}
      </div>
      <div
        className={`group flex-1 mb-4 rounded-xl border px-4 py-3 ${style.border} ${style.bg} select-none ${isClickable ? "cursor-pointer hover:border-gray-300 transition-colors" : ""} ${isDragging ? "opacity-40" : ""} ${slot.kind === "activity" && onDragStart ? "cursor-grab" : ""}`}
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
                className="w-full bg-transparent border-b border-teal-400 text-gray-900 font-semibold text-sm outline-none mb-1"
              />
            ) : (
              <p
                className={`text-sm font-semibold leading-snug ${slot.kind === "intercity_transfer" ? "text-teal-600" : "text-gray-900"} ${slot.kind === "activity" && onRename ? "cursor-text" : ""}`}
                onDoubleClick={slot.kind === "activity" ? (e) => { e.stopPropagation(); onRename?.(slot); } : undefined}
                title={slot.kind === "activity" && onRename ? "Double-click to rename" : undefined}
              >
                {slot.title}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-gray-700">{formatDuration(slot.durationMinutes)}</span>
              {nbhd && (
                <>
                  <span className="text-gray-700 text-xs">·</span>
                  <span className="text-[11px] text-gray-700">{nbhd}</span>
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
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-700 hover:text-teal-600 hover:bg-gray-50 transition-all text-base"
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
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-700 hover:text-teal-600 hover:bg-gray-50 transition-all text-base"
                title="Move down"
              >
                ↓
              </button>
            )}
            {slot.kind === "activity" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSlotClick(slot); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-700 hover:text-teal-600 hover:bg-gray-50 transition-all text-base"
                title="View details"
              >
                ℹ
              </button>
            )}
            {onRename && slot.kind === "activity" && !isRenaming && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRename(slot); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-700 hover:text-teal-600 hover:bg-gray-50 transition-all text-base"
                title="Rename"
              >
                ✏
              </button>
            )}
            {onDelete && slot.kind !== "intercity_transfer" && slot.kind !== "airport_transfer" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(slot); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-700 hover:text-red-400 hover:bg-gray-50 transition-all text-base"
                title="Remove from itinerary"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {slot.explanation && (
          <p className="mt-2 text-[11px] text-gray-700 leading-relaxed line-clamp-2">
            {slot.explanation}
          </p>
        )}
        {slot.kind === "activity" && onEditNotes && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider">Notes</span>
              {noteEdit === null ? (
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => { e.stopPropagation(); setNoteEdit(slot.note ?? ""); }}
                  className="text-[10px] text-gray-700 hover:text-teal-600 transition-colors"
                >
                  {slot.note ? "Edit" : "+ Add"}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" draggable={false} onClick={(e) => { e.stopPropagation(); setNoteEdit(null); }} className="text-[10px] text-gray-700 hover:text-gray-600 transition-colors">Cancel</button>
                  <button type="button" draggable={false} onClick={(e) => { e.stopPropagation(); onEditNotes(slot, noteEdit); setNoteEdit(null); }} className="text-[10px] text-teal-600 font-semibold hover:opacity-80 transition-opacity">Save</button>
                </div>
              )}
            </div>
            {noteEdit === null ? (
              slot.note
                ? <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">{slot.note}</p>
                : <p className="text-[10px] text-gray-700 italic">No notes</p>
            ) : (
              <textarea
                autoFocus
                value={noteEdit}
                onChange={(e) => setNoteEdit(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Add your notes…"
                rows={2}
                className="select-text w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-700 placeholder:text-gray-700 focus:outline-none focus:border-teal-400 resize-none"
              />
            )}
          </div>
        )}
        {slot.kind === "activity" && onEditDuration && (
          <div className="mt-2 flex items-center gap-3">
            <span className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider">Duration</span>
            {durationEdit === null ? (
              <>
                <span className="text-[11px] text-gray-700">{slot.durationMinutes}m</span>
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => { e.stopPropagation(); setDurationEdit(slot.durationMinutes); }}
                  className="text-[10px] text-gray-700 hover:text-teal-600 transition-colors"
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
                    className="select-text w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:border-teal-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[10px] text-gray-700">min</span>
                  {durError && <span className="text-red-400 text-[10px]">{durError}</span>}
                  <button type="button" draggable={false} onClick={(e) => { e.stopPropagation(); setDurationEdit(null); }} className="text-[10px] text-gray-700 hover:text-gray-600 transition-colors">Cancel</button>
                  <button type="button" draggable={false} disabled={!!durError} onClick={(e) => { e.stopPropagation(); if (!durError) { onEditDuration(slot, clampedDur); setDurationEdit(null); } }} className={`text-[10px] font-semibold transition-opacity ${durError ? "text-gray-700 cursor-not-allowed" : "text-teal-600 hover:opacity-80"}`}>Save</button>
                </>
              );
            })()}
          </div>
        )}
        {slot.kind === "activity" && (
          <div className="mt-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">⏰ Why this time?</p>
            <p className="text-[12px] text-gray-700 italic leading-relaxed">
              {slot.timeExplanation ?? "AI-scheduled for optimal experience"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const GAP_CAT_STYLE: Record<string, string> = {
  food:        "text-amber-600  bg-amber-50  border-amber-200",
  nightlife:   "text-purple-600 bg-purple-50 border-purple-200",
  culture:     "text-teal-600   bg-teal-50   border-teal-200",
  adventure:   "text-orange-600 bg-orange-50 border-orange-200",
  nature:      "text-green-600  bg-green-50  border-green-200",
  luxury:      "text-amber-600  bg-amber-50  border-amber-200",
  hidden_gems: "text-pink-600   bg-pink-50   border-pink-200",
};

function GapActivityCard({
  id, meta, onInsert, onViewDetail,
}: {
  id:            string;
  meta:          SavedMeta;
  onInsert:      (id: string, meta: SavedMeta) => void;
  onViewDetail?: (id: string, meta: SavedMeta) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const catStyle = meta.category && meta.category in GAP_CAT_STYLE ? GAP_CAT_STYLE[meta.category] : "text-gray-500 bg-gray-50 border-gray-200";
  const hasPhoto = !!meta.photoRef && !imgFailed;
  const GRAD: Record<string, string> = {
    food: "from-amber-400 to-orange-500", nightlife: "from-purple-500 to-indigo-600",
    culture: "from-teal-400 to-cyan-600", adventure: "from-orange-400 to-red-500",
    nature: "from-green-400 to-emerald-600", luxury: "from-yellow-400 to-amber-500",
    hidden_gems: "from-pink-400 to-rose-500",
  };
  const grad = meta.category ? (GRAD[meta.category] ?? "from-gray-400 to-gray-600") : "from-gray-400 to-gray-600";

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Photo */}
      <div className="relative h-36 shrink-0">
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activityPhotoUrl(meta.photoRef!, 800)}
            alt={meta.title}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
            <span className="text-white/60 text-3xl">
              {meta.category === "food" ? "🍜" : meta.category === "culture" ? "🏛️" : meta.category === "nature" ? "🌿" : meta.category === "nightlife" ? "🌃" : "✦"}
            </span>
          </div>
        )}
        {meta.category && (
          <span className={`absolute top-2 left-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize backdrop-blur-sm ${catStyle}`}>
            {meta.category === "hidden_gems" ? "Hidden Gem" : meta.category}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-3 gap-1.5">
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{meta.title}</p>
        <p className="text-[11px] text-gray-400">
          {[meta.neighborhood, meta.duration].filter(Boolean).join(" · ")}
        </p>
        {meta.rating > 0 && (
          <p className="text-[11px] text-amber-500 font-medium">★ {meta.rating.toFixed(1)}</p>
        )}
        <div className="mt-auto flex gap-1.5">
          {onViewDetail && (
            <button
              type="button"
              onClick={() => onViewDetail(id, meta)}
              className="flex-1 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold py-2 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Details
            </button>
          )}
          <button
            type="button"
            onClick={() => onInsert(id, meta)}
            className="flex-1 rounded-lg bg-teal-500 text-white text-xs font-semibold py-2 hover:bg-teal-600 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function GapSuggestion({
  freeMinutes,
  afterSlot,
  daySlots,
  city,
  onInsert,
}: {
  freeMinutes: number;
  afterSlot:   PlannedSlot;
  daySlots:    PlannedSlot[];
  city:        string;
  onInsert:    (id: string, meta: SavedMeta) => void;
}) {
  const [open,          setOpen]          = useState(false);
  const [catFilter,     setCatFilter]     = useState("all");
  const [detailAct,     setDetailAct]     = useState<{ id: string; meta: SavedMeta } | null>(null);
  const [detailData,    setDetailData]    = useState<PlaceDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPhoto,   setDetailPhoto]   = useState(0);
  const [apiResults,    setApiResults]    = useState<Activity[]>([]);
  const [apiLoading,    setApiLoading]    = useState(false);
  const [apiFetched,    setApiFetched]    = useState(false);

  useEffect(() => {
    if (!detailAct) { setDetailData(null); return; }
    setDetailLoading(true);
    setDetailData(null);
    setDetailPhoto(0);
    void fetchGooglePlaceDetail(detailAct.id, "modal_standard")
      .then((data) => setDetailData(data ? toPlannerPlaceDetail(data) : null))
      .finally(() => setDetailLoading(false));
  }, [detailAct?.id]);

  void afterSlot;

  const scheduledTitles = new Set(daySlots.map((s) => s.title.toLowerCase()));
  const allCandidates = apiResults.filter((a) => {
    const dur = parseDuration(a.duration);
    return dur <= freeMinutes && !scheduledTitles.has(a.title.toLowerCase());
  });
  const cats = ["all", ...Array.from(new Set(allCandidates.map((a) => a.category).filter(Boolean)))];
  const candidates = allCandidates
    .filter((a) => catFilter === "all" || a.category === catFilter)
    .sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setCatFilter("all");
          setDetailAct(null);
          if (!apiFetched && city) {
            setApiLoading(true);
            fetch(`/api/activities/search?destination=${encodeURIComponent(city)}`)
              .then((r) => r.ok ? r.json() : null)
              .then((data: { activities?: Activity[] } | null) => {
                if (data?.activities) setApiResults(data.activities);
                setApiFetched(true);
              })
              .catch(() => { setApiFetched(true); })
              .finally(() => setApiLoading(false));
          }
        }}
        className="w-full flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3.5 py-2 my-1.5 text-xs text-gray-400 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50/40 transition-colors"
      >
        <span className="text-sm leading-none">+</span>
        <span>
          <span className="font-semibold text-gray-500">{fmtMins(freeMinutes)} free</span>
          {" — add an activity here"}
        </span>
        <span className="ml-auto">→</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setOpen(false); setDetailAct(null); }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Add to this gap</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtMins(freeMinutes)} available
                  {apiLoading ? " · Searching activities…" : candidates.length > 0 ? ` · ${candidates.length} ${candidates.length === 1 ? "activity" : "activities"} fit` : apiFetched ? " · No activities found" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setOpen(false); setDetailAct(null); }}
                className="h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Category filter chips — hidden in detail view */}
            {!detailAct && cats.length > 2 && (
              <div className="flex gap-1.5 px-5 py-3 border-b border-gray-100 overflow-x-auto shrink-0">
                {cats.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    className={`shrink-0 text-xs px-3 py-1 rounded-full border capitalize transition-colors ${
                      catFilter === cat
                        ? "border-teal-400 bg-teal-50 text-teal-700"
                        : "border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {cat === "all" ? "All" : cat === "hidden_gems" ? "Hidden Gems" : cat}
                  </button>
                ))}
              </div>
            )}

            {/* Detail view — shown when a card's "Details" is clicked */}
            {detailAct ? (
              <div className="flex-1 overflow-y-auto">
                {/* Detail header */}
                <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailAct(null)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-600 transition-colors"
                  >
                    ← Back to results
                  </button>
                </div>

                {/* Photo carousel */}
                {(() => {
                  const photos = detailData?.photos ?? (detailAct.meta.photoRef ? [{ name: detailAct.meta.photoRef }] : []);
                  if (photos.length === 0) return null;
                  return (
                    <div className="h-52 relative overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        key={photos[detailPhoto]?.name}
                        src={activityPhotoUrl(photos[detailPhoto]?.name ?? "", 800)}
                        className="w-full h-full object-cover"
                        alt={detailAct.meta.title}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      {photos[detailPhoto]?.authorAttributions?.length ? (
                        <p className="absolute bottom-2 left-3 rounded bg-black/60 px-2 py-1 text-[9px] text-white">
                          Photo: {photos[detailPhoto].authorAttributions!.map((author) => author.displayName).filter(Boolean).join(", ")}
                        </p>
                      ) : null}
                      {photos.length > 1 && (
                        <>
                          <button type="button" onClick={() => setDetailPhoto((n) => Math.max(0, n - 1))} disabled={detailPhoto === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-all disabled:opacity-20">
                            ‹
                          </button>
                          <button type="button" onClick={() => setDetailPhoto((n) => Math.min(photos.length - 1, n + 1))} disabled={detailPhoto === photos.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-all disabled:opacity-20">
                            ›
                          </button>
                          <div className="absolute bottom-2 right-3 bg-black/55 rounded-full px-2 py-0.5 text-[10px] text-white">
                            {detailPhoto + 1} / {photos.length}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Detail body */}
                <div className="p-5">
                  {/* Title + meta */}
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{detailAct.meta.title}</h3>
                  <div className="flex items-center flex-wrap gap-2 mb-3">
                    {(detailData?.address ?? detailAct.meta.neighborhood) && (
                      <span className="text-xs text-gray-500">{detailData?.address ?? detailAct.meta.neighborhood}</span>
                    )}
                    {(detailData?.rating ?? (detailAct.meta.rating > 0 ? detailAct.meta.rating : null)) != null && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-amber-600">
                          ★ {(detailData?.rating ?? detailAct.meta.rating).toFixed(1)}
                          {detailData?.userRatingCount && (
                            <span className="text-gray-400 ml-1">({detailData.userRatingCount.toLocaleString()})</span>
                          )}
                        </span>
                      </>
                    )}
                    {detailAct.meta.duration && (
                      <span className="text-xs text-gray-400">{detailAct.meta.duration}</span>
                    )}
                    {detailAct.meta.category && detailAct.meta.category in GAP_CAT_STYLE && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${GAP_CAT_STYLE[detailAct.meta.category]}`}>
                        {detailAct.meta.category === "hidden_gems" ? "Hidden Gem" : detailAct.meta.category}
                      </span>
                    )}
                  </div>

                  {detailLoading && (
                    <p className="text-[11px] text-gray-400 mb-3">Loading details…</p>
                  )}

                  {/* Editorial summary */}
                  {detailData?.editorialSummary && (
                    <p className="text-sm text-gray-700 leading-relaxed mb-4">{detailData.editorialSummary}</p>
                  )}

                  {/* Hours */}
                  {detailData?.weekdayDescriptions && detailData.weekdayDescriptions.length > 0 && (
                    <details className="mb-3">
                      <summary className="text-[11px] text-gray-500 cursor-pointer select-none">
                        {detailData.openNow === false ? "🔴 Closed now" : detailData.openNow ? "🟢 Open now" : "⏰ Opening hours"}
                      </summary>
                      <ul className="mt-1 space-y-0.5 pl-4">
                        {detailData.weekdayDescriptions.map((line, i) => (
                          <li key={i} className="text-[10px] text-gray-500">{line}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* Contact & links */}
                  {(detailData?.phone || detailData?.website || detailData?.googleMapsUri) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
                      {detailData.phone && (
                        <a href={`tel:${detailData.phone}`} className="text-[11px] text-gray-500 hover:text-gray-700 transition-colors">
                          📞 {detailData.phone}
                        </a>
                      )}
                      {detailData.website && (
                        <a href={detailData.website} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-blue-600 hover:text-blue-800 truncate max-w-[240px] transition-colors">
                          🌐 {detailData.website.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      )}
                      {detailData.googleMapsUri && (
                        <a href={detailData.googleMapsUri} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-blue-600 hover:text-blue-800 transition-colors">
                          🗺 Google Maps
                        </a>
                      )}
                    </div>
                  )}

                  {/* Reviews */}
                  {detailData?.reviews && detailData.reviews.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Reviews</p>
                      <div className="space-y-2">
                        {detailData.reviews.map((r, i) => (
                          <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                            <div className="flex items-center gap-2 mb-1">
                              {r.authorPhotoUri && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.authorPhotoUri} alt={r.authorName ?? ""} className="w-5 h-5 rounded-full object-cover" />
                              )}
                              <span className="text-[11px] font-medium text-gray-600">{r.authorName ?? "Anonymous"}</span>
                              {r.rating != null && (
                                <span className="text-[10px] text-amber-500 ml-auto">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                              )}
                            </div>
                            {r.text && <p className="text-[11px] text-gray-600 leading-relaxed line-clamp-3">{r.text}</p>}
                            {r.timeAgo && <p className="text-[10px] text-gray-400 mt-1">{r.timeAgo}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add button */}
                  <button
                    type="button"
                    onClick={() => { onInsert(detailAct.id, detailAct.meta); setOpen(false); setDetailAct(null); }}
                    className="w-full rounded-xl bg-teal-500 text-white text-sm font-semibold py-3 hover:bg-teal-600 transition-colors"
                  >
                    Add to itinerary
                  </button>
                </div>
              </div>
            ) : (
            /* Grid */
            <div className="flex-1 overflow-y-auto p-5">
              {apiLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-teal-400 animate-spin mb-4" />
                  <p className="text-sm text-gray-400">Finding activities that fit…</p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-gray-400 mb-3">
                    {apiFetched
                      ? "No activities fit this time slot — they may all be too long for the available gap."
                      : "Open the Activities page to load activities for this destination first."}
                  </p>
                  <Link
                    href="/activities"
                    onClick={() => setOpen(false)}
                    className="text-sm font-semibold text-teal-600 hover:text-teal-700"
                  >
                    Browse activities →
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {candidates.map((activity) => {
                    const id = activity.placeId ?? activity.id;
                    const meta: SavedMeta = {
                      title:        activity.title,
                      category:     activity.category,
                      neighborhood: activity.neighborhood,
                      duration:     activity.duration,
                      rating:       activity.rating,
                      lat:          activity.lat,
                      lng:          activity.lng,
                    };
                    return (
                      <GapActivityCard
                        key={id}
                        id={id}
                        meta={meta}
                        onInsert={(id, meta) => { onInsert(id, meta); setOpen(false); }}
                        onViewDetail={(id, meta) => setDetailAct({ id, meta })}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Footer — hidden in detail view */}
            {!detailAct && (
              <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
                <p className="text-[11px] text-gray-400">Showing activities that fit the {fmtMins(freeMinutes)} gap</p>
                <Link
                  href="/activities"
                  onClick={() => setOpen(false)}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
                >
                  Browse all activities →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const WARNING_COLORS: Record<DayWarning["type"], string> = {
  packed:          "bg-amber-50  text-amber-700  border-amber-200",
  food_heavy:      "bg-orange-50 text-orange-700 border-orange-200",
  transit_heavy:   "bg-blue-50   text-blue-700   border-blue-200",
  late_night:      "bg-purple-50 text-purple-700 border-purple-200",
  flight_recovery: "bg-red-50    text-red-700    border-red-200",
  ai_note:         "bg-teal-50   text-teal-700   border-teal-200",
};

function DayView({
  day, savedMeta, compact, city, onSlotClick, onDeleteSlot, onEditTime,
  onRename, renamingSlot, onRenameChange, onRenameCommit,
  onDragStart, onDragEnd, draggingSlot, onMoveUp, onMoveDown,
  onEditNotes, onEditDuration, onQuickAdd, onInsertAfterGap,
  onRelaxDay, relaxing,
}: {
  day:               PlannedDay;
  savedMeta:         Record<string, SavedMeta>;
  compact:           boolean;
  city?:             string;
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
  onEditNotes?:        (slot: PlannedSlot, note: string) => void;
  onEditDuration?:     (slot: PlannedSlot, minutes: number) => void;
  onQuickAdd?:         () => void;
  onInsertAfterGap?:   (afterSlot: PlannedSlot, id: string, meta: SavedMeta) => void;
  onRelaxDay?:         () => void;
  relaxing?:           boolean;
}) {
  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500 text-[11px] font-bold text-white flex-shrink-0 shadow-sm">
            {day.dayIndex + 1}
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-700">
            {longDate(day.date)}
          </p>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{day.theme || `Day ${day.dayIndex + 1}`}</h2>
        {day.cityLabel && (
          <p className="text-sm text-gray-700 mt-0.5">{day.cityLabel}</p>
        )}
        <div className="flex gap-4 mt-2">
          <span className="text-xs text-gray-700">
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
          <p className="text-[11px] text-gray-700 italic mt-2 mb-1 leading-relaxed">{day.daySummary}</p>
        )}
        {onRelaxDay && (
          <button
            onClick={onRelaxDay}
            disabled={relaxing}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100 disabled:cursor-wait disabled:opacity-60"
          >
            {relaxing ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-teal-600 border-t-transparent" />
                Making day lighter…
              </>
            ) : (
              "Make this day more relaxed"
            )}
          </button>
        )}
      </div>
      <div>
        {day.slots.map((slot, i) => {
          const next = day.slots[i + 1];
          // Net free time = raw gap minus transit time to next slot
          const rawGap       = next ? next.startMinutes - slot.endMinutes : 0;
          const transitMins  = next?.transit?.durationMinutes ?? 0;
          const freeMinutes  = rawGap - transitMins;
          // Show gap card only between substantive slots (skip free_time connectors)
          const showGap = !compact
            && slot.kind !== "free_time"
            && next != null
            && next.kind !== "free_time"
            && freeMinutes >= 90;

          return (
            <span key={i}>
              <TimelineSlot
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
              {showGap && onInsertAfterGap && (
                <GapSuggestion
                  freeMinutes={freeMinutes}
                  afterSlot={slot}
                  daySlots={day.slots}
                  city={city ?? ""}
                  onInsert={(id, meta) => onInsertAfterGap(slot, id, meta)}
                />
              )}
            </span>
          );
        })}
        {onQuickAdd && (
          <button
            type="button"
            onClick={onQuickAdd}
            className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:text-teal-600 hover:border-teal-200 text-xs transition-colors"
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
    <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-100 transition-colors";

function FieldLabel({ label, note }: { label: string; note?: string }) {
  return (
    <label className="text-xs text-gray-700 block mb-1.5">
      {label}
      {note && <span className="ml-1 text-gray-700">{note}</span>}
    </label>
  );
}

function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-teal-600 transition-colors">
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
                ? "border-teal-400 bg-teal-50 text-teal-600"
                : "border-gray-200 bg-gray-50 text-gray-700 hover:text-gray-600"
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
        className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-100 transition-colors"
      />
      <input
        type="number"
        min={1}
        max={21}
        value={stop.days}
        onChange={(e) => onUpdate({ days: Math.max(1, parseInt(e.target.value) || 1) })}
        className="w-14 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm text-gray-900 text-center focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-100 transition-colors"
      />
      <span className="text-[11px] text-gray-700 shrink-0">d</span>
      {canRemove ? (
        <button type="button" onClick={onRemove} className="shrink-0 w-5 text-gray-700 hover:text-red-400 transition-colors text-lg leading-none">
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
          ? "border-gray-100 bg-transparent opacity-40 hover:opacity-60"
          : "border-gray-200 bg-gray-50 hover:border-gray-200"
      }`}
    >
      <div className={`shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center transition-colors ${
        excluded ? "border-gray-300 bg-transparent" : "border-teal-400 bg-teal-50"
      }`}>
        {!excluded && (
          <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2 text-teal-600" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l3 3 5-6" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate">{meta?.title ?? id}</p>
        {meta && (
          <p className="text-[10px] text-gray-700 mt-0.5 truncate">
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 space-y-2">
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
          <span className="text-xs font-semibold text-gray-900 truncate">{flight.airline}</span>
          {flight.flightNumber && (
            <span className="text-[10px] text-gray-700 shrink-0">{flight.flightNumber}</span>
          )}
        </div>
        <span className="text-xs font-bold text-gray-600 shrink-0">
          ${Math.round(flight.price).toLocaleString()}
        </span>
      </div>

      {/* Outbound */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
        <div className="text-center shrink-0">
          <div className="text-sm font-bold text-gray-900">{fmt24(flight.departTime)}</div>
          <div className="text-[10px] font-mono text-gray-700">{flight.origin}</div>
        </div>
        <div className="flex-1 text-center px-1">
          <div className="text-[10px] text-gray-700">{flight.duration}</div>
          <div className="w-full h-px bg-gray-100 my-1" />
          <div className="text-[10px] text-gray-700">{flight.stopLabel}</div>
        </div>
        <div className="text-center shrink-0">
          <div className="text-sm font-bold text-gray-900">{fmt24(flight.arriveTime)}</div>
          <div className="text-[10px] font-mono text-gray-700">{flight.destination}</div>
        </div>
      </div>

      {/* Return if present */}
      {flight.returnDepartTime && (
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.015] border border-gray-100 px-3 py-2">
          <div className="text-center shrink-0">
            <div className="text-sm font-bold text-gray-700">{fmt24(flight.returnDepartTime)}</div>
            <div className="text-[10px] font-mono text-gray-700">{flight.returnOrigin}</div>
          </div>
          <div className="flex-1 text-center px-1">
            <div className="text-[10px] text-gray-700">{flight.returnDuration}</div>
            <div className="w-full h-px bg-gray-100 my-1" />
            <div className="text-[10px] text-gray-700">{flight.returnStopLabel}</div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-sm font-bold text-gray-700">{fmt24(flight.returnArriveTime ?? "")}</div>
            <div className="text-[10px] font-mono text-gray-700">{flight.returnDestination}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <CtaLink href="/flights" label="Change flight" />
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-gray-700 hover:text-red-400 transition-colors"
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
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
          <p className="text-sm font-semibold text-gray-900 leading-snug">{hotel.name}</p>
          <p className="text-[11px] text-gray-700 mt-0.5">
            {hotel.neighborhood}
            {hotel.pricePerNight > 0 && ` · $${Math.round(hotel.pricePerNight)}/night`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hotel.rating > 0 && (
            <span className="text-[11px] text-gray-700">
              ★ {hotel.rating.toFixed(1)}
            </span>
          )}
          {hotel.aiScore > 0 && (
            <span className="text-[11px] text-teal-500">
              TG score {hotel.aiScore}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <CtaLink href="/hotels" label="Change hotel" />
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-gray-700 hover:text-red-400 transition-colors"
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
  const [selectedHotels, setSelectedHotels] = useState<Record<string, SelectedHotel>>({});
  const [selectedFlight,       setSelectedFlight]       = useState<SelectedFlight | null>(null);
  const [selectedReturnFlight, setSelectedReturnFlight] = useState<SelectedFlight | null>(null);

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
  const [dragOverDay,       setDragOverDay]       = useState<number | null>(null);
  const [relaxingDayIndex, setRelaxingDayIndex] = useState<number | null>(null);

  // Tab navigation
  type ActiveTab = "itinerary" | "preferences" | "travel" | "recommendations" | "saved" | "dropped";
  const [activeTab, setActiveTab] = useState<ActiveTab>("preferences");

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
  const [flightAddedBanner,       setFlightAddedBanner]       = useState(false);
  const [returnFlightAddedBanner, setReturnFlightAddedBanner] = useState(false);
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
  type ObStep = "destination" | "travelers" | "dates" | "style" | "recommendations" | "cities" | "done";
  const [obStep,           setObStep]           = useState<ObStep>("done");
  const [obDest,           setObDest]           = useState("");
  const [obDestValidated,  setObDestValidated]  = useState(false);
  const [obDestError,      setObDestError]      = useState<string | null>(null);
  const [obExtraDests, setObExtraDests] = useState<{ value: string; validated: boolean; error: string | null }[]>([]);
  const [obStart,          setObStart]          = useState("");
  const [obReturn,         setObReturn]         = useState("");
  const [obDuration,       setObDuration]       = useState(7);
  const [obTravelers,      setObTravelers]      = useState(1);
  const [obFirstTime,      setObFirstTime]      = useState<boolean | null>(null);
  const [obStyles,         setObStyles]         = useState<TravelStyle[]>([]);
  const [obCities,         setObCities]         = useState<{ city: string; days: number; why: string }[]>([]);
  const [obSummary,        setObSummary]        = useState("");
  const [obLoading,        setObLoading]        = useState(false);
  const [obError,          setObError]          = useState<string | null>(null);

  // Tracks destinationRegion for display in the summary banner
  const obDestRef        = useRef("");
  const autoRegenDoneRef = useRef(false);

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
          // Read cross-page selections from the shared v3 store (Flights/Hotels pages write here)
          const shared = readTripStore();
          if (shared?.selectedFlight) setSelectedFlight(shared.selectedFlight);
          else { const fs = localStorage.getItem(FLIGHT_KEY); if (fs) setSelectedFlight(JSON.parse(fs) as SelectedFlight); }
          if (shared?.selectedReturnFlight) setSelectedReturnFlight(shared.selectedReturnFlight);
          const firstCity  = stored.trip.cities[0]?.city ?? "";
          const hotelsMap = (shared?.selectedHotels ?? {}) as Record<string, SelectedHotel>;
          if (Object.keys(hotelsMap).length > 0) {
            setSelectedHotels(hotelsMap);
          } else {
            const hs = localStorage.getItem(HOTEL_KEY);
            if (hs && firstCity) setSelectedHotels({ [firstCity]: JSON.parse(hs) as SelectedHotel });
          }
          if (shared?.travelStyles?.length) setObStyles(shared.travelStyles);
          if (shared?.firstTime !== null && shared?.firstTime !== undefined) setObFirstTime(shared.firstTime);
          if (shared?.travelers && shared.travelers > 1) setObTravelers(shared.travelers);
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
        if (v2.selectedReturnFlight) setSelectedReturnFlight(v2.selectedReturnFlight);
        const firstCity    = v2.cityStops[0]?.city ?? "";
        const hotelsMap2   = (v2.selectedHotels ?? {}) as Record<string, SelectedHotel>;
        if (Object.keys(hotelsMap2).length > 0) {
          setSelectedHotels(hotelsMap2);
        } else {
          const hs = localStorage.getItem(HOTEL_KEY);
          if (hs && firstCity) setSelectedHotels({ [firstCity]: JSON.parse(hs) as SelectedHotel });
        }
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
      if (flightStored) setSelectedFlight(JSON.parse(flightStored) as SelectedFlight);
      // hotel stored without city key — will be re-keyed below once we know the city
      const v3 = readTripStore();
      if (v3?.selectedReturnFlight) setSelectedReturnFlight(v3.selectedReturnFlight);

      const tripStored = localStorage.getItem(TRIP_KEY);
      if (tripStored) {
        const parsed = JSON.parse(tripStored) as TripStorage;
        if (parsed.version === 1 && parsed.cities[0]?.city) {
          setTrip(parsed);
          if (hotelStored) setSelectedHotels({ [parsed.cities[0].city]: JSON.parse(hotelStored) as SelectedHotel });
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
          selectedHotels:       selectedHotels,
        });
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [trip, savedIds, savedMeta, hydrated, obStep, obStyles, obFirstTime, selectedFlight, selectedHotels]);

  // ── Sync saved activities to canonical trip store ──
  useEffect(() => {
    if (!hydrated) return;
    updateTripStore({ savedActivities: savedIds });
  }, [savedIds, hydrated]);

  // ── Show "flight added" banner when arriving from flight selection ──
  useEffect(() => {
    if (!hydrated || autoRegenDoneRef.current) return;
    autoRegenDoneRef.current = true;
    // Returning users who already have an itinerary go straight to it
    if (trip.itinerary) setActiveTab("itinerary");
    try {
      if (sessionStorage.getItem("tg_flight_added") === "1") {
        sessionStorage.removeItem("tg_flight_added");
        setFlightAddedBanner(true);
        setActiveTab("itinerary");
      }
      if (sessionStorage.getItem("tg_return_flight_added") === "1") {
        sessionStorage.removeItem("tg_return_flight_added");
        setReturnFlightAddedBanner(true);
        setActiveTab("itinerary");
      }
    } catch { /* ignore */ }
  }, [hydrated]);

  useEffect(() => { setNoteEdit(null); setDurationEdit(null); setDetailActivePhoto(0); }, [detailSlot]);

  // ── Lazy-load place details when modal opens ──
  useEffect(() => {
    if (!detailSlot?.sourceId || detailSlot.sourceId.startsWith("preview-")) {
      setModalPlaceDetail(null);
      return;
    }
    setModalDetailLoading(true);
    void fetchGooglePlaceDetail(detailSlot.sourceId, "modal_standard")
      .then((data) => setModalPlaceDetail(data ? toPlannerPlaceDetail(data) : null))
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

  function clearHotel(cityKey: string) {
    setSelectedHotels((prev) => {
      const next = { ...prev };
      delete next[cityKey];
      return next;
    });
    try {
      const existing = readTripStore()?.selectedHotels ?? {};
      const updated  = { ...existing };
      delete (updated as Record<string, unknown>)[cityKey];
      updateTripStore({ selectedHotels: updated });
      if (Object.keys(updated).length === 0) localStorage.removeItem(HOTEL_KEY);
    } catch { /* ignore */ }
  }

  function clearFlight() {
    setSelectedFlight(null);
    try {
      localStorage.removeItem(FLIGHT_KEY);
      updateTripStore({ selectedFlight: null });
    } catch { /* ignore */ }
  }

  function clearReturnFlight() {
    setSelectedReturnFlight(null);
    try {
      updateTripStore({ selectedReturnFlight: null });
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
    setSelectedHotels({});
    setSelectedFlight(null);
    // Clear saved activities — each trip has its own set
    setSavedIds([]);
    setSavedMeta({});
    try {
      localStorage.removeItem("travelgrab:saved-activities");
      localStorage.removeItem("travelgrab:saved-activities-data");
    } catch { /* ignore */ }
    setObDest("");
    setObDestValidated(false);
    setObDestError(null);
    setObExtraDests([]);
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
    setObExtraDests([]);
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
    const allDestsStr = [obDest.trim(), ...obExtraDests.map((d) => d.value.trim())]
      .filter(Boolean)
      .join(", ");
    try {
      const res = await fetch("/api/itinerary/suggest-cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region:       allDestsStr,
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
    const allDestsLabel = [obDest.trim(), ...obExtraDests.map((d) => d.value.trim())].filter(Boolean).join(", ");
    obDestRef.current = allDestsLabel;
    // Write immediately to canonical store so other pages see it right away
    writeTripStore({
      ...TRIP_STORE_DEFAULT,
      destinationRegion: allDestsLabel,
      cityStops:         cities,
      startDate,
      returnDate,
      tripLength,
      travelers:         obTravelers,
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

  // ── Apply flight times to existing itinerary (non-destructive) ──
  // Only patches the arrival day (outbound) or departure day (return).
  // Activities bumped off those days are moved to excludedActivityIds so they
  // appear in the Dropped tab and can be restored by the user.
  // Falls back to a full generate() when no itinerary exists yet.
  function applyFlightToItinerary(which: "outbound" | "return") {
    const current = trip.itinerary;
    if (!current || current.days.length === 0) {
      void generate();
      return;
    }

    function fmtMin(minutes: number): string {
      const h = Math.floor(minutes / 60).toString().padStart(2, "0");
      const m = (minutes % 60).toString().padStart(2, "0");
      return `${h}:${m}`;
    }

    const days = current.days.map((d) => ({ ...d, slots: [...d.slots] }));
    const newlyExcluded: string[] = [];
    const newlyDropped: import("@/lib/itinerary/types").DroppedActivity[] = [];

    function displace(day: typeof days[number]) {
      for (const slot of day.slots) {
        if (slot.kind === "activity" && slot.sourceId && !trip.excludedActivityIds.includes(slot.sourceId)) {
          newlyExcluded.push(slot.sourceId);
          newlyDropped.push({
            sourceId: slot.sourceId,
            title:    slot.title,
            reason:   which === "outbound"
              ? "Arrival day — tap to restore once you know your schedule"
              : "Departure day — tap to restore once you know your schedule",
          });
        }
      }
    }

    if (which === "outbound" && selectedFlight?.arriveTime) {
      const [h, m]         = selectedFlight.arriveTime.split(":").map(Number);
      const arrMins        = h * 60 + m;
      const transferEndMins = Math.min(arrMins + 90, 23 * 60);
      const day0            = days[0];
      if (day0) {
        displace(day0);
        days[0] = {
          ...day0,
          slots: [{
            kind:            "airport_transfer",
            startMinutes:    arrMins,
            endMinutes:      transferEndMins,
            durationMinutes: transferEndMins - arrMins,
            title:           `Arrive ${selectedFlight.destination} — airport transfer`,
            explanation:     `Flight lands at ${selectedFlight.arriveTime}. Allow ~90 min for baggage, customs, and transfer to your hotel.`,
          }],
          scheduledActivityCount: 0,
          totalActivityMinutes:   0,
          theme:       "Arrival day",
          daySummary:  `Your flight arrives at ${selectedFlight.arriveTime}. Check in, rest, and explore the neighbourhood.`,
          warnings:    [],
        };
      }
    }

    if (which === "return") {
      const departTime = selectedReturnFlight?.departTime ?? selectedFlight?.returnDepartTime;
      if (departTime) {
        const [h, m]       = departTime.split(":").map(Number);
        const deptMins     = h * 60 + m;
        const airportByMin = Math.max(0, deptMins - 180);
        const lastDay      = days[days.length - 1];
        if (lastDay) {
          displace(lastDay);
          days[days.length - 1] = {
            ...lastDay,
            slots: [{
              kind:            "airport_transfer",
              startMinutes:    airportByMin,
              endMinutes:      deptMins,
              durationMinutes: deptMins - airportByMin,
              title:           `Depart — transfer to airport`,
              explanation:     `Flight departs at ${departTime}. Leave for the airport by ${fmtMin(airportByMin)} to allow time for check-in and security.`,
            }],
            scheduledActivityCount: 0,
            totalActivityMinutes:   0,
            theme:      "Departure day",
            daySummary: `Your return flight departs at ${departTime}. Pack up and head to the airport by ${fmtMin(airportByMin)}.`,
            warnings:   [],
          };
        }
      }
    }

    const updatedExcluded = [...new Set([...trip.excludedActivityIds, ...newlyExcluded])];
    const existingDropped = current.meta.droppedActivities.filter(
      (d) => !newlyExcluded.includes(d.sourceId)
    );

    const updated: PlannerOutput = {
      ...current,
      days,
      meta: {
        ...current.meta,
        droppedActivities: [...existingDropped, ...newlyDropped],
        totalActivitiesDropped: existingDropped.length + newlyDropped.length,
      },
    };

    updateTrip({ itinerary: updated, excludedActivityIds: updatedExcluded });
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

      const res = await fetchWithAuth("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string | boolean>;
        throw new Error(String(err.error ?? `HTTP ${res.status}`));
      }

      // Read NDJSON stream — server sends heartbeat pings while Claude generates,
      // then a final {"type":"done","data":{...}} line with the itinerary.
      if (!res.body) throw new Error("No response body from itinerary API");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf    = "";
      let result: PlannerOutput | null = null;

      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const msg = JSON.parse(trimmed) as { type: string; data?: PlannerOutput; error?: string };
          if (msg.type === "done" && msg.data) { result = msg.data; break readLoop; }
          if (msg.type === "error") throw new Error(msg.error ?? "Unknown error");
          // "ping" → ignore
        }
      }

      if (!result) throw new Error("No itinerary received from server");
      const raw  = result as PlannerOutput & { _debugCityAssignment?: unknown };
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

  async function relaxDay(dayIndex: number) {
    if (!trip.itinerary) return;
    const day = trip.itinerary.days[dayIndex];
    if (!day) return;
    setRelaxingDayIndex(dayIndex);
    try {
      const res = await fetchWithAuth("/api/itinerary/relax-day", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ day, wakeTime: trip.wakeTime }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>;
        throw new Error(String(err.error ?? `HTTP ${res.status}`));
      }
      if (!res.body) throw new Error("No response body");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let relaxedDay: PlannedDay | null = null;

      relaxLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const msg = JSON.parse(trimmed) as { type: string; data?: PlannedDay; error?: string };
          if (msg.type === "done" && msg.data) { relaxedDay = msg.data; break relaxLoop; }
          if (msg.type === "error") throw new Error(msg.error ?? "Unknown error");
        }
      }

      if (!relaxedDay) throw new Error("No response from server");

      updateTrip({
        itinerary: {
          ...trip.itinerary,
          days: trip.itinerary.days.map((d) =>
            d.dayIndex === dayIndex ? { ...relaxedDay!, dayIndex } : d
          ),
        },
      });
    } catch (e) {
      console.error("[relax-day]", e);
    } finally {
      setRelaxingDayIndex(null);
    }
  }

  const isGenerating = genStatus === "generating";
  const hasItinerary = !!trip.itinerary;

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/travelgrab-logo.svg" alt="TravelGrab" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-sm font-bold tracking-tight text-gray-800">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-gray-100" />
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
            {(["destination", "travelers", "dates", "style", "recommendations", "cities"] as const).map((s, i) => {
              const steps = ["destination", "travelers", "dates", "style", "recommendations", "cities"] as const;
              const stepIdx = steps.indexOf(obStep as typeof steps[number]);
              const isActive = s === obStep;
              const isDone = i < stepIdx;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full transition-colors ${
                    isActive ? "bg-lantern-mint" : isDone ? "bg-lantern-mint/40" : "bg-gray-200"
                  }`} />
                  {i < 5 && <div className="h-px w-6 bg-gray-100" />}
                </div>
              );
            })}
          </div>

          {/* Step: destination */}
          {obStep === "destination" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Where are you going?</h1>
                <p className="text-sm text-gray-700">Enter a country, region, or city. Add multiple for a multi-country trip — order matters.</p>
              </div>
              <div className="space-y-3">
                {/* First destination */}
                <div className="flex items-start gap-3">
                  {obExtraDests.length > 0 && (
                    <span className="mt-3.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">1</span>
                  )}
                  <div className="flex-1">
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
                  </div>
                </div>
                {obExtraDests.map((extra, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="mt-3.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">{i + 2}</span>
                    <div className="flex-1">
                      <ItineraryDestinationInput
                        value={extra.value}
                        validated={extra.validated}
                        error={extra.error}
                        onChange={(v) => {
                          setObExtraDests((prev) => prev.map((d, j) => j === i ? { ...d, value: v, validated: false, error: v ? d.error : null } : d));
                        }}
                        onValidate={(normalized) => {
                          setObExtraDests((prev) => prev.map((d, j) => j === i ? { value: normalized, validated: true, error: null } : d));
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setObExtraDests((prev) => prev.filter((_, j) => j !== i))}
                      className="mt-3 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-50 transition-colors text-base leading-none"
                      aria-label="Remove destination"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setObExtraDests((prev) => [...prev, { value: "", validated: false, error: null }])}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors pl-8"
                >
                  <span className="text-sm leading-none">+</span> Add another country / region
                </button>
              </div>
              <button
                type="button"
                disabled={!obDest.trim()}
                onClick={() => {
                  let hasError = false;
                  if (!obDestValidated) {
                    setObDestError("Choose a destination from the suggestions.");
                    hasError = true;
                  }
                  const updatedExtras = obExtraDests.map((d) => {
                    if (d.value.trim() && !d.validated) return { ...d, error: "Choose a destination from the suggestions." };
                    return d;
                  });
                  if (updatedExtras.some((d) => d.error)) {
                    setObExtraDests(updatedExtras);
                    hasError = true;
                  }
                  if (hasError) return;
                  setObDestError(null);
                  setObStep("travelers");
                }}
                className="w-full h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}

          {/* Step: travelers */}
          {obStep === "travelers" && (
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Who&apos;s traveling?</h1>
                <p className="text-sm text-gray-700">We&apos;ll use this to size flight and hotel searches.</p>
              </div>
              <div className="flex items-center justify-center gap-6 py-6">
                <button
                  type="button"
                  onClick={() => setObTravelers(Math.max(1, obTravelers - 1))}
                  className="w-14 h-14 rounded-full border border-gray-200 text-2xl font-bold text-gray-700 hover:border-gray-400 transition-colors flex items-center justify-center"
                >−</button>
                <div className="text-center">
                  <span className="text-6xl font-black text-gray-900">{obTravelers}</span>
                  <p className="text-sm text-gray-500 mt-1">{obTravelers === 1 ? "traveler" : "travelers"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setObTravelers(Math.min(9, obTravelers + 1))}
                  className="w-14 h-14 rounded-full border border-gray-200 text-2xl font-bold text-gray-700 hover:border-gray-400 transition-colors flex items-center justify-center"
                >+</button>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setObStep("destination")} className="flex-1 h-12 rounded-full border border-gray-200 text-sm text-gray-700 hover:text-gray-700 transition-colors">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setObStep("dates")}
                  className="flex-[2] h-12 rounded-full bg-lantern-mint text-ink text-sm font-bold transition hover:opacity-90"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step: dates */}
          {obStep === "dates" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">When are you going?</h1>
                <p className="text-sm text-gray-700">Set a start date and trip length, or pick a return date.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-700 block mb-1.5">Start date</label>
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
                    className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-100 transition-colors [color-scheme:light]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-700 block mb-1.5">
                    Trip length — <span className="text-gray-600 font-semibold">{obDuration} {obDuration === 1 ? "day" : "days"}</span>
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
                  <label className="text-xs text-gray-700 block mb-1.5">Return date <span className="text-gray-700">(optional)</span></label>
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
                    className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-100 transition-colors [color-scheme:light]"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setObStep("travelers")} className="flex-1 h-12 rounded-full border border-gray-200 text-sm text-gray-700 hover:text-gray-700 transition-colors">
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
                <h1 className="text-3xl font-bold text-gray-900 mb-2">How do you travel?</h1>
                <p className="text-sm text-gray-700">Select all that apply — we&apos;ll use this to recommend the right cities.</p>
              </div>
              <div>
                <p className="text-xs text-gray-700 mb-3">First time visiting {[obDest, ...obExtraDests.map((d) => d.value)].filter(Boolean).join(" + ")}?</p>
                <div className="grid grid-cols-2 gap-2">
                  {([true, false] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setObFirstTime(obFirstTime === v ? null : v)}
                      className={`rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                        obFirstTime === v
                          ? "border-teal-400 bg-teal-50 text-teal-600"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:text-gray-700"
                      }`}
                    >
                      {v ? "Yes, first time" : "Been before"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-700 mb-3">Travel style <span className="text-gray-700">(pick all that apply)</span></p>
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
                            ? "border-teal-400 bg-teal-50 text-teal-600"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:text-gray-700"
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
                  className="flex-1 h-12 rounded-full border border-gray-200 text-sm text-gray-700 hover:text-gray-700 transition-colors"
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
                  <div className="h-10 w-10 rounded-full border-2 border-gray-200 border-t-lantern-mint animate-spin mb-6" />
                  <p className="text-base font-semibold text-gray-900">Finding your best route…</p>
                  <p className="text-sm text-gray-700 mt-2">Planning {obDuration} days in {[obDest, ...obExtraDests.map((d) => d.value)].filter(Boolean).join(" + ")}</p>
                </div>
              )}
              {!obLoading && obError && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Something went wrong</h1>
                    <p className="text-sm text-red-400">{obError}</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setObStep("style"); setObError(null); }}
                      className="flex-1 h-12 rounded-full border border-gray-200 text-sm text-gray-700 hover:text-gray-700 transition-colors"
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
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Your AI route</h1>
                    {obSummary && <p className="text-sm text-gray-700 leading-relaxed">{obSummary}</p>}
                  </div>
                  <div className="space-y-3">
                    {obCities.map((stop, i) => (
                      <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-gray-900">{stop.city}</p>
                          <span className="text-xs font-semibold text-teal-600">{stop.days}d</span>
                        </div>
                        {stop.why && <p className="text-[11px] text-gray-700 leading-relaxed">{stop.why}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-700 px-1">
                    <span>{obCities.reduce((s, c) => s + c.days, 0)} days total · {obTravelers} {obTravelers === 1 ? "traveler" : "travelers"}</span>
                    <span>{[obDest, ...obExtraDests.map((d) => d.value)].filter(Boolean).join(" + ")}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 text-center px-2">
                    You can edit cities, dates, and preferences at any time from the Preferences tab.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setObStep("style"); setObError(null); }}
                      className="flex-1 h-12 rounded-full border border-gray-200 text-sm text-gray-700 hover:text-gray-700 transition-colors"
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
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Customize your route</h1>
                <p className="text-sm text-gray-700">Edit cities, adjust days, or add stops.</p>
              </div>
              <div className="space-y-3">
                {obCities.map((stop, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={stop.city}
                        onChange={(e) => {
                          const updated = [...obCities];
                          updated[i] = { ...stop, city: e.target.value };
                          setObCities(updated);
                        }}
                        className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-700 focus:border-teal-400 focus:outline-none"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => { const u=[...obCities]; u[i]={...stop,days:Math.max(1,stop.days-1)}; setObCities(u); }} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-700 hover:text-gray-900 flex items-center justify-center text-lg leading-none">−</button>
                        <span className="text-sm font-semibold text-gray-900 w-12 text-center">{stop.days}d</span>
                        <button type="button" onClick={() => { const u=[...obCities]; u[i]={...stop,days:stop.days+1}; setObCities(u); }} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-700 hover:text-gray-900 flex items-center justify-center text-lg leading-none">+</button>
                        {obCities.length > 1 && (
                          <button type="button" onClick={() => setObCities(obCities.filter((_,j)=>j!==i))} className="w-7 h-7 text-gray-700 hover:text-red-400 flex items-center justify-center text-lg leading-none">×</button>
                        )}
                      </div>
                    </div>
                    {stop.why && <p className="text-[11px] text-gray-700 pl-1">{stop.why}</p>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-xs text-gray-700">
                <span>{obCities.reduce((s,c)=>s+c.days,0)} days total</span>
                <button
                  type="button"
                  onClick={() => setObCities([...obCities, { city: "", days: 2, why: "" }])}
                  className="text-teal-500 hover:text-teal-600 transition-colors"
                >
                  + Add city
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setObStep("recommendations")}
                  className="flex-1 h-12 rounded-full border border-gray-200 text-sm text-gray-700 hover:text-gray-700 transition-colors"
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

        <UsageBanner feature="itinerary" />

        {/* ── Tab bar ── */}
        <div className="flex gap-0 border-b border-gray-200 mb-5 overflow-x-auto">
          {([
            { key: "preferences",     label: "Preferences" },
            { key: "itinerary",       label: "Itinerary" },
            { key: "travel",          label: "Flights & Hotels" },
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
                  ? "border-teal-400 text-gray-900"
                  : "border-transparent text-gray-700 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Always-visible: trip + flight strip ── */}
        {(obDestRef.current || primaryCity) && (
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 mb-5 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {obDestRef.current || trip.cities.map((c) => c.city).filter(Boolean).join(" → ")}
                </p>
                <p className="text-[11px] text-gray-700 mt-0.5">
                  {[
                    trip.startDate ? `${shortDate(trip.startDate)} – ${shortDate(endDate)}` : null,
                    `${totalDays}d`,
                    obStyles.length > 0 ? obStyles.map((s) => TRAVEL_STYLE_LABELS[s]).join(", ") : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              {selectedFlight && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.gstatic.com/flights/airline_logos/70px/${selectedFlight.airlineCode}.png`}
                    alt={selectedFlight.airline}
                    width={14}
                    height={14}
                    className="rounded object-contain shrink-0 opacity-70"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="text-[11px] font-mono text-gray-700">{selectedFlight.origin}</span>
                  <span className="text-gray-700 text-xs">→</span>
                  <span className="text-[11px] font-mono text-gray-700">{selectedFlight.destination}</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-[11px] text-gray-700">{fmt24(selectedFlight.departTime)}</span>
                </div>
              )}
              {Object.values(selectedHotels).length > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
                  <span className="text-[10px] text-gray-700">🏨</span>
                  <span className="text-[11px] text-gray-700 truncate max-w-[160px]">{Object.values(selectedHotels)[0]?.name}</span>
                  {Object.values(selectedHotels).length > 1 && (
                    <span className="text-[10px] text-gray-700">+{Object.values(selectedHotels).length - 1}</span>
                  )}
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
                className="text-[11px] text-gray-700 hover:text-teal-600 transition-colors"
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
                  className="text-[11px] text-teal-500 hover:text-teal-600 transition-colors"
                >
                  + Add activities
                </button>
              )}
              <button
                type="button"
                onClick={startNewTrip}
                className="text-[11px] text-gray-700 hover:text-red-400 transition-colors"
              >
                New trip
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Itinerary ── */}
        {activeTab === "itinerary" && (
        <div>
          {/* Return flight-added prompt banner */}
          {returnFlightAddedBanner && selectedReturnFlight && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 mb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">✈️</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-teal-800">
                    Return flight {selectedReturnFlight.origin} → {selectedReturnFlight.destination} added
                  </p>
                  <p className="text-[11px] text-teal-600 mt-0.5">
                    {trip.itinerary ? "Update your last day to block departure time — other days stay untouched." : "Generate your itinerary to block out departure time."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {primaryCity && trip.startDate && (
                  <button
                    type="button"
                    onClick={() => { setReturnFlightAddedBanner(false); applyFlightToItinerary("return"); }}
                    className="h-8 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                  >
                    {trip.itinerary ? "Update last day" : "Generate"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setReturnFlightAddedBanner(false)}
                  className="text-teal-400 hover:text-teal-600 transition-colors text-lg leading-none"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Outbound flight-added prompt banner */}
          {flightAddedBanner && selectedFlight && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 mb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">✈️</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-teal-800">
                    {selectedFlight.origin} → {selectedFlight.destination} added
                  </p>
                  <p className="text-[11px] text-teal-600 mt-0.5">
                    {trip.itinerary ? "Update Day 1 to block arrival time — other days stay untouched." : "Generate your itinerary to block out arrival time."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {primaryCity && trip.startDate && (
                  <button
                    type="button"
                    onClick={() => { setFlightAddedBanner(false); applyFlightToItinerary("outbound"); }}
                    className="h-8 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                  >
                    {trip.itinerary ? "Update Day 1" : "Generate"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFlightAddedBanner(false)}
                  className="text-teal-400 hover:text-teal-600 transition-colors text-lg leading-none"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Preferences nudge — only shown before first generation */}
          {!hasItinerary && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800">
                <strong>Set your preferences first</strong> — destination, dates, pace, and interests help Claude build the right itinerary on the first try.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("preferences")}
                className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 transition-colors"
              >
                Open Preferences
              </button>
            </div>
          )}

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
              <p className="text-[11px] text-gray-700">
                {!primaryCity ? "Enter a destination in Preferences." : "Add a start date in Preferences."}
              </p>
            )}
            <div className="flex gap-2 ml-auto items-center">
              <button
                type="button"
                onClick={() => { setSaveAsName(""); setSaveAsModal(true); }}
                className="h-9 rounded-full border border-gray-200 px-4 text-xs font-medium text-gray-700 hover:text-gray-700 hover:border-gray-300 transition-colors"
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
                  className="h-9 rounded-full border border-gray-200 px-4 text-xs font-medium text-gray-700 hover:text-gray-700 hover:border-gray-300 transition-colors"
                >
                  Load trip ▾
                </button>
                {loadDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-gray-50 border border-gray-200 rounded-xl shadow-2xl min-w-[200px] overflow-hidden">
                    {tripList.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-700">No saved trips</p>
                    ) : (
                      tripList.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTrip(t.trip);
                            const ids  = t.trip.savedActivityIds ?? [];
                            const meta = t.trip.savedActivityMeta ?? {};
                            setSavedIds(ids);
                            setSavedMeta(meta);
                            try {
                              localStorage.setItem("travelgrab:saved-activities",      JSON.stringify(ids));
                              localStorage.setItem("travelgrab:saved-activities-data", JSON.stringify(meta));
                            } catch { /* ignore */ }
                            setActiveTripId(t.id);
                            setCurrentTripId(t.id);
                            setLoadDropdown(false);
                          }}
                          className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-xs transition-colors hover:bg-gray-100 ${
                            t.id === activeTripId ? "text-teal-600" : "text-gray-600"
                          }`}
                        >
                          <span>{t.name}</span>
                          {t.id === activeTripId && <span className="text-gray-700 text-[10px]">current</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={clearTrip}
                className="h-9 rounded-full border border-gray-200 px-4 text-xs font-medium text-gray-700 hover:text-red-400 hover:border-red-400/20 transition-colors"
              >
                Clear trip
              </button>
            </div>
          </div>

          {/* ── Itinerary output ── */}
          {!hasItinerary && !isGenerating && genStatus !== "error" && (
            <div className="flex flex-col items-center justify-center min-h-[480px] rounded-2xl border border-gray-200 bg-white p-10 text-center">
              <div className="h-14 w-14 rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center text-2xl mb-5">
                ✦
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Build your itinerary</h1>
              <p className="text-sm text-gray-700 max-w-xs leading-relaxed">
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
                  className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-full border border-teal-200 bg-lantern-mint/[0.08] px-5 text-xs font-semibold text-teal-600 hover:bg-teal-50 transition-colors"
                >
                  Browse activities →
                </Link>
              )}
            </div>
          )}

          {isGenerating && (
            <div className="flex flex-col items-center justify-center min-h-[480px] rounded-2xl border border-gray-200 bg-white p-10 text-center">
              <div className="h-10 w-10 rounded-full border-2 border-gray-200 border-t-lantern-mint animate-spin mb-6" />
              <p className="text-sm text-gray-700">Clustering activities by geography…</p>
              <p className="text-xs text-gray-700 mt-2">Usually under a second</p>
            </div>
          )}

          {genStatus === "error" && !hasItinerary && (
            <div className="flex flex-col items-center justify-center min-h-[480px] rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-10 text-center">
              <p className="text-sm font-semibold text-red-400 mb-2">Failed to generate itinerary</p>
              <p className="text-xs text-gray-700 mb-6">{genError}</p>
              <button
                type="button"
                onClick={generate}
                className="text-xs text-teal-600 border border-teal-200 rounded-lg px-4 py-2 hover:bg-teal-50 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {hasItinerary && trip.itinerary && !isGenerating && (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    {trip.cities.map((c) => c.city).filter(Boolean).join(" → ") || "Your trip"}
                  </h1>
                  <p className="text-sm text-gray-700 mt-1">
                    {trip.startDate && `${shortDate(trip.startDate)} – ${shortDate(endDate)} · `}
                    {trip.itinerary.days.length} {trip.itinerary.days.length === 1 ? "day" : "days"} ·{" "}
                    {activeActivityIds.length - trip.itinerary.meta.droppedActivities.length} of {activeActivityIds.length}{" "}
                    {activeActivityIds.length === 1 ? "activity" : "activities"} scheduled
                    {trip.itinerary.meta.droppedActivities.length > 0 && (
                      <> · {trip.itinerary.meta.droppedActivities.length} dropped</>
                    )}
                  </p>
                  {trip.itineraryGeneratedAt && (
                    <p className="text-[11px] text-gray-700 mt-1">
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
                    className="text-[11px] text-gray-700 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
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
                          ? "border-teal-400 bg-teal-100 text-teal-700 scale-105"
                          : selectedDay === i
                          ? "border-teal-500 bg-teal-500 text-white shadow-sm"
                          : "border-gray-200 bg-white text-gray-700 hover:border-teal-200 hover:text-teal-600"
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
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <DayView
                    day={trip.itinerary.days[selectedDay]}
                    savedMeta={savedMeta}
                    compact={compactView}
                    city={primaryCity}
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
                    onInsertAfterGap={(afterSlot, id, meta) => {
                      const itin = trip.itinerary;
                      if (!itin) return;
                      const day = itin.days[selectedDay];
                      if (!day) return;
                      const dur = parseDuration(meta.duration);
                      const newSlot: PlannedSlot = {
                        kind:            "activity",
                        startMinutes:    afterSlot.endMinutes,
                        durationMinutes: dur,
                        endMinutes:      afterSlot.endMinutes + dur,
                        title:           meta.title,
                        sourceId:        id,
                        explanation:     meta.neighborhood ?? "",
                        category:        meta.category,
                      };
                      const insertIdx = day.slots.indexOf(afterSlot) + 1;
                      const newSlots  = [
                        ...day.slots.slice(0, insertIdx),
                        newSlot,
                        ...day.slots.slice(insertIdx),
                      ];
                      updateTrip({
                        itinerary: {
                          ...itin,
                          days: itin.days.map((d) =>
                            d.dayIndex === day.dayIndex
                              ? { ...d, slots: newSlots, scheduledActivityCount: newSlots.filter((s) => s.kind === "activity").length }
                              : d
                          ),
                        },
                      });
                    }}
                    onRelaxDay={() => void relaxDay(selectedDay)}
                    relaxing={relaxingDayIndex === selectedDay}
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
                      className="relative z-10 w-full max-w-lg mx-4 mb-4 sm:mb-0 rounded-3xl border border-gray-200 bg-gray-50 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
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
                              src={activityPhotoUrl(photos[detailActivePhoto]?.name ?? "", 800)}
                              className="w-full h-full object-cover"
                              alt={detailSlot.title}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-50 via-[#0D1019]/20 to-transparent" />
                            {photos[detailActivePhoto]?.authorAttributions?.length ? (
                              <p className="absolute bottom-2 left-3 rounded bg-black/60 px-2 py-1 text-[9px] text-white">
                                Photo: {photos[detailActivePhoto].authorAttributions!.map((author) => author.displayName).filter(Boolean).join(", ")}
                              </p>
                            ) : null}
                            {photos.length > 1 && (
                              <>
                                <button type="button" onClick={() => setDetailActivePhoto((n) => Math.max(0, n - 1))} disabled={detailActivePhoto === 0}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 border border-gray-200 flex items-center justify-center text-gray-700 hover:text-gray-900 transition-all disabled:opacity-20">
                                  ‹
                                </button>
                                <button type="button" onClick={() => setDetailActivePhoto((n) => Math.min(photos.length - 1, n + 1))} disabled={detailActivePhoto === photos.length - 1}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 border border-gray-200 flex items-center justify-center text-gray-700 hover:text-gray-900 transition-all disabled:opacity-20">
                                  ›
                                </button>
                                <div className="absolute bottom-2 right-3 bg-black/55 rounded-full px-2 py-0.5 text-[10px] text-gray-700">
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
                            className="absolute top-4 right-4 z-10 text-gray-700 hover:text-gray-700 transition-colors text-lg leading-none"
                            onClick={() => setDetailSlot(null)}
                          >
                            ✕
                          </button>

                          {/* Title + meta */}
                          <p className="text-[11px] font-mono text-gray-700 mb-1">
                            {formatTime(detailSlot.startMinutes)} — {formatDuration(detailSlot.durationMinutes)}
                          </p>
                          <h3 className="text-lg font-bold text-gray-900 mb-2">{detailSlot.title}</h3>
                          <div className="flex items-center flex-wrap gap-2 mb-3">
                            {(modalPlaceDetail?.address ?? dMeta?.neighborhood) && (
                              <span className="text-xs text-gray-700">{modalPlaceDetail?.address ?? dMeta?.neighborhood}</span>
                            )}
                            {(modalPlaceDetail?.rating ?? (dMeta?.rating != null && dMeta.rating > 0 ? dMeta.rating : null)) != null && (
                              <>
                                <span className="text-gray-700">·</span>
                                <span className="text-xs text-amber-600">
                                  ★ {(modalPlaceDetail?.rating ?? dMeta?.rating)!.toFixed(1)}
                                  {modalPlaceDetail?.userRatingCount && (
                                    <span className="text-gray-700 ml-1">({modalPlaceDetail.userRatingCount.toLocaleString()})</span>
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
                            <p className="text-sm text-gray-700 leading-relaxed mb-3">
                              {modalPlaceDetail?.editorialSummary ?? detailSlot.explanation}
                            </p>
                          )}

                          {/* Loading indicator */}
                          {modalDetailLoading && (
                            <p className="text-[10px] text-gray-700 mb-2">Loading place details…</p>
                          )}

                          {/* Hours */}
                          {modalPlaceDetail?.weekdayDescriptions && modalPlaceDetail.weekdayDescriptions.length > 0 && (
                            <details className="mb-2">
                              <summary className="text-[11px] text-gray-700 cursor-pointer select-none">
                                {modalPlaceDetail.openNow === false ? "🔴 Closed now" : modalPlaceDetail.openNow ? "🟢 Open now" : "⏰ Opening hours"}
                              </summary>
                              <ul className="mt-1 space-y-0.5 pl-4">
                                {modalPlaceDetail.weekdayDescriptions.map((line, i) => (
                                  <li key={i} className="text-[10px] text-gray-700">{line}</li>
                                ))}
                              </ul>
                            </details>
                          )}

                          {/* Contact & links */}
                          {(modalPlaceDetail?.phone || modalPlaceDetail?.website || modalPlaceDetail?.googleMapsUri) && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                              {modalPlaceDetail.phone && (
                                <a href={`tel:${modalPlaceDetail.phone}`} className="text-[11px] text-gray-700 hover:text-gray-700 transition-colors">
                                  📞 {modalPlaceDetail.phone}
                                </a>
                              )}
                              {modalPlaceDetail.website && (
                                <a href={modalPlaceDetail.website} target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] text-blue-600 hover:text-blue-600 truncate max-w-[200px] transition-colors">
                                  🌐 {modalPlaceDetail.website.replace(/^https?:\/\/(www\.)?/, "")}
                                </a>
                              )}
                              {(modalPlaceDetail?.googleMapsUri ?? detailSlot.sourceId) && (
                                <a
                                  href={modalPlaceDetail?.googleMapsUri ?? `https://maps.google.com/?q=${encodeURIComponent(detailSlot.title)}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] text-blue-600 hover:text-blue-600 transition-colors">
                                  🗺 Google Maps
                                </a>
                              )}
                            </div>
                          )}

                          {/* Reviews */}
                          {modalPlaceDetail?.reviews && modalPlaceDetail.reviews.length > 0 && (
                            <div className="mb-4">
                              <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-2">Reviews</p>
                              <div className="space-y-3">
                                {modalPlaceDetail.reviews.map((r, i) => (
                                  <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      {r.authorPhotoUri && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={r.authorPhotoUri} alt={r.authorName ?? ""} className="w-5 h-5 rounded-full object-cover" />
                                      )}
                                      <span className="text-[11px] font-medium text-gray-600">{r.authorName ?? "Anonymous"}</span>
                                      {r.rating != null && (
                                        <span className="text-[10px] text-amber-600 ml-auto">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                                      )}
                                    </div>
                                    {r.text && (
                                      <p className="text-[11px] text-gray-700 leading-relaxed line-clamp-3">{r.text}</p>
                                    )}
                                    {r.timeAgo && (
                                      <p className="text-[10px] text-gray-700 mt-1">{r.timeAgo}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          <div className="mt-2 border-t border-gray-200 pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Notes</span>
                              {noteEdit === null ? (
                                <button
                                  type="button"
                                  onClick={() => setNoteEdit(detailSlot.note ?? "")}
                                  className="text-[11px] text-gray-700 hover:text-teal-600 transition-colors"
                                >
                                  {detailSlot.note ? "Edit" : "+ Add note"}
                                </button>
                              ) : (
                                <div className="flex gap-3">
                                  <button type="button" onClick={() => setNoteEdit(null)} className="text-[11px] text-gray-700 hover:text-gray-700 transition-colors">Cancel</button>
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
                                    className="text-[11px] text-teal-600 font-semibold hover:opacity-80 transition-opacity"
                                  >
                                    Save
                                  </button>
                                </div>
                              )}
                            </div>
                            {noteEdit === null ? (
                              detailSlot.note ? (
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{detailSlot.note}</p>
                              ) : (
                                <p className="text-[12px] text-gray-700 italic">No notes yet</p>
                              )
                            ) : (
                              <textarea
                                autoFocus
                                value={noteEdit}
                                onChange={(e) => setNoteEdit(e.target.value)}
                                placeholder="Add your notes…"
                                rows={3}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder:text-gray-700 focus:outline-none focus:border-teal-400 resize-none"
                              />
                            )}
                          </div>

                          {/* Duration */}
                          <div className="mt-4 border-t border-gray-200 pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Duration</span>
                              {durationEdit === null ? (
                                <button type="button" onClick={() => setDurationEdit(detailSlot.durationMinutes)} className="text-[11px] text-gray-700 hover:text-teal-600 transition-colors">Edit</button>
                              ) : (
                                <div className="flex gap-3">
                                  <button type="button" onClick={() => setDurationEdit(null)} className="text-[11px] text-gray-700 hover:text-gray-700 transition-colors">Cancel</button>
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
                                    className="text-[11px] text-teal-600 font-semibold hover:opacity-80 transition-opacity"
                                  >
                                    Save
                                  </button>
                                </div>
                              )}
                            </div>
                            {durationEdit === null ? (
                              <p className="text-sm text-gray-700">{detailSlot.durationMinutes}m</p>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input
                                  autoFocus type="number" min={15} max={480} step={15} value={durationEdit}
                                  onChange={(e) => setDurationEdit(Number(e.target.value))}
                                  className="w-28 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-teal-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-sm text-gray-700">minutes</span>
                              </div>
                            )}
                          </div>

                          {!modalPlaceDetail?.googleMapsUri && (
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(detailSlot.title)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-gray-900 transition-colors"
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
                <div className="mt-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Notes</p>
                  <ul className="space-y-1">
                    {trip.itinerary.meta.conflicts.map((c, i) => (
                      <li key={i} className="text-xs text-gray-700">{c.description}</li>
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
          <div>
            {!hasItinerary && (
              <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                Fill in your destination, dates, and trip style below — then click <strong>Build My Itinerary</strong> when you&apos;re ready. Each generation uses AI credits, so getting preferences right first saves a regeneration.
              </div>
            )}
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
              obStyles={obStyles}
              obFirstTime={obFirstTime}
              onEditTrip={startOnboarding}
            />
            {/* Activities nudge */}
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    {savedIds.length > 0
                      ? `${savedIds.length} activit${savedIds.length === 1 ? "y" : "ies"} saved`
                      : "Add activities (optional)"}
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {savedIds.length > 0
                      ? "Claude will schedule these into your itinerary and fill in the rest of your days."
                      : "Browse the Activities page to save places you want to visit. Claude will fit them into your schedule automatically."}
                  </p>
                </div>
                <Link
                  href={primaryCity ? `/activities?city=${encodeURIComponent(primaryCity)}` : "/activities"}
                  className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:border-teal-400 hover:text-teal-700 transition-colors"
                >
                  {savedIds.length > 0 ? "Add more" : "Browse Activities"} <span>→</span>
                </Link>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("itinerary")}
                  disabled={!primaryCity || !trip.startDate}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-lantern-mint px-7 text-sm font-bold text-ink transition hover:opacity-90 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
                >
                  <span className="text-base">✦</span>
                  {hasItinerary ? "Back to Itinerary" : "Build My Itinerary →"}
                </button>
                {savedIds.length > 0 && !hasItinerary && primaryCity && trip.startDate && (
                  <p className="text-xs text-gray-400">
                    Your {savedIds.length} saved place{savedIds.length === 1 ? "" : "s"} will be included — Claude fills in the rest.
                  </p>
                )}
              </div>
              {(!primaryCity || !trip.startDate) && (
                <p className="mt-2 text-[11px] text-gray-500">
                  {!primaryCity ? "Add a destination above to continue." : "Add a start date above to continue."}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Flights & Hotels ── */}
        {activeTab === "travel" && (() => {
          const isMultiCity = trip.cities.length > 1;
          const firstCity2  = trip.cities[0]?.city ?? "";
          const lastCity    = trip.cities[trip.cities.length - 1]?.city ?? "";
          return (
            <div className="max-w-xl space-y-4">

              {/* Outbound flight */}
              <section className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Outbound flight</h3>
                  <span className="text-[11px] text-gray-400">(optional)</span>
                </div>
                {selectedFlight ? (
                  <SelectedFlightCard flight={selectedFlight} onClear={clearFlight} />
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Arrival date &amp; time</label>
                      <input
                        type="datetime-local"
                        value={trip.manualArrivalTime}
                        onChange={(e) => updateTrip({ manualArrivalTime: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-300 transition-colors"
                      />
                    </div>
                    {!isMultiCity && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5">Return departure date &amp; time</label>
                        <input
                          type="datetime-local"
                          value={trip.manualDepartureTime}
                          onChange={(e) => updateTrip({ manualDepartureTime: e.target.value })}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-300 transition-colors"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Link
                        href={firstCity2 ? `/flights?autofill_to=${encodeURIComponent(firstCity2)}` : "/flights"}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors"
                      >
                        Search outbound flight <span>→</span>
                      </Link>
                      {!isMultiCity && (
                        <Link
                          href={lastCity ? `/flights?autofill_from=${encodeURIComponent(lastCity)}&mode=return` : "/flights?mode=return"}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors"
                        >
                          Search return flight <span>→</span>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Return flight — multi-city only */}
              {isMultiCity && (
                <section className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Return flight</h3>
                    <span className="text-[11px] text-gray-400">(optional)</span>
                  </div>
                  {selectedReturnFlight ? (
                    <SelectedFlightCard flight={selectedReturnFlight} onClear={clearReturnFlight} />
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5">Departure date &amp; time</label>
                        <input
                          type="datetime-local"
                          value={trip.manualDepartureTime}
                          onChange={(e) => updateTrip({ manualDepartureTime: e.target.value })}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-300 transition-colors"
                        />
                      </div>
                      <Link
                        href={lastCity ? `/flights?autofill_from=${encodeURIComponent(lastCity)}&mode=return` : "/flights?mode=return"}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors"
                      >
                        Search return flight <span>→</span>
                      </Link>
                    </div>
                  )}
                </section>
              )}

              {/* Hotel per city — with connecting flight cards between country transitions */}
              {(() => {
                const validCities = trip.cities.filter((s) => s.city.trim());
                const getCountry = (city: string) => {
                  const parts = city.split(",");
                  return parts.length > 1 ? parts[parts.length - 1].trim().toLowerCase() : city.trim().toLowerCase();
                };
                return validCities.map((stop, i) => {
                  const prevStop = i > 0 ? validCities[i - 1] : null;
                  const crossesBorder = prevStop && getCountry(prevStop.city) !== getCountry(stop.city);
                  const cityKey = stop.city;
                  const hotel   = selectedHotels[cityKey];
                  const label   = isMultiCity ? `Hotel · ${stop.city.split(",")[0]}` : "Hotel / base";
                  return (
                    <React.Fragment key={i}>
                      {crossesBorder && prevStop && (
                        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-blue-900">
                              Connecting flight · {prevStop.city.split(",")[0]} → {stop.city.split(",")[0]}
                            </h3>
                            <span className="text-[11px] text-blue-400">international</span>
                          </div>
                          <p className="text-xs text-blue-700 mb-3">
                            You&apos;re crossing from {getCountry(prevStop.city).replace(/\b\w/g, (c) => c.toUpperCase())} to {getCountry(stop.city).replace(/\b\w/g, (c) => c.toUpperCase())} — you&apos;ll need a flight between these cities.
                          </p>
                          <Link
                            href={`/flights?autofill_from=${encodeURIComponent(prevStop.city)}&autofill_to=${encodeURIComponent(stop.city)}`}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                          >
                            Search connecting flight <span>→</span>
                          </Link>
                        </section>
                      )}
                  <section className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
                      <span className="text-[11px] text-gray-400">(optional)</span>
                    </div>
                    {hotel ? (
                      <SelectedHotelCard hotel={hotel} onClear={() => clearHotel(cityKey)} />
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1.5">Hotel name or neighborhood</label>
                          <input
                            type="text"
                            placeholder="e.g. Park Hyatt Shinjuku"
                            value={i === 0 ? trip.manualHotelName : ""}
                            onChange={(e) => { if (i === 0) updateTrip({ manualHotelName: e.target.value }); }}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-300 transition-colors"
                          />
                        </div>
                        <Link
                          href={cityKey ? `/hotels?city=${encodeURIComponent(cityKey)}` : "/hotels"}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors"
                        >
                          Search on Hotels and add <span>→</span>
                        </Link>
                      </div>
                    )}
                  </section>
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          );
        })()}

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
              <div className="flex flex-col items-center justify-center min-h-[220px] rounded-2xl border border-gray-200 bg-white p-10 text-center">
                <p className="text-sm font-semibold text-gray-900 mb-1">All activities scheduled</p>
                <p className="text-xs text-gray-700">Every saved place made it into the itinerary.</p>
              </div>
            );
          }

          return (
            <div className="space-y-2 max-w-2xl">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900">{dropped.length} {dropped.length === 1 ? "activity" : "activities"} didn&apos;t fit</h2>
                <p className="text-xs text-gray-700 mt-1">Click &ldquo;+ Add&rdquo; and Claude will suggest the best placement.</p>
              </div>
              {dropped.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{d.title}</p>
                    <p className="text-[10px] text-gray-700 mt-0.5">
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
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-teal-200 text-teal-600 text-xs hover:bg-teal-50 transition-colors"
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
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 max-w-md w-full mx-4">
                <p className="text-gray-900 text-center">Claude is analyzing placement options...</p>
              </div>
            </div>
          );
        }

        // Cannot fit
        if (placement.cannotFit) {
          return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 max-w-md w-full mx-4">
                <p className="text-gray-900 font-semibold mb-2">Cannot fit this activity</p>
                <p className="text-gray-600 text-sm mb-6">{placement.explanation}</p>
                <button
                  type="button"
                  onClick={() => setAddActivityModal(null)}
                  className="w-full px-4 py-2 bg-teal-50 border border-teal-200 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-gray-900 font-semibold">Add to itinerary</h2>
                    <p className="text-gray-700 text-sm mt-1">{activity.title} · {durMin}m</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddActivityModal(null)}
                    className="text-gray-700 hover:text-gray-900"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-3">
                {placement.bestFitDays && placement.bestFitDays.length > 0 && (
                  <div>
                    <p className="text-gray-700 text-xs font-semibold uppercase mb-2">Best Options</p>
                    {placement.bestFitDays.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => addActivityToDay(suggestion.dayIndex)}
                        className="w-full text-left p-4 rounded-lg border border-teal-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-400 transition-colors mb-2"
                      >
                        <p className="text-gray-900 font-semibold">Day {suggestion.dayIndex + 1} · {suggestion.city}</p>
                        <p className="text-teal-600 text-sm mt-1">{suggestion.reason}</p>
                      </button>
                    ))}
                  </div>
                )}

                {placement.swapSuggestions && placement.swapSuggestions.length > 0 && (
                  <div>
                    <p className="text-gray-700 text-xs font-semibold uppercase mb-2">Or Swap With</p>
                    {placement.swapSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => addActivityToDay(suggestion.dayIndex, suggestion.replaceActivityTitle)}
                        className="w-full text-left p-4 rounded-lg border border-yellow-500/30 bg-gray-50 hover:bg-yellow-500/10 hover:border-yellow-500/50 transition-colors mb-2"
                      >
                        <p className="text-gray-900 font-semibold">Day {suggestion.dayIndex + 1} · {suggestion.city}</p>
                        <p className="text-yellow-400 text-sm mt-1">
                          Replace &ldquo;{suggestion.replaceActivityTitle}&rdquo; ({suggestion.replaceActivityDuration}m)
                        </p>
                        <p className="text-gray-700 text-xs mt-2">{suggestion.reason}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setAddActivityModal(null)}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
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
              className="bg-gray-50 border border-gray-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-gray-900 font-semibold">Change start time</h2>
                  <p className="text-gray-700 text-sm mt-0.5 truncate max-w-[230px]">{editingTime.slot.title}</p>
                </div>
                <button type="button" onClick={() => setEditingTime(null)} className="text-gray-700 hover:text-gray-700 transition-colors ml-3 shrink-0">✕</button>
              </div>

              <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                <span className="text-[11px] text-gray-700 uppercase tracking-wider">Current</span>
                <span className="text-gray-600 font-mono text-sm">{formatTime(editingTime.slot.startMinutes)}</span>
              </div>

              <label className="block text-gray-700 text-xs mb-2 uppercase tracking-wider">New time</label>
              <input
                type="time"
                value={editingTime.value}
                onChange={(e) => setEditingTime((prev) => prev ? { ...prev, value: e.target.value } : null)}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 text-xl font-mono focus:outline-none focus:border-teal-400 mb-3"
                autoFocus
              />
              {timeError && (
                <p className="text-red-400 text-xs mb-3">{timeError}</p>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setEditingTime(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
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
            <div className="bg-gray-50 border border-gray-200 rounded-2xl max-w-sm w-full shadow-2xl"
                 onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-gray-900 font-semibold text-sm">Add activity</h2>
                    <p className="text-[11px] text-gray-700 mt-0.5">{dayLabel}</p>
                  </div>
                  <button type="button"
                    onClick={() => setQuickAddModal((m) => ({ ...m, open: false }))}
                    className="text-gray-700 hover:text-gray-700 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-xl leading-none">
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-700 block mb-1.5">Activity name</label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="e.g. Temple visit"
                      value={quickAddModal.activityName}
                      onChange={(e) => setQuickAddModal((m) => ({ ...m, activityName: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") commitQuickAdd(); }}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 text-sm placeholder:text-gray-700 focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 block mb-1.5">
                      Duration — <span className="text-gray-700">{quickAddModal.durationMinutes} min</span>
                    </label>
                    <input
                      type="number"
                      min={15} max={480} step={15}
                      value={quickAddModal.durationMinutes}
                      onChange={(e) => setQuickAddModal((m) => ({ ...m, durationMinutes: Math.max(15, Math.min(480, parseInt(e.target.value) || 90)) }))}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 text-sm focus:border-teal-400 focus:outline-none"
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
                    className="flex-1 border border-gray-200 text-gray-600 rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors">
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
          <div className="bg-gray-50 border border-gray-200 rounded-2xl max-w-sm w-full shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-900 font-semibold">Save trip as</h2>
                <button type="button" onClick={() => setSaveAsModal(false)}
                  className="text-gray-700 hover:text-gray-700 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-xl leading-none">
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
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 text-sm placeholder:text-gray-700 focus:border-teal-400 focus:outline-none mb-4"
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
                  className="flex-1 border border-gray-200 text-gray-600 rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors">
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
          <div className="bg-gray-50 border border-gray-200 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-gray-50 z-10">
              <div>
                <h2 className="text-gray-900 font-semibold">Edit trip</h2>
                {activeTripId && tripList.find((t) => t.id === activeTripId)?.name && (
                  <p className="text-[11px] text-gray-700 mt-0.5">
                    {tripList.find((t) => t.id === activeTripId)!.name}
                  </p>
                )}
              </div>
              <button type="button"
                onClick={() => setEditTripModal(false)}
                className="text-gray-700 hover:text-gray-700 transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50">
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
                      <label className="text-xs text-gray-700 block mb-2">Destination</label>
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
                        className="mt-2 text-[11px] text-gray-700 hover:text-teal-600 transition-colors">
                        + Add city
                      </button>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-700 block mb-1.5">Start date</label>
                        <input type="date" value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-gray-900 text-sm focus:border-teal-400 focus:outline-none [color-scheme:light]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-700 block mb-1.5">End date</label>
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
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-gray-900 text-sm focus:border-teal-400 focus:outline-none [color-scheme:light]"
                        />
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Pace */}
              <div>
                <label className="text-xs text-gray-700 block mb-2">Pace</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["relaxed", "balanced", "packed"] as const).map((p) => (
                    <button key={p} type="button"
                      onClick={() => setEditPace(p)}
                      className={`rounded-lg border py-2.5 text-xs font-medium capitalize transition-colors ${
                        editPace === p
                          ? "border-teal-400 bg-teal-50 text-teal-600"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:text-gray-700"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transit */}
              <div>
                <label className="text-xs text-gray-700 block mb-2">Getting around</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["walking", "public transit", "taxi", "mixed"] as const).map((t) => (
                    <button key={t} type="button"
                      onClick={() => setEditTransit(t)}
                      className={`rounded-lg border py-2.5 text-xs font-medium capitalize transition-colors ${
                        editTransit === t
                          ? "border-teal-400 bg-teal-50 text-teal-600"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:text-gray-700"
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 space-y-3 sticky bottom-0 bg-gray-50">
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
                className="w-full px-4 py-3 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

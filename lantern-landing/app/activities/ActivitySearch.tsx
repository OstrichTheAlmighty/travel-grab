"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { readTripStore, updateTripStore } from "@/lib/trip-store";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import UsageBanner from "@/app/components/UsageBanner";
import type { Activity, Badge, Category } from "./data/types";
import { supabase } from "@/lib/supabase";

// ── Filter config ─────────────────────────────────────────────────────────────

type FilterId = "all" | Category | "free" | "saved" | "browse_all";

const FILTERS: { id: FilterId; label: string; icon: string }[] = [
  { id: "all",         label: "Featured",    icon: "⭐" },
  { id: "food",        label: "Food",        icon: "🍜" },
  { id: "nightlife",   label: "Nightlife",   icon: "🌃" },
  { id: "culture",     label: "Culture",     icon: "🎭" },
  { id: "adventure",   label: "Adventure",   icon: "⚡" },
  { id: "nature",      label: "Nature",      icon: "🌿" },
  { id: "luxury",      label: "Luxury",      icon: "✨" },
  { id: "hidden_gems", label: "Hidden Gems", icon: "💎" },
  { id: "free",        label: "Free",        icon: "🎁" },
  { id: "saved",       label: "Saved",       icon: "❤" },
  { id: "browse_all",  label: "Browse All",  icon: "🗂" },
];

const BADGE_META: Record<Badge, { label: string; className: string }> = {
  hidden_gem:        { label: "Hidden Gem",        className: "text-teal-600 bg-black/60 border-teal-500/55 backdrop-blur-sm shadow-sm" },
  worth_the_splurge: { label: "Worth the Splurge", className: "text-amber-600   bg-black/60 border-amber-300/55   backdrop-blur-sm shadow-sm" },
  family_friendly:   { label: "Family Friendly",   className: "text-teal-600   bg-black/60 border-teal-400/55   backdrop-blur-sm shadow-sm" },
  popular:           { label: "Popular",            className: "text-amber-300      bg-black/60 border-amber-500/55      backdrop-blur-sm shadow-sm" },
  free:              { label: "Free",               className: "text-teal-600   bg-black/60 border-teal-400/55   backdrop-blur-sm shadow-sm" },
};

const CATEGORY_LABEL: Record<Category, string> = {
  food:        "Food & Drink",
  nightlife:   "Nightlife",
  culture:     "Art & Culture",
  adventure:   "Adventure",
  nature:      "Nature",
  luxury:      "Luxury",
  hidden_gems: "Hidden Gem",
};

const CATEGORY_BADGE: Record<string, string> = {
  food:        "bg-amber-50  text-amber-700  border-amber-200",
  nightlife:   "bg-purple-50 text-purple-700 border-purple-200",
  culture:     "bg-teal-50   text-teal-700   border-teal-200",
  adventure:   "bg-orange-50 text-orange-700 border-orange-200",
  nature:      "bg-green-50  text-green-700  border-green-200",
  luxury:      "bg-amber-50  text-amber-700  border-amber-200",
  hidden_gems: "bg-pink-50   text-pink-700   border-pink-200",
};

const CATEGORY_BORDER: Record<string, string> = {
  food:        "border-l-amber-400",
  nightlife:   "border-l-purple-400",
  culture:     "border-l-teal-400",
  adventure:   "border-l-orange-400",
  nature:      "border-l-green-400",
  luxury:      "border-l-amber-500",
  hidden_gems: "border-l-pink-400",
};

// ── Destination search localStorage cache (24h TTL, last 5 cities) ───────────

const LS_CACHE_KEY = "tg_dest_cache_v1";
const LS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const LS_CACHE_MAX = 5;

type LsCacheEntry = { result: unknown; ts: number };
type LsCache = Record<string, LsCacheEntry>;

function lsGetDestination(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as LsCache;
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > LS_CACHE_TTL) return null; // expired
    return entry.result;
  } catch { return null; }
}

function lsSetDestination(key: string, result: unknown): void {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    const cache: LsCache = raw ? (JSON.parse(raw) as LsCache) : {};
    cache[key] = { result, ts: Date.now() };
    // Evict oldest entries beyond limit
    const keys = Object.keys(cache);
    if (keys.length > LS_CACHE_MAX) {
      const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts)[0];
      delete cache[oldest];
    }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota — ignore */ }
}

// ── Supabase → Activity mapping ───────────────────────────────────────────────

const CATEGORY_GRADIENT: Record<Category, string> = {
  food:        "radial-gradient(ellipse at 30% 25%, rgba(194,65,12,0.95) 0%, rgba(120,53,15,0.85) 45%, rgba(12,8,4,1) 100%)",
  nightlife:   "radial-gradient(ellipse at 70% 20%, rgba(79,70,229,0.85) 0%, rgba(30,27,75,0.9) 50%, rgba(5,5,18,1) 100%)",
  culture:     "radial-gradient(ellipse at 35% 30%, rgba(109,40,217,0.9) 0%, rgba(76,29,149,0.85) 45%, rgba(8,4,18,1) 100%)",
  adventure:   "radial-gradient(ellipse at 25% 45%, rgba(13,148,136,0.9) 0%, rgba(6,78,59,0.85) 45%, rgba(3,10,8,1) 100%)",
  nature:      "radial-gradient(ellipse at 50% 20%, rgba(21,128,61,0.9) 0%, rgba(20,83,45,0.85) 45%, rgba(3,10,5,1) 100%)",
  luxury:      "radial-gradient(ellipse at 60% 30%, rgba(161,107,20,0.9) 0%, rgba(120,53,15,0.8) 45%, rgba(10,7,3,1) 100%)",
  hidden_gems: "radial-gradient(ellipse at 35% 40%, rgba(147,51,234,0.9) 0%, rgba(88,28,135,0.85) 45%, rgba(8,3,15,1) 100%)",
};

const CATEGORY_EMOJI: Record<Category, string> = {
  food: "🍜", nightlife: "🌃", culture: "🎭", adventure: "⚡",
  nature: "🌿", luxury: "✨", hidden_gems: "💎",
};

const VALID_CATEGORIES = new Set<Category>([
  "food", "nightlife", "culture", "adventure", "nature", "luxury", "hidden_gems",
]);
const VALID_BADGES = new Set<Badge>([
  "hidden_gem", "worth_the_splurge", "family_friendly", "popular", "free",
]);

type SupabaseRow = {
  id: string;
  place_id: string;
  title: string;
  city: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  google_places_data: Record<string, unknown> | null;
  created_at: string;
};

function rowToActivity(row: SupabaseRow): Activity {
  const gd   = (row.google_places_data ?? {}) as Record<string, unknown>;
  const raw  = (row.category ?? "culture") as Category;
  const cat: Category = VALID_CATEGORIES.has(raw) ? raw : "culture";

  const rawBadges = (gd.badges as string[] | undefined) ?? [];
  const badges    = rawBadges.filter((b): b is Badge => VALID_BADGES.has(b as Badge));

  const loc    = gd.location as { latitude?: number; longitude?: number } | undefined;
  const hours  = gd.regularOpeningHours as { openNow?: boolean } | undefined;

  // Derive isFree from multiple signals — the stored isFree field may be stale
  // (migration bug: parks got "free" badge but isFree left as false)
  const gdTypes   = (gd.types as string[] | undefined) ?? [];
  const gdPrice   = (gd.price as string | undefined) ?? "";
  const priceLevel = (gd.priceLevel as string | undefined);
  const freeTypes  = new Set(["park", "natural_feature", "beach", "hiking_area", "shrine"]);
  const isFreeByType = !priceLevel && gdTypes.some((t) => freeTypes.has(t));
  const isFree = !!(
    (gd.isFree as boolean | undefined)
    || badges.includes("free")
    || priceLevel === "PRICE_LEVEL_FREE"
    || gdPrice === "Free"
    || isFreeByType
  );

  return {
    id:           row.place_id || row.id,
    placeId:      row.place_id || undefined,
    title:        row.title,
    neighborhood: (gd.neighborhood as string | undefined)
                  ?? (gd.shortFormattedAddress as string | undefined)
                  ?? row.city,
    duration:     (gd.duration as string | undefined) ?? "1–2 hours",
    price:        isFree ? "Free" : (gdPrice || "Varies"),
    isFree,
    rating:       (gd.rating as number | undefined) ?? 0,
    reviewCount:  (gd.userRatingCount as number | undefined) ?? 0,
    description:  row.description ?? "",
    whyVisit:     (gd.whyVisit as string | undefined) ?? row.description ?? "",
    category:     cat,
    tags:         (gd.tags as string[] | undefined) ?? [],
    badges,
    emoji:        (gd.emoji as string | undefined) ?? CATEGORY_EMOJI[cat],
    gradient:     CATEGORY_GRADIENT[cat],
    photoRef:     row.image_url ?? undefined,
    websiteUri:   (gd.websiteUri as string | undefined),
    googleMapsUri:(gd.googleMapsUri as string | undefined),
    openNow:      hours?.openNow,
    lat:          loc?.latitude,
    lng:          loc?.longitude,
    querySources: (gd.querySources as string[] | undefined),
  };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconPin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconHeart({ filled, className }: { filled: boolean; className?: string }) {
  return filled ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" strokeLinejoin="round" />
    </svg>
  );
}


function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M2 4l4 4 4-4" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden animate-pulse">
      <div className="h-52 bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-2.5 bg-gray-50 rounded-full w-1/3" />
        <div className="h-4 bg-gray-100 rounded-full w-5/6" />
        <div className="h-3 bg-gray-100 rounded-full w-2/3" />
        <div className="space-y-1.5 mt-2">
          <div className="h-2.5 bg-gray-50 rounded-full w-full" />
          <div className="h-2.5 bg-gray-50 rounded-full w-4/5" />
        </div>
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-14 bg-gray-50 rounded-full" />
          <div className="h-5 w-16 bg-gray-50 rounded-full" />
          <div className="h-5 w-12 bg-gray-50 rounded-full" />
        </div>
        <div className="h-8 bg-gray-50 rounded-xl mt-2" />
      </div>
    </div>
  );
}

// ── Activity Card ─────────────────────────────────────────────────────────────

function ActivityCard({
  activity,
  saved,
  onToggleSave,
  onViewDetails,
}: {
  activity: Activity;
  saved: boolean;
  onToggleSave: () => void;
  onViewDetails: () => void;
}) {
  const [showWhy,   setShowWhy]   = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const heroBadges = activity.badges
    .filter((b) => !(b === "free" && activity.isFree))
    .slice(0, 2);

  const hasPhoto = Boolean(activity.photoRef) && !imgFailed;

  return (
    <div className={`group flex flex-col rounded-2xl border border-gray-200 border-l-[3px] ${CATEGORY_BORDER[activity.category] ?? "border-l-teal-400"} bg-white overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] hover:border-gray-300`}>

      {/* ── Hero ── */}
      <div className="relative h-52 overflow-hidden flex-shrink-0">
        {/* Gradient + emoji always visible as background/loading placeholder */}
        <div
          className="absolute inset-0 w-full h-full flex items-center justify-center"
          style={{ background: activity.gradient }}
        >
          <span
            className="text-8xl select-none transition-transform duration-500 ease-out group-hover:scale-110"
            style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}
          >
            {activity.emoji}
          </span>
        </div>
        {/* Photo fades in over gradient once loaded */}
        {hasPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/activities/photo?name=${encodeURIComponent(activity.photoRef!)}`}
            alt={activity.title}
            loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
          />
        )}

        {/* Bottom fade to panel bg */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-panel/70 to-transparent pointer-events-none z-10" />

        {/* Michelin star badge */}
        {activity.tags?.includes("Michelin") && (
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-sm border border-red-500/40 px-2 py-1">
            <span className="text-red-400 text-[11px] leading-none">★</span>
            <span className="text-[9px] font-bold text-white uppercase tracking-wide leading-none">Michelin</span>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
          aria-label={saved ? "Remove from saved" : "Save activity"}
          className={`absolute top-3 right-3 z-20 w-9 h-9 rounded-full backdrop-blur-sm border flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 ${
            saved
              ? "bg-gray-200 border-gray-200"
              : "bg-black/40 border-gray-200 hover:bg-black/55"
          }`}
        >
          <IconHeart
            filled={saved}
            className={`w-4 h-4 ${saved ? "text-red-400" : "text-gray-700"}`}
          />
        </button>

        {/* Badges */}
        {heroBadges.length > 0 && (
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
            {heroBadges.map((badge) => (
              <span
                key={badge}
                className={`inline-flex items-center text-[10px] font-bold rounded-full px-2.5 py-1 border leading-none ${BADGE_META[badge].className}`}
              >
                {BADGE_META[badge].label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col p-4 pt-3.5">

        {/* Rating + category */}
        <div className="flex items-center gap-1.5 mb-2">
          <IconStar className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[12px] font-bold text-gray-900 tabular-nums">
            {activity.rating > 0 ? activity.rating.toFixed(1) : "—"}
          </span>
          {activity.reviewCount > 0 && (
            <span className="text-[11px] text-gray-700">
              ({activity.reviewCount >= 1000
                ? `${(activity.reviewCount / 1000).toFixed(0)}k`
                : activity.reviewCount.toLocaleString()})
            </span>
          )}
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${CATEGORY_BADGE[activity.category] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
            {CATEGORY_LABEL[activity.category]}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-[14px] font-bold text-gray-900 leading-snug mb-2 line-clamp-2">
          {activity.title}
        </h3>

        {/* Meta: location · duration · price */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-700 mb-3">
          <span className="flex items-center gap-1">
            <IconPin className="w-2.5 h-2.5 flex-shrink-0" />
            {activity.neighborhood}
          </span>
          <span className="text-gray-900/[0.12]">·</span>
          <span className="flex items-center gap-1">
            <IconClock className="w-2.5 h-2.5 flex-shrink-0" />
            {activity.duration}
          </span>
          <span className="text-gray-900/[0.12]">·</span>
          <span className={`font-semibold ${activity.isFree ? "text-teal-600/80" : "text-gray-600"}`}>
            {activity.price}
          </span>
        </div>

        {/* Description */}
        <p className="text-[12px] text-gray-700 leading-relaxed mb-3 line-clamp-3">
          {activity.description}
        </p>

        {/* Tags */}
        {activity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {activity.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-gray-700 border border-gray-200 bg-gray-50 rounded-full px-2 py-0.5 leading-none"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3 border-t border-gray-200 space-y-2.5">

          {/* Why visit? */}
          <button
            onClick={() => setShowWhy((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-gray-700 hover:text-gray-600 transition-colors"
          >
            <IconChevron
              className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${showWhy ? "rotate-180" : ""}`}
            />
            Why visit?
          </button>

          <div
            className="overflow-hidden transition-all duration-300 ease-out"
            style={{ maxHeight: showWhy ? "160px" : "0px", opacity: showWhy ? 1 : 0 }}
          >
            <p className="text-[12px] text-gray-700 leading-relaxed pl-4 border-l-2 border-teal-500/30 italic pb-1">
              {activity.whyVisit}
            </p>
          </div>

          {/* View Details → opens in-app detail modal */}
          <button
            onClick={onViewDetails}
            className="w-full h-9 rounded-xl bg-gray-100 border border-gray-200 text-[12px] font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-700 hover:border-gray-300 transition-all duration-200 active:scale-[0.98]"
          >
            View Details →
          </button>

        </div>
      </div>
    </div>
  );
}

// ── Review Insights (returned by /api/activities/review-insights) ─────────────

interface ReviewInsights {
  guestsLove: string[];
  watchOut:   string[];
  bestFor:    string[];
  tips:       string[];
  limited:    boolean;
}

// ── Place Detail type (mirrors /api/activities/place response) ────────────────

interface PlaceReview {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: { text: string; languageCode?: string };
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  publishTime?: string;
  googleMapsUri?: string;
}

interface PlaceDetail {
  id: string;
  displayName?: { text: string };
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  types?: string[];
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  priceLevel?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  editorialSummary?: { text: string };
  reviews?: PlaceReview[];
}

// ── Practical-tip helpers (all labeled as estimated in the UI) ────────────────

function getBestTime(types: string[]): string {
  if (types.some((t) => ["night_club", "bar"].includes(t))) return "Evenings from 9 PM onwards";
  if (types.some((t) => ["park", "natural_feature", "campground"].includes(t))) return "Morning or late afternoon";
  if (types.some((t) => ["museum", "art_gallery"].includes(t))) return "Weekday mornings to avoid crowds";
  if (types.some((t) => ["restaurant", "cafe", "bakery"].includes(t))) return "Lunch (noon–2 PM) or dinner (6–8 PM)";
  if (types.some((t) => ["shopping_mall", "market"].includes(t))) return "Weekday mornings";
  if (types.some((t) => ["amusement_park", "zoo", "aquarium"].includes(t))) return "Weekday opening hours";
  return "Early morning or late afternoon for smaller crowds";
}

function getCrowdLevel(count: number): string {
  if (count >= 10000) return "Very busy — expect crowds, especially on weekends and holidays";
  if (count >= 5000)  return "Popular — can get crowded during peak hours";
  if (count >= 1000)  return "Moderately visited — comfortable most days";
  if (count >= 100)   return "Relatively uncrowded";
  return "Quiet — few visitors";
}

function getGoodFor(badges: Badge[], types: string[]): string {
  const parts: string[] = [];
  if (badges.includes("family_friendly")) parts.push("families with children");
  if (badges.includes("popular"))         parts.push("first-time visitors");
  if (badges.includes("hidden_gem"))      parts.push("those seeking off-the-beaten-path experiences");
  if (types.some((t) => ["museum", "art_gallery"].includes(t))) parts.push("culture enthusiasts");
  if (types.some((t) => ["park", "natural_feature"].includes(t))) parts.push("outdoor lovers");
  if (types.some((t) => ["restaurant", "cafe", "food"].includes(t))) parts.push("food lovers");
  if (types.some((t) => ["night_club", "bar"].includes(t))) parts.push("night owls");
  if (types.some((t) => ["zoo", "aquarium", "amusement_park"].includes(t))) parts.push("families");
  return parts.length > 0 ? parts.join(", ") : "most travelers";
}

// ── Activity Detail Modal ─────────────────────────────────────────────────────

// ── Review Insights section ───────────────────────────────────────────────────

function ReviewInsightsSection({
  insights,
  loading,
}: {
  insights: ReviewInsights | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mb-6 animate-pulse">
        <div className="h-2 w-28 bg-gray-50 rounded-full mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
              <div className="h-2 w-16 bg-gray-100 rounded-full mb-3" />
              <div className="space-y-2">
                <div className="h-2 bg-gray-50 rounded-full w-full" />
                <div className="h-2 bg-gray-50 rounded-full w-4/5" />
                <div className="h-2 bg-gray-50 rounded-full w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!insights) return null;

  const hasContent =
    insights.guestsLove.length > 0 ||
    insights.watchOut.length > 0 ||
    insights.bestFor.length > 0 ||
    insights.tips.length > 0;

  if (!hasContent) return null;

  return (
    <div className="mb-6">
      <div className="text-[9px] font-black uppercase tracking-widest text-gray-700 mb-3">
        Review Insights
      </div>

      {insights.limited && (
        <p className="text-[11px] text-gray-700 italic mb-3">
          Based on Google&apos;s limited review sample.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Guests love */}
        {insights.guestsLove.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <svg className="w-3 h-3 text-teal-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[11px] font-bold text-gray-700">Guests love</span>
            </div>
            <ul className="space-y-1.5">
              {insights.guestsLove.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-gray-700 leading-snug">
                  <span className="text-gray-700 flex-shrink-0 mt-px">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Watch out */}
        {insights.watchOut.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <svg className="w-3 h-3 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-[11px] font-bold text-gray-700">Watch out</span>
            </div>
            <ul className="space-y-1.5">
              {insights.watchOut.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-gray-700 leading-snug">
                  <span className="text-gray-700 flex-shrink-0 mt-px">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Best for */}
        {insights.bestFor.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <svg className="w-3 h-3 text-blue-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="text-[11px] font-bold text-gray-700">Best for</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {insights.bestFor.map((item, i) => (
                <span
                  key={i}
                  className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 leading-none"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tips from reviews */}
        {insights.tips.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <svg className="w-3 h-3 text-amber-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7zm2 19v1a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1h4z" />
              </svg>
              <span className="text-[11px] font-bold text-gray-700">Tips from reviews</span>
            </div>
            <ul className="space-y-1.5">
              {insights.tips.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-gray-700 leading-snug">
                  <span className="text-gray-700 flex-shrink-0 mt-px">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ActivityDetailModal({
  activity,
  detail,
  loading,
  insights,
  insightsLoading,
  onClose,
}: {
  activity: Activity;
  detail: PlaceDetail | null;
  loading: boolean;
  insights: ReviewInsights | null;
  insightsLoading: boolean;
  onClose: () => void;
}) {
  const [activePhoto,   setActivePhoto]   = useState(0);
  const [showHours,     setShowHours]     = useState(false);
  const [reviewFilter,  setReviewFilter]  = useState<"all" | "5" | "4" | "lte3">("all");
  const [reviewSearch,  setReviewSearch]  = useState("");

  // Close on Escape and lock body scroll
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Reset photo index and review filters when detail changes
  useEffect(() => {
    setActivePhoto(0);
    setReviewFilter("all");
    setReviewSearch("");
  }, [detail]);

  // Resolve fields — prefer detail data, fall back to card data
  const photos        = detail?.photos ?? (activity.photoRef ? [{ name: activity.photoRef }] : []);
  const name          = detail?.displayName?.text ?? activity.title;
  const rating        = detail?.rating        ?? activity.rating;
  const reviewCount   = detail?.userRatingCount ?? activity.reviewCount;
  const address       = detail?.formattedAddress ?? detail?.shortFormattedAddress ?? activity.neighborhood;
  const summary       = detail?.editorialSummary?.text ?? activity.description;
  const openNow       = detail?.regularOpeningHours?.openNow ?? activity.openNow;
  const hours         = detail?.regularOpeningHours?.weekdayDescriptions ?? [];
  const types         = detail?.types ?? [];
  const websiteUri    = detail?.websiteUri    ?? activity.websiteUri;
  const googleMapsUri = detail?.googleMapsUri ?? activity.googleMapsUri;
  const phone         = detail?.nationalPhoneNumber ?? detail?.internationalPhoneNumber;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel (mirrors hotel research panel) */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-full lg:max-w-[720px] bg-gray-50 border-l border-gray-200 flex flex-col shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        {/* ── Sticky header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm flex-shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">Place Details</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:text-gray-900 hover:border-gray-300 transition-all"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Photo gallery — show immediately from card data, upgrade when detail loads */}
          {photos.length > 0 ? (
            <div>
              {/* Main photo */}
              <div className="relative h-64 sm:h-80 bg-gray-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={photos[activePhoto]?.name}
                  src={`/api/activities/photo?name=${encodeURIComponent(photos[activePhoto]?.name ?? "")}&w=1200`}
                  alt={`${name} — photo ${activePhoto + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Nav arrows */}
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setActivePhoto((n) => Math.max(0, n - 1))}
                      disabled={activePhoto === 0}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm border border-gray-200 flex items-center justify-center text-gray-700 hover:text-gray-900 hover:bg-black/70 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button
                      onClick={() => setActivePhoto((n) => Math.min(photos.length - 1, n + 1))}
                      disabled={activePhoto === photos.length - 1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm border border-gray-200 flex items-center justify-center text-gray-700 hover:text-gray-900 hover:bg-black/70 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </>
                )}
                {/* Photo counter */}
                {photos.length > 1 && (
                  <div className="absolute bottom-3 right-3 bg-black/55 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] text-gray-700 font-semibold tabular-nums">
                    {activePhoto + 1} / {photos.length}
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {photos.length > 1 && (
                <div
                  className="flex gap-1.5 px-4 py-2.5 bg-white/[0.015] border-b border-gray-100 overflow-x-auto"
                  style={{ scrollbarWidth: "none" } as React.CSSProperties}
                >
                  {photos.slice(0, 10).map((photo, i) => (
                    <button
                      key={photo.name}
                      onClick={() => setActivePhoto(i)}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                        i === activePhoto
                          ? "border-teal-500/70 opacity-100"
                          : "border-transparent opacity-45 hover:opacity-75"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/activities/photo?name=${encodeURIComponent(photo.name)}&w=120`}
                        alt={`Thumbnail ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Fallback gradient hero while no photos available
            <div
              className="h-52 flex items-center justify-center flex-shrink-0"
              style={{ background: activity.gradient }}
            >
              <span className="text-8xl select-none" style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}>
                {activity.emoji}
              </span>
            </div>
          )}

          {/* Body */}
          <div className="p-5 space-y-5">

            {/* ── Name + category + open status ── */}
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-700 border border-gray-200 rounded-full px-2 py-0.5">
                  {CATEGORY_LABEL[activity.category]}
                </span>
                {openNow !== undefined && (
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                    openNow ? "text-emerald-400 bg-emerald-400/10" : "text-red-400/60 bg-red-400/[0.08]"
                  }`}>
                    {openNow ? "Open now" : "Closed now"}
                  </span>
                )}
                {loading && (
                  <span className="text-[10px] text-gray-700 flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                    Loading details…
                  </span>
                )}
              </div>

              <h2 className="text-xl font-black text-gray-900 leading-tight mb-2.5">{name}</h2>

              {/* Rating + reviews + price */}
              <div className="flex items-center gap-2 flex-wrap">
                <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                  {rating > 0 ? rating.toFixed(1) : "—"}
                </span>
                {reviewCount > 0 && (
                  <span className="text-[12px] text-gray-700">
                    ({reviewCount >= 1000 ? `${Math.round(reviewCount / 1000)}k` : reviewCount.toLocaleString()} reviews)
                  </span>
                )}
                {activity.price !== "Varies" && (
                  <>
                    <span className="text-gray-900/[0.15] mx-0.5">·</span>
                    <span className={`text-[12px] font-semibold ${activity.isFree ? "text-teal-600/80" : "text-gray-600"}`}>
                      {activity.price}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* ── Address ── */}
            {address && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 flex items-start gap-3">
                <svg className="w-4 h-4 text-gray-700 flex-shrink-0 mt-px" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <p className="text-[12px] text-gray-700 leading-relaxed">{address}</p>
              </div>
            )}

            {/* ── Editorial summary / About ── */}
            {summary && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-gray-700 mb-2">About</div>
                <p className="text-[13px] text-gray-600 leading-relaxed">{summary}</p>
              </div>
            )}

            {/* ── Why visit ── */}
            <div className="rounded-xl border border-teal-200 bg-teal-600/[0.04] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-teal-500 mb-2">Why visit</div>
              <p className="text-[12px] text-gray-600 leading-relaxed italic">{activity.whyVisit}</p>
            </div>

            {/* ── Opening hours ── */}
            {hours.length > 0 && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-gray-700 mb-2">Hours</div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                  <button
                    onClick={() => setShowHours((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className={`text-[12px] font-semibold ${
                      openNow === true  ? "text-emerald-400" :
                      openNow === false ? "text-red-400/70"  : "text-gray-700"
                    }`}>
                      {openNow === true ? "Open now" : openNow === false ? "Closed now" : "See weekly hours"}
                      {!showHours && " — tap to expand"}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-700 transition-transform flex-shrink-0 ${showHours ? "rotate-180" : ""}`}
                      viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                    >
                      <path d="M2 4l4 4 4-4" />
                    </svg>
                  </button>
                  {showHours && (
                    <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-1.5">
                      {hours.map((day, i) => {
                        const colonIdx = day.indexOf(": ");
                        const dayName  = colonIdx >= 0 ? day.slice(0, colonIdx) : day;
                        const dayHours = colonIdx >= 0 ? day.slice(colonIdx + 2) : "";
                        return (
                          <div key={i} className="flex text-[11px] gap-3">
                            <span className="text-gray-700 w-24 flex-shrink-0">{dayName}</span>
                            <span className="text-gray-600">{dayHours || "—"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Contact & links ── */}
            {(phone || websiteUri || googleMapsUri) && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-gray-700 mb-2">Contact & links</div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-gray-700 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                      </svg>
                      {phone}
                    </a>
                  )}
                  {websiteUri && (
                    <a
                      href={websiteUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-gray-700 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        <path d="M2 12h20" />
                      </svg>
                      <span className="truncate">{websiteUri.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                    </a>
                  )}
                  {googleMapsUri && (
                    <a
                      href={googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-gray-700 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                      </svg>
                      Open in Google Maps
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* ── Practical tips ── */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-700 mb-2">Practical Tips</div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100 overflow-hidden">

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-gray-700 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-gray-700 mb-0.5">Estimated visit duration</div>
                    <div className="text-[12px] text-gray-600">{activity.duration}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-gray-700 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-gray-700 mb-0.5">
                      Best time to visit <span className="text-gray-700">(typical)</span>
                    </div>
                    <div className="text-[12px] text-gray-600">{getBestTime(types)}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-gray-700 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-gray-700 mb-0.5">
                      Crowd level <span className="text-gray-700">(estimated from review volume)</span>
                    </div>
                    <div className="text-[12px] text-gray-600">{getCrowdLevel(reviewCount)}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-gray-700 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-gray-700 mb-0.5">Good for</div>
                    <div className="text-[12px] text-gray-600 capitalize">{getGoodFor(activity.badges, types)}</div>
                  </div>
                </div>

              </div>
            </div>

            {/* ── Review Insights ── */}
            {(insightsLoading || insights) && (
              <div className="px-5 pb-1">
                <ReviewInsightsSection
                  insights={insights}
                  loading={insightsLoading}
                />
              </div>
            )}

            {/* ── Guest Reviews ── */}
            {(() => {
              const allReviews = detail?.reviews ?? [];

              // Filter by star rating
              const starFiltered = allReviews.filter((r) => {
                const s = r.rating ?? 0;
                if (reviewFilter === "5")   return s === 5;
                if (reviewFilter === "4")   return s === 4;
                if (reviewFilter === "lte3") return s <= 3;
                return true;
              });

              // Filter by search text
              const q = reviewSearch.trim().toLowerCase();
              const shownReviews = q
                ? starFiltered.filter((r) =>
                    (r.text?.text ?? "").toLowerCase().includes(q) ||
                    (r.authorAttribution?.displayName ?? "").toLowerCase().includes(q),
                  )
                : starFiltered;

              // Counts per bucket for filter chips
              const count5   = allReviews.filter((r) => (r.rating ?? 0) === 5).length;
              const count4   = allReviews.filter((r) => (r.rating ?? 0) === 4).length;
              const countLt3 = allReviews.filter((r) => (r.rating ?? 0) <= 3).length;

              return (
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-gray-700 mb-2">
                    Review sample
                  </div>

                  {/* Limitation notice + "Open full reviews" CTA */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-[11px] text-gray-700 leading-snug">
                      Google provides a limited review sample here
                      {allReviews.length > 0 && ` (${allReviews.length} shown)`}.
                    </p>
                    {(detail?.googleMapsUri ?? activity.googleMapsUri) && (
                      <a
                        href={detail?.googleMapsUri ?? activity.googleMapsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-600 transition-colors whitespace-nowrap"
                      >
                        Open full reviews ↗
                      </a>
                    )}
                  </div>

                  {detail && !loading && allReviews.length === 0 ? (
                    <p className="text-[12px] text-gray-700 italic px-0.5">
                      Review text is not available from Google for this place.
                    </p>
                  ) : (
                    <>
                      {/* Filter chips */}
                      {allReviews.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          {(
                            [
                              { id: "all",  label: "All",  count: allReviews.length },
                              { id: "5",    label: "5★",   count: count5 },
                              { id: "4",    label: "4★",   count: count4 },
                              { id: "lte3", label: "≤3★",  count: countLt3 },
                            ] as const
                          ).map((chip) => (
                            <button
                              key={chip.id}
                              onClick={() => setReviewFilter(chip.id)}
                              disabled={chip.count === 0}
                              className={`flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                                reviewFilter === chip.id
                                  ? "bg-lantern-mint text-ink border-teal-400"
                                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                              }`}
                            >
                              {chip.label}
                              {chip.count > 0 && (
                                <span className={`ml-1.5 tabular-nums ${reviewFilter === chip.id ? "text-gray-700" : "text-gray-700"}`}>
                                  {chip.count}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Search box */}
                      {allReviews.length > 0 && (
                        <div className="relative mb-3">
                          <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-700 pointer-events-none"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                          >
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                          </svg>
                          <input
                            type="text"
                            value={reviewSearch}
                            onChange={(e) => setReviewSearch(e.target.value)}
                            placeholder="Search reviews for crowds, kids, food, wait times…"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-[12px] text-gray-700 placeholder:text-gray-700 outline-none focus:border-gray-300 focus:bg-gray-100 transition-all"
                          />
                          {reviewSearch && (
                            <button
                              onClick={() => setReviewSearch("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-600 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}

                      {/* No results after filtering */}
                      {allReviews.length > 0 && shownReviews.length === 0 && (
                        <p className="text-[12px] text-gray-700 italic py-4 text-center">
                          No reviews match your filter.
                        </p>
                      )}

                      {/* Review cards */}
                      <div className="space-y-3">
                        {shownReviews.map((review, i) => {
                          const stars  = review.rating ?? 0;
                          const author = review.authorAttribution?.displayName ?? "Google Reviewer";
                          const initial = author.charAt(0).toUpperCase();
                          const text   = review.text?.text;
                          const link   = review.authorAttribution?.uri ?? review.googleMapsUri;

                          return (
                            <div
                              key={review.name ?? i}
                              className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                            >
                              {/* Author + meta row */}
                              <div className="flex items-start gap-3 mb-3">
                                {/* Avatar initial */}
                                <div className="w-8 h-8 rounded-full bg-teal-100 border border-teal-500/30 flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-teal-600">
                                  {initial}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[12px] font-semibold text-gray-700 truncate">{author}</span>
                                    {review.relativePublishTimeDescription && (
                                      <span className="text-[10px] text-gray-700 flex-shrink-0">
                                        {review.relativePublishTimeDescription}
                                      </span>
                                    )}
                                  </div>
                                  {/* Star row */}
                                  <div className="flex items-center gap-0.5 mt-1">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <svg
                                        key={s}
                                        className={`w-3 h-3 ${s <= stars ? "text-amber-400" : "text-gray-700"}`}
                                        viewBox="0 0 24 24" fill="currentColor"
                                      >
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                      </svg>
                                    ))}
                                  </div>
                                </div>
                                {/* View on Google */}
                                {link && (
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 text-[10px] text-gray-700 hover:text-blue-600 transition-colors whitespace-nowrap"
                                  >
                                    View on Google ↗
                                  </a>
                                )}
                              </div>

                              {/* Review text */}
                              <p className="text-[12px] text-gray-600 leading-relaxed">
                                {text && text.trim()
                                  ? text
                                  : "Review text is not available from Google for this place."}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Attribution */}
                      {allReviews.length > 0 && (
                        <p className="text-[10px] text-gray-700 mt-3 text-center leading-relaxed">
                          Reviews from Google · up to 5 returned by the Places API
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          </div>
        </div>

        {/* ── Sticky footer CTAs ── */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50/95 backdrop-blur-sm">
          <div className="flex gap-2">
            {googleMapsUri ? (
              <a
                href={googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-3 rounded-xl text-sm font-bold text-ink bg-lantern-mint hover:bg-lantern-mint/90 transition-colors shadow-md"
              >
                Open in Google Maps →
              </a>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all"
              >
                Close
              </button>
            )}
            {websiteUri && (
              <a
                href={websiteUri}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-3 rounded-xl text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-all"
              >
                Visit Website →
              </a>
            )}
          </div>
        </div>

      </div>
    </>
  );
}

// ── Category Filter Strip ─────────────────────────────────────────────────────

function CategoryFilter({
  active,
  onChange,
  counts,
  savedCount,
}: {
  active: FilterId;
  onChange: (id: FilterId) => void;
  counts: Partial<Record<FilterId, number>>;
  savedCount: number;
}) {
  const visibleFilters = savedCount > 0 ? FILTERS : FILTERS.filter((f) => f.id !== "saved");

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
      style={{ scrollbarWidth: "none" } as React.CSSProperties}
    >
      {visibleFilters.map((f) => {
        const isActive = f.id === active;
        const count    = f.id === "saved" ? savedCount : (counts[f.id] ?? 0);
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className={`flex items-center gap-1.5 flex-shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold border transition-all duration-200 whitespace-nowrap ${
              isActive
                ? "bg-teal-500 text-white border-teal-500 shadow-sm"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-teal-200 hover:text-teal-700"
            }`}
          >
            {f.icon && <span className="leading-none">{f.icon}</span>}
            {f.label}
            {f.id !== "all" && count > 0 && (
              <span
                className={`text-[10px] rounded-full px-1.5 py-0.5 leading-none tabular-nums ${
                  isActive ? "bg-gray-200 text-gray-900" : "bg-gray-50 text-gray-700"
                }`}
              >
                {count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Destination Search (with Places Autocomplete) ─────────────────────────────

interface AutocompleteSuggestionItem {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

function DestinationSearch({
  value,
  onChange,
  onSearch,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (v?: string) => void;
  loading: boolean;
}) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionItem[]>([]);
  const [open, setOpen]               = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fetching, setFetching]       = useState(false);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                      = useRef<HTMLInputElement>(null);
  const listRef                       = useRef<HTMLUListElement>(null);

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
        const data = await res.json() as { suggestions: AutocompleteSuggestionItem[] };
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions?.length ?? 0) > 0);
        setActiveIndex(-1);
      } catch { /* silently ignore */ }
      finally { setFetching(false); }
    }, 300);
  }

  function selectSuggestion(s: AutocompleteSuggestionItem) {
    onChange(s.text);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    onSearch(s.text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "Enter") onSearch();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        selectSuggestion(suggestions[activeIndex]);
      } else {
        setOpen(false);
        onSearch();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2">
      <div className="flex items-center gap-2">

        {/* Input area */}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-3 px-3 py-2">
            <IconPin className="w-4 h-4 text-gray-700 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                fetchSuggestions(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
              onBlur={() => {
                // small delay so click on suggestion registers first
                setTimeout(() => setOpen(false), 150);
              }}
              placeholder="City, region, or country…"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-700 outline-none"
            />
            {fetching && (
              <svg className="w-3.5 h-3.5 text-gray-700 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
            )}
            {!fetching && value && (
              <button
                onMouseDown={(e) => { e.preventDefault(); onChange(""); setSuggestions([]); setOpen(false); inputRef.current?.focus(); }}
                className="text-gray-700 hover:text-gray-700 transition-colors flex-shrink-0 text-base leading-none"
              >×</button>
            )}
          </div>

          {/* Dropdown */}
          {open && suggestions.length > 0 && (
            <ul
              ref={listRef}
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-gray-200 bg-gray-50 shadow-xl overflow-hidden"
            >
              {suggestions.map((s, i) => (
                <li key={s.placeId || i}>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                      i === activeIndex
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <IconPin className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" />
                    <span className="min-w-0 truncate">
                      <span className="text-sm font-medium text-gray-900">{s.mainText}</span>
                      {s.secondaryText && (
                        <span className="text-xs text-gray-700 ml-1.5">{s.secondaryText}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* CTA */}
        <div className="flex-shrink-0">
          <button
            onClick={() => onSearch()}
            disabled={loading}
            className="flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-gradient-to-r from-lantern-violet to-lantern-blue text-sm font-bold text-gray-900 transition-all duration-200 hover:opacity-90 active:scale-[0.98] whitespace-nowrap shadow-[0_4px_20px_rgba(119,167,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                Searching…
              </>
            ) : (
              <>
                <IconSearch className="w-4 h-4" />
                Find Activities
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Empty / Error states ──────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterId }) {
  if (filter === "saved") {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🤍</div>
        <h3 className="text-base font-bold text-gray-700 mb-2">No saved places yet</h3>
        <p className="text-[13px] text-gray-700 max-w-xs mb-2">
          Tap the ♥ on any activity to save it. Saved places stay here on this browser — no account needed.
        </p>
      </div>
    );
  }
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h3 className="text-base font-bold text-gray-700 mb-2">No activities found</h3>
      <p className="text-[13px] text-gray-700">
        {filter === "free"
          ? "No free activities available for this destination."
          : filter === "browse_all"
          ? "No activities have been loaded yet."
          : `No ${FILTERS.find((f) => f.id === filter)?.label ?? filter} activities in the results.`}
      </p>
    </div>
  );
}

function EmptySearchState({
  query,
  activeFilter,
  onClearFilter,
}: {
  query: string;
  activeFilter: FilterId;
  onClearFilter: () => void;
}) {
  const isFiltered = activeFilter !== "all" && activeFilter !== "browse_all" && activeFilter !== "saved";
  const filterLabel = FILTERS.find((f) => f.id === activeFilter)?.label ?? String(activeFilter);
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h3 className="text-base font-bold text-gray-700 mb-2">
        {isFiltered ? `No "${query}" results in ${filterLabel}` : `No results for "${query}"`}
      </h3>
      <p className="text-[13px] text-gray-700 mb-4">
        {isFiltered
          ? "This search term might match a different category."
          : "Try a different search term or browse by category."}
      </p>
      {isFiltered && (
        <button
          onClick={onClearFilter}
          className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-700 transition-all"
        >
          Search all categories
        </button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h3 className="text-base font-bold text-gray-700 mb-2">Something went wrong</h3>
      <p className="text-[13px] text-gray-700 mb-5 max-w-xs">{message}</p>
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-700 transition-all"
      >
        Try again
      </button>
    </div>
  );
}

// ── Featured curation ─────────────────────────────────────────────────────────
// Featured is NOT the top-N by review score — it's a curated blend that
// prioritises landmarks, culture, and experiences over restaurants.

const FEATURED_CAT_WEIGHT: Partial<Record<Category, number>> = {
  culture:     4.5,
  adventure:   4.0,
  nature:      3.0,
  luxury:      2.5,
  hidden_gems: 2.5,
  nightlife:   1.5,
  food:        0.25, // food lives in the Food tab; keep Featured landmark-first
};

// Extra multiplier for tags that signal iconic attractions / destinations
const FEATURED_TAG_WEIGHT: Record<string, number> = {
  "Observation Deck": 2.0,
  "Theme Park":       2.0,
  "Sightseeing":      1.9,  // tourist_attraction type places
  "Temple":           1.8,
  "Shrine":           1.7,
  "Museum":           1.6,
  "Historical Site":  1.5,
  "Landmark":         1.5,
  "Art Gallery":      1.4,
  "Aquarium":         1.4,
  "Botanical Garden": 1.4,
  "Guided Tour":      1.3,
  "Zoo":              1.3,
  "Views":            1.3,
  "Garden":           1.3,
  "Market":           1.2,
  "Beach":            1.2,
  "Park":             1.2,
};

// Hard cap on food slots in Featured
const MAX_FOOD_IN_FEATURED = 5;

function buildFeatured(activities: Activity[], count: number): Activity[] {
  const scored = activities.map((a) => {
    const base = a.rating * Math.log1p(a.reviewCount);
    const catW = FEATURED_CAT_WEIGHT[a.category] ?? 1.0;
    let tagW = 1.0;
    for (const tag of a.tags) {
      const w = FEATURED_TAG_WEIGHT[tag] ?? 0;
      if (w > tagW) tagW = w;
    }
    return { activity: a, score: base * catW * tagW };
  });

  scored.sort((a, b) => b.score - a.score);

  const maxFood = MAX_FOOD_IN_FEATURED;
  const result: Activity[] = [];
  let foodCount = 0;

  for (const { activity } of scored) {
    if (result.length >= count) break;
    if (activity.category === "food") {
      if (foodCount >= maxFood) continue;
      foodCount++;
    }
    result.push(activity);
  }

  return result;
}

// ── Activity search ───────────────────────────────────────────────────────────

const CURATED_COUNT = 30;

function sortByRelevance(activities: Activity[], query: string): Activity[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return activities;

  const scored = activities.map((a) => {
    const title   = a.title.toLowerCase();
    const tags    = a.tags.join(" ").toLowerCase();
    const cat     = a.category.replace(/_/g, " ").toLowerCase();
    const badges  = a.badges.join(" ").replace(/_/g, " ").toLowerCase();
    const desc    = (a.description + " " + (a.whyVisit ?? "") + " " + a.neighborhood).toLowerCase();
    // querySources: "ramen restaurant", "sushi restaurant", "tourist attraction", etc.
    // A place found via "ramen restaurant" query matches search token "ramen" even if its
    // display name is in Japanese.
    const sources = (a.querySources ?? []).join(" ").toLowerCase();

    let score = 0;
    for (const token of tokens) {
      // Title: strongest signal
      if (title === token)                    score += 20;
      else if (title.startsWith(token + " ")) score += 12;
      else if (title.includes(token))         score += 8;
      // Tags (type-derived: "Ramen", "Sushi", "Rooftop Bar", etc.)
      if (tags.split(/\s+/).some((t) => t === token)) score += 12;
      else if (tags.includes(token))          score += 7;
      // Query source: "ramen restaurant" query → place matches token "ramen"
      if (sources.split(/\s+/).some((t) => t === token)) score += 10;
      else if (sources.includes(token))       score += 6;
      // Category / badge
      if (cat.includes(token))                score += 5;
      if (badges.includes(token))             score += 5;
      // Description / whyVisit / neighborhood
      if (desc.includes(token))               score += 2;
    }

    return { activity: a, score };
  });

  const matched = scored.filter(({ score }) => score > 0);
  matched.sort((a, b) => b.score - a.score);
  const results = matched.map(({ activity }) => activity);

  // Debug log — visible in browser console
  const searchQuery   = query;
  const totalPlaces   = activities.length;
  const matchedPlaces = results.length;
  const firstTenMatches = results.slice(0, 10).map((a) => ({
    title: a.title, category: a.category, tags: a.tags, querySources: a.querySources,
  }));
  console.log({ searchQuery, totalPlaces, matchedPlaces, firstTenMatches });

  return results;
}

function ActivitySearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus-within:border-teal-400 transition-colors">
      <IconSearch className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search sushi, ramen, temple, rooftop bar, anime…"
        className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-700 outline-none"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="text-gray-700 hover:text-gray-700 transition-colors text-base leading-none px-1"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Saved bar (sticky bottom, only when saves exist) ─────────────────────────

function SavedBar({
  count,
  onPlanItinerary,
}: {
  count: number;
  onPlanItinerary: () => void;
}) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-14 gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <IconHeart filled className="w-4 h-4 text-red-400" />
          <span>
            <span className="font-semibold text-gray-700 tabular-nums">{count}</span>
            {" "}{count === 1 ? "place" : "places"} saved on this device
          </span>
        </div>
        <button
          onClick={onPlanItinerary}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-lantern-mint text-ink text-[12px] font-semibold hover:bg-lantern-mint/90 transition-all duration-200 active:scale-[0.97] shadow-md"
        >
          Plan from saved
          <span className="text-gray-700">→</span>
        </button>
      </div>
    </div>
  );
}

// ── Itinerary placeholder modal ───────────────────────────────────────────────

function ItineraryModal({
  savedActivities,
  onClose,
}: {
  savedActivities: Activity[];
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-1">Plan your itinerary</h2>
            <p className="text-[12px] text-gray-700">
              {savedActivities.length} {savedActivities.length === 1 ? "place" : "places"} saved on this device
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700 hover:text-gray-700 hover:bg-gray-100 transition-all text-sm"
          >
            ×
          </button>
        </div>

        {/* Saved list */}
        {savedActivities.length > 0 && (
          <ul className="px-5 py-3 space-y-2 max-h-52 overflow-y-auto">
            {savedActivities.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 text-[12px]">
                <span className="text-lg leading-none flex-shrink-0">{a.emoji}</span>
                <div className="min-w-0">
                  <p className="text-gray-700 font-medium truncate">{a.title}</p>
                  <p className="text-gray-700 truncate">{a.neighborhood} · {a.duration}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Coming soon callout */}
        <div className="mx-5 mb-5 mt-2 rounded-xl border border-teal-500/25 bg-teal-600/8 px-4 py-3.5">
          <p className="text-[12px] text-teal-600 font-medium mb-1">Coming next</p>
          <p className="text-[12px] text-gray-700 leading-relaxed">
            We&apos;ll turn your saved activities into a day-by-day plan — with travel times,
            opening hours, and neighbourhood grouping built in.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface SearchResult {
  activities: Activity[];
  city: string;
  country: string;
  source?: string;
  inventoryStatus?: "building" | "ready";
  inventorySize?: number;
  inventoryProgress?: { completed: number; total: number };
  _debug?: {
    cacheSource:   string;
    apiCallsMade:  number;
    entriesLoaded: number;
  };
}

export default function ActivitySearch() {
  const [destination,        setDestination]        = useState("Tokyo, Japan");
  const [activityQuery,      setActivityQuery]      = useState("");
  const [activeFilter,       setActiveFilter]       = useState<FilterId>("all");
  const [activeSubTag,       setActiveSubTag]       = useState<string | null>(null);
  const [savedIds,           setSavedIds]           = useState<Set<string>>(new Set());
  const [savedMeta,          setSavedMeta]          = useState<Record<string, { title: string; category: string; neighborhood: string; duration: string; rating: number; photoRef?: string; lat?: number; lng?: number; city?: string }>>({});
  const [tripCities,         setTripCities]         = useState<string[]>([]); // city stops from itinerary
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [result,             setResult]             = useState<SearchResult | null>(null);

  // ── Detail modal state ──
  const [modalActivity,      setModalActivity]      = useState<Activity | null>(null);
  const [modalDetail,        setModalDetail]        = useState<PlaceDetail | null>(null);
  const [modalLoading,       setModalLoading]       = useState(false);
  const [modalInsights,      setModalInsights]      = useState<ReviewInsights | null>(null);
  const [modalInsightsLoading, setModalInsightsLoading] = useState(false);
  const detailsCache  = useRef(new Map<string, PlaceDetail>());
  const insightsCache = useRef(new Map<string, ReviewInsights | null>());

  // Mount — load saved activities, preload session cache, prefill from trip store
  useEffect(() => {
    // 1. Restore saved activities from localStorage
    try {
      const stored = localStorage.getItem("travelgrab:saved-activities");
      if (stored) setSavedIds(new Set(JSON.parse(stored) as string[]));
      const storedMeta = localStorage.getItem("travelgrab:saved-activities-data");
      if (storedMeta) setSavedMeta(JSON.parse(storedMeta));
    } catch { /* ignore */ }

    // 2. Preload per-city session cache into in-memory map (instant on revisit)
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith("tg_act_")) {
          const raw = sessionStorage.getItem(k);
          if (raw) clientCache.current.set(k.slice(7), JSON.parse(raw) as SearchResult);
        }
      }
    } catch { /* ignore */ }

    // 3. Prefill destination from trip store, show city chips for multi-city itineraries
    let initialDest = "Tokyo, Japan";
    try {
      const trip = readTripStore();
      if (trip?.cityStops.length) {
        const cities = trip.cityStops.map((c) => c.city).filter(Boolean);
        if (cities.length > 1) setTripCities(cities);
        if (cities[0]) {
          initialDest = cities[0];
          setDestination(cities[0]);
        }
      }
    } catch { /* ignore */ }

    void fetchActivities(initialDest);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const arr = [...savedIds];
      localStorage.setItem("travelgrab:saved-activities", JSON.stringify(arr));
      updateTripStore({ savedActivities: arr });
    } catch { /* ignore quota errors */ }
  }, [savedIds]);

  useEffect(() => {
    try {
      localStorage.setItem("travelgrab:saved-activities-data", JSON.stringify(savedMeta));
    } catch { /* ignore quota errors */ }
  }, [savedMeta]);

  // Client-side cache keyed by lowercased destination — cleared when inventory finishes building
  const clientCache = useRef(new Map<string, SearchResult>());
  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivities = useCallback(async (dest: string, skipCache = false) => {
    const key = dest.trim().toLowerCase();
    if (!skipCache) {
      // 1. In-memory (fastest — same session, survives re-renders)
      const mem = clientCache.current.get(key);
      if (mem) {
        setResult(mem);
        setError(null);
        return;
      }
      // 2. localStorage (survives page reloads and cold Vercel starts, 24h TTL)
      const persisted = lsGetDestination(key);
      if (persisted) {
        console.log(`[activities] ls cache hit: ${key}`);
        const r = persisted as SearchResult;
        clientCache.current.set(key, r);
        setResult(r);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    if (!skipCache) setActivityQuery(""); // clear activity search when switching destinations

    try {
      // 4. Supabase database — fast query, zero Google API cost
      if (supabase) {
        const cityName = dest.split(",")[0].trim();
        const { data: rows, error: sbError } = await supabase
          .from("activities")
          .select("*")
          .ilike("city", cityName)
          .limit(200)
          .order("title", { ascending: true });

        if (sbError) {
          console.warn("[activities] Supabase query failed:", sbError.message);
        } else if (rows && rows.length > 0) {
          const activities = (rows as SupabaseRow[]).map(rowToActivity);
          const r: SearchResult = {
            activities,
            city:            cityName,
            country:         dest.includes(",") ? dest.split(",").slice(1).join(",").trim() : "",
            source:          "supabase",
            inventoryStatus: "ready",
            inventorySize:   activities.length,
          };
          clientCache.current.set(key, r);
          lsSetDestination(key, r);
          setResult(r);
          setError(null);
          return; // finally { setLoading(false) } handles cleanup
        }
        // No rows → fall through to Google Places API
      }

      // 5. Google Places API
      const res  = await fetchWithAuth(`/api/activities/search?destination=${encodeURIComponent(dest.trim())}`);
      const data = await res.json() as {
        activities?: Activity[]; city?: string; country?: string; source?: string; error?: string;
        limitReached?: boolean;
        inventoryStatus?: "building" | "ready"; inventorySize?: number;
        inventoryProgress?: { completed: number; total: number };
        _debug?: { cacheSource: string; apiCallsMade: number; entriesLoaded: number };
      };

      if (res.status === 429 && data.limitReached) throw new Error(data.error ?? "Daily limit reached. Resets at midnight UTC.");
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.activities?.length) throw new Error("No activities found for this destination.");

      const r: SearchResult = {
        activities:        data.activities,
        city:              data.city    ?? dest.split(",")[0].trim(),
        country:           data.country ?? dest.split(",").pop()?.trim() ?? "",
        source:            data.source,
        inventoryStatus:   data.inventoryStatus,
        inventorySize:     data.inventorySize,
        inventoryProgress: data.inventoryProgress,
        _debug:            data._debug,
      };

      clientCache.current.set(key, r);
      setResult(r);
      // Persist so revisiting the page (or a cold server start) shows results instantly
      if (r.inventoryStatus !== "building") {
        try { sessionStorage.setItem(`tg_act_${key}`, JSON.stringify(r)); } catch { /* quota */ }
        lsSetDestination(key, r); // localStorage: survives session + cold Vercel starts
        console.log(`[activities] ls cache set: ${key}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll inventory status while it's building; refresh once it's ready
  useEffect(() => {
    if (result?.inventoryStatus !== "building") {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }

    const cityKey = result.city.toLowerCase();
    pollingRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/activities/inventory/status?city=${encodeURIComponent(cityKey)}`);
        if (!res.ok) return;
        const data = await res.json() as { status: string; count: number };

        if (data.status === "ready") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          // Clear stale cache entry and re-fetch the full inventory
          clientCache.current.delete(destination.trim().toLowerCase());
          void fetchActivities(destination, true);
        } else {
          // Update the live count without re-fetching all activities
          setResult((prev) => prev ? { ...prev, inventorySize: data.count } : prev);
        }
      } catch { /* ignore network errors during polling */ }
    }, 3000);

    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [result?.inventoryStatus, result?.city, destination, fetchActivities]);

  function handleSearch(overrideValue?: string) {
    const dest = (overrideValue ?? destination).trim();
    if (dest) fetchActivities(dest);
  }

  function toggleSave(activity: Activity) {
    const id = activity.id;
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0 && activeFilter === "saved") setActiveFilter("all");
        setSavedMeta((m) => { const u = { ...m }; delete u[id]; return u; });
      } else {
        next.add(id);
        setSavedMeta((m) => ({
          ...m,
          [id]: {
            title:        activity.title,
            category:     activity.category,
            neighborhood: activity.neighborhood,
            duration:     activity.duration,
            rating:       activity.rating,
            photoRef:     activity.photoRef,
            lat:          activity.lat,
            lng:          activity.lng,
            city:         destination,  // current search city — used for multi-city itinerary assignment
          },
        }));
      }
      return next;
    });
  }

  async function fetchInsights(placeId: string, detail: PlaceDetail, activity: Activity) {
    // Cache hit (including null = "tried, no result")
    if (insightsCache.current.has(placeId)) {
      setModalInsights(insightsCache.current.get(placeId) ?? null);
      return;
    }

    const reviews = (detail.reviews ?? [])
      .filter((r) => r.text?.text)
      .map((r) => ({ text: r.text!.text, rating: r.rating ?? 0 }));

    if (reviews.length === 0) {
      insightsCache.current.set(placeId, null);
      setModalInsights(null);
      return;
    }

    setModalInsightsLoading(true);
    try {
      const res = await fetch("/api/activities/review-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          placeName: detail.displayName?.text ?? activity.title,
          category:  activity.category,
          reviews,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ReviewInsights;
      insightsCache.current.set(placeId, data);
      setModalInsights(data);
    } catch (err) {
      console.warn("[review-insights] fetch failed:", err instanceof Error ? err.message : String(err));
      insightsCache.current.set(placeId, null);
      setModalInsights(null);
    } finally {
      setModalInsightsLoading(false);
    }
  }

  async function openDetails(activity: Activity) {
    setModalActivity(activity);
    setModalDetail(null);
    setModalInsights(null);
    setModalInsightsLoading(false);

    const placeId = activity.placeId;
    if (!placeId) return; // show modal with card data only

    // Load from detail cache or fetch
    const cached = detailsCache.current.get(placeId);
    if (cached) {
      setModalDetail(cached);
      // Insights may already be cached too
      void fetchInsights(placeId, cached, activity);
      return;
    }

    setModalLoading(true);
    try {
      const res  = await fetch(`/api/activities/place?id=${encodeURIComponent(placeId)}`);
      if (!res.ok) throw new Error("Failed to load place details");
      const data = await res.json() as PlaceDetail;
      detailsCache.current.set(placeId, data);
      setModalDetail(data);
      // Fetch insights concurrently once we have the reviews
      void fetchInsights(placeId, data, activity);
    } catch {
      // Non-fatal: modal still shows with card-level data
      setModalDetail(null);
    } finally {
      setModalLoading(false);
    }
  }

  function closeDetails() {
    setModalActivity(null);
    setModalDetail(null);
    setModalLoading(false);
    setModalInsights(null);
    setModalInsightsLoading(false);
  }

  const isSearching  = activityQuery.trim().length > 0;
  const isFeatured   = activeFilter === "all" && !isSearching;

  // Reset sub-tag when category filter changes
  useEffect(() => { setActiveSubTag(null); }, [activeFilter]);

  // Two datasets — fullDataset is the source of truth for counts and browsing
  const fullDataset  = useMemo(() => result?.activities ?? [], [result?.activities]);
  // Featured uses a curated ranking (landmark/culture bias + food cap) rather than
  // raw review-score order, which would be dominated by high-volume restaurants.
  const featured     = useMemo(() => buildFeatured(fullDataset, CURATED_COUNT), [fullDataset]);

  // Category counts ALWAYS from full dataset (not just the top 30)
  const counts = useMemo((): Partial<Record<FilterId, number>> => {
    const c: Partial<Record<FilterId, number>> = {};
    for (const a of fullDataset) {
      c[a.category] = (c[a.category] ?? 0) + 1;
      if (a.isFree) c.free = (c.free ?? 0) + 1;
      if (savedIds.has(a.id)) c.saved = (c.saved ?? 0) + 1;
    }
    if (fullDataset.length > 0) c.browse_all = fullDataset.length;
    // Also count saves from other destinations (not in current fullDataset)
    if (savedIds.size > 0 && !c.saved) c.saved = 0;
    return c;
  }, [fullDataset, savedIds]);

  // Sub-tag counts within the current category view (for the chip strip)
  const subTagCounts = useMemo((): Map<string, number> => {
    if (activeFilter === "all" || activeFilter === "browse_all" || isSearching) return new Map();
    let base: Activity[];
    if (activeFilter === "free")        base = fullDataset.filter((a) => a.isFree);
    else if (activeFilter === "saved")  base = fullDataset.filter((a) => savedIds.has(a.id));
    else if (activeFilter in CATEGORY_LABEL) base = fullDataset.filter((a) => a.category === activeFilter);
    else base = [];
    const map = new Map<string, number>();
    for (const a of base) {
      for (const tag of a.tags) map.set(tag, (map.get(tag) ?? 0) + 1);
    }
    return map;
  }, [activeFilter, fullDataset, isSearching, savedIds]);

  // Full view before pagination — five modes:
  //   featured    → top 30, no pagination
  //   saved       → only saved activities (from current dataset)
  //   browse_all  → entire fullDataset, paginated
  //   category    → all in that category from fullDataset, paginated (+ optional sub-tag)
  //   search      → relevance-ranked from fullDataset (+ optional category filter), paginated
  const viewBase = useMemo(() => {
    if (isSearching) {
      let base = fullDataset;
      if (activeFilter !== "all" && activeFilter !== "browse_all") {
        if (activeFilter === "free")         base = base.filter((a) => a.isFree);
        else if (activeFilter === "saved")   base = base.filter((a) => savedIds.has(a.id));
        else if (activeFilter in CATEGORY_LABEL) base = base.filter((a) => a.category === activeFilter);
      }
      return sortByRelevance(base, activityQuery.trim());
    }
    if (activeFilter === "all")        return featured;
    if (activeFilter === "saved")      return fullDataset.filter((a) => savedIds.has(a.id));
    if (activeFilter === "browse_all") {
      return activeSubTag ? fullDataset.filter((a) => a.tags.some((t) => t === activeSubTag)) : fullDataset;
    }
    let base: Activity[];
    if (activeFilter === "free") base = fullDataset.filter((a) => a.isFree);
    else base = fullDataset.filter((a) => a.category === activeFilter);
    return activeSubTag ? base.filter((a) => a.tags.some((t) => t === activeSubTag)) : base;
  }, [isSearching, activeFilter, activityQuery, fullDataset, featured, activeSubTag, savedIds]);

  // Pagination — reset page whenever the view changes
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [viewBase]);

  const PAGE_SIZE = 24;
  const displayed = viewBase.slice(0, page * PAGE_SIZE);
  const hasMore   = displayed.length < viewBase.length;

  const city    = result?.city    ?? destination.split(",")[0].trim();
  const country = result?.country ?? destination.split(",").pop()?.trim() ?? "";

  // All saved activities from the current dataset (for modal list + sticky bar)
  const savedActivities = useMemo(
    () => fullDataset.filter((a) => savedIds.has(a.id)),
    [fullDataset, savedIds],
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── Nav ── */}
      <nav className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/travelgrab-logo.svg" alt="TravelGrab" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-sm font-bold tracking-tight text-gray-800">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-gray-100" />
          <Link href="/flights"    className="text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors">Flights</Link>
          <Link href="/hotels"     className="text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors">Hotels</Link>
          <span                    className="text-sm font-semibold text-teal-600">Activities</span>
          <Link href="/itinerary"  className="text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors">Itinerary</Link>
          {savedIds.size > 0 && (
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-700">
              <IconHeart filled className="w-3 h-3 text-red-400" />
              {savedIds.size} saved
            </div>
          )}
        </div>
      </nav>

      <main className={`mx-auto max-w-6xl px-4 sm:px-6 ${savedIds.size > 0 ? "pb-28" : "pb-16"}`}>

        {/* ── Hero ── */}
        <div className="pt-12 pb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-[11px] font-semibold text-gray-700 mb-5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              loading ? "bg-amber-400 animate-pulse" :
              result?.inventoryStatus === "building" ? "bg-amber-400 animate-pulse" :
              "bg-lantern-mint animate-pulse"
            }`} />
            {loading
              ? "Indexing city…"
              : result?.inventoryStatus === "building"
                ? `Indexing ${city} — ${(result.inventorySize ?? 0).toLocaleString()} places found so far…`
                : result
                  ? `${(result.inventorySize ?? result.activities.length).toLocaleString()} places indexed in ${city}`
                  : "Discover experiences"}
            {process.env.NODE_ENV !== "production" && result?._debug && (
              <span className="font-mono text-[9px] text-amber-400/70 ml-2">
                {result._debug.apiCallsMade === 0
                  ? `💾 ${result._debug.cacheSource}`
                  : `⚡ ${result._debug.apiCallsMade} API calls`}
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight leading-tight mb-3">
            Discover the best of{" "}
            <span className="bg-gradient-to-r from-lantern-violet via-lantern-blue to-lantern-mint bg-clip-text text-transparent">
              {city}{country ? `, ${country}` : ""}
            </span>
          </h1>
          <p className="text-gray-700 text-base max-w-md mx-auto">
            Hand-picked experiences across food, culture, nightlife, adventure, and more.
          </p>
        </div>

        <UsageBanner feature="activities" />

        {/* ── Trip city chips (shown when itinerary has 2+ stops) ── */}
        {tripCities.length > 1 && (
          <div className="mb-3">
            <p className="text-[11px] text-gray-700 mb-2 font-medium">Browse by city</p>
            <div
              className="flex gap-2 overflow-x-auto pb-0.5"
              style={{ scrollbarWidth: "none" } as React.CSSProperties}
            >
              {tripCities.map((city) => {
                const cityShort = city.split(",")[0].trim();
                const isActive = destination.split(",")[0].trim().toLowerCase() === cityShort.toLowerCase();
                return (
                  <button
                    key={city}
                    onClick={() => { setDestination(city); void fetchActivities(city); }}
                    className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold border transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-teal-50 border-teal-300 text-teal-600"
                        : "bg-gray-50 border-gray-200 text-gray-700 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {cityShort}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Destination search bar ── */}
        <div className="mb-3 relative">
          <DestinationSearch
            value={destination}
            onChange={setDestination}
            onSearch={handleSearch}
            loading={loading}
          />
        </div>

        {/* ── Activity search ── */}
        <div className="mb-6">
          <ActivitySearchInput value={activityQuery} onChange={setActivityQuery} />
        </div>

        {/* ── Category filter strip ── */}
        <div className="mb-4">
          <CategoryFilter
            active={activeFilter}
            onChange={setActiveFilter}
            counts={counts}
            savedCount={savedIds.size}
          />
        </div>

        {/* ── Sub-category chips (within a category, hidden in Featured / search mode) ── */}
        {!isSearching && activeFilter !== "all" && subTagCounts.size > 0 && (
          <div
            className="flex gap-2 overflow-x-auto pb-1 mb-4"
            style={{ scrollbarWidth: "none" } as React.CSSProperties}
          >
            <button
              onClick={() => setActiveSubTag(null)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition-all ${
                activeSubTag === null
                  ? "bg-gray-100 text-gray-900 border-gray-300"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              All
            </button>
            {[...subTagCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 14)
              .map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setActiveSubTag(activeSubTag === tag ? null : tag)}
                  className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition-all whitespace-nowrap ${
                    activeSubTag === tag
                      ? "bg-gray-100 text-gray-900 border-gray-300"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-600"
                  }`}
                >
                  {tag}
                  <span className="ml-1.5 text-[10px] opacity-50 tabular-nums">{count.toLocaleString()}</span>
                </button>
              ))}
          </div>
        )}

        {/* ── Result count ── */}
        {result && !loading && (
          <div className="flex items-center justify-between mb-5">
            <p className="text-[12px] text-gray-700">
              {isSearching
                ? `${viewBase.length.toLocaleString()} ${viewBase.length === 1 ? "result" : "results"} for "${activityQuery}"${city ? ` in ${city}` : ""}`
                : isFeatured
                  ? `${featured.length} featured experiences · ${(result?.inventorySize ?? fullDataset.length).toLocaleString()} total indexed in ${city}${result?.inventoryStatus === "building" ? " (still indexing…)" : ""}`
                  : activeFilter === "saved"
                    ? `${viewBase.length.toLocaleString()} saved on this device${activeSubTag ? ` · "${activeSubTag}"` : ""}`
                    : activeFilter === "browse_all"
                      ? `${fullDataset.length.toLocaleString()} total experiences in ${city}${activeSubTag ? ` · filtered to "${activeSubTag}"` : ""}`
                      : activeSubTag
                        ? `${viewBase.length.toLocaleString()} "${activeSubTag}" experiences in ${city}`
                        : `${viewBase.length.toLocaleString()} ${FILTERS.find((f) => f.id === activeFilter)?.label ?? activeFilter} experience${viewBase.length === 1 ? "" : "s"} found in ${city}`
              }
            </p>
            {savedIds.size > 0 && (
              <p className="text-[11px] text-gray-700 flex items-center gap-1">
                <IconHeart filled className="w-2.5 h-2.5 text-red-400/70" />
                {savedIds.size} saved
              </p>
            )}
          </div>
        )}

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {loading ? (
            Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
          ) : error ? (
            <ErrorState message={error} onRetry={() => fetchActivities(destination)} />
          ) : displayed.length > 0 ? (
            displayed.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                saved={savedIds.has(activity.id)}
                onToggleSave={() => toggleSave(activity)}
                onViewDetails={() => openDetails(activity)}
              />
            ))
          ) : isSearching ? (
            <EmptySearchState
              query={activityQuery}
              activeFilter={activeFilter}
              onClearFilter={() => setActiveFilter("all")}
            />
          ) : (
            <EmptyState filter={activeFilter} />
          )}
        </div>

        {/* ── Load more ── */}
        {!loading && hasMore && (
          <div className="flex flex-col items-center gap-2 mt-10">
            <button
              onClick={() => setPage((p) => p + 1)}
              className="px-8 py-3 rounded-xl bg-gray-100 border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-700 hover:border-gray-300 transition-all duration-200 active:scale-[0.98]"
            >
              Load more · {(viewBase.length - displayed.length).toLocaleString()} remaining
            </button>
          </div>
        )}

      </main>

      {/* ── Detail modal ── */}
      {modalActivity && (
        <ActivityDetailModal
          activity={modalActivity}
          detail={modalDetail}
          loading={modalLoading}
          insights={modalInsights}
          insightsLoading={modalInsightsLoading}
          onClose={closeDetails}
        />
      )}

      {/* ── Sticky saved bar ── */}
      {savedIds.size > 0 && (
        <SavedBar
          count={savedIds.size}
          onPlanItinerary={() => setShowItineraryModal(true)}
        />
      )}

      {/* ── Itinerary placeholder modal ── */}
      {showItineraryModal && (
        <ItineraryModal
          savedActivities={savedActivities}
          onClose={() => setShowItineraryModal(false)}
        />
      )}

    </div>
  );
}

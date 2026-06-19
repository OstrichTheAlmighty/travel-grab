"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Activity, Badge, Category } from "./data/types";

// ── Filter config ─────────────────────────────────────────────────────────────

type FilterId = "all" | Category | "free";

const FILTERS: { id: FilterId; label: string; icon: string }[] = [
  { id: "all",         label: "All",          icon: "" },
  { id: "food",        label: "Food",         icon: "🍜" },
  { id: "nightlife",   label: "Nightlife",    icon: "🌃" },
  { id: "culture",     label: "Culture",      icon: "🎭" },
  { id: "adventure",   label: "Adventure",    icon: "⚡" },
  { id: "nature",      label: "Nature",       icon: "🌿" },
  { id: "luxury",      label: "Luxury",       icon: "✨" },
  { id: "hidden_gems", label: "Hidden Gems",  icon: "💎" },
  { id: "free",        label: "Free",         icon: "🎁" },
];

const BADGE_META: Record<Badge, { label: string; className: string }> = {
  hidden_gem:        { label: "Hidden Gem",        className: "text-lantern-violet bg-lantern-violet/20 border-lantern-violet/40" },
  worth_the_splurge: { label: "Worth the Splurge", className: "text-lantern-gold   bg-lantern-gold/10   border-lantern-gold/30"   },
  family_friendly:   { label: "Family Friendly",   className: "text-lantern-mint   bg-lantern-mint/10   border-lantern-mint/30"   },
  popular:           { label: "Popular",            className: "text-amber-300      bg-amber-500/15      border-amber-500/30"      },
  free:              { label: "Free",               className: "text-lantern-mint   bg-lantern-mint/10   border-lantern-mint/30"   },
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

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconPeople({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
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
    <div className="rounded-2xl border border-white/[0.07] bg-panel overflow-hidden animate-pulse">
      <div className="h-52 bg-white/[0.05]" />
      <div className="p-4 space-y-3">
        <div className="h-2.5 bg-white/[0.06] rounded-full w-1/3" />
        <div className="h-4 bg-white/[0.07] rounded-full w-5/6" />
        <div className="h-3 bg-white/[0.05] rounded-full w-2/3" />
        <div className="space-y-1.5 mt-2">
          <div className="h-2.5 bg-white/[0.04] rounded-full w-full" />
          <div className="h-2.5 bg-white/[0.04] rounded-full w-4/5" />
        </div>
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-14 bg-white/[0.04] rounded-full" />
          <div className="h-5 w-16 bg-white/[0.04] rounded-full" />
          <div className="h-5 w-12 bg-white/[0.04] rounded-full" />
        </div>
        <div className="h-8 bg-white/[0.04] rounded-xl mt-2" />
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

  const heroBadges = activity.badges
    .filter((b) => !(b === "free" && activity.isFree))
    .slice(0, 2);

  const showPhoto = Boolean(activity.photoRef) && !imgFailed;

  return (
    <div className="group flex flex-col rounded-2xl border border-white/[0.08] bg-panel overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.55)] hover:border-white/[0.14]">

      {/* ── Hero ── */}
      <div className="relative h-52 overflow-hidden flex-shrink-0">
        {showPhoto ? (
          // Real photo from Google Places (proxied server-side via /api/activities/photo)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/activities/photo?name=${encodeURIComponent(activity.photoRef!)}`}
            alt={activity.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onError={() => setImgFailed(true)}
          />
        ) : (
          // Gradient + emoji fallback
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: activity.gradient }}
          >
            <span
              className="text-8xl select-none transition-transform duration-500 ease-out group-hover:scale-110"
              style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}
            >
              {activity.emoji}
            </span>
          </div>
        )}

        {/* Bottom fade to panel bg */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-panel/70 to-transparent pointer-events-none z-10" />

        {/* Save button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
          aria-label={saved ? "Remove from saved" : "Save activity"}
          className={`absolute top-3 right-3 z-20 w-9 h-9 rounded-full backdrop-blur-sm border flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 ${
            saved
              ? "bg-white/20 border-white/30"
              : "bg-black/40 border-white/[0.12] hover:bg-black/55"
          }`}
        >
          <IconHeart
            filled={saved}
            className={`w-4 h-4 ${saved ? "text-red-400" : "text-white/70"}`}
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
          <span className="text-[12px] font-bold text-white tabular-nums">
            {activity.rating > 0 ? activity.rating.toFixed(1) : "—"}
          </span>
          {activity.reviewCount > 0 && (
            <span className="text-[11px] text-white/30">
              ({activity.reviewCount >= 1000
                ? `${(activity.reviewCount / 1000).toFixed(0)}k`
                : activity.reviewCount.toLocaleString()})
            </span>
          )}
          <span className="text-white/[0.12] mx-0.5">·</span>
          <span className="text-[11px] text-white/35">{CATEGORY_LABEL[activity.category]}</span>
        </div>

        {/* Title */}
        <h3 className="text-[14px] font-bold text-white leading-snug mb-2 line-clamp-2">
          {activity.title}
        </h3>

        {/* Meta: location · duration · price */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-white/35 mb-3">
          <span className="flex items-center gap-1">
            <IconPin className="w-2.5 h-2.5 flex-shrink-0" />
            {activity.neighborhood}
          </span>
          <span className="text-white/[0.12]">·</span>
          <span className="flex items-center gap-1">
            <IconClock className="w-2.5 h-2.5 flex-shrink-0" />
            {activity.duration}
          </span>
          <span className="text-white/[0.12]">·</span>
          <span className={`font-semibold ${activity.isFree ? "text-lantern-mint/80" : "text-white/60"}`}>
            {activity.price}
          </span>
        </div>

        {/* Description */}
        <p className="text-[12px] text-white/45 leading-relaxed mb-3 line-clamp-3">
          {activity.description}
        </p>

        {/* Tags */}
        {activity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {activity.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-white/30 border border-white/[0.08] bg-white/[0.03] rounded-full px-2 py-0.5 leading-none"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3 border-t border-white/[0.06] space-y-2.5">

          {/* Why visit? */}
          <button
            onClick={() => setShowWhy((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/55 transition-colors"
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
            <p className="text-[12px] text-white/50 leading-relaxed pl-4 border-l-2 border-lantern-violet/30 italic pb-1">
              {activity.whyVisit}
            </p>
          </div>

          {/* View Details → opens in-app detail modal */}
          <button
            onClick={onViewDetails}
            className="w-full h-9 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[12px] font-semibold text-white/50 hover:bg-white/[0.09] hover:text-white/80 hover:border-white/[0.18] transition-all duration-200 active:scale-[0.98]"
          >
            View Details →
          </button>

        </div>
      </div>
    </div>
  );
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

function ActivityDetailModal({
  activity,
  detail,
  loading,
  onClose,
}: {
  activity: Activity;
  detail: PlaceDetail | null;
  loading: boolean;
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
        className="fixed inset-y-0 right-0 z-50 w-full max-w-full lg:max-w-[720px] bg-[#0e0e14] border-l border-white/[0.07] flex flex-col shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        {/* ── Sticky header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0e0e14]/95 backdrop-blur-sm flex-shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Place Details</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20 transition-all"
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
              <div className="relative h-64 sm:h-80 bg-white/[0.03] overflow-hidden">
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
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button
                      onClick={() => setActivePhoto((n) => Math.min(photos.length - 1, n + 1))}
                      disabled={activePhoto === photos.length - 1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </>
                )}
                {/* Photo counter */}
                {photos.length > 1 && (
                  <div className="absolute bottom-3 right-3 bg-black/55 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] text-white/70 font-semibold tabular-nums">
                    {activePhoto + 1} / {photos.length}
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {photos.length > 1 && (
                <div
                  className="flex gap-1.5 px-4 py-2.5 bg-white/[0.015] border-b border-white/[0.05] overflow-x-auto"
                  style={{ scrollbarWidth: "none" } as React.CSSProperties}
                >
                  {photos.slice(0, 10).map((photo, i) => (
                    <button
                      key={photo.name}
                      onClick={() => setActivePhoto(i)}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                        i === activePhoto
                          ? "border-lantern-violet/70 opacity-100"
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 border border-white/[0.1] rounded-full px-2 py-0.5">
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
                  <span className="text-[10px] text-white/20 flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                    Loading details…
                  </span>
                )}
              </div>

              <h2 className="text-xl font-black text-white leading-tight mb-2.5">{name}</h2>

              {/* Rating + reviews + price */}
              <div className="flex items-center gap-2 flex-wrap">
                <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="text-sm font-bold text-white tabular-nums">
                  {rating > 0 ? rating.toFixed(1) : "—"}
                </span>
                {reviewCount > 0 && (
                  <span className="text-[12px] text-white/35">
                    ({reviewCount >= 1000 ? `${Math.round(reviewCount / 1000)}k` : reviewCount.toLocaleString()} reviews)
                  </span>
                )}
                {activity.price !== "Varies" && (
                  <>
                    <span className="text-white/[0.15] mx-0.5">·</span>
                    <span className={`text-[12px] font-semibold ${activity.isFree ? "text-lantern-mint/80" : "text-white/55"}`}>
                      {activity.price}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* ── Address ── */}
            {address && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 flex items-start gap-3">
                <svg className="w-4 h-4 text-white/25 flex-shrink-0 mt-px" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <p className="text-[12px] text-white/50 leading-relaxed">{address}</p>
              </div>
            )}

            {/* ── Editorial summary / About ── */}
            {summary && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">About</div>
                <p className="text-[13px] text-white/60 leading-relaxed">{summary}</p>
              </div>
            )}

            {/* ── Why visit ── */}
            <div className="rounded-xl border border-lantern-violet/20 bg-lantern-violet/[0.04] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-lantern-violet/60 mb-2">Why visit</div>
              <p className="text-[12px] text-white/55 leading-relaxed italic">{activity.whyVisit}</p>
            </div>

            {/* ── Opening hours ── */}
            {hours.length > 0 && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Hours</div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                  <button
                    onClick={() => setShowHours((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className={`text-[12px] font-semibold ${
                      openNow === true  ? "text-emerald-400" :
                      openNow === false ? "text-red-400/70"  : "text-white/50"
                    }`}>
                      {openNow === true ? "Open now" : openNow === false ? "Closed now" : "See weekly hours"}
                      {!showHours && " — tap to expand"}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-white/30 transition-transform flex-shrink-0 ${showHours ? "rotate-180" : ""}`}
                      viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                    >
                      <path d="M2 4l4 4 4-4" />
                    </svg>
                  </button>
                  {showHours && (
                    <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-1.5">
                      {hours.map((day, i) => {
                        const colonIdx = day.indexOf(": ");
                        const dayName  = colonIdx >= 0 ? day.slice(0, colonIdx) : day;
                        const dayHours = colonIdx >= 0 ? day.slice(colonIdx + 2) : "";
                        return (
                          <div key={i} className="flex text-[11px] gap-3">
                            <span className="text-white/30 w-24 flex-shrink-0">{dayName}</span>
                            <span className="text-white/55">{dayHours || "—"}</span>
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
                <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Contact & links</div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.02] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/25" viewBox="0 0 24 24" fill="currentColor">
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
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.02] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
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
                      className="flex items-center gap-3 px-4 py-3 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.02] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/25" viewBox="0 0 24 24" fill="currentColor">
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
              <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Practical Tips</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-white/20 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-white/30 mb-0.5">Estimated visit duration</div>
                    <div className="text-[12px] text-white/60">{activity.duration}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-white/20 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-white/30 mb-0.5">
                      Best time to visit <span className="text-white/15">(typical)</span>
                    </div>
                    <div className="text-[12px] text-white/60">{getBestTime(types)}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-white/20 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-white/30 mb-0.5">
                      Crowd level <span className="text-white/15">(estimated from review volume)</span>
                    </div>
                    <div className="text-[12px] text-white/60">{getCrowdLevel(reviewCount)}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-3.5 h-3.5 text-white/20 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-white/30 mb-0.5">Good for</div>
                    <div className="text-[12px] text-white/60 capitalize">{getGoodFor(activity.badges, types)}</div>
                  </div>
                </div>

              </div>
            </div>

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
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-3">
                    Guest Reviews
                    {allReviews.length > 0 && (
                      <span className="ml-2 font-semibold text-white/15 normal-case tracking-normal">
                        (Google sample · {allReviews.length} shown)
                      </span>
                    )}
                  </div>

                  {detail && !loading && allReviews.length === 0 ? (
                    <p className="text-[12px] text-white/30 italic px-0.5">
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
                                  ? "bg-lantern-violet text-white border-lantern-violet"
                                  : "bg-white/[0.04] text-white/45 border-white/[0.08] hover:bg-white/[0.07] hover:text-white/70"
                              }`}
                            >
                              {chip.label}
                              {chip.count > 0 && (
                                <span className={`ml-1.5 tabular-nums ${reviewFilter === chip.id ? "text-white/70" : "text-white/25"}`}>
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
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 pointer-events-none"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                          >
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                          </svg>
                          <input
                            type="text"
                            value={reviewSearch}
                            onChange={(e) => setReviewSearch(e.target.value)}
                            placeholder="Search reviews for crowds, kids, food, wait times…"
                            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-[12px] text-white/70 placeholder-white/20 outline-none focus:border-white/[0.16] focus:bg-white/[0.05] transition-all"
                          />
                          {reviewSearch && (
                            <button
                              onClick={() => setReviewSearch("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
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
                        <p className="text-[12px] text-white/25 italic py-4 text-center">
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
                              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                            >
                              {/* Author + meta row */}
                              <div className="flex items-start gap-3 mb-3">
                                {/* Avatar initial */}
                                <div className="w-8 h-8 rounded-full bg-lantern-violet/20 border border-lantern-violet/30 flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-lantern-violet/80">
                                  {initial}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[12px] font-semibold text-white/70 truncate">{author}</span>
                                    {review.relativePublishTimeDescription && (
                                      <span className="text-[10px] text-white/25 flex-shrink-0">
                                        {review.relativePublishTimeDescription}
                                      </span>
                                    )}
                                  </div>
                                  {/* Star row */}
                                  <div className="flex items-center gap-0.5 mt-1">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <svg
                                        key={s}
                                        className={`w-3 h-3 ${s <= stars ? "text-amber-400" : "text-white/15"}`}
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
                                    className="flex-shrink-0 text-[10px] text-white/25 hover:text-lantern-blue transition-colors whitespace-nowrap"
                                  >
                                    View on Google ↗
                                  </a>
                                )}
                              </div>

                              {/* Review text */}
                              <p className="text-[12px] text-white/55 leading-relaxed">
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
                        <p className="text-[10px] text-white/15 mt-3 text-center leading-relaxed">
                          Reviews sourced from Google · Sample of up to 5 reviews returned by the Places API
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
        <div className="flex-shrink-0 p-4 border-t border-white/[0.07] bg-[#0e0e14]/95 backdrop-blur-sm">
          <div className="flex gap-2">
            {googleMapsUri ? (
              <a
                href={googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-3 rounded-xl text-sm font-bold text-white bg-lantern-violet hover:bg-lantern-violet/80 transition-colors shadow-[0_0_20px_rgba(139,92,246,0.20)]"
              >
                Open in Google Maps →
              </a>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white/50 bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.09] transition-all"
              >
                Close
              </button>
            )}
            {websiteUri && (
              <a
                href={websiteUri}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-3 rounded-xl text-sm font-semibold text-white/70 bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.09] hover:text-white transition-all"
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
}: {
  active: FilterId;
  onChange: (id: FilterId) => void;
  counts: Partial<Record<FilterId, number>>;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: "none" } as React.CSSProperties}
    >
      {FILTERS.map((f) => {
        const isActive = f.id === active;
        const count    = counts[f.id] ?? 0;
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className={`flex items-center gap-1.5 flex-shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold border transition-all duration-200 whitespace-nowrap ${
              isActive
                ? "bg-lantern-violet text-white border-lantern-violet shadow-[0_0_20px_rgba(167,139,250,0.25)]"
                : "bg-white/[0.04] text-white/50 border-white/[0.09] hover:bg-white/[0.07] hover:text-white/75 hover:border-white/[0.16]"
            }`}
          >
            {f.icon && <span className="leading-none">{f.icon}</span>}
            {f.label}
            {f.id !== "all" && count > 0 && (
              <span
                className={`text-[10px] rounded-full px-1.5 py-0.5 leading-none tabular-nums ${
                  isActive ? "bg-white/20 text-white" : "bg-white/[0.06] text-white/35"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Search Bar ────────────────────────────────────────────────────────────────

function SearchBar({
  destination,
  setDestination,
  onSearch,
  loading,
}: {
  destination: string;
  setDestination: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [travelers, setTravelers] = useState(2);

  return (
    <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-2">
      <div className="flex flex-col lg:flex-row lg:items-center lg:divide-x lg:divide-white/[0.07] gap-2 lg:gap-0">

        {/* Destination */}
        <div className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2 lg:px-3 lg:pr-5 lg:py-1">
          <IconPin className="w-4 h-4 text-white/25 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-0.5">Destination</div>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="City or country"
              className="w-full bg-transparent text-sm text-white placeholder-white/20 outline-none"
            />
          </div>
        </div>

        {/* Check in */}
        <div className="flex items-center gap-3 px-3 py-2 lg:px-5 lg:py-1">
          <IconCalendar className="w-4 h-4 text-white/25 flex-shrink-0" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-0.5">Check in</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-sm text-white/55 outline-none [color-scheme:dark] w-32"
            />
          </div>
        </div>

        {/* Check out */}
        <div className="flex items-center gap-3 px-3 py-2 lg:px-5 lg:py-1">
          <IconCalendar className="w-4 h-4 text-white/25 flex-shrink-0" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-0.5">Check out</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-sm text-white/55 outline-none [color-scheme:dark] w-32"
            />
          </div>
        </div>

        {/* Travelers */}
        <div className="flex items-center gap-3 px-3 py-2 lg:px-5 lg:py-1">
          <IconPeople className="w-4 h-4 text-white/25 flex-shrink-0" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-0.5">Travelers</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTravelers((n) => Math.max(1, n - 1))}
                className="w-5 h-5 rounded-full border border-white/15 flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-colors text-xs font-bold leading-none"
              >−</button>
              <span className="text-sm text-white/65 min-w-[64px]">
                {travelers} {travelers === 1 ? "adult" : "adults"}
              </span>
              <button
                onClick={() => setTravelers((n) => Math.min(20, n + 1))}
                className="w-5 h-5 rounded-full border border-white/15 flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-colors text-xs font-bold leading-none"
              >+</button>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-2 pt-1 pb-2 lg:pt-0 lg:pb-0 lg:pl-3">
          <button
            onClick={onSearch}
            disabled={loading}
            className="w-full lg:w-auto flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-gradient-to-r from-lantern-violet to-lantern-blue text-sm font-bold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98] whitespace-nowrap shadow-[0_4px_20px_rgba(119,167,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
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
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h3 className="text-base font-bold text-white/50 mb-2">No activities found</h3>
      <p className="text-[13px] text-white/25">
        {filter === "free"
          ? "No free activities available for this destination."
          : `No ${FILTERS.find((f) => f.id === filter)?.label ?? filter} activities in the results.`}
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h3 className="text-base font-bold text-white/50 mb-2">Something went wrong</h3>
      <p className="text-[13px] text-white/25 mb-5 max-w-xs">{message}</p>
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm font-semibold text-white/60 hover:bg-white/[0.09] hover:text-white/80 transition-all"
      >
        Try again
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface SearchResult {
  activities: Activity[];
  city: string;
  country: string;
  source?: string;  // "places_api" | "mock" | "mock_fallback" | "cache"
}

export default function ActivitySearch() {
  const [destination,   setDestination]   = useState("Tokyo, Japan");
  const [activeFilter,  setActiveFilter]  = useState<FilterId>("all");
  const [savedIds,      setSavedIds]      = useState<Set<string>>(new Set());
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [result,        setResult]        = useState<SearchResult | null>(null);

  // ── Detail modal state ──
  const [modalActivity,   setModalActivity]   = useState<Activity | null>(null);
  const [modalDetail,     setModalDetail]     = useState<PlaceDetail | null>(null);
  const [modalLoading,    setModalLoading]    = useState(false);
  const detailsCache = useRef(new Map<string, PlaceDetail>());

  // Simple client-side cache so switching back to a searched destination is instant
  const clientCache = useRef(new Map<string, SearchResult>());

  const fetchActivities = useCallback(async (dest: string) => {
    const key = dest.trim().toLowerCase();
    const cached = clientCache.current.get(key);
    if (cached) {
      setResult(cached);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/activities/search?destination=${encodeURIComponent(dest.trim())}`);
      const data = await res.json() as { activities?: Activity[]; city?: string; country?: string; source?: string; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (!data.activities?.length) {
        throw new Error("No activities found for this destination.");
      }

      const r: SearchResult = {
        activities: data.activities,
        city:       data.city    ?? dest.split(",")[0].trim(),
        country:    data.country ?? dest.split(",").pop()?.trim() ?? "",
        source:     data.source,
      };

      clientCache.current.set(key, r);
      setResult(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load default destination on mount
  useEffect(() => {
    fetchActivities("Tokyo, Japan");
  }, [fetchActivities]);

  function handleSearch() {
    const dest = destination.trim();
    if (dest) fetchActivities(dest);
  }

  function toggleSave(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function openDetails(activity: Activity) {
    setModalActivity(activity);
    setModalDetail(null);

    const placeId = activity.placeId;
    if (!placeId) return; // show modal with card data only

    const cached = detailsCache.current.get(placeId);
    if (cached) {
      setModalDetail(cached);
      return;
    }

    setModalLoading(true);
    try {
      const res  = await fetch(`/api/activities/place?id=${encodeURIComponent(placeId)}`);
      if (!res.ok) throw new Error("Failed to load place details");
      const data = await res.json() as PlaceDetail;
      detailsCache.current.set(placeId, data);
      setModalDetail(data);
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
  }

  // Filter activities by active chip
  const filtered = useMemo(() => {
    if (!result) return [];
    const { activities } = result;
    if (activeFilter === "all")  return activities;
    if (activeFilter === "free") return activities.filter((a) => a.isFree);
    return activities.filter((a) => a.category === activeFilter);
  }, [result, activeFilter]);

  // Category counts for chips
  const counts = useMemo((): Partial<Record<FilterId, number>> => {
    if (!result) return {};
    const c: Partial<Record<FilterId, number>> = { all: result.activities.length };
    for (const a of result.activities) {
      c[a.category] = (c[a.category] ?? 0) + 1;
      if (a.isFree) c["free"] = (c["free"] ?? 0) + 1;
    }
    return c;
  }, [result]);

  const city    = result?.city    ?? destination.split(",")[0].trim();
  const country = result?.country ?? destination.split(",").pop()?.trim() ?? "";

  return (
    <div className="min-h-screen bg-ink text-white">

      {/* ── Nav ── */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/travelgrab-logo.svg" alt="TravelGrab" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <Link href="/flights"  className="text-sm font-medium text-white/40 hover:text-white/75 transition-colors">Flights</Link>
          <Link href="/hotels"   className="text-sm font-medium text-white/40 hover:text-white/75 transition-colors">Hotels</Link>
          <span                  className="text-sm font-semibold text-lantern-violet">Activities</span>
          {savedIds.size > 0 && (
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-white/35">
              <IconHeart filled className="w-3 h-3 text-red-400" />
              {savedIds.size} saved
            </div>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pb-16">

        {/* ── Hero ── */}
        <div className="pt-12 pb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-[11px] font-semibold text-white/45 mb-5">
            <span className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-amber-400 animate-pulse" : "bg-lantern-mint animate-pulse"}`} />
            {loading
              ? "Searching…"
              : result
              ? `${result.activities.length} experiences in ${city}`
              : "Discover experiences"}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-3">
            Discover the best of{" "}
            <span className="bg-gradient-to-r from-lantern-violet via-lantern-blue to-lantern-mint bg-clip-text text-transparent">
              {city}{country ? `, ${country}` : ""}
            </span>
          </h1>
          <p className="text-white/35 text-base max-w-md mx-auto">
            Hand-picked experiences across food, culture, nightlife, adventure, and more.
          </p>
        </div>

        {/* ── Search bar ── */}
        <div className="mb-8">
          <SearchBar
            destination={destination}
            setDestination={setDestination}
            onSearch={handleSearch}
            loading={loading}
          />
        </div>

        {/* ── Category filter strip ── */}
        <div className="mb-6">
          <CategoryFilter
            active={activeFilter}
            onChange={setActiveFilter}
            counts={counts}
          />
        </div>

        {/* ── Result count + debug source ── */}
        {result && !loading && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <p className="text-[12px] text-white/30">
                {activeFilter === "all"
                  ? `Showing all ${filtered.length} activities`
                  : `${filtered.length} ${FILTERS.find((f) => f.id === activeFilter)?.label ?? activeFilter} activit${filtered.length === 1 ? "y" : "ies"}`}{" "}
                in {city}
              </p>
              {/* DEBUG: remove once real data is confirmed */}
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                result.source === "places_api" || result.source === "cache"
                  ? "text-green-400 border-green-400/30 bg-green-400/5"
                  : "text-amber-400 border-amber-400/30 bg-amber-400/5"
              }`}>
                {result.source === "places_api" ? "Data source: Google Places"
                  : result.source === "cache" ? "Data source: Google Places (cached)"
                  : result.source === "mock_fallback" ? "Data source: Mock fallback"
                  : result.source === "mock" ? "Data source: Mock (no API key)"
                  : `Data source: ${result.source ?? "unknown"}`}
              </span>
            </div>
            {savedIds.size > 0 && (
              <p className="text-[11px] text-white/20 flex items-center gap-1">
                <IconHeart filled className="w-2.5 h-2.5 text-red-400/70" />
                {savedIds.size} saved
              </p>
            )}
          </div>
        )}

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {loading ? (
            // Skeleton loading state
            Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
          ) : error ? (
            <ErrorState message={error} onRetry={() => fetchActivities(destination)} />
          ) : filtered.length > 0 ? (
            filtered.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                saved={savedIds.has(activity.id)}
                onToggleSave={() => toggleSave(activity.id)}
                onViewDetails={() => openDetails(activity)}
              />
            ))
          ) : (
            <EmptyState filter={activeFilter} />
          )}
        </div>

      </main>

      {/* ── Detail modal ── */}
      {modalActivity && (
        <ActivityDetailModal
          activity={modalActivity}
          detail={modalDetail}
          loading={modalLoading}
          onClose={closeDetails}
        />
      )}

    </div>
  );
}

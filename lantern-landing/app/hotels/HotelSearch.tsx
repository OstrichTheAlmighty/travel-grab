"use client";

import { useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HotelOffer {
  hotel_id: string;
  source: string;
  name: string;
  address: string;
  star_rating: number;
  overall_rating: number;
  review_count: number;
  location_rating: number;
  price_per_night: number;
  total_price: number;
  nights: number;
  currency: string;
  amenities: string[];
  image_url: string;
  booking_url: string;
  check_in: string;
  check_out: string;
  hotel_type: string;
  eco_certified: boolean;
  description: string;
  ai_score: number;
  recommendation_label: string;
  recommendation_why: string;
  nearby_walk: { name: string; minutes: number } | null;
  score_breakdown: {
    price:       number;
    reviews:     number;
    location:    number;
    stars:       number;
    walkability: number;
  };
  neighborhood_fit_score:  number;
  inferred_neighborhood:   string;
  neighborhood_fit_label:  string;
}

type SearchState = "idle" | "loading" | "results" | "error";

// ── Neighborhood preference chips ─────────────────────────────────────────────

const NEIGHBORHOOD_PREFS: { id: string; label: string; icon: string }[] = [
  { id: "first-time",  label: "First-time visitor", icon: "✦" },
  { id: "sightseeing", label: "Best sightseeing",   icon: "🏛" },
  { id: "food",        label: "Food & restaurants", icon: "🍽" },
  { id: "nightlife",   label: "Nightlife",           icon: "🎵" },
  { id: "quiet",       label: "Quiet / relaxed",    icon: "🌿" },
  { id: "luxury",      label: "Luxury",              icon: "✦" },
  { id: "budget",      label: "Budget-friendly",    icon: "✦" },
  { id: "family",      label: "Family-friendly",    icon: "✦" },
  { id: "transit",     label: "Near transit",        icon: "🚇" },
  { id: "walkable",    label: "Walkable area",       icon: "✦" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return "text-lantern-mint";
  if (score >= 55) return "text-lantern-blue";
  return "text-lantern-gold";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/25";
  if (score >= 55) return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/25";
  return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/25";
}

function labelBg(label: string): string {
  if (label === "Best Overall")  return "bg-lantern-violet/20 text-lantern-violet border-lantern-violet/50";
  if (label === "Luxury Pick")   return "bg-amber-500/15 text-amber-300 border-amber-500/35";
  if (label === "Best Location") return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/30";
  if (label === "Budget Pick")   return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/30";
  if (label === "Best Value")    return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/30";
  return "bg-white/10 text-white/60 border-white/15";
}

function fitBg(label: string): string {
  if (label === "Great fit")   return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/30";
  if (label === "Good fit")    return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/25";
  if (label === "Partial fit") return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/25";
  return "";
}

function StarRating({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} className={`w-2.5 h-2.5 ${i <= count ? "fill-current" : "fill-white/10"}`} viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── HotelCard ─────────────────────────────────────────────────────────────────

function HotelCard({
  offer,
  isBestOverall,
  prefsActive,
}: {
  offer: HotelOffer;
  isBestOverall: boolean;
  prefsActive: boolean;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(isBestOverall);

  const breakdownRows = [
    { key: "reviews",     label: "Guest Reviews",   score: offer.score_breakdown.reviews     },
    { key: "location",    label: "Location",         score: offer.score_breakdown.location    },
    { key: "price",       label: "Price / Value",    score: offer.score_breakdown.price       },
    { key: "stars",       label: "Hotel Quality",    score: offer.score_breakdown.stars       },
    { key: "walkability", label: "Walkability",      score: offer.score_breakdown.walkability },
  ].sort((a, b) => b.score - a.score);

  if (prefsActive && offer.neighborhood_fit_score > 0) {
    breakdownRows.push({ key: "nbhd", label: "Neighborhood Fit", score: offer.neighborhood_fit_score });
  }

  function barColor(s: number): string {
    if (s >= 65) return "bg-lantern-mint";
    if (s >= 45) return "bg-white/25";
    return "bg-lantern-gold/70";
  }
  function barText(s: number): string {
    if (s >= 65) return "text-lantern-mint";
    if (s >= 45) return "text-white/50";
    return "text-lantern-gold";
  }

  const visibleAmenities = offer.amenities.slice(0, 5);
  const showFitBadge = prefsActive && offer.neighborhood_fit_label;

  return (
    <div
      className={`rounded-xl border transition-all ${
        isBestOverall
          ? "border-lantern-violet/40 bg-lantern-violet/[0.04] shadow-[0_0_32px_rgba(167,139,250,0.07)]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start gap-3.5 mb-3">
          {/* Image */}
          {offer.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.image_url}
              alt={offer.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 bg-white/[0.04]"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
            </div>
          )}

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0 flex-1">
                {/* Badges row */}
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  {isBestOverall && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-lantern-violet border border-lantern-violet/50 bg-lantern-violet/15 rounded-full px-2 py-0.5 leading-none">
                      AI Pick
                    </span>
                  )}
                  {!isBestOverall && offer.recommendation_label && (
                    <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${labelBg(offer.recommendation_label)}`}>
                      {offer.recommendation_label}
                    </span>
                  )}
                  {showFitBadge && (
                    <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${fitBg(offer.neighborhood_fit_label)}`}>
                      {offer.neighborhood_fit_label}
                    </span>
                  )}
                  {offer.eco_certified && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-1.5 py-0.5 leading-none">
                      Eco
                    </span>
                  )}
                </div>

                {/* Neighborhood tag */}
                {offer.inferred_neighborhood && (
                  <div className="text-[10px] text-white/30 font-medium mb-0.5 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5 text-white/20 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                    </svg>
                    {offer.inferred_neighborhood}
                  </div>
                )}

                <h3 className="text-sm font-bold text-white leading-tight">{offer.name}</h3>
                {offer.address && (
                  <p className="text-[11px] text-white/35 mt-0.5 leading-tight truncate">{offer.address}</p>
                )}
              </div>

              {/* Price */}
              <div className="text-right flex-shrink-0">
                <div className={`text-2xl font-black tabular-nums leading-none ${scoreColor(offer.ai_score)}`}>
                  ${Math.round(offer.price_per_night).toLocaleString()}
                </div>
                <div className="text-[11px] text-white/35 mt-0.5">per night</div>
                {offer.nights > 1 && (
                  <div className="text-[11px] text-white/25 mt-0.5">
                    ${Math.round(offer.total_price).toLocaleString()} total
                  </div>
                )}
              </div>
            </div>

            {/* Stars + rating */}
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {offer.star_rating > 0 && <StarRating count={offer.star_rating} />}
              {offer.overall_rating > 0 && (
                <span className={`text-[11px] font-bold tabular-nums ${scoreColor(offer.ai_score)}`}>
                  {offer.overall_rating.toFixed(1)}
                </span>
              )}
              {offer.review_count > 0 && (
                <span className="text-[11px] text-white/30">
                  ({offer.review_count.toLocaleString()} reviews)
                </span>
              )}
              {offer.hotel_type && offer.hotel_type !== "Hotel" && (
                <span className="text-[10px] text-white/25 uppercase tracking-wider">{offer.hotel_type}</span>
              )}
            </div>
          </div>
        </div>

        {/* Recommendation sentence */}
        {offer.recommendation_why && (
          <p className="text-[11px] text-white/50 leading-relaxed mb-3">
            {offer.recommendation_why}
          </p>
        )}

        {/* Nearby walk */}
        {offer.nearby_walk && (
          <div className="flex items-center gap-1.5 mb-2.5">
            <svg className="w-3 h-3 text-lantern-mint flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4l3 3" />
            </svg>
            <span className="text-[11px] text-white/40">
              {offer.nearby_walk.minutes} min walk to {offer.nearby_walk.name}
            </span>
          </div>
        )}

        {/* Amenity chips */}
        {visibleAmenities.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {visibleAmenities.map((a) => (
              <span
                key={a}
                className="text-[10px] text-white/40 border border-white/[0.08] bg-white/[0.03] rounded-full px-2 py-0.5"
              >
                {a}
              </span>
            ))}
            {offer.amenities.length > 5 && (
              <span className="text-[10px] text-white/25 px-1">
                +{offer.amenities.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* Footer: dates + score + CTA */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-2 text-[11px] text-white/30">
            <span>{formatDate(offer.check_in)}</span>
            <span className="text-white/15">→</span>
            <span>{formatDate(offer.check_out)}</span>
            {offer.nights > 0 && <span className="text-white/20">· {offer.nights}n</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBreakdownOpen((o) => !o)}
              className={`inline-flex items-center gap-1 border rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums transition-all hover:opacity-80 ${scoreBg(offer.ai_score)}`}
              title="View score breakdown"
            >
              <span>{offer.ai_score}</span>
              <svg
                className={`w-2.5 h-2.5 transition-transform ${breakdownOpen ? "rotate-180" : ""}`}
                viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
              >
                <path d="M2 4l4 4 4-4" />
              </svg>
            </button>

            {offer.booking_url && (
              <a
                href={offer.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("hotel_booking_clicked", {
                    hotel:  offer.name,
                    price:  Math.round(offer.price_per_night),
                    score:  offer.ai_score,
                    source: offer.source,
                  })
                }
                className="text-[11px] font-bold text-white bg-lantern-violet hover:bg-lantern-violet/80 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
              >
                View hotel
              </a>
            )}
          </div>
        </div>

        {/* Score breakdown */}
        {breakdownOpen && (
          <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Score Breakdown</div>
            {breakdownRows.map(({ key, label, score }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] text-white/55">{label}</span>
                  <span className={`text-[11px] font-bold tabular-nums ${barText(score)}`}>{score}</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-[10px] text-white/20 leading-relaxed pt-1">
              Each dimension scored 0–100 relative to results returned.
              {prefsActive && " Neighborhood Fit weighted at 25% when preferences are selected."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recommendation panel ──────────────────────────────────────────────────────

function RecommendationPanel({
  offers,
  prefsActive,
}: {
  offers: HotelOffer[];
  prefsActive: boolean;
}) {
  const pick = offers.find((o) => o.recommendation_label === "Best Overall") ?? offers[0];
  if (!pick) return null;

  return (
    <div className="mb-4 max-w-3xl mx-auto rounded-xl border border-lantern-violet/40 bg-lantern-violet/[0.07] px-4 sm:px-5 py-4 shadow-[0_0_24px_rgba(139,92,246,0.10)]">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-lantern-violet flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="text-[10px] font-black uppercase tracking-widest text-lantern-violet">
            TravelGrab Recommendation
          </span>
        </div>
        <span className="text-lg font-black text-white tabular-nums leading-none flex-shrink-0">
          ${Math.round(pick.price_per_night).toLocaleString()}
          <span className="text-sm font-medium text-white/40">/night</span>
        </span>
      </div>

      {pick.inferred_neighborhood && (
        <div className="text-[10px] text-lantern-violet/60 font-medium mb-1 flex items-center gap-1">
          <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          {pick.inferred_neighborhood}
        </div>
      )}

      <div className="text-sm font-bold text-white mb-1">{pick.name}</div>
      {pick.address && <div className="text-[11px] text-white/40 mb-2">{pick.address}</div>}

      {pick.recommendation_why && (
        <p className="text-[11px] text-white/65 leading-relaxed">
          {pick.recommendation_why}
        </p>
      )}

      {prefsActive && pick.neighborhood_fit_label && (
        <div className={`mt-2 inline-flex items-center gap-1 border rounded-full px-2.5 py-1 text-[10px] font-bold ${fitBg(pick.neighborhood_fit_label)}`}>
          <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 6l3.5 3.5L11 2" />
          </svg>
          {pick.neighborhood_fit_label} for your preferences
        </div>
      )}
    </div>
  );
}

// ── FeatureCard (idle state) ──────────────────────────────────────────────────

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-lantern-violet/15 text-lantern-violet">
        {icon}
      </div>
      <div className="mb-1 text-sm font-semibold text-white">{title}</div>
      <div className="text-xs text-white/45 leading-relaxed">{body}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HotelSearch() {
  const today = new Date().toISOString().split("T")[0];

  const [destination,       setDestination]       = useState("");
  const [checkIn,           setCheckIn]           = useState("");
  const [checkOut,          setCheckOut]          = useState("");
  const [guests,            setGuests]            = useState(2);
  const [rooms,             setRooms]             = useState(1);
  const [selectedPrefs,     setSelectedPrefs]     = useState<string[]>([]);

  const [searchState,  setSearchState]  = useState<SearchState>("idle");
  const [offers,       setOffers]       = useState<HotelOffer[]>([]);
  const [searchedDest, setSearchedDest] = useState("");
  const [activePrefs,  setActivePrefs]  = useState<string[]>([]);
  const [errorTitle,   setErrorTitle]   = useState("");
  const [errorBody,    setErrorBody]    = useState("");
  const [errors,       setErrors]       = useState<string[]>([]);

  const togglePref = (id: string) => {
    setSelectedPrefs((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSearch = async () => {
    const errs: string[] = [];
    if (!destination.trim()) errs.push("Please enter a destination.");
    if (!checkIn)             errs.push("Please select a check-in date.");
    if (!checkOut)            errs.push("Please select a check-out date.");
    if (checkIn && checkOut && checkOut <= checkIn) errs.push("Check-out must be after check-in.");
    setErrors(errs);
    if (errs.length > 0) return;

    track("hotel_search_submitted", {
      destination:         destination.trim(),
      check_in:            checkIn,
      check_out:           checkOut,
      guests,
      rooms,
      neighborhood_prefs:  selectedPrefs.join(","),
    });

    setSearchState("loading");
    setSearchedDest(destination.trim());

    try {
      const res = await fetch("/api/hotels/search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination:        destination.trim(),
          check_in:           checkIn,
          check_out:          checkOut,
          guests,
          rooms,
          neighborhood_prefs: selectedPrefs,
        }),
      });

      const data = await res.json() as {
        status:             string;
        message?:           string;
        offers?:            HotelOffer[];
        neighborhood_prefs?: string[];
      };

      if (data.status === "not_configured") {
        setErrorTitle("Search unavailable");
        setErrorBody(data.message ?? "Hotel search is temporarily unavailable.");
        setSearchState("error");
        return;
      }
      if (data.status === "error") {
        setErrorTitle("Search failed");
        setErrorBody(data.message ?? "Couldn't complete this search. Try again.");
        setSearchState("error");
        return;
      }
      if (data.status === "empty" || !data.offers?.length) {
        setErrorTitle("No hotels found");
        setErrorBody(data.message ?? `No hotels found for "${destination}". Try a different city name.`);
        setSearchState("error");
        return;
      }

      setOffers(data.offers!);
      setActivePrefs(data.neighborhood_prefs ?? selectedPrefs);
      setSearchState("results");
    } catch {
      setErrorTitle("Network error");
      setErrorBody("Couldn't reach TravelGrab's servers. Check your connection and try again.");
      setSearchState("error");
    }
  };

  const bestOverallId = offers.find((o) => o.recommendation_label === "Best Overall")?.hotel_id;
  const prefsActive   = activePrefs.length > 0;

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <svg className="w-5 h-5 text-lantern-violet group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <Link href="/flights" className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors">
            Flights
          </Link>
          <span className="text-sm font-medium text-lantern-violet">Hotels</span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="mb-7 text-center">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white mb-2">
            Find your hotel
          </h1>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            TravelGrab ranks hotels by reviews, walkability, location quality, and total value — not just price.
          </p>
        </div>

        {/* Search panel */}
        <div className="max-w-3xl mx-auto rounded-2xl border border-white/[0.09] bg-white/[0.03] p-5 sm:p-6 mb-4 shadow-card">
          {/* Destination */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">
              Destination
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="City name (e.g. Paris, Tokyo, New York)"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-3.5 py-3 text-sm text-white placeholder-white/25 outline-none transition-colors"
            />
          </div>

          {/* Dates */}
          <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">
                Check-in
              </label>
              <input
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-3.5 py-3 text-sm text-white outline-none transition-colors [color-scheme:dark]"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">
                Check-out
              </label>
              <input
                type="date"
                min={checkIn || today}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-3.5 py-3 text-sm text-white outline-none transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Guests + Rooms */}
          <div className="flex gap-2.5 mb-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">
                Guests
              </label>
              <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
                <button onClick={() => setGuests((n) => Math.max(1, n - 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">−</button>
                <span className="flex-1 text-center text-sm font-semibold text-white">{guests}</span>
                <button onClick={() => setGuests((n) => Math.min(8, n + 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">+</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">
                Rooms
              </label>
              <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
                <button onClick={() => setRooms((n) => Math.max(1, n - 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">−</button>
                <span className="flex-1 text-center text-sm font-semibold text-white">{rooms}</span>
                <button onClick={() => setRooms((n) => Math.min(4, n + 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">+</button>
              </div>
            </div>
          </div>

          {/* Neighborhood preferences */}
          <div className="pt-4 border-t border-white/[0.06] mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                What kind of area?
              </div>
              {selectedPrefs.length > 0 && (
                <button
                  onClick={() => setSelectedPrefs([])}
                  className="text-[10px] text-white/25 hover:text-white/55 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NEIGHBORHOOD_PREFS.map(({ id, label }) => {
                const selected = selectedPrefs.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => togglePref(id)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      selected
                        ? "bg-lantern-violet/30 text-lantern-violet border-lantern-violet/70 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                        : "bg-transparent text-white/30 border-white/[0.09] hover:border-white/[0.18] hover:text-white/55"
                    }`}
                  >
                    {selected && (
                      <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 6l3.5 3.5L11 2" />
                      </svg>
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 text-[10px] text-white/20 leading-relaxed">
              {selectedPrefs.length === 0
                ? "Select any that apply — rankings will be adjusted to match your preferences."
                : `Ranking weighted for: ${selectedPrefs.map((p) => NEIGHBORHOOD_PREFS.find((x) => x.id === p)?.label ?? p).join(", ")}.`
              }
            </div>
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {/* Search button */}
          <button
            onClick={handleSearch}
            disabled={searchState === "loading"}
            className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide text-white bg-lantern-violet hover:bg-lantern-violet/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_24px_rgba(139,92,246,0.25)] hover:shadow-[0_0_32px_rgba(139,92,246,0.35)]"
          >
            {searchState === "loading" ? "Searching hotels…" : "Search hotels"}
          </button>
        </div>

        {/* Loading */}
        {searchState === "loading" && (
          <div className="max-w-3xl mx-auto text-center py-14">
            <div className="inline-flex items-center gap-3 text-white/50 text-sm">
              <svg className="w-4 h-4 animate-spin text-lantern-violet" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching hotels in {searchedDest}…
            </div>
            <p className="text-xs text-white/25 mt-2">Ranking by reviews, location
              {selectedPrefs.length > 0 ? `, and neighborhood fit` : ", and value"}
            </p>
          </div>
        )}

        {/* Error */}
        {searchState === "error" && (
          <div className="max-w-3xl mx-auto rounded-2xl border border-red-500/20 bg-red-500/[0.07] px-5 py-8 text-center">
            <div className="text-sm font-bold text-white mb-1">{errorTitle}</div>
            <div className="text-xs text-white/45 leading-relaxed">{errorBody}</div>
          </div>
        )}

        {/* Results */}
        {searchState === "results" && offers.length > 0 && (
          <div className="max-w-3xl mx-auto">
            {/* Summary bar */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="text-xs text-white/40">
                <span className="font-semibold text-white/70">{offers.length} hotels</span>
                {" "}in {searchedDest}
              </div>
              <div className="flex items-center gap-2">
                {prefsActive && (
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {activePrefs.map((p) => (
                      <span key={p} className="text-[9px] font-bold uppercase tracking-wider text-lantern-violet/70 border border-lantern-violet/25 rounded-full px-1.5 py-0.5 leading-none">
                        {NEIGHBORHOOD_PREFS.find((x) => x.id === p)?.label ?? p}
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[11px] text-white/25">Ranked by TravelGrab</span>
              </div>
            </div>

            {/* Recommendation panel */}
            <RecommendationPanel offers={offers} prefsActive={prefsActive} />

            {/* Hotel cards */}
            <div className="space-y-3">
              {offers.map((offer) => (
                <HotelCard
                  key={offer.hotel_id}
                  offer={offer}
                  isBestOverall={offer.hotel_id === bestOverallId}
                  prefsActive={prefsActive}
                />
              ))}
            </div>

            <div className="mt-6 text-center text-[11px] text-white/20 leading-relaxed">
              Prices sourced from Google Hotels via SerpAPI. Final prices confirmed at the booking site.
            </div>
          </div>
        )}

        {/* Idle state */}
        {searchState === "idle" && (
          <div className="max-w-3xl mx-auto mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FeatureCard
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              }
              title="Review-first ranking"
              body="We weight actual guest ratings heavily. A 4.8-star hotel beats a cheaper option with mediocre reviews."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
              }
              title="Neighborhood-aware"
              body="Tell us what kind of area you want. We infer neighborhoods from landmarks and hotels' surroundings."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
              }
              title="Honest comparisons"
              body="We explain exactly why a hotel ranks #1 — not just a score, but a clear comparison versus alternatives."
            />
          </div>
        )}
      </main>
    </div>
  );
}

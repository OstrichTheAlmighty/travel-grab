import { NextResponse } from "next/server";
import { searchGoogleHotels } from "../providers/googleHotels";
import { enrichWithGooglePlaces } from "../providers/googlePlaces";
import type { PlacesEnrichment } from "../providers/googlePlaces";
import type { NearbyPlace, ProviderHotel } from "../providers/types";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 45;

// ── Neighborhood preference → keyword signals (SerpAPI fallback path) ─────────
// Used when Google Places enrichment is unavailable. Matches against hotel
// name, address, description, amenities, and SerpAPI nearby_places names.

const PREF_SIGNALS: Record<string, {
  nearbyTerms:  string[];
  addressTerms: string[];
  descTerms:    string[];
  amenityTerms: string[];
}> = {
  "first-time": {
    nearbyTerms:  ["eiffel", "louvre", "notre dame", "big ben", "colosseum", "sagrada familia", "acropolis", "times square", "central park", "trevi", "vatican", "buckingham", "tower of london", "sacré-cœur", "sacre-coeur", "pantheon", "duomo", "empire state", "golden gate"],
    addressTerms: ["old town", "historic", "city centre", "city center", "centro", "altstadt"],
    descTerms:    ["iconic", "heart of the city", "center of", "famous", "landmark", "must-see"],
    amenityTerms: ["tour desk", "concierge"],
  },
  "sightseeing": {
    nearbyTerms:  ["museum", "gallery", "monument", "cathedral", "basilica", "palace", "castle", "temple", "shrine", "colosseum", "forum", "ruins", "aquarium", "zoo", "national park", "historic site"],
    addressTerms: ["museum", "gallery", "palace", "historic", "heritage"],
    descTerms:    ["museum", "gallery", "historic", "cultural", "sightseeing", "landmark", "arts"],
    amenityTerms: ["tour desk", "concierge"],
  },
  "food": {
    nearbyTerms:  ["restaurant", "market", "food hall", "brasserie", "cafe", "bistro", "street food", "farmers market", "covered market", "les halles", "food market", "tavern", "trattoria"],
    addressTerms: ["market", "food street", "restaurant row"],
    descTerms:    ["culinary", "restaurant", "dining", "gastronomic", "chef", "cuisine", "food scene"],
    amenityTerms: ["restaurant", "bar", "breakfast included", "rooftop restaurant"],
  },
  "nightlife": {
    nearbyTerms:  ["bar", "nightclub", "club", "lounge", "pub", "brewery", "wine bar", "cocktail bar", "jazz club", "oberkampf", "soho"],
    addressTerms: ["oberkampf", "bastille", "pigalle", "soho", "entertainment"],
    descTerms:    ["vibrant", "lively", "nightlife", "trendy", "hip", "buzzing", "young crowd"],
    amenityTerms: ["bar", "rooftop bar", "nightclub"],
  },
  "quiet": {
    nearbyTerms:  ["park", "garden", "botanical garden", "lake", "riverside", "nature reserve"],
    addressTerms: ["residential", "quiet", "peaceful", "garden district"],
    descTerms:    ["quiet", "peaceful", "serene", "tranquil", "relaxing", "oasis", "residential"],
    amenityTerms: ["spa", "garden", "yoga", "meditation", "wellness"],
  },
  "luxury": {
    nearbyTerms:  ["champs-élysées", "champs elysees", "fifth avenue", "rodeo drive", "knightsbridge", "mayfair", "avenue montaigne"],
    addressTerms: ["grand", "plaza", "royal", "palace", "luxury", "prestige"],
    descTerms:    ["luxury", "luxurious", "five-star", "5-star", "prestigious", "exclusive", "elite"],
    amenityTerms: ["spa", "butler service", "valet parking", "fine dining", "pool", "fitness center"],
  },
  "budget": {
    nearbyTerms:  [],
    addressTerms: [],
    descTerms:    ["affordable", "budget", "value", "economical", "great deal"],
    amenityTerms: ["free wifi", "free breakfast", "kitchenette", "self-catering"],
  },
  "family": {
    nearbyTerms:  ["zoo", "aquarium", "theme park", "playground", "disney", "lego", "children's museum", "science museum", "water park"],
    addressTerms: [],
    descTerms:    ["family", "children", "kids", "family-friendly", "connecting rooms"],
    amenityTerms: ["pool", "kids club", "family room", "playground", "babysitting", "children's menu"],
  },
  "transit": {
    nearbyTerms:  ["metro", "subway", "train station", "bus station", "tram stop", "rail", "tube", "gare", "bahnhof", "stazione", "station"],
    addressTerms: ["station", "metro", "transit hub", "transport hub"],
    descTerms:    ["metro station", "subway", "train station", "bus stop", "well connected", "transport links"],
    amenityTerms: ["airport shuttle", "free shuttle", "metro pass"],
  },
  "walkable": {
    nearbyTerms:  ["shopping", "mall", "market", "park", "plaza", "square", "promenade", "waterfront", "boardwalk"],
    addressTerms: ["downtown", "central", "city centre", "city center", "midtown", "old town"],
    descTerms:    ["walkable", "walking distance", "central location", "steps from", "heart of", "pedestrian"],
    amenityTerms: [],
  },
};

// ── HotelOffer — shape sent to the client ─────────────────────────────────────

export interface HotelOffer {
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
  // Neighborhood fields
  neighborhood_fit_score:  number;   // 0–100; 0 when no prefs
  inferred_neighborhood:   string;   // "" if not determined
  neighborhood_fit_label:  string;   // "Great fit" | "Good fit" | "Partial fit" | ""
  // Google Places enrichment fields
  location_summary: string;          // "central, metro nearby, strong dining scene"
  transit_note:     string;          // "Métro Opéra · 3 min walk"
}

// ── Base helpers ──────────────────────────────────────────────────────────────

function parseDurationMinutes(duration: string): number {
  const m = duration.match(/(\d+)\s*min/i);
  if (m) return parseInt(m[1]);
  const h = duration.match(/(\d+)\s*hr?/i);
  if (h) return parseInt(h[1]) * 60;
  return 999;
}

function nearestWalk(places: NearbyPlace[]): { name: string; minutes: number } | null {
  let best: { name: string; minutes: number } | null = null;
  for (const p of places) {
    for (const t of p.transportations) {
      if (t.type.toLowerCase().includes("walk")) {
        const mins = parseDurationMinutes(t.duration);
        if (!best || mins < best.minutes) best = { name: p.name, minutes: mins };
      }
    }
  }
  return best;
}

function walkabilityScore(places: NearbyPlace[]): number {
  const walkable = places.flatMap((p) =>
    p.transportations
      .filter((t) => t.type.toLowerCase().includes("walk"))
      .map((t) => parseDurationMinutes(t.duration))
  );
  if (walkable.length === 0) return 40;
  const under10 = walkable.filter((m) => m <= 10).length;
  const under20 = walkable.filter((m) => m <= 20).length;
  return Math.min(100, under10 * 18 + under20 * 6 + 10);
}

// ── Neighborhood helpers ──────────────────────────────────────────────────────

function inferNeighborhoodFallback(hotel: ProviderHotel): string {
  const allText = [
    hotel.name, hotel.address, hotel.description,
    ...hotel.nearbyPlaces.map((p) => p.name),
  ].join(" ").toLowerCase();

  const patterns = [
    ["le marais", "Le Marais"],
    ["saint-germain", "Saint-Germain"],
    ["latin quarter", "Latin Quarter"],
    ["quartier latin", "Latin Quarter"],
    ["montmartre", "Montmartre"],
    ["bastille", "Bastille / 11th"],
    ["canal saint-martin", "Canal Saint-Martin"],
    ["champs-élysées", "Champs-Élysées / 8th"],
    ["champs elysees", "Champs-Élysées / 8th"],
    ["louvre", "Louvre / 1st"],
    ["eiffel", "Eiffel Tower / 7th"],
    ["old town", "Old Town"],
    ["historic center", "Historic Center"],
    ["city center", "City Center"],
    ["city centre", "City Centre"],
    ["downtown", "Downtown"],
    ["waterfront", "Waterfront"],
  ] as const;

  for (const [keyword, name] of patterns) {
    if (allText.includes(keyword)) return name;
  }
  return "";
}

function computeNeighborhoodFit(
  hotel: ProviderHotel,
  prefs: string[],
  enrichment: PlacesEnrichment | undefined,
): number {
  if (prefs.length === 0) return 0;

  let total = 0;

  for (const pref of prefs) {
    let score = 0;

    if (enrichment) {
      // Primary: Places-derived bestFor list — these are neighborhood characteristics
      // confirmed by actual address data, not keyword guessing.
      if (enrichment.bestFor.includes(pref)) {
        score += 65;
      } else {
        score += 12; // base — area doesn't match but hotel might still fit
      }

      // Transit pref: boost based on walk time in transitNote
      if (pref === "transit" && enrichment.transitNote) {
        const m = enrichment.transitNote.match(/(\d+)\s*min/);
        const mins = m ? parseInt(m[1]) : 10;
        if (mins <= 3)       score += 28;
        else if (mins <= 7)  score += 18;
        else if (mins <= 12) score += 8;
      }

      // Keyword cross-checks in locationSummary / transitNote
      const summLower = (enrichment.locationSummary + " " + enrichment.transitNote).toLowerCase();
      if (pref === "food"      && summLower.includes("dining"))      score += 15;
      if (pref === "walkable"  && summLower.includes("walkable"))    score += 15;
      if (pref === "sightseeing" && summLower.includes("sights"))    score += 15;
      if (pref === "quiet"     && summLower.includes("quiet"))       score += 15;
      if (pref === "nightlife" && summLower.includes("nightlife"))   score += 15;
    } else {
      // Fallback path: keyword matching against SerpAPI text data
      const signals = PREF_SIGNALS[pref];
      if (!signals) { total += 50; continue; }

      const walkMinutes = new Map<string, number>();
      for (const p of hotel.nearbyPlaces) {
        const mins = p.transportations
          .filter((t) => t.type.toLowerCase().includes("walk"))
          .map((t) => parseDurationMinutes(t.duration));
        if (mins.length > 0) walkMinutes.set(p.name.toLowerCase(), Math.min(...mins));
      }

      const nearbyNames = hotel.nearbyPlaces.map((p) => p.name.toLowerCase());
      const addrLower   = (hotel.address + " " + hotel.name).toLowerCase();
      const descLower   = hotel.description.toLowerCase();
      const amenLower   = hotel.amenities.map((a) => a.toLowerCase());

      // Nearby places — walk-time weighted
      outer:
      for (const term of signals.nearbyTerms) {
        const tl = term.toLowerCase();
        for (const nn of nearbyNames) {
          if (nn.includes(tl)) {
            const walk = walkMinutes.get(nn) ?? 999;
            if (walk <= 5)       score += 40;
            else if (walk <= 10) score += 28;
            else if (walk <= 20) score += 15;
            else                 score += 6;
            break outer;
          }
        }
      }
      let addrHits = 0;
      for (const t of signals.addressTerms) { if (addrLower.includes(t)) addrHits++; }
      score += Math.min(25, addrHits * 13);

      let descHits = 0;
      for (const t of signals.descTerms) { if (descLower.includes(t)) descHits++; }
      score += Math.min(20, descHits * 7);

      let amenHits = 0;
      for (const t of signals.amenityTerms) { if (amenLower.some((a) => a.includes(t))) amenHits++; }
      score += Math.min(25, amenHits * 12);

      if (pref === "luxury") {
        if (hotel.starRating >= 5)      score += 20;
        else if (hotel.starRating >= 4) score += 10;
      }
      if (pref === "budget") score += 12;
    }

    total += Math.min(100, score);
  }

  return Math.round(total / prefs.length);
}

function neighborhoodFitLabel(score: number, prefs: string[]): string {
  if (prefs.length === 0 || score === 0) return "";
  if (score >= 68) return "Great fit";
  if (score >= 42) return "Good fit";
  if (score >= 22) return "Partial fit";
  return "";
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreHotels(
  hotels: ProviderHotel[],
  prefs: string[],
  destination: string,
  enrichments: Map<string, PlacesEnrichment>,
): HotelOffer[] {
  const prices     = hotels.map((h) => h.pricePerNight);
  const minP       = Math.min(...prices);
  const maxP       = Math.max(...prices);
  const priceRange = Math.max(1, maxP - minP);

  return hotels.map((h) => {
    const enrichment = enrichments.get(h.sourceHotelId);

    const priceScore    = ((maxP - h.pricePerNight) / priceRange) * 100;
    const reviewScore   = Math.min(100, (h.overallRating / 5) * 100);
    const locationScore = h.locationRating > 0 ? Math.min(100, (h.locationRating / 10) * 100) : 50;
    const starsScore    = Math.min(100, (h.starRating / 5) * 100);
    const walkScore     = walkabilityScore(h.nearbyPlaces);

    const baseScore = Math.round(
      priceScore    * 0.28 +
      reviewScore   * 0.27 +
      locationScore * 0.20 +
      starsScore    * 0.14 +
      walkScore     * 0.11
    );

    const neighborhood_fit_score = computeNeighborhoodFit(h, prefs, enrichment);

    // Blend neighborhood fit at 25% when preferences are active
    const blendedScore = prefs.length > 0
      ? Math.round(baseScore * 0.75 + neighborhood_fit_score * 0.25)
      : baseScore;

    // Budget-only mode: shift weights heavily toward price
    const ai_score = (prefs.length === 1 && prefs[0] === "budget")
      ? Math.round(priceScore * 0.50 + reviewScore * 0.25 + locationScore * 0.10 + starsScore * 0.08 + walkScore * 0.07)
      : blendedScore;

    const inferred_neighborhood =
      enrichment?.neighborhood || inferNeighborhoodFallback(h);

    return {
      hotel_id:            h.sourceHotelId,
      source:              h.source,
      name:                h.name,
      address:             h.address,
      star_rating:         h.starRating,
      overall_rating:      h.overallRating,
      review_count:        h.reviewCount,
      location_rating:     h.locationRating,
      price_per_night:     h.pricePerNight,
      total_price:         h.totalPrice,
      nights:              0,
      currency:            h.currency,
      amenities:           h.amenities,
      image_url:           h.imageUrl,
      booking_url:         h.bookingUrl,
      check_in:            h.checkIn,
      check_out:           h.checkOut,
      hotel_type:          h.hotelType,
      eco_certified:       h.ecoCertified,
      description:         h.description,
      ai_score,
      recommendation_label: "",
      recommendation_why:   "",
      nearby_walk:         nearestWalk(h.nearbyPlaces),
      score_breakdown: {
        price:       Math.round(priceScore),
        reviews:     Math.round(reviewScore),
        location:    Math.round(locationScore),
        stars:       Math.round(starsScore),
        walkability: Math.round(walkScore),
      },
      neighborhood_fit_score,
      inferred_neighborhood,
      neighborhood_fit_label: neighborhoodFitLabel(neighborhood_fit_score, prefs),
      location_summary: enrichment?.locationSummary ?? "",
      transit_note:     enrichment?.transitNote     ?? "",
    };
  });
}

// ── Label assignment ──────────────────────────────────────────────────────────

function assignLabels(scored: HotelOffer[]): void {
  if (scored.length === 0) return;
  const claim = (h: HotelOffer, label: string) => { if (!h.recommendation_label) h.recommendation_label = label; };

  claim([...scored].sort((a, b) => b.ai_score - a.ai_score)[0], "Best Overall");

  const lux = scored
    .filter((h) => h.star_rating >= 4 && !h.recommendation_label)
    .sort((a, b) => b.star_rating !== a.star_rating ? b.star_rating - a.star_rating : b.overall_rating - a.overall_rating)[0];
  if (lux) claim(lux, "Luxury Pick");

  const loc = scored
    .filter((h) => !h.recommendation_label)
    .sort((a, b) => (b.score_breakdown.location + b.score_breakdown.walkability) - (a.score_breakdown.location + a.score_breakdown.walkability))[0];
  if (loc) claim(loc, "Best Location");

  const budget = scored
    .filter((h) => h.overall_rating >= 3.5 && !h.recommendation_label)
    .sort((a, b) => a.price_per_night - b.price_per_night)[0];
  if (budget) claim(budget, "Budget Pick");

  const val = scored
    .filter((h) => !h.recommendation_label)
    .sort((a, b) =>
      (b.score_breakdown.reviews + b.score_breakdown.location - b.score_breakdown.price * 0.3) -
      (a.score_breakdown.reviews + a.score_breakdown.location - a.score_breakdown.price * 0.3)
    )[0];
  if (val) claim(val, "Best Value");
}

// ── Recommendation text ───────────────────────────────────────────────────────

const PREF_DISPLAY: Record<string, string> = {
  "first-time":  "first-time visitors",
  "sightseeing": "sightseeing",
  "food":        "food lovers",
  "nightlife":   "nightlife",
  "quiet":       "a quiet stay",
  "luxury":      "luxury",
  "budget":      "budget travelers",
  "family":      "families",
  "transit":     "transit access",
  "walkable":    "walkability",
};

function buildWhy(
  h: HotelOffer,
  all: HotelOffer[],
  prefs: string[],
  enrichment: PlacesEnrichment | undefined,
): string {
  const cheapest  = all.reduce((a, b) => a.price_per_night <= b.price_per_night ? a : b);
  const priceDiff = Math.round(h.price_per_night - cheapest.price_per_night);
  const parts: string[] = [];

  // ── Location context ───────────────────────────────────────────────────────
  if (enrichment) {
    // Google Places: rich area description
    if (h.inferred_neighborhood) {
      const summaryPart = enrichment.locationSummary
        ? `${h.inferred_neighborhood} — ${enrichment.locationSummary}`
        : h.inferred_neighborhood;

      // Add pref-match note when this area genuinely suits selected preferences
      const matchedPrefs = prefs.filter((p) => enrichment.bestFor.includes(p));
      if (matchedPrefs.length > 0) {
        const prefLabel = matchedPrefs.slice(0, 2).map((p) => PREF_DISPLAY[p] ?? p).join(" and ");
        parts.push(`${summaryPart} — great for ${prefLabel}`);
      } else {
        parts.push(summaryPart);
      }
    }
    // Transit note as a separate context item (don't double-count if already in summary)
    if (enrichment.transitNote && !enrichment.locationSummary.toLowerCase().includes("metro") && !enrichment.locationSummary.toLowerCase().includes("transit")) {
      parts.push(enrichment.transitNote);
    }
  } else if (h.inferred_neighborhood) {
    // Fallback: basic neighborhood name with optional pref note
    const matchedPrefs = prefs.filter((p) => {
      const signals = PREF_SIGNALS[p];
      if (!signals) return false;
      const allText = [h.name, h.address, h.description, ...h.amenities].join(" ").toLowerCase();
      return signals.addressTerms.some((t) => allText.includes(t)) ||
             signals.descTerms.some((t)    => allText.includes(t)) ||
             h.neighborhood_fit_score >= 55;
    });
    if (matchedPrefs.length > 0) {
      const pl = matchedPrefs.slice(0, 2).map((p) => PREF_DISPLAY[p] ?? p).join(" and ");
      parts.push(`In ${h.inferred_neighborhood} — great for ${pl}`);
    } else {
      parts.push(`In ${h.inferred_neighborhood}`);
    }
  }

  // ── Review quality ─────────────────────────────────────────────────────────
  if (h.overall_rating >= 4.7)      parts.push("outstanding guest reviews");
  else if (h.overall_rating >= 4.4) parts.push("excellent reviews");
  else if (h.overall_rating >= 4.0) parts.push("very good reviews");
  else if (h.overall_rating >= 3.5) parts.push("solid guest ratings");

  // ── Standout amenity ───────────────────────────────────────────────────────
  const topAmenities = ["Pool", "Spa", "Free breakfast", "Gym", "Airport shuttle", "Restaurant"];
  const highlight = h.amenities.find((a) =>
    topAmenities.some((ta) => a.toLowerCase().includes(ta.toLowerCase()))
  );
  if (highlight && parts.length < 3) parts.push(`includes ${highlight.toLowerCase()}`);

  // ── Price comparison ───────────────────────────────────────────────────────
  if (priceDiff <= 0) {
    parts.push(`the lowest price in this set at $${Math.round(h.price_per_night)}/night`);
  } else if (priceDiff <= 25) {
    parts.push(`only $${priceDiff}/night more than the cheapest option`);
  } else if (priceDiff <= 60) {
    parts.push(`$${priceDiff}/night more than the cheapest option`);
  }

  if (parts.length === 0)
    return `${h.star_rating > 0 ? `${h.star_rating}-star ` : ""}${h.hotel_type.toLowerCase()} at $${Math.round(h.price_per_night)}/night.`;
  if (parts.length === 1)
    return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}.`;
  const last = parts.pop()!;
  return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `, ${parts.slice(1).join(", ")}` : ""}, and ${last}.`;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function deduplicateHotels(hotels: ProviderHotel[]): ProviderHotel[] {
  const seen = new Map<string, ProviderHotel>();
  for (const h of hotels) {
    const key = h.name.toLowerCase().replace(/\W+/g, " ").trim();
    const existing = seen.get(key);
    if (!existing || h.pricePerNight < existing.pricePerNight) seen.set(key, h);
  }
  return [...seen.values()];
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const n = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000);
  return n > 0 ? n : 1;
}

// ── POST /api/hotels/search ───────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ status: "error", message: "Invalid JSON." }, { status: 400 }); }

  const destination        = (body.destination as string | undefined)?.trim() ?? "";
  const check_in           = (body.check_in    as string | undefined)?.trim() ?? "";
  const check_out          = (body.check_out   as string | undefined)?.trim() ?? "";
  const guests             = Math.max(1, Math.min(8, Number(body.guests ?? 2)));
  const rooms              = Math.max(1, Math.min(4, Number(body.rooms  ?? 1)));
  const neighborhood_prefs = Array.isArray(body.neighborhood_prefs)
    ? (body.neighborhood_prefs as unknown[]).filter((p): p is string => typeof p === "string" && p in PREF_SIGNALS)
    : [];

  if (!destination || !check_in || !check_out) {
    return NextResponse.json({ status: "error", message: "destination, check_in, and check_out are required." }, { status: 400 });
  }

  const serpApiKey   = (process.env.SERPAPI_API_KEY      ?? "").trim();
  const placesApiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();

  if (!serpApiKey) {
    return NextResponse.json({ status: "not_configured", message: "Hotel search is temporarily unavailable." }, { status: 200 });
  }

  const nights = nightsBetween(check_in, check_out);

  // ── Fetch from SerpAPI ─────────────────────────────────────────────────────
  const serpResult = await searchGoogleHotels({ destination, check_in, check_out, guests, rooms }, serpApiKey);

  if (serpResult.hotels.length === 0) {
    return NextResponse.json({ status: "empty", message: `No hotels found for "${destination}". Try a different city name.`, offers: [] });
  }

  const deduped = deduplicateHotels(serpResult.hotels);
  console.log(`[hotels] raw=${serpResult.rawCount}  deduped=${deduped.length}  prefs=[${neighborhood_prefs.join(",")}]  places=${!!placesApiKey}  (serp=${serpResult.latencyMs}ms)`);

  // ── Enrich with Google Places (optional) ───────────────────────────────────
  let enrichments = new Map<string, PlacesEnrichment>();
  if (placesApiKey) {
    enrichments = await enrichWithGooglePlaces(deduped, destination, placesApiKey);
  }

  // ── Score, sort, label ─────────────────────────────────────────────────────
  const scored = scoreHotels(deduped, neighborhood_prefs, destination, enrichments).map((h) => ({ ...h, nights }));

  scored.sort((a, b) =>
    b.ai_score !== a.ai_score ? b.ai_score - a.ai_score : a.price_per_night - b.price_per_night
  );

  assignLabels(scored);

  for (const h of scored) {
    h.recommendation_why = buildWhy(h, scored, neighborhood_prefs, enrichments.get(h.hotel_id));
  }

  return NextResponse.json({
    status: "ok",
    destination,
    check_in,
    check_out,
    nights,
    guests,
    rooms,
    neighborhood_prefs,
    places_enriched: enrichments.size > 0,
    offer_count: scored.length,
    offers: scored,
  });
}

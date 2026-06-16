import { NextResponse } from "next/server";
import { searchGoogleHotels } from "../providers/googleHotels";
import { enrichWithGooglePlaces } from "../providers/googlePlaces";
import type { PlacesEnrichment } from "../providers/googlePlaces";
import type { NearbyPlace, ProviderHotel } from "../providers/types";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 45;

// ── Neighborhood preference → keyword signals (SerpAPI fallback path) ─────────

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
    nearbyTerms:  ["champs-élysées", "champs elysees", "fifth avenue", "rodeo drive", "knightsbridge", "mayfair", "avenue montaigne", "passeig de gràcia", "paseo de gracia"],
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

// ── City-specific neighborhood fit scores ─────────────────────────────────────
// Pre-calibrated 0–100 scores for known neighborhoods per preference.
// These take priority over keyword / Places bestFor scoring when the hotel's
// inferred_neighborhood matches a key in this table.

type PrefScoreMap = Record<string, number>;
type CityNeighborhoodTable = Record<string, PrefScoreMap>;  // pref → {neighborhood → score}

const NEIGHBORHOOD_FIT_TABLES: Record<string, CityNeighborhoodTable> = {
  barcelona: {
    quiet: {
      "sarrià-sant gervasi": 95, "sant gervasi": 90, "pedralbes": 90,
      "gràcia": 80,
      "eixample": 55, "sants-montjuïc": 50, "sant martí": 45,
      "les corts": 65, "horta-guinardó": 65, "nou barris": 55, "sant andreu": 50,
      "ciutat vella": 20, "el raval": 10, "barceloneta": 15,
      "barri gòtic": 15, "gothic quarter": 15, "el born": 30,
      "l'hospitalet": 25, "hospitalet": 25, "poblenou": 42,
    },
    luxury: {
      "eixample": 90, "passeig de gràcia": 95,
      "sarrià-sant gervasi": 85, "sant gervasi": 85, "pedralbes": 92,
      "les corts": 70, "el born": 70,
      "barri gòtic": 55, "gothic quarter": 55, "ciutat vella": 55,
      "barceloneta": 65, "sants-montjuïc": 45, "gràcia": 50,
      "l'hospitalet": 20, "hospitalet": 20, "el raval": 25,
      "sant martí": 40, "poblenou": 45,
    },
    food: {
      "eixample": 90, "el born": 92, "gràcia": 85,
      "barri gòtic": 80, "gothic quarter": 80, "ciutat vella": 80,
      "sant antoni": 88, "el raval": 78, "barceloneta": 75,
      "sarrià-sant gervasi": 60, "poblenou": 75, "sant martí": 70,
      "sants-montjuïc": 65, "l'hospitalet": 45, "hospitalet": 45,
      "les corts": 55, "sant andreu": 55,
    },
    sightseeing: {
      "ciutat vella": 95, "barri gòtic": 95, "gothic quarter": 95,
      "el born": 92, "eixample": 87,
      "barceloneta": 70, "sants-montjuïc": 72,
      "sarrià-sant gervasi": 40, "gràcia": 65,
      "les corts": 50, "poblenou": 55, "sant martí": 55,
      "l'hospitalet": 30, "hospitalet": 30, "el raval": 72,
    },
    transit: {
      "eixample": 92, "sants-montjuïc": 88, "sants": 92,
      "passeig de gràcia": 92, "gràcia": 78, "sant martí": 72,
      "sarrià-sant gervasi": 65, "l'hospitalet": 67, "hospitalet": 67,
      "sant andreu": 72, "nou barris": 65, "horta-guinardó": 62,
      "les corts": 75, "barceloneta": 72, "barri gòtic": 82,
      "gothic quarter": 82, "el born": 82, "el raval": 77,
      "ciutat vella": 82, "poblenou": 68,
    },
    nightlife: {
      "barri gòtic": 90, "gothic quarter": 90, "el raval": 95,
      "el born": 92, "barceloneta": 87, "gràcia": 78,
      "eixample": 72, "poblenou": 78, "sant martí": 72,
      "sarrià-sant gervasi": 22, "les corts": 30,
      "sants-montjuïc": 55, "l'hospitalet": 50, "hospitalet": 50,
    },
    budget: {
      "l'hospitalet": 85, "hospitalet": 85, "poblenou": 72,
      "sant andreu": 78, "nou barris": 82, "horta-guinardó": 77,
      "sants-montjuïc": 68, "sant martí": 67, "el raval": 72,
      "gràcia": 62, "barceloneta": 62, "barri gòtic": 57,
      "gothic quarter": 57, "eixample": 40,
      "sarrià-sant gervasi": 18, "pedralbes": 12,
    },
    family: {
      "sarrià-sant gervasi": 82, "sant gervasi": 80, "les corts": 82,
      "gràcia": 78, "horta-guinardó": 72, "eixample": 67,
      "sant martí": 67, "sants-montjuïc": 62, "nou barris": 65,
      "barceloneta": 72, "barri gòtic": 57, "gothic quarter": 57,
      "el raval": 38, "l'hospitalet": 57, "hospitalet": 57,
    },
    "first-time": {
      "barri gòtic": 97, "gothic quarter": 97, "el born": 92,
      "eixample": 92, "barceloneta": 82, "gràcia": 72,
      "sants-montjuïc": 67, "sarrià-sant gervasi": 45,
      "les corts": 52, "el raval": 72,
      "l'hospitalet": 28, "hospitalet": 28,
    },
    walkable: {
      "barri gòtic": 97, "gothic quarter": 97, "el born": 92,
      "eixample": 88, "gràcia": 87, "barceloneta": 82,
      "el raval": 82, "sarrià-sant gervasi": 57,
      "sants-montjuïc": 62, "sant martí": 67,
      "l'hospitalet": 42, "hospitalet": 42, "les corts": 60, "poblenou": 65,
    },
  },
};

// Best neighborhood per preference per city (used in "less X than Y" comparisons)
const CITY_BEST_NEIGHBORHOOD: Record<string, Record<string, string>> = {
  barcelona: {
    quiet:        "Sarrià-Sant Gervasi",
    luxury:       "Eixample",
    food:         "Eixample",
    sightseeing:  "Gothic Quarter",
    transit:      "Eixample",
    nightlife:    "El Raval",
    "first-time": "Gothic Quarter",
    walkable:     "Gothic Quarter",
    budget:       "L'Hospitalet",
    family:       "Sarrià-Sant Gervasi",
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
  neighborhood_fit_score:  number;
  inferred_neighborhood:   string;
  neighborhood_fit_label:  string;
  location_summary: string;
  transit_note:     string;
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
    // Barcelona
    ["passeig de gràcia", "Eixample"],
    ["paseo de gracia",   "Eixample"],
    ["eixample",          "Eixample"],
    ["barri gòtic",       "Gothic Quarter"],
    ["barri gotic",       "Gothic Quarter"],
    ["gothic quarter",    "Gothic Quarter"],
    ["el born",           "El Born"],
    ["barceloneta",       "Barceloneta"],
    ["sarrià",            "Sarrià-Sant Gervasi"],
    ["sant gervasi",      "Sarrià-Sant Gervasi"],
    ["pedralbes",         "Sarrià-Sant Gervasi"],
    ["el raval",          "El Raval"],
    ["raval",             "El Raval"],
    ["poblenou",          "Poblenou"],
    ["sants",             "Sants-Montjuïc"],
    // Paris
    ["le marais",           "Le Marais"],
    ["saint-germain",       "Saint-Germain"],
    ["latin quarter",       "Latin Quarter"],
    ["quartier latin",      "Latin Quarter"],
    ["montmartre",          "Montmartre"],
    ["bastille",            "Bastille / 11th"],
    ["canal saint-martin",  "Canal Saint-Martin"],
    ["champs-élysées",      "Champs-Élysées / 8th"],
    ["champs elysees",      "Champs-Élysées / 8th"],
    ["louvre",              "Louvre / 1st"],
    ["eiffel",              "Eiffel Tower / 7th"],
    // Generic
    ["old town",        "Old Town"],
    ["historic center", "Historic Center"],
    ["city center",     "City Center"],
    ["city centre",     "City Centre"],
    ["downtown",        "Downtown"],
    ["waterfront",      "Waterfront"],
  ] as const;

  for (const [keyword, name] of patterns) {
    if (allText.includes(keyword)) return name;
  }
  return "";
}

/**
 * Look up a pre-calibrated neighborhood fit score for a specific city/pref combo.
 * Returns null when this city isn't in the table (falls back to dynamic scoring).
 */
function lookupCityNeighborhoodScore(
  destination: string,
  neighborhood: string,
  hotelAddress: string,
  pref: string,
): number | null {
  const destL  = destination.toLowerCase();
  const addrL  = hotelAddress.toLowerCase();
  const nbhdL  = neighborhood.toLowerCase();

  let cityKey: string | null = null;
  if (destL.includes("barcelona")) cityKey = "barcelona";
  if (!cityKey) return null;

  const prefTable = NEIGHBORHOOD_FIT_TABLES[cityKey]?.[pref];
  if (!prefTable) return null;

  // Sub-district detection: check address for more-specific areas
  if (cityKey === "barcelona") {
    if (addrL.includes("passeig de gràcia") || addrL.includes("paseo de gracia"))
      return prefTable["passeig de gràcia"] ?? prefTable["eixample"] ?? null;
    if (addrL.includes("barceloneta"))
      return prefTable["barceloneta"] ?? null;
    if (addrL.includes("el born") || addrL.includes("barri del born"))
      return prefTable["el born"] ?? null;
    if (addrL.includes("el raval") || (addrL.includes("raval") && !addrL.includes("naval")))
      return prefTable["el raval"] ?? null;
    if (addrL.includes("barri gòtic") || addrL.includes("barri gotic") || addrL.includes("gothic quarter"))
      return prefTable["gothic quarter"] ?? prefTable["barri gòtic"] ?? null;
    if (addrL.includes("poblenou"))   return prefTable["poblenou"]          ?? null;
    if (addrL.includes("pedralbes"))  return prefTable["pedralbes"]         ?? null;
    if (addrL.includes("sant gervasi"))  return prefTable["sant gervasi"]   ?? prefTable["sarrià-sant gervasi"] ?? null;
    if (addrL.includes("sarrià") || addrL.includes("sarria"))
      return prefTable["sarrià-sant gervasi"] ?? null;
    if (addrL.includes("sants") && !addrL.includes("sant andreu") && !addrL.includes("sant gervasi"))
      return prefTable["sants-montjuïc"] ?? null;
    if (addrL.includes("gràcia") || addrL.includes("gracia"))
      return prefTable["gràcia"] ?? null;
  }

  // Exact match on neighborhood name
  if (prefTable[nbhdL] !== undefined) return prefTable[nbhdL];

  // Partial match: table key inside neighborhood name, or vice versa
  for (const [key, score] of Object.entries(prefTable)) {
    if (nbhdL.includes(key) || key.includes(nbhdL)) return score;
  }

  return null;
}

function computeNeighborhoodFit(
  hotel: ProviderHotel,
  prefs: string[],
  enrichment: PlacesEnrichment | undefined,
  inferredNeighborhood: string,
  destination: string,
): number {
  if (prefs.length === 0) return 0;

  let total = 0;

  for (const pref of prefs) {
    let score = 0;

    // ── City table lookup (highest priority) ──────────────────────────────────
    const tableScore = lookupCityNeighborhoodScore(
      destination,
      inferredNeighborhood,
      hotel.address + " " + hotel.name,
      pref,
    );

    if (tableScore !== null) {
      score = tableScore;
    } else if (enrichment) {
      // ── Places-based scoring ───────────────────────────────────────────────
      if (enrichment.bestFor.includes(pref)) score += 65;
      else                                   score += 12;

      if (pref === "transit" && enrichment.transitNote) {
        const m = enrichment.transitNote.match(/(\d+)\s*min/);
        const mins = m ? parseInt(m[1]) : 10;
        if (mins <= 3)       score += 28;
        else if (mins <= 7)  score += 18;
        else if (mins <= 12) score += 8;
      }

      const summLower = (enrichment.locationSummary + " " + enrichment.transitNote).toLowerCase();
      if (pref === "food"        && summLower.includes("dining"))    score += 15;
      if (pref === "walkable"    && summLower.includes("walkable"))  score += 15;
      if (pref === "sightseeing" && summLower.includes("sights"))    score += 15;
      if (pref === "quiet"       && summLower.includes("quiet"))     score += 15;
      if (pref === "nightlife"   && summLower.includes("nightlife")) score += 15;
    } else {
      // ── Keyword fallback (SerpAPI data only) ──────────────────────────────
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

    // Compute inferred neighborhood before fit scoring (it's an input to the score)
    const inferred_neighborhood =
      enrichment?.neighborhood || inferNeighborhoodFallback(h);

    const neighborhood_fit_score = computeNeighborhoodFit(
      h, prefs, enrichment, inferred_neighborhood, destination,
    );

    // Blend neighborhood fit at 30% when preferences are active
    const blendedScore = prefs.length > 0
      ? Math.round(baseScore * 0.70 + neighborhood_fit_score * 0.30)
      : baseScore;

    // Budget-only mode: shift weights heavily toward price
    const ai_score = (prefs.length === 1 && prefs[0] === "budget")
      ? Math.round(priceScore * 0.50 + reviewScore * 0.25 + locationScore * 0.10 + starsScore * 0.08 + walkScore * 0.07)
      : blendedScore;

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

function assignLabels(scored: HotelOffer[], prefs: string[]): void {
  if (scored.length === 0) return;
  const claim = (h: HotelOffer, label: string) => { if (!h.recommendation_label) h.recommendation_label = label; };

  // Best Overall: when prefs are active, only consider hotels with NF >= 60
  // so the pick reflects the user's stated preferences.
  const prefAwarePool = prefs.length > 0
    ? scored.filter((h) => h.neighborhood_fit_score >= 60)
    : scored;
  const bestPool    = prefAwarePool.length > 0 ? prefAwarePool : scored;
  const bestOverall = bestPool.reduce((a, b) => b.ai_score > a.ai_score ? b : a);
  claim(bestOverall, "Best Overall");

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

/** Returns a short positive description for a pref+score combo. */
function prefStrengthCopy(pref: string, score: number, neighborhood: string, cityKey: string | null): string {
  const high = score >= 75;
  const nbhdL = neighborhood.toLowerCase();

  if (high && cityKey === "barcelona") {
    if (pref === "luxury") {
      if (nbhdL.includes("passeig") || nbhdL.includes("eixample"))
        return "upscale shopping on Passeig de Gràcia, excellent fine dining";
      if (nbhdL.includes("sarrià") || nbhdL.includes("sant gervasi") || nbhdL.includes("pedralbes"))
        return "prestigious upscale residential area";
    }
    if (pref === "quiet") {
      if (nbhdL.includes("sarrià") || nbhdL.includes("sant gervasi") || nbhdL.includes("pedralbes"))
        return "quiet leafy residential streets";
      if (nbhdL.includes("gràcia") || nbhdL.includes("gracia"))
        return "relaxed village feel with quiet plazas";
    }
    if (pref === "food" && (nbhdL.includes("eixample") || nbhdL.includes("born")))
      return "exceptional restaurant density, Michelin-starred chefs";
    if (pref === "sightseeing" && (nbhdL.includes("gòtic") || nbhdL.includes("gothic") || nbhdL.includes("born")))
      return "surrounded by Barcelona's historic landmarks";
    if (pref === "nightlife" && (nbhdL.includes("raval") || nbhdL.includes("born") || nbhdL.includes("gòtic")))
      return "heart of Barcelona's nightlife and bar scene";
  }

  switch (pref) {
    case "luxury":      return high ? "excellent luxury options"          : "moderate luxury offering";
    case "quiet":       return high ? "quiet, residential atmosphere"     : "reasonably quiet";
    case "food":        return high ? "outstanding local dining scene"    : "solid restaurant selection";
    case "sightseeing": return high ? "prime sightseeing location"        : "good access to attractions";
    case "transit":     return high ? "excellent transit links"           : "decent transit access";
    case "nightlife":   return high ? "vibrant nightlife scene"           : "some evening options";
    case "first-time":  return high ? "ideal first-visit location"        : "accessible for newcomers";
    case "walkable":    return high ? "highly walkable streets"           : "walkable area";
    case "budget":      return high ? "budget-friendly neighborhood"      : "moderate local prices";
    case "family":      return high ? "family-friendly neighborhood"      : "suitable for families";
    default:            return high ? "excellent match"                   : "decent match";
  }
}

/** Returns an adjective for the "less X than Y" comparison. */
function prefAdjective(pref: string): string {
  const map: Record<string, string> = {
    luxury: "upscale", quiet: "quiet", food: "dining-focused",
    sightseeing: "tourist-centric", transit: "transit-connected",
    nightlife: "lively", "first-time": "tourist-central",
    walkable: "walkable", budget: "budget-friendly", family: "family-oriented",
  };
  return map[pref] ?? pref;
}

function buildWhy(
  h: HotelOffer,
  all: HotelOffer[],
  prefs: string[],
  enrichment: PlacesEnrichment | undefined,
  destination: string,
): string {
  const cheapest  = all.reduce((a, b) => a.price_per_night <= b.price_per_night ? a : b);
  const priceDiff = Math.round(h.price_per_night - cheapest.price_per_night);
  const parts: string[] = [];

  const nbhd    = h.inferred_neighborhood;
  const destL   = destination.toLowerCase();
  const cityKey = destL.includes("barcelona") ? "barcelona" : null;

  // ── Location context ───────────────────────────────────────────────────────
  if (prefs.length > 0 && nbhd) {
    // Score each pref for this hotel's neighborhood
    const prefScores = prefs.map((p) => ({
      pref: p,
      score: lookupCityNeighborhoodScore(destination, nbhd, h.address, p)
             ?? (enrichment?.bestFor.includes(p) ? 65 : 20),
    }));

    const strongFits = prefScores.filter((ps) => ps.score >= 75);
    const mediumFits = prefScores.filter((ps) => ps.score >= 50 && ps.score < 75);
    const weakFits   = prefScores.filter((ps) => ps.score < 50);

    const locationParts: string[] = [];

    if (strongFits.length > 0) {
      locationParts.push(
        strongFits.slice(0, 2).map((ps) => prefStrengthCopy(ps.pref, ps.score, nbhd, cityKey)).join(", ")
      );
    }
    if (mediumFits.length > 0) {
      locationParts.push(
        mediumFits.slice(0, 1).map((ps) => prefStrengthCopy(ps.pref, ps.score, nbhd, cityKey)).join(", ")
      );
    }
    if (weakFits.length > 0 && cityKey) {
      const comparisons = weakFits.flatMap((ps) => {
        const bestNbhd = CITY_BEST_NEIGHBORHOOD[cityKey]?.[ps.pref];
        if (bestNbhd && bestNbhd.toLowerCase() !== nbhd.toLowerCase()) {
          return [`less ${prefAdjective(ps.pref)} than ${bestNbhd}`];
        }
        return [];
      });
      if (comparisons.length > 0) locationParts.push(comparisons[0]);
    }

    if (locationParts.length > 0) {
      parts.push(`${nbhd} — ${locationParts.join("; ")}`);
    } else if (enrichment?.locationSummary) {
      parts.push(`${nbhd} — ${enrichment.locationSummary}`);
    } else {
      parts.push(`In ${nbhd}`);
    }
  } else if (enrichment) {
    if (nbhd) {
      const summaryPart = enrichment.locationSummary
        ? `${nbhd} — ${enrichment.locationSummary}`
        : nbhd;
      const matchedPrefs = prefs.filter((p) => enrichment.bestFor.includes(p));
      if (matchedPrefs.length > 0) {
        const pl = matchedPrefs.slice(0, 2).map((p) => PREF_DISPLAY[p] ?? p).join(" and ");
        parts.push(`${summaryPart} — great for ${pl}`);
      } else {
        parts.push(summaryPart);
      }
    }
    if (
      enrichment.transitNote &&
      !enrichment.locationSummary.toLowerCase().includes("metro") &&
      !enrichment.locationSummary.toLowerCase().includes("transit")
    ) {
      parts.push(enrichment.transitNote);
    }
  } else if (nbhd) {
    parts.push(`In ${nbhd}`);
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

  const serpResult = await searchGoogleHotels({ destination, check_in, check_out, guests, rooms }, serpApiKey);

  if (serpResult.hotels.length === 0) {
    return NextResponse.json({ status: "empty", message: `No hotels found for "${destination}". Try a different city name.`, offers: [] });
  }

  const deduped = deduplicateHotels(serpResult.hotels);
  console.log(`[hotels] raw=${serpResult.rawCount}  deduped=${deduped.length}  prefs=[${neighborhood_prefs.join(",")}]  places=${!!placesApiKey}  (serp=${serpResult.latencyMs}ms)`);

  let enrichments = new Map<string, PlacesEnrichment>();
  if (placesApiKey) {
    enrichments = await enrichWithGooglePlaces(deduped, destination, placesApiKey);
  }

  const scored = scoreHotels(deduped, neighborhood_prefs, destination, enrichments).map((h) => ({ ...h, nights }));

  scored.sort((a, b) =>
    b.ai_score !== a.ai_score ? b.ai_score - a.ai_score : a.price_per_night - b.price_per_night
  );

  assignLabels(scored, neighborhood_prefs);

  for (const h of scored) {
    h.recommendation_why = buildWhy(h, scored, neighborhood_prefs, enrichments.get(h.hotel_id), destination);
  }

  console.log(`[pipeline] ${scored.length}_offers_rendered_as_cards=${scored.length} (reranked=${neighborhood_prefs.length > 0 ? scored.length : 0})`);

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

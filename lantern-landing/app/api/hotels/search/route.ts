import { NextResponse } from "next/server";
import { searchGoogleHotels } from "../providers/googleHotels";
import type { NearbyPlace, ProviderHotel } from "../providers/types";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

// ── Neighborhood preference signals ──────────────────────────────────────────
// Each preference maps to keyword lists across the hotel data sources.
// "nearbyTerms" match against SerpAPI nearby_places[].name (strongest signal).
// "addressTerms" match against hotel.address.
// "descTerms" match against hotel.description.
// "amenityTerms" match against hotel.amenities.

const PREF_SIGNALS: Record<string, {
  nearbyTerms: string[];
  addressTerms: string[];
  descTerms: string[];
  amenityTerms: string[];
}> = {
  "first-time": {
    nearbyTerms: [
      "eiffel", "louvre", "notre dame", "big ben", "colosseum", "sagrada familia",
      "acropolis", "times square", "central park", "trevi", "vatican", "buckingham",
      "tower of london", "sacré-cœur", "sacre-coeur", "pantheon", "duomo",
      "empire state", "golden gate", "coliseum", "kremlin", "alhambra",
    ],
    addressTerms: ["old town", "historic", "city centre", "city center", "centro", "altstadt"],
    descTerms: ["iconic", "heart of the city", "center of", "famous", "landmark", "must-see"],
    amenityTerms: ["tour desk", "concierge"],
  },
  "sightseeing": {
    nearbyTerms: [
      "museum", "gallery", "monument", "cathedral", "basilica", "palace", "castle",
      "temple", "shrine", "colosseum", "forum", "ruins", "aquarium", "zoo",
      "national park", "historic site", "art museum", "natural history",
    ],
    addressTerms: ["museum", "gallery", "palace", "historic", "heritage"],
    descTerms: ["museum", "gallery", "historic", "cultural", "sightseeing", "landmark", "arts"],
    amenityTerms: ["tour desk", "concierge"],
  },
  "food": {
    nearbyTerms: [
      "restaurant", "market", "food hall", "brasserie", "cafe", "bistro",
      "street food", "farmers market", "covered market", "les halles",
      "food market", "tavern", "trattoria", "ramen", "sushi",
    ],
    addressTerms: ["market", "food street", "restaurant row"],
    descTerms: ["culinary", "restaurant", "dining", "gastronomic", "chef", "cuisine", "food scene"],
    amenityTerms: ["restaurant", "bar", "breakfast included", "rooftop restaurant"],
  },
  "nightlife": {
    nearbyTerms: [
      "bar", "nightclub", "club", "lounge", "pub", "brewery", "wine bar",
      "cocktail bar", "jazz club", "oberkampf", "soho", "castro",
    ],
    addressTerms: ["oberkampf", "bastille", "pigalle", "soho", "entertainment"],
    descTerms: ["vibrant", "lively", "nightlife", "trendy", "hip", "buzzing", "young crowd"],
    amenityTerms: ["bar", "rooftop bar", "nightclub"],
  },
  "quiet": {
    nearbyTerms: ["park", "garden", "botanical garden", "lake", "riverside", "nature reserve", "forest"],
    addressTerms: ["residential", "quiet", "peaceful", "garden district"],
    descTerms: ["quiet", "peaceful", "serene", "tranquil", "relaxing", "oasis", "residential"],
    amenityTerms: ["spa", "garden", "yoga", "meditation", "wellness"],
  },
  "luxury": {
    nearbyTerms: [
      "champs-élysées", "champs elysees", "fifth avenue", "rodeo drive",
      "knightsbridge", "mayfair", "avenue montaigne",
    ],
    addressTerms: ["grand", "plaza", "royal", "palace", "luxury", "prestige"],
    descTerms: ["luxury", "luxurious", "five-star", "5-star", "prestigious", "exclusive", "elite"],
    amenityTerms: ["spa", "butler service", "valet parking", "fine dining", "pool", "fitness center"],
  },
  "budget": {
    nearbyTerms: [],
    addressTerms: [],
    descTerms: ["affordable", "budget", "value", "economical", "great deal"],
    amenityTerms: ["free wifi", "free breakfast", "kitchenette", "self-catering"],
  },
  "family": {
    nearbyTerms: [
      "zoo", "aquarium", "theme park", "playground", "disney", "lego",
      "children's museum", "science museum", "water park",
    ],
    addressTerms: [],
    descTerms: ["family", "children", "kids", "family-friendly", "connecting rooms"],
    amenityTerms: ["pool", "kids club", "family room", "playground", "babysitting", "children's menu"],
  },
  "transit": {
    nearbyTerms: [
      "metro", "subway", "train station", "bus station", "tram stop",
      "rail", "tube", "gare", "bahnhof", "stazione", "station",
    ],
    addressTerms: ["station", "metro", "transit hub", "transport hub"],
    descTerms: ["metro station", "subway", "train station", "bus stop", "well connected", "transport links"],
    amenityTerms: ["airport shuttle", "free shuttle", "metro pass"],
  },
  "walkable": {
    nearbyTerms: [
      "shopping", "mall", "market", "park", "plaza", "square",
      "promenade", "waterfront", "boardwalk", "high street",
    ],
    addressTerms: ["downtown", "central", "city centre", "city center", "midtown", "old town"],
    descTerms: ["walkable", "walking distance", "central location", "steps from", "heart of", "pedestrian"],
    amenityTerms: [],
  },
};

// ── Paris neighborhood inference ──────────────────────────────────────────────
// Keywords drawn from landmark names SerpAPI returns in nearby_places, plus
// street names and arrondissement numbers that appear in addresses.

const PARIS_NEIGHBORHOODS: Array<{
  name: string;
  keywords: string[];
  bestFor: string[];
}> = [
  {
    name: "Champs-Élysées / 8th",
    keywords: ["champs-élysées", "champs elysees", "arc de triomphe", "avenue montaigne", "8e arrondissement", "8th arrondissement", " 8e "],
    bestFor: ["luxury", "sightseeing", "first-time"],
  },
  {
    name: "Eiffel Tower / 7th",
    keywords: ["eiffel tower", "champ de mars", "trocadéro", "trocadero", "invalides", "musée d'orsay", "orsay", "7e arrondissement", "7th arrondissement", " 7e "],
    bestFor: ["sightseeing", "first-time", "quiet", "luxury"],
  },
  {
    name: "Louvre / 1st",
    keywords: ["louvre", "les halles", "châtelet", "chatelet", "palais royal", "rue de rivoli", "1er arrondissement", "1st arrondissement", " 1er "],
    bestFor: ["first-time", "sightseeing", "walkable"],
  },
  {
    name: "Le Marais",
    keywords: ["le marais", "centre pompidou", "pompidou", "place des vosges", "rue de bretagne", "3e arrondissement", "4e arrondissement", "3rd arrondissement", "4th arrondissement", " 3e ", " 4e "],
    bestFor: ["sightseeing", "food", "walkable", "first-time", "nightlife"],
  },
  {
    name: "Saint-Germain",
    keywords: ["saint-germain", "st-germain", "odéon", "odeon", "jardin du luxembourg", "luxembourg", "6e arrondissement", "6th arrondissement", " 6e "],
    bestFor: ["food", "quiet", "walkable", "sightseeing", "luxury"],
  },
  {
    name: "Latin Quarter",
    keywords: ["latin quarter", "quartier latin", "sorbonne", "panthéon", "pantheon", "5e arrondissement", "5th arrondissement", " 5e "],
    bestFor: ["food", "walkable", "sightseeing", "budget"],
  },
  {
    name: "Opéra / Grands Boulevards",
    keywords: ["opéra garnier", "opera garnier", "grands boulevards", "galeries lafayette", "printemps", "9e arrondissement", "9th arrondissement", " 9e "],
    bestFor: ["first-time", "sightseeing", "walkable"],
  },
  {
    name: "Montmartre",
    keywords: ["montmartre", "sacré-cœur", "sacre coeur", "18e arrondissement", "18th arrondissement", " 18e "],
    bestFor: ["sightseeing", "first-time", "budget", "food"],
  },
  {
    name: "Bastille / 11th",
    keywords: ["bastille", "oberkampf", "place de la bastille", "11e arrondissement", "11th arrondissement", " 11e "],
    bestFor: ["nightlife", "food", "walkable"],
  },
  {
    name: "Canal Saint-Martin",
    keywords: ["canal saint-martin", "canal st martin", "gare du nord", "gare de l'est", "10e arrondissement", "10th arrondissement", " 10e "],
    bestFor: ["food", "nightlife", "budget"],
  },
];

// ── Generic neighborhood patterns (any city) ──────────────────────────────────

const GENERIC_NEIGHBORHOOD_PATTERNS: Array<{ pattern: string; name: string }> = [
  { pattern: "old town",          name: "Old Town" },
  { pattern: "historic center",   name: "Historic Center" },
  { pattern: "historic centre",   name: "Historic Centre" },
  { pattern: "old city",          name: "Old City" },
  { pattern: "downtown",          name: "Downtown" },
  { pattern: "city center",       name: "City Center" },
  { pattern: "city centre",       name: "City Centre" },
  { pattern: "financial district",name: "Financial District" },
  { pattern: "waterfront",        name: "Waterfront" },
  { pattern: "beachfront",        name: "Beachfront" },
  { pattern: "beach",             name: "Beachside" },
  { pattern: "midtown",           name: "Midtown" },
  { pattern: "uptown",            name: "Uptown" },
  { pattern: "soho",              name: "SoHo" },
  { pattern: "left bank",         name: "Left Bank" },
  { pattern: "right bank",        name: "Right Bank" },
];

// ── Scored hotel shape returned to the client ─────────────────────────────────

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
  // Neighborhood fields (populated when neighborhood_prefs are provided)
  neighborhood_fit_score:  number;   // 0–100; 0 when no prefs
  inferred_neighborhood:   string;   // "" if not determined
  neighborhood_fit_label:  string;   // "Great fit" | "Good fit" | "Partial fit" | ""
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function inferNeighborhood(hotel: ProviderHotel, destination: string): string {
  const dest = destination.toLowerCase().trim();
  const allText = [
    hotel.name, hotel.address, hotel.description,
    ...hotel.nearbyPlaces.map((p) => p.name),
  ].join(" ").toLowerCase();

  if (dest.includes("paris")) {
    for (const nh of PARIS_NEIGHBORHOODS) {
      if (nh.keywords.some((k) => allText.includes(k.toLowerCase()))) return nh.name;
    }
  }

  for (const { pattern, name } of GENERIC_NEIGHBORHOOD_PATTERNS) {
    if (allText.includes(pattern)) return name;
  }

  return "";
}

function computeNeighborhoodFit(hotel: ProviderHotel, prefs: string[]): number {
  if (prefs.length === 0) return 0;

  // Build walk-time map: place name → min walking minutes
  const walkMinutes = new Map<string, number>();
  for (const p of hotel.nearbyPlaces) {
    const mins = p.transportations
      .filter((t) => t.type.toLowerCase().includes("walk"))
      .map((t) => parseDurationMinutes(t.duration));
    if (mins.length > 0) walkMinutes.set(p.name.toLowerCase(), Math.min(...mins));
  }

  const nearbyNames = hotel.nearbyPlaces.map((p) => p.name.toLowerCase());
  const addressLower = (hotel.address + " " + hotel.name).toLowerCase();
  const descLower    = hotel.description.toLowerCase();
  const amenLower    = hotel.amenities.map((a) => a.toLowerCase());

  let totalScore = 0;

  for (const pref of prefs) {
    const signals = PREF_SIGNALS[pref];
    if (!signals) { totalScore += 50; continue; }

    let prefScore = 0;

    // Nearby places (strongest signal)
    outer:
    for (const term of signals.nearbyTerms) {
      const tl = term.toLowerCase();
      for (const nn of nearbyNames) {
        if (nn.includes(tl)) {
          const walk = walkMinutes.get(nn) ?? 999;
          if (walk <= 5)       prefScore += 40;
          else if (walk <= 10) prefScore += 28;
          else if (walk <= 20) prefScore += 15;
          else                 prefScore += 6;
          break outer;
        }
      }
    }

    // Address / hotel name
    let addrHits = 0;
    for (const term of signals.addressTerms) {
      if (addressLower.includes(term.toLowerCase())) addrHits++;
    }
    prefScore += Math.min(25, addrHits * 13);

    // Description (weaker — marketing copy)
    let descHits = 0;
    for (const term of signals.descTerms) {
      if (descLower.includes(term.toLowerCase())) descHits++;
    }
    prefScore += Math.min(20, descHits * 7);

    // Amenities (reliable for feature-based prefs)
    let amenHits = 0;
    for (const term of signals.amenityTerms) {
      if (amenLower.some((a) => a.includes(term.toLowerCase()))) amenHits++;
    }
    prefScore += Math.min(25, amenHits * 12);

    // Star-rating adjustments
    if (pref === "luxury") {
      if (hotel.starRating >= 5)      prefScore += 20;
      else if (hotel.starRating >= 4) prefScore += 10;
    }
    if (pref === "budget") {
      // Low-price hotels are implicitly preferred via price score; give small base
      prefScore += 12;
    }

    totalScore += Math.min(100, prefScore);
  }

  return Math.round(totalScore / prefs.length);
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
): HotelOffer[] {
  const prices    = hotels.map((h) => h.pricePerNight);
  const minP      = Math.min(...prices);
  const maxP      = Math.max(...prices);
  const priceRange = Math.max(1, maxP - minP);

  return hotels.map((h) => {
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

    const neighborhood_fit_score = computeNeighborhoodFit(h, prefs);
    const inferred_neighborhood  = inferNeighborhood(h, destination);
    const neighborhood_fit_label = neighborhoodFitLabel(neighborhood_fit_score, prefs);

    // Blend neighborhood fit into composite score when preferences are active
    const ai_score = prefs.length > 0
      ? Math.round(baseScore * 0.75 + neighborhood_fit_score * 0.25)
      : baseScore;

    // For "budget" pref, boost price score and re-blend when it's the only pref
    const budgetAdj = prefs.includes("budget") && prefs.length === 1
      ? Math.round(priceScore * 0.50 + reviewScore * 0.25 + locationScore * 0.10 + starsScore * 0.08 + walkScore * 0.07)
      : ai_score;

    return {
      hotel_id:             h.sourceHotelId,
      source:               h.source,
      name:                 h.name,
      address:              h.address,
      star_rating:          h.starRating,
      overall_rating:       h.overallRating,
      review_count:         h.reviewCount,
      location_rating:      h.locationRating,
      price_per_night:      h.pricePerNight,
      total_price:          h.totalPrice,
      nights:               0, // filled in POST handler
      currency:             h.currency,
      amenities:            h.amenities,
      image_url:            h.imageUrl,
      booking_url:          h.bookingUrl,
      check_in:             h.checkIn,
      check_out:            h.checkOut,
      hotel_type:           h.hotelType,
      eco_certified:        h.ecoCertified,
      description:          h.description,
      ai_score:             prefs.includes("budget") && prefs.length === 1 ? budgetAdj : ai_score,
      recommendation_label: "",
      recommendation_why:   "",
      nearby_walk:          nearestWalk(h.nearbyPlaces),
      score_breakdown: {
        price:       Math.round(priceScore),
        reviews:     Math.round(reviewScore),
        location:    Math.round(locationScore),
        stars:       Math.round(starsScore),
        walkability: Math.round(walkScore),
      },
      neighborhood_fit_score,
      inferred_neighborhood,
      neighborhood_fit_label,
    };
  });
}

// ── Label assignment ──────────────────────────────────────────────────────────

function assignLabels(scored: HotelOffer[]): void {
  if (scored.length === 0) return;

  const claim = (h: HotelOffer, label: string) => {
    if (!h.recommendation_label) h.recommendation_label = label;
  };

  const byScore = [...scored].sort((a, b) => b.ai_score - a.ai_score);
  claim(byScore[0], "Best Overall");

  const luxCandidates = scored
    .filter((h) => h.star_rating >= 4 && !h.recommendation_label)
    .sort((a, b) => b.star_rating !== a.star_rating ? b.star_rating - a.star_rating : b.overall_rating - a.overall_rating);
  if (luxCandidates.length > 0) claim(luxCandidates[0], "Luxury Pick");

  const locCandidates = scored.filter((h) => !h.recommendation_label);
  if (locCandidates.length > 0) {
    const loc = locCandidates.sort(
      (a, b) =>
        (b.score_breakdown.location + b.score_breakdown.walkability) -
        (a.score_breakdown.location + a.score_breakdown.walkability)
    )[0];
    claim(loc, "Best Location");
  }

  const budgetCandidates = scored
    .filter((h) => h.overall_rating >= 3.5 && !h.recommendation_label)
    .sort((a, b) => a.price_per_night - b.price_per_night);
  if (budgetCandidates.length > 0) claim(budgetCandidates[0], "Budget Pick");

  const valueCandidates = scored.filter((h) => !h.recommendation_label);
  if (valueCandidates.length > 0) {
    const val = valueCandidates.sort(
      (a, b) =>
        (b.score_breakdown.reviews + b.score_breakdown.location - b.score_breakdown.price * 0.3) -
        (a.score_breakdown.reviews + a.score_breakdown.location - a.score_breakdown.price * 0.3)
    )[0];
    claim(val, "Best Value");
  }
}

// ── Recommendation text ───────────────────────────────────────────────────────

const PREF_DISPLAY_NAMES: Record<string, string> = {
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

function buildWhy(h: HotelOffer, all: HotelOffer[], prefs: string[]): string {
  const cheapest  = all.reduce((a, b) => a.price_per_night <= b.price_per_night ? a : b);
  const priceDiff = Math.round(h.price_per_night - cheapest.price_per_night);
  const parts: string[] = [];

  // Neighborhood context
  if (h.inferred_neighborhood) {
    if (prefs.length > 0 && h.neighborhood_fit_score >= 45) {
      const matchedPrefs = prefs.filter((p) => {
        // Only mention prefs where this hotel actually fits
        const s = PREF_SIGNALS[p];
        if (!s) return false;
        const allText = [h.name, h.address, h.description, ...h.amenities].join(" ").toLowerCase();
        return (
          s.addressTerms.some((t) => allText.includes(t)) ||
          s.descTerms.some((t) => allText.includes(t)) ||
          s.amenityTerms.some((t) => allText.includes(t)) ||
          h.neighborhood_fit_score >= 55
        );
      });
      const prefLabel = matchedPrefs.slice(0, 2).map((p) => PREF_DISPLAY_NAMES[p] ?? p).join(" and ");
      if (prefLabel) {
        parts.push(`In ${h.inferred_neighborhood} — a great area for ${prefLabel}`);
      } else {
        parts.push(`In ${h.inferred_neighborhood}`);
      }
    } else {
      parts.push(`In ${h.inferred_neighborhood}`);
    }
  } else if (prefs.length > 0 && h.neighborhood_fit_score >= 65) {
    const bestPref = prefs.find((p) => PREF_SIGNALS[p] !== undefined);
    if (bestPref) parts.push(`Strong match for ${PREF_DISPLAY_NAMES[bestPref] ?? bestPref}`);
  }

  // Location / walk
  if (h.nearby_walk) {
    const { name, minutes } = h.nearby_walk;
    if (minutes <= 3)       parts.push(`steps from ${name}`);
    else if (minutes <= 8)  parts.push(`a ${minutes}-minute walk from ${name}`);
    else if (minutes <= 15) parts.push(`${minutes} minutes on foot from ${name}`);
  } else if (h.location_rating >= 9) {
    parts.push("an excellent location score");
  }

  // Review quality
  if (h.overall_rating >= 4.7)      parts.push("outstanding guest reviews");
  else if (h.overall_rating >= 4.4) parts.push("excellent reviews");
  else if (h.overall_rating >= 4.0) parts.push("very good reviews");
  else if (h.overall_rating >= 3.5) parts.push("solid guest ratings");

  // Standout amenity
  const topAmenities = ["Pool", "Spa", "Free breakfast", "Gym", "Airport shuttle", "Restaurant"];
  const highlight = h.amenities.find((a) =>
    topAmenities.some((ta) => a.toLowerCase().includes(ta.toLowerCase()))
  );
  if (highlight && parts.length < 3) parts.push(`includes ${highlight.toLowerCase()}`);

  // Price comparison
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
    if (!existing || h.pricePerNight < existing.pricePerNight) {
      seen.set(key, h);
    }
  }
  return [...seen.values()];
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  const n = Math.round((b - a) / 86_400_000);
  return n > 0 ? n : 1;
}

// ── POST /api/hotels/search ───────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON." }, { status: 400 });
  }

  const destination       = (body.destination        as string | undefined)?.trim() ?? "";
  const check_in          = (body.check_in            as string | undefined)?.trim() ?? "";
  const check_out         = (body.check_out           as string | undefined)?.trim() ?? "";
  const guests            = Math.max(1, Math.min(8, Number(body.guests  ?? 2)));
  const rooms             = Math.max(1, Math.min(4, Number(body.rooms   ?? 1)));
  const neighborhood_prefs = Array.isArray(body.neighborhood_prefs)
    ? (body.neighborhood_prefs as unknown[]).filter((p): p is string => typeof p === "string" && p in PREF_SIGNALS)
    : [];

  if (!destination || !check_in || !check_out) {
    return NextResponse.json(
      { status: "error", message: "destination, check_in, and check_out are required." },
      { status: 400 }
    );
  }

  const apiKey = (process.env.SERPAPI_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { status: "not_configured", message: "Hotel search is temporarily unavailable." },
      { status: 200 }
    );
  }

  const nights = nightsBetween(check_in, check_out);

  const result = await searchGoogleHotels(
    { destination, check_in, check_out, guests, rooms },
    apiKey,
  );

  if (result.hotels.length === 0) {
    return NextResponse.json({
      status: "empty",
      message: `No hotels found for "${destination}". Try a different city name.`,
      offers: [],
    });
  }

  const deduped = deduplicateHotels(result.hotels);
  console.log(
    `[hotels] raw=${result.rawCount}  after_dedup=${deduped.length}  prefs=[${neighborhood_prefs.join(",")}]  (${result.latencyMs}ms)`
  );

  const scored = scoreHotels(deduped, neighborhood_prefs, destination).map((h) => ({ ...h, nights }));

  scored.sort((a, b) =>
    b.ai_score !== a.ai_score ? b.ai_score - a.ai_score : a.price_per_night - b.price_per_night
  );

  assignLabels(scored);

  for (const h of scored) {
    h.recommendation_why = buildWhy(h, scored, neighborhood_prefs);
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
    offer_count: scored.length,
    offers: scored,
  });
}

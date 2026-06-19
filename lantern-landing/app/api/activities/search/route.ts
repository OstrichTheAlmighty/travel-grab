import { NextRequest, NextResponse } from "next/server";
import type { Activity, Category, Badge } from "../../../activities/data/types";
import { DESTINATION_DATA } from "../../../activities/data/tokyo";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GooglePlace {
  place_id: string;
  name: string;
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  formatted_address?: string;
  photos?: Array<{ photo_reference: string; width: number; height: number }>;
  price_level?: number;    // 0–4
  business_status?: string;
  geometry: {
    location: { lat: number; lng: number };
  };
}

interface PlacesResponse {
  results: GooglePlace[];
  status: string;
  error_message?: string;
}

interface Viewport {
  northeast: { lat: number; lng: number };
  southwest: { lat: number; lng: number };
}

interface GeoResult {
  lat: number;
  lng: number;
  viewport: Viewport;
  city: string;
  country: string;
}

// ── Server-side cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  activities: Activity[];
  city: string;
  country: string;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// ── Search group config ───────────────────────────────────────────────────────

interface SearchGroup {
  type?: string;          // nearby search
  query?: string;         // text search; {city} is substituted at runtime
  category: Category;
  limit: number;
}

const SEARCH_GROUPS: SearchGroup[] = [
  { type: "tourist_attraction", category: "culture",   limit: 20 },
  { type: "museum",             category: "culture",   limit: 15 },
  { type: "art_gallery",        category: "culture",   limit: 10 },
  { type: "amusement_park",     category: "adventure", limit: 10 },
  { type: "zoo",                category: "adventure", limit:  5 },
  { type: "aquarium",           category: "adventure", limit:  5 },
  { type: "park",               category: "nature",    limit: 15 },
  { type: "night_club",         category: "nightlife", limit: 15 },
  { type: "bar",                category: "nightlife", limit: 15 },
  { type: "shopping_mall",      category: "culture",   limit: 10 },
  { query: "food market {city}",          category: "food", limit: 10 },
  { query: "popular restaurant {city}",   category: "food", limit: 10 },
];

// ── Category / type maps ──────────────────────────────────────────────────────

const CATEGORY_GRADIENTS: Record<Category, string> = {
  food:        "radial-gradient(ellipse at 30% 25%, rgba(194,65,12,0.95) 0%, rgba(120,53,15,0.85) 45%, rgba(12,8,4,1) 100%)",
  nightlife:   "radial-gradient(ellipse at 70% 20%, rgba(79,70,229,0.85) 0%, rgba(30,27,75,0.9) 50%, rgba(5,5,18,1) 100%)",
  culture:     "radial-gradient(ellipse at 35% 30%, rgba(109,40,217,0.9) 0%, rgba(76,29,149,0.85) 45%, rgba(8,4,18,1) 100%)",
  adventure:   "radial-gradient(ellipse at 25% 45%, rgba(13,148,136,0.9) 0%, rgba(6,78,59,0.85) 45%, rgba(3,10,8,1) 100%)",
  nature:      "radial-gradient(ellipse at 50% 20%, rgba(21,128,61,0.9) 0%, rgba(20,83,45,0.85) 45%, rgba(3,10,5,1) 100%)",
  luxury:      "radial-gradient(ellipse at 60% 30%, rgba(161,107,20,0.9) 0%, rgba(120,53,15,0.8) 45%, rgba(10,7,3,1) 100%)",
  hidden_gems: "radial-gradient(ellipse at 35% 40%, rgba(147,51,234,0.9) 0%, rgba(88,28,135,0.85) 45%, rgba(8,3,15,1) 100%)",
};

const CATEGORY_EMOJI: Record<Category, string> = {
  food:        "🍜",
  nightlife:   "🌃",
  culture:     "🎭",
  adventure:   "⚡",
  nature:      "🌿",
  luxury:      "✨",
  hidden_gems: "💎",
};

const TYPE_EMOJI: Record<string, string> = {
  museum:            "🏛️",
  art_gallery:       "🎨",
  park:              "🌸",
  night_club:        "💃",
  bar:               "🍸",
  restaurant:        "🍽️",
  zoo:               "🦁",
  aquarium:          "🐠",
  amusement_park:    "🎢",
  shopping_mall:     "🛍️",
  tourist_attraction:"📸",
  food:              "🍜",
  cafe:              "☕",
  temple:            "⛩️",
  church:            "⛪",
};

const TYPE_TAGS: Record<string, string> = {
  museum:             "Museum",
  art_gallery:        "Art Gallery",
  park:               "Park",
  tourist_attraction: "Sightseeing",
  night_club:         "Nightclub",
  bar:                "Bar",
  restaurant:         "Restaurant",
  shopping_mall:      "Shopping",
  zoo:                "Zoo",
  aquarium:           "Aquarium",
  amusement_park:     "Theme Park",
  church:             "Historic Site",
  hindu_temple:       "Temple",
  place_of_worship:   "Cultural Site",
  food:               "Food",
  cafe:               "Café",
  natural_feature:    "Nature",
  spa:                "Spa",
  movie_theater:      "Cinema",
  bowling_alley:      "Bowling",
  casino:             "Casino",
  stadium:            "Stadium",
};

const SKIP_TYPES = new Set([
  "establishment", "point_of_interest", "premise", "political",
  "locality", "country", "route", "street_address", "postal_code",
  "administrative_area_level_1", "administrative_area_level_2",
  "sublocality", "sublocality_level_1", "neighborhood", "geocode",
  "colloquial_area", "continent",
]);

// ── Utility ───────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractNeighborhood(vicinity: string | undefined, fallback: string): string {
  if (!vicinity) return fallback;
  const parts = vicinity.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
  // Prefer the second segment (ward / district) when available
  const candidate = parts.length >= 2 ? parts[1] : parts[0];
  // Strip leading street numbers like "2-3-1 "
  return candidate.replace(/^[\d][\d\-]*\s+/, "") || fallback;
}

function pickEmoji(types: string[]): string {
  for (const t of types) {
    if (TYPE_EMOJI[t]) return TYPE_EMOJI[t];
  }
  return "📍";
}

function buildTags(types: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of types) {
    if (SKIP_TYPES.has(t)) continue;
    const label = TYPE_TAGS[t];
    if (label && !seen.has(label)) {
      seen.add(label);
      tags.push(label);
    }
  }
  return tags.slice(0, 4);
}

function estimateDuration(types: string[]): string {
  if (types.includes("museum"))          return "2–3 hours";
  if (types.includes("art_gallery"))     return "1–2 hours";
  if (types.includes("amusement_park"))  return "3–5 hours";
  if (types.includes("zoo"))             return "2–4 hours";
  if (types.includes("aquarium"))        return "1.5–2 hours";
  if (types.includes("park"))            return "1–2 hours";
  if (types.includes("night_club"))      return "3–4 hours";
  if (types.includes("bar"))             return "1.5–3 hours";
  if (types.includes("restaurant"))      return "1–1.5 hours";
  if (types.includes("shopping_mall"))   return "2–3 hours";
  if (types.includes("tourist_attraction")) return "1–2 hours";
  return "1–2 hours";
}

function estimatePrice(priceLevel: number | undefined): { price: string; isFree: boolean } {
  switch (priceLevel) {
    case 0:  return { price: "Free",   isFree: true  };
    case 1:  return { price: "$",      isFree: false };
    case 2:  return { price: "$$",     isFree: false };
    case 3:  return { price: "$$$",    isFree: false };
    case 4:  return { price: "$$$$",   isFree: false };
    default: return { price: "Varies", isFree: false };
  }
}

function generateBadges(place: GooglePlace): Badge[] {
  const types  = place.types ?? [];
  const rating = place.rating ?? 0;
  const count  = place.user_ratings_total ?? 0;
  const badges: Badge[] = [];

  if (place.price_level === 0)                        badges.push("free");
  if (place.price_level === 4)                        badges.push("worth_the_splurge");
  if (rating >= 4.5 && count >= 1000)                 badges.push("popular");
  if (rating >= 4.7 && count > 0 && count < 300)      badges.push("hidden_gem");
  if (types.some((t) => ["park", "zoo", "aquarium", "amusement_park"].includes(t))) {
    badges.push("family_friendly");
  }

  return [...new Set(badges)].slice(0, 3) as Badge[];
}

function buildDescription(place: GooglePlace, neighborhood: string): string {
  const parts: string[] = [];
  if (neighborhood) parts.push(`Located in ${neighborhood}.`);
  if (place.rating && place.user_ratings_total) {
    const n = place.user_ratings_total;
    const nStr = n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
    parts.push(`Rated ${place.rating.toFixed(1)}/5 by ${nStr} visitors.`);
  }
  const tags = buildTags(place.types ?? []).slice(0, 2).join(" & ");
  if (tags) parts.push(`Category: ${tags}.`);
  return parts.join(" ") || "A popular destination.";
}

function buildWhyVisit(place: GooglePlace, category: Category, city: string): string {
  const r     = place.rating;
  const n     = place.user_ratings_total ?? 0;
  const nStr  = n >= 1000 ? `${Math.round(n / 1000)}k` : n > 0 ? String(n) : null;
  const rPart = r ? `Rated ${r.toFixed(1)}/5${nStr ? ` by ${nStr} visitors` : ""}.` : "";

  const suffix: Record<Category, string> = {
    food:        `A well-regarded food and dining experience in ${city}.`,
    nightlife:   `Known for its lively atmosphere and vibrant nightlife.`,
    culture:     `One of ${city}'s most celebrated cultural attractions.`,
    adventure:   `A memorable activity worth building time around.`,
    nature:      `A peaceful natural escape from the urban bustle of ${city}.`,
    luxury:      `A premium experience for those looking to treat themselves.`,
    hidden_gems: `Less crowded than the famous tourist spots but highly regarded by those who seek it out.`,
  };

  return [rPart, suffix[category]].filter(Boolean).join(" ");
}

function mapToActivity(place: GooglePlace, category: Category, city: string): Activity {
  const types       = place.types ?? [];
  const { price, isFree } = estimatePrice(place.price_level);
  const vicinity    = place.vicinity ?? place.formatted_address;
  const neighborhood = extractNeighborhood(vicinity, city);
  const badges      = generateBadges(place);

  // Promote to hidden_gems if badge earned and not food/nightlife (those have rich sub-filters already)
  const finalCategory: Category =
    badges.includes("hidden_gem") && !["food", "nightlife"].includes(category)
      ? "hidden_gems"
      : category;

  return {
    id:          place.place_id,
    title:       place.name,
    neighborhood,
    duration:    estimateDuration(types),
    price,
    isFree,
    rating:      place.rating ?? 0,
    reviewCount: place.user_ratings_total ?? 0,
    description: buildDescription(place, neighborhood),
    whyVisit:    buildWhyVisit(place, finalCategory, city),
    category:    finalCategory,
    tags:        buildTags(types),
    badges,
    emoji:       pickEmoji(types) || CATEGORY_EMOJI[finalCategory],
    gradient:    CATEGORY_GRADIENTS[finalCategory],
    photoRef:    place.photos?.[0]?.photo_reference,
    placeId:     place.place_id,
  };
}

// ── Google API calls ──────────────────────────────────────────────────────────

async function geocodeDestination(destination: string, apiKey: string): Promise<GeoResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;

    const data = await res.json() as {
      status: string;
      results?: Array<{
        geometry?: {
          location?: { lat?: number; lng?: number };
          viewport?: {
            northeast?: { lat?: number; lng?: number };
            southwest?: { lat?: number; lng?: number };
          };
        };
        address_components?: Array<{ long_name?: string; types?: string[] }>;
      }>;
    };

    if (data.status !== "OK" || !data.results?.[0]) return null;

    const result = data.results[0];
    const loc = result.geometry?.location;
    const vp  = result.geometry?.viewport;

    if (
      typeof loc?.lat !== "number" ||
      typeof loc?.lng !== "number" ||
      !vp?.northeast?.lat || !vp?.southwest?.lat
    ) return null;

    let city = "", country = "";
    for (const c of result.address_components ?? []) {
      if (c.types?.includes("locality"))  city    = c.long_name ?? "";
      if (c.types?.includes("administrative_area_level_1") && !city) city = c.long_name ?? "";
      if (c.types?.includes("country"))   country = c.long_name ?? "";
    }
    if (!city)    city    = destination.split(",")[0].trim();
    if (!country) country = destination.split(",").pop()?.trim() ?? "";

    console.log(`[activities/geocode] "${destination}" → ${city}, ${country} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);

    return {
      lat:      loc.lat,
      lng:      loc.lng,
      viewport: {
        northeast: { lat: vp.northeast.lat!, lng: vp.northeast.lng! },
        southwest: { lat: vp.southwest.lat!, lng: vp.southwest.lng! },
      },
      city,
      country,
    };
  } catch (err) {
    console.error("[activities/geocode] error", err);
    return null;
  }
}

async function nearbySearch(
  lat: number, lng: number, radius: number,
  type: string, limit: number, apiKey: string,
): Promise<GooglePlace[]> {
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}&radius=${radius}&type=${encodeURIComponent(type)}&key=${apiKey}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[activities/nearby] HTTP ${res.status} type=${type}`);
      return [];
    }
    const data = await res.json() as PlacesResponse;
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`[activities/nearby] status=${data.status} type=${type}`, data.error_message ?? "");
    }
    return (data.results ?? []).slice(0, limit);
  } catch (err) {
    console.warn(`[activities/nearby] fetch error type=${type}`, err);
    return [];
  }
}

async function textSearch(
  query: string, lat: number, lng: number,
  limit: number, apiKey: string,
): Promise<GooglePlace[]> {
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=30000&key=${apiKey}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[activities/text] HTTP ${res.status} query="${query}"`);
      return [];
    }
    const data = await res.json() as PlacesResponse;
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`[activities/text] status=${data.status} query="${query}"`, data.error_message ?? "");
    }
    return (data.results ?? []).slice(0, limit);
  } catch (err) {
    console.warn(`[activities/text] fetch error query="${query}"`, err);
    return [];
  }
}

// ── Viewport filter ───────────────────────────────────────────────────────────

function insideBounds(place: GooglePlace, viewport: Viewport): boolean {
  const { lat, lng } = place.geometry.location;
  const padLat = Math.abs(viewport.northeast.lat - viewport.southwest.lat) * 0.25;
  const padLng = Math.abs(viewport.northeast.lng - viewport.southwest.lng) * 0.25;
  return (
    lat >= viewport.southwest.lat - padLat &&
    lat <= viewport.northeast.lat + padLat &&
    lng >= viewport.southwest.lng - padLng &&
    lng <= viewport.northeast.lng + padLng
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const destination = (searchParams.get("destination") ?? "").trim();

  if (!destination) {
    return NextResponse.json({ error: "destination is required" }, { status: 400 });
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();

  // ── Cache hit ──
  const cacheKey = destination.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    console.log(`[activities/search] cache hit "${destination}" (${hit.activities.length})`);
    return NextResponse.json({ activities: hit.activities, city: hit.city, country: hit.country, source: "cache" });
  }

  // ── No API key → return mock fallback ──
  if (!apiKey) {
    console.warn("[activities/search] GOOGLE_PLACES_API_KEY not set — returning mock data");
    const mock = DESTINATION_DATA["Tokyo, Japan"];
    return NextResponse.json({
      activities: mock.activities,
      city:       mock.city,
      country:    mock.country,
      source:     "mock",
      warning:    "GOOGLE_PLACES_API_KEY not configured",
    });
  }

  // ── Geocode ──
  const geo = await geocodeDestination(destination, apiKey);
  if (!geo) {
    console.warn(`[activities/search] geocode failed for "${destination}"`);
    return NextResponse.json({ error: "Could not locate that destination", activities: [] }, { status: 404 });
  }

  const { lat, lng, viewport, city, country } = geo;

  // Search radius: half the viewport diagonal, capped 8–50 km
  const diagKm = haversineKm(viewport.southwest.lat, viewport.southwest.lng, viewport.northeast.lat, viewport.northeast.lng);
  const radiusM = Math.round(Math.min(Math.max(diagKm * 500, 8000), 50000));

  console.log(`[activities/search] "${destination}" lat=${lat.toFixed(4)} lng=${lng.toFixed(4)} radius=${radiusM}m`);

  // ── Concurrent searches ──
  const searchResults = await Promise.all(
    SEARCH_GROUPS.map(async (g): Promise<{ places: GooglePlace[]; category: Category }> => {
      if (g.type) {
        const places = await nearbySearch(lat, lng, radiusM, g.type, g.limit, apiKey);
        return { places, category: g.category };
      }
      if (g.query) {
        const query = g.query.replace("{city}", city);
        const places = await textSearch(query, lat, lng, g.limit, apiKey);
        return { places, category: g.category };
      }
      return { places: [], category: g.category };
    }),
  );

  // ── Dedup + filter ──
  const seen    = new Set<string>();
  const mapped: Activity[] = [];

  for (const { places, category } of searchResults) {
    for (const p of places) {
      if (seen.has(p.place_id)) continue;
      seen.add(p.place_id);

      // Skip closed or unrated places
      if (p.business_status === "CLOSED_PERMANENTLY") continue;
      if (!p.rating || p.rating < 3.5)               continue;

      // Skip if outside city bounds
      if (!insideBounds(p, viewport)) continue;

      mapped.push(mapToActivity(p, category, city));
    }
  }

  // Sort: photos first, then weighted by rating × log(reviews)
  mapped.sort((a, b) => {
    const aPhoto = a.photoRef ? 1 : 0;
    const bPhoto = b.photoRef ? 1 : 0;
    if (aPhoto !== bPhoto) return bPhoto - aPhoto;
    const scoreA = a.rating * Math.log1p(a.reviewCount);
    const scoreB = b.rating * Math.log1p(b.reviewCount);
    return scoreB - scoreA;
  });

  const withPhotos    = mapped.filter((a) => a.photoRef).length;
  const withoutPhotos = mapped.length - withPhotos;
  console.log(
    `[activities/search] "${destination}" → ${mapped.length} activities ` +
    `(${withPhotos} with photos, ${withoutPhotos} gradient-only)`,
  );

  // ── Fallback if Google returned nothing useful ──
  if (mapped.length < 5) {
    console.warn(`[activities/search] too few results (${mapped.length}) — returning mock fallback`);
    const mock = DESTINATION_DATA["Tokyo, Japan"];
    return NextResponse.json({
      activities: mock.activities,
      city:       mock.city,
      country:    mock.country,
      source:     "mock_fallback",
    });
  }

  cache.set(cacheKey, { activities: mapped, city, country, ts: Date.now() });

  return NextResponse.json({ activities: mapped, city, country, source: "places_api" });
}

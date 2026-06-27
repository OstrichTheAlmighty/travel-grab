import type { ProviderHotel } from "./types";
import { readHotelEnrichmentCache, writeHotelEnrichmentCache } from "./enrichmentCache";

// ── Paris arrondissement → neighborhood profiles ───────────────────────────────
// Postal codes 75001–75020 map to named areas with characteristic traits and
// the preference IDs (from PREF_SIGNALS in route.ts) this area best suits.

const PARIS_PROFILES: Record<string, { neighborhood: string; traits: string[]; bestFor: string[] }> = {
  "75001": { neighborhood: "Louvre / 1st",              traits: ["central Paris", "historic"],           bestFor: ["sightseeing", "first-time", "walkable"] },
  "75002": { neighborhood: "Bourse / 2nd",              traits: ["central", "lively"],                   bestFor: ["walkable", "food"] },
  "75003": { neighborhood: "Upper Marais",              traits: ["trendy", "walkable"],                  bestFor: ["food", "sightseeing", "walkable"] },
  "75004": { neighborhood: "Le Marais",                 traits: ["historic", "vibrant", "walkable"],     bestFor: ["sightseeing", "first-time", "food", "walkable"] },
  "75005": { neighborhood: "Latin Quarter",             traits: ["historic", "lively"],                  bestFor: ["sightseeing", "food", "budget", "walkable"] },
  "75006": { neighborhood: "Saint-Germain",             traits: ["chic", "walkable", "upscale"],         bestFor: ["luxury", "food", "quiet", "sightseeing"] },
  "75007": { neighborhood: "Eiffel Tower / 7th",       traits: ["iconic", "quiet", "upscale"],          bestFor: ["sightseeing", "first-time", "quiet", "luxury"] },
  "75008": { neighborhood: "Champs-Élysées / 8th",     traits: ["upscale", "iconic"],                   bestFor: ["luxury", "sightseeing", "first-time"] },
  "75009": { neighborhood: "Opéra / Grands Boulevards",traits: ["central", "transit-friendly"],          bestFor: ["first-time", "sightseeing", "walkable", "transit"] },
  "75010": { neighborhood: "Canal Saint-Martin",       traits: ["trendy", "local vibe"],                bestFor: ["food", "nightlife", "budget"] },
  "75011": { neighborhood: "Bastille / 11th",          traits: ["vibrant", "local nightlife"],          bestFor: ["nightlife", "food", "walkable"] },
  "75012": { neighborhood: "Nation / 12th",            traits: ["local", "residential"],                bestFor: ["quiet", "budget"] },
  "75013": { neighborhood: "Butte-aux-Cailles / 13th", traits: ["residential", "multicultural"],        bestFor: ["budget"] },
  "75014": { neighborhood: "Montparnasse",             traits: ["lively", "transit hub"],               bestFor: ["budget", "walkable", "transit"] },
  "75015": { neighborhood: "15th Arrondissement",      traits: ["residential", "quiet"],                bestFor: ["quiet", "budget", "family"] },
  "75016": { neighborhood: "16th Arrondissement",      traits: ["upscale", "quiet", "residential"],     bestFor: ["luxury", "quiet", "family"] },
  "75017": { neighborhood: "17th Arrondissement",      traits: ["residential", "local"],                bestFor: ["quiet"] },
  "75018": { neighborhood: "Montmartre",               traits: ["bohemian", "hilltop", "artistic"],     bestFor: ["sightseeing", "first-time", "budget", "food"] },
  "75019": { neighborhood: "Buttes-Chaumont / 19th",  traits: ["local", "park access"],                bestFor: ["quiet", "family", "budget"] },
  "75020": { neighborhood: "Belleville / 20th",        traits: ["multicultural", "artsy"],              bestFor: ["food", "nightlife", "budget"] },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlacesEnrichment {
  neighborhood:    string;   // "Opéra / Grands Boulevards"
  locationSummary: string;   // "central, transit-friendly, strong dining scene"
  transitNote:     string;   // "Métro Opéra · 3 min walk"
  bestFor:         string[]; // pref IDs this area suits
  lat:             number;
  lng:             number;
  source:          "places";
}

// ── Internal API shapes ───────────────────────────────────────────────────────

type GPlace = {
  id?: string;
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  displayName?: { text?: string };
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
  types?: string[];
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToWalkMin(m: number): number {
  return Math.max(1, Math.round(m / 75)); // ~75 m/min walking pace
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── Single-hotel enrichment ───────────────────────────────────────────────────

async function enrichOne(
  hotel: ProviderHotel,
  destination: string,
  apiKey: string,
): Promise<PlacesEnrichment | null> {
  const TIMEOUT_MS = 4500;
  const PLACES_BASE = "https://places.googleapis.com/v1/places";

  // ── L2 cache check (Supabase) — skip both Places API calls if cached ────────
  const cached = await readHotelEnrichmentCache(hotel.name, destination);
  if (cached) {
    console.log(`[hotel_enrich] CACHE_HIT  "${hotel.name}" / "${destination}"`);
    return cached.enrichment;
  }
  console.log(`[hotel_enrich] CACHE_MISS "${hotel.name}" / "${destination}" — calling Places API`);

  // ── Text Search: find the hotel, get coordinates + address ──────────────────
  let lat = 0, lng = 0, formattedAddress = "", postalCode = "";
  let googlePlaceId = "";
  let textSearchResult: unknown = null;
  try {
    const res = await fetchWithTimeout(
      `${PLACES_BASE}:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type":    "application/json",
          "X-Goog-Api-Key":  apiKey,
          "X-Goog-FieldMask": "places.id,places.location,places.formattedAddress,places.addressComponents",
        },
        body: JSON.stringify({ textQuery: `${hotel.name} ${destination}`, maxResultCount: 1 }),
      },
      TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const body = await res.json() as { places?: GPlace[] };
    const p = body.places?.[0];
    if (!p?.location?.latitude || !p?.location?.longitude) return null;

    googlePlaceId    = p.id ?? "";
    lat              = p.location.latitude;
    lng              = p.location.longitude;
    formattedAddress = p.formattedAddress ?? "";
    textSearchResult = p;

    // Postal code from addressComponents (most reliable for Paris arr.)
    for (const c of p.addressComponents ?? []) {
      if (c.types?.includes("postal_code") && c.longText) {
        postalCode = c.longText.replace(/\s+/g, "");
        break;
      }
    }
    // Fallback: extract from raw address string
    if (!postalCode) {
      const m = formattedAddress.match(/\b(750\d{2})\b/);
      if (m) postalCode = m[1];
    }
  } catch {
    return null;
  }

  // ── Nearby Search: transit stations, landmarks, restaurants ─────────────────
  const transitStations: Array<{ name: string; meters: number; type: "subway" | "train" | "tram" | "transit" }> = [];
  const landmarks:       Array<{ name: string; meters: number }> = [];
  let restaurantCount = 0;
  let nearbySearchResult: unknown = null;

  try {
    const res = await fetchWithTimeout(
      `${PLACES_BASE}:searchNearby`,
      {
        method: "POST",
        headers: {
          "Content-Type":    "application/json",
          "X-Goog-Api-Key":  apiKey,
          "X-Goog-FieldMask": "places.displayName,places.types,places.location",
        },
        body: JSON.stringify({
          locationRestriction: {
            circle: { center: { latitude: lat, longitude: lng }, radius: 600 },
          },
          includedTypes: [
            "subway_station", "train_station", "light_rail_station", "transit_station",
            "museum", "tourist_attraction",
            "restaurant", "cafe", "bar",
          ],
          maxResultCount: 15,
          rankPreference: "DISTANCE",
        }),
      },
      TIMEOUT_MS,
    );

    if (res.ok) {
      const body = await res.json() as { places?: GPlace[] };
      nearbySearchResult = body.places ?? null;
      for (const p of body.places ?? []) {
        const name   = p.displayName?.text ?? "";
        const types  = p.types ?? [];
        const pLat   = p.location?.latitude  ?? 0;
        const pLng   = p.location?.longitude ?? 0;
        const meters = haversineMeters(lat, lng, pLat, pLng);

        if (types.some((t) => ["subway_station", "train_station", "light_rail_station", "transit_station"].includes(t))) {
          const primaryType: "subway" | "train" | "tram" | "transit" =
            types.includes("subway_station")      ? "subway"
            : types.includes("train_station")     ? "train"
            : types.includes("light_rail_station") ? "tram"
            : "transit";

          // Skip generic transit stops whose names are street intersections
          // like "Ausiàs Marc - Bailen" — those are bus stops, not metro stations.
          const isStreetIntersection = primaryType === "transit" && /^[^(]+\s+-\s+[^(]+$/.test(name);
          if (!isStreetIntersection) {
            transitStations.push({ name, meters, type: primaryType });
          }
        } else if (types.some((t) => ["museum", "tourist_attraction"].includes(t))) {
          landmarks.push({ name, meters });
        } else if (types.some((t) => ["restaurant", "cafe", "bar"].includes(t))) {
          restaurantCount++;
        }
      }
    }
  } catch {
    // Nearby search timed out or failed — continue with just text-search data
  }

  // ── Derive neighborhood ────────────────────────────────────────────────────

  const destLower = destination.toLowerCase();
  let neighborhood = "";
  let traits: string[] = [];
  let bestFor: string[] = [];

  // Paris: exact arrondissement match from postal code
  if (destLower.includes("paris") && postalCode && PARIS_PROFILES[postalCode]) {
    const prof = PARIS_PROFILES[postalCode];
    neighborhood = prof.neighborhood;
    traits       = [...prof.traits];
    bestFor      = [...prof.bestFor];
  }

  // Generic fallback: try to extract a legible area name from the address
  if (!neighborhood && formattedAddress) {
    const parts = formattedAddress.split(",").map((s) => s.trim());
    // Paris neighbourhood names may appear as sub-locality before the city name
    for (let i = parts.length - 3; i >= 0; i--) {
      const candidate = parts[i];
      if (candidate && candidate.length > 3 && !/^\d+$/.test(candidate)) {
        neighborhood = candidate;
        break;
      }
    }
  }

  // ── Enrich traits from nearby data ────────────────────────────────────────

  const sorted = transitStations.sort((a, b) => a.meters - b.meters);
  const closest = sorted[0];

  if (closest) {
    const walkMin   = metersToWalkMin(closest.meters);
    const typeLabel = closest.type === "subway" ? "metro"
      : closest.type === "train" ? "train"
      : closest.type === "tram"  ? "tram"
      : "transit";
    if (walkMin <= 5)       traits.push(`${typeLabel} ${walkMin} min`);
    else if (walkMin <= 10) traits.push(`${typeLabel} nearby`);
    if (!bestFor.includes("transit")) bestFor.push("transit");
  }
  if (restaurantCount >= 5) {
    traits.push("strong dining scene");
    if (!bestFor.includes("food")) bestFor.push("food");
  } else if (restaurantCount >= 2) {
    traits.push("dining options nearby");
  }
  if (landmarks.length >= 2 && !traits.some((t) => t === "historic" || t === "iconic")) {
    traits.push("near major sights");
    if (!bestFor.includes("sightseeing")) bestFor.push("sightseeing");
  }

  // ── Build summary strings ──────────────────────────────────────────────────

  const transitNote = closest
    ? `${closest.name} · ${metersToWalkMin(closest.meters)} min walk`
    : "";

  const locationSummary = traits.slice(0, 3).join(", ");

  const enrichment: PlacesEnrichment = {
    neighborhood:    neighborhood || hotel.address.split(",").slice(0, 2).join(",").trim(),
    locationSummary,
    transitNote,
    bestFor,
    lat,
    lng,
    source: "places",
  };

  // Write to Supabase cache (fire-and-forget — doesn't block response)
  writeHotelEnrichmentCache(
    googlePlaceId,
    hotel.name,
    destination,
    enrichment,
    textSearchResult,
    nearbySearchResult,
  ).catch(() => {});

  return enrichment;
}

// ── Batch enrichment ──────────────────────────────────────────────────────────

export async function enrichWithGooglePlaces(
  hotels: ProviderHotel[],
  destination: string,
  apiKey: string,
): Promise<Map<string, PlacesEnrichment>> {
  const map = new Map<string, PlacesEnrichment>();
  const t0  = Date.now();

  const results = await Promise.allSettled(
    hotels.map(async (h) => {
      const enrichment = await enrichOne(h, destination, apiKey);
      return { id: h.sourceHotelId, enrichment };
    })
  );

  let ok = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.enrichment) {
      map.set(r.value.id, r.value.enrichment);
      ok++;
    }
  }

  console.log(`[google_places] enriched ${ok}/${hotels.length} hotels  (${Date.now() - t0}ms)`);
  return map;
}

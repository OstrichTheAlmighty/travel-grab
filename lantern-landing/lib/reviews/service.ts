import type { FetchParams, ReviewSource, ReviewsResult } from "./types";
import { emptyResult } from "./types";
import { createGooglePlacesProvider } from "./providers/googlePlaces";

// TODO: replace with Upstash Redis / Vercel KV for durability across cold starts.
// Current Map is reset per-instance; a durable store would survive deploys.
const cache = new Map<string, { result: ReviewsResult; ts: number }>();

// 7-day TTL: Google Places review text changes infrequently; long cache reduces API spend.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(params: FetchParams, source: ReviewSource): string {
  const name = params.hotelName.toLowerCase().replace(/\s+/g, " ").trim();
  const loc  = (params.placeId ?? params.city ?? "").toLowerCase().trim();
  return `${source}|${name}|${loc}`;
}

function getProvider(source: ReviewSource) {
  if (source === "google_places") {
    const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
    if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not configured");
    return createGooglePlacesProvider(apiKey);
  }

  // Tripadvisor and other providers: not yet implemented.
  // Add cases here as providers come online.
  throw new Error(`Review provider "${source}" is not implemented`);
}

export interface FetchHotelReviewsResult {
  data:     ReviewsResult;
  cacheHit: boolean;
}

export async function fetchHotelReviews(
  params: FetchParams,
  source: ReviewSource = "google_places",
): Promise<FetchHotelReviewsResult> {
  const key = cacheKey(params, source);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { data: hit.result, cacheHit: true };
  }

  let result: ReviewsResult;
  try {
    result = await getProvider(source).fetchReviews(params);
  } catch (err) {
    console.error(`[reviews/service] fetchHotelReviews failed for "${params.hotelName}":`, err);
    result = emptyResult(source);
  }

  cache.set(key, { result, ts: Date.now() });
  return { data: result, cacheHit: false };
}

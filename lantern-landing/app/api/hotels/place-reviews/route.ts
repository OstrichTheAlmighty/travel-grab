import { NextRequest, NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlaceReview {
  rating: number;
  text: string;
  relativePublishTimeDescription: string;
  publishTime: string;
  authorName: string;
  authorPhotoUri: string;
  googleMapsUri: string;
}

export interface PlaceReviewsResult {
  placeId: string;
  rating: number;
  userRatingCount: number;
  reviews: PlaceReview[];
}

// ── In-memory cache ───────────────────────────────────────────────────────────
// TODO: replace with durable cache (Redis / KV) for production
const cache = new Map<string, { result: PlaceReviewsResult; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(hotelName: string, city: string): string {
  return `${hotelName.toLowerCase().replace(/\s+/g, " ").trim()}|${city.toLowerCase().trim()}`;
}

// ── Google Places API (New) helpers ───────────────────────────────────────────

const PLACES_BASE = "https://places.googleapis.com/v1";

async function searchTextForPlaceId(
  hotelName: string,
  city: string,
  apiKey: string,
): Promise<string | null> {
  const query = `${hotelName} hotel ${city}`;
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[place-reviews] searchText failed:", res.status, body.slice(0, 200));
    return null;
  }

  const data = (await res.json()) as { places?: { id?: string }[] };
  return data.places?.[0]?.id ?? null;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceReviewsResult | null> {
  const fieldMask = [
    "id",
    "rating",
    "userRatingCount",
    "reviews.rating",
    "reviews.text",
    "reviews.relativePublishTimeDescription",
    "reviews.publishTime",
    "reviews.authorAttribution",
    "reviews.googleMapsUri",
  ].join(",");

  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[place-reviews] place details failed:", res.status, body.slice(0, 200));
    return null;
  }

  type RawReview = {
    rating?: number;
    text?: { text?: string; languageCode?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
    googleMapsUri?: string;
  };

  const data = (await res.json()) as {
    id?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: RawReview[];
  };

  const reviews: PlaceReview[] = (data.reviews ?? []).map((r) => ({
    rating:                         r.rating ?? 0,
    text:                           r.text?.text ?? "",
    relativePublishTimeDescription: r.relativePublishTimeDescription ?? "",
    publishTime:                    r.publishTime ?? "",
    authorName:                     r.authorAttribution?.displayName ?? "Guest",
    authorPhotoUri:                 r.authorAttribution?.photoUri ?? "",
    googleMapsUri:                  r.googleMapsUri ?? "",
  }));

  return {
    placeId,
    rating:          data.rating ?? 0,
    userRatingCount: data.userRatingCount ?? 0,
    reviews,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not configured" },
      { status: 503 },
    );
  }

  let body: { hotelName?: string; city?: string; placeId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hotelName = (body.hotelName ?? "").trim();
  const city      = (body.city      ?? "").trim();
  let   placeId   = (body.placeId   ?? "").trim();

  if (!hotelName) {
    return NextResponse.json({ error: "hotelName is required" }, { status: 400 });
  }

  // Serve from cache if fresh
  const key = cacheKey(hotelName, city || placeId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.result);
  }

  // Resolve placeId via searchText if not provided
  if (!placeId) {
    if (!city) {
      return NextResponse.json(
        { error: "Either placeId or city is required" },
        { status: 400 },
      );
    }
    placeId = (await searchTextForPlaceId(hotelName, city, apiKey)) ?? "";
    if (!placeId) {
      return NextResponse.json(
        { error: "Place not found", placeId: null, rating: 0, userRatingCount: 0, reviews: [] },
        { status: 200 }, // 200 so the client handles gracefully
      );
    }
  }

  const result = await fetchPlaceDetails(placeId, apiKey);
  if (!result) {
    return NextResponse.json(
      { error: "Failed to fetch place details", placeId, rating: 0, userRatingCount: 0, reviews: [] },
      { status: 200 },
    );
  }

  cache.set(key, { result, ts: Date.now() });
  console.log(
    `[place-reviews] ${hotelName} → ${placeId} · ${result.userRatingCount} reviews · ${result.reviews.length} snippets`,
  );

  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";

// GET /api/activities/place?id={placeId}
// Fetches Place Details from the Places API (New) for a single place.
// Caches by placeId (1-hour TTL) so repeated modal opens skip the API.

export interface PlaceDetail {
  id: string;
  displayName?: { text: string; languageCode?: string };
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  types?: string[];
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: Array<{
      open?: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  };
  priceLevel?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  editorialSummary?: { text: string; languageCode?: string };
}

const cache = new Map<string, { detail: PlaceDetail; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// For Place Details (New), no "places." prefix — fields are at the top level
const FIELD_MASK = [
  "id",
  "displayName",
  "photos",
  "rating",
  "userRatingCount",
  "formattedAddress",
  "shortFormattedAddress",
  "types",
  "regularOpeningHours",
  "priceLevel",
  "websiteUri",
  "googleMapsUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "editorialSummary",
].join(",");

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 503 });
  }

  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log(`[activities/place] cache hit id="${id}"`);
    return NextResponse.json({ ...cached.detail, source: "cache" });
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key":   apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[activities/place] HTTP ${res.status} id="${id}" body="${body.slice(0, 300)}"`);
      return NextResponse.json({ error: "Failed to fetch place details" }, { status: res.status });
    }

    const data = await res.json() as PlaceDetail;
    console.log(
      `[activities/place] OK id="${id}" name="${data.displayName?.text}" ` +
      `photos=${data.photos?.length ?? 0} has_hours=${Boolean(data.regularOpeningHours?.weekdayDescriptions?.length)}`,
    );

    cache.set(id, { detail: data, ts: Date.now() });
    return NextResponse.json({ ...data, source: "places_api" });
  } catch (err) {
    console.error(`[activities/place] error id="${id}"`, err);
    return NextResponse.json({ error: "Network error fetching place details" }, { status: 502 });
  }
}

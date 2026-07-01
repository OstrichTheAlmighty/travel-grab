import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_DETAIL_FIELD_MASKS,
  parseGoogleDetailLevel,
  sanitizeDetailResponse,
  type GoogleDetailLevel,
  type GooglePlaceDetail,
} from "@/lib/activities/google-place-details";
import {
  canSpend,
  recordGoogleUsage,
  recordServerCacheHit,
  recordServerInFlightHit,
  type GoogleUsageKind,
} from "@/lib/activities/google-usage";

export type { GooglePlaceDetail as PlaceDetail, GooglePlaceReview as PlaceReview } from "@/lib/activities/google-place-details";

const cache = new Map<string, { detail: GooglePlaceDetail; ts: number }>();
const inFlight = new Map<string, Promise<GooglePlaceDetail>>();
const CACHE_TTL = 60 * 60 * 1000;

const USAGE_KIND: Record<GoogleDetailLevel, GoogleUsageKind> = {
  modal_standard: "place_details_modal_standard",
  modal_rich_reviews: "place_details_modal_rich_reviews",
  modal_gallery: "place_details_modal_gallery",
};

async function fetchDetail(id: string, level: GoogleDetailLevel, apiKey: string): Promise<GooglePlaceDetail> {
  const key = `${id}:${level}`;
  const pending = inFlight.get(key);
  if (pending) {
    recordServerInFlightHit();
    return pending;
  }

  const request = (async () => {
    if (!recordGoogleUsage(USAGE_KIND[level])) throw new Error("DAILY_CAP_REACHED");
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_DETAIL_FIELD_MASKS[level],
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`GOOGLE_HTTP_${res.status}`);
    const raw = await res.json() as GooglePlaceDetail;
    const detail = sanitizeDetailResponse(raw, level);
    cache.set(key, { detail, ts: Date.now() });
    return detail;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const level = parseGoogleDetailLevel(req.nextUrl.searchParams.get("level"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!level) return NextResponse.json({ error: "unsupported detail level" }, { status: 400 });

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "Place details unavailable" }, { status: 503 });

  const key = `${id}:${level}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    recordServerCacheHit();
    return NextResponse.json({ ...cached.detail, source: "cache" });
  }

  if (!canSpend(USAGE_KIND[level])) {
    return NextResponse.json({ id, detailLevel: level, capReached: true, downgraded: true });
  }

  try {
    const detail = await fetchDetail(id, level, apiKey);
    console.log(`[activities/place] level=${level} id="${id}" cache=false`);
    return NextResponse.json({ ...detail, source: "places_api" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "DAILY_CAP_REACHED") {
      return NextResponse.json({ id, detailLevel: level, capReached: true, downgraded: true });
    }
    const status = message.startsWith("GOOGLE_HTTP_") ? Number(message.slice(12)) || 502 : 502;
    console.error(`[activities/place] request failed level=${level} id="${id}" status=${status}`);
    return NextResponse.json({ error: "Place details temporarily unavailable" }, { status });
  }
}

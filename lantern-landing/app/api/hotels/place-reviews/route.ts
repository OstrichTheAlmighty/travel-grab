import { NextRequest, NextResponse } from "next/server";
import { fetchHotelReviews } from "@/lib/reviews/service";
import type { ReviewsResult } from "@/lib/reviews/types";
import { createRateLimiter, getClientIP, rateLimitedResponse } from "@/lib/rate-limit";

export type { ReviewsResult };

// 30 requests per 10 minutes per IP
// TODO: replace createRateLimiter with Upstash Ratelimit when adding Redis
const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const ip     = getClientIP(req);
  const limit  = limiter(ip);
  if (!limit.allowed) {
    console.warn(`[place-reviews] rate limited: ${ip}`);
    return rateLimitedResponse(limit.resetAt);
  }

  let body: { hotelName?: string; city?: string; placeId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hotelName = (body.hotelName ?? "").trim();
  const city      = (body.city      ?? "").trim();
  const placeId   = (body.placeId   ?? "").trim();

  if (!hotelName) {
    return NextResponse.json({ error: "hotelName is required" }, { status: 400 });
  }
  if (!city && !placeId) {
    return NextResponse.json({ error: "Either city or placeId is required" }, { status: 400 });
  }

  try {
    const { data, cacheHit } = await fetchHotelReviews(
      { hotelName, city, placeId: placeId || undefined },
      "google_places",
    );
    // cacheHit is returned so the client can fire analytics without knowing internals
    return NextResponse.json({ ...data, cacheHit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not configured")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

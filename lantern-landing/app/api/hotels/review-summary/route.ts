import { NextRequest, NextResponse } from "next/server";
import { fetchHotelReviews } from "@/lib/reviews/service";
import { generateReviewSummary } from "@/lib/reviews/summarizer";
import type { ReviewSummary } from "@/lib/reviews/types";
import { emptySummary } from "@/lib/reviews/types";
import { createRateLimiter, getClientIP, rateLimitedResponse } from "@/lib/rate-limit";

export type { ReviewSummary };

// 15 requests per 10 minutes per IP — lower than reviews because LLM calls are expensive
// TODO: replace createRateLimiter with Upstash Ratelimit when adding Redis
const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 15 });

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const ip    = getClientIP(req);
  const limit = limiter(ip);
  if (!limit.allowed) {
    console.warn(`[review-summary] rate limited: ${ip}`);
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

  // Fetch reviews — hits the shared review cache when place-reviews was called first
  let reviews;
  try {
    const { data } = await fetchHotelReviews(
      { hotelName, city, placeId: placeId || undefined },
      "google_places",
    );
    reviews = data.reviews;
  } catch (err) {
    console.error("[review-summary] failed to fetch reviews:", err);
    return NextResponse.json({ ...emptySummary, cacheHit: false });
  }

  if (reviews.length === 0) {
    return NextResponse.json({ ...emptySummary, cacheHit: false });
  }

  const { summary, cacheHit } = await generateReviewSummary(hotelName, city, reviews);
  return NextResponse.json({ ...summary, cacheHit });
}

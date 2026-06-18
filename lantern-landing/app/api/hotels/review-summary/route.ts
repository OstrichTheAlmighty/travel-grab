import { NextRequest, NextResponse } from "next/server";
import { fetchHotelReviews } from "@/lib/reviews/service";
import { generateReviewSummary } from "@/lib/reviews/summarizer";
import type { ReviewSummary } from "@/lib/reviews/types";
import { emptySummary } from "@/lib/reviews/types";

export type { ReviewSummary };

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // Fetch reviews from the shared service — hits cache if place-reviews was called first
  let reviews;
  try {
    const result = await fetchHotelReviews(
      { hotelName, city, placeId: placeId || undefined },
      "google_places",
    );
    reviews = result.reviews;
  } catch (err) {
    console.error("[review-summary] failed to fetch reviews:", err);
    return NextResponse.json(emptySummary);
  }

  if (reviews.length === 0) {
    return NextResponse.json(emptySummary);
  }

  // Generate (or serve cached) AI summary
  const summary = await generateReviewSummary(hotelName, city, reviews);
  return NextResponse.json(summary);
}

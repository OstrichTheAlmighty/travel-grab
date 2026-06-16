import { NextResponse } from "next/server";
import { searchGoogleHotels } from "../providers/googleHotels";
import type { NearbyPlace, ProviderHotel } from "../providers/types";

export const runtime   = "nodejs";
export const dynamic   = "force-dynamic";
export const maxDuration = 30;

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

function scoreHotels(hotels: ProviderHotel[]): HotelOffer[] {
  const prices  = hotels.map((h) => h.pricePerNight);
  const minP    = Math.min(...prices);
  const maxP    = Math.max(...prices);
  const priceRange = Math.max(1, maxP - minP);

  return hotels.map((h) => {
    const priceScore    = ((maxP - h.pricePerNight) / priceRange) * 100;
    const reviewScore   = Math.min(100, (h.overallRating / 5) * 100);
    const locationScore = h.locationRating > 0 ? Math.min(100, (h.locationRating / 10) * 100) : 50;
    const starsScore    = Math.min(100, (h.starRating / 5) * 100);
    const walkScore     = walkabilityScore(h.nearbyPlaces);

    const ai_score = Math.round(
      priceScore    * 0.28 +
      reviewScore   * 0.27 +
      locationScore * 0.20 +
      starsScore    * 0.14 +
      walkScore     * 0.11
    );

    return {
      hotel_id:           h.sourceHotelId,
      source:             h.source,
      name:               h.name,
      address:            h.address,
      star_rating:        h.starRating,
      overall_rating:     h.overallRating,
      review_count:       h.reviewCount,
      location_rating:    h.locationRating,
      price_per_night:    h.pricePerNight,
      total_price:        h.totalPrice,
      nights:             0, // filled below
      currency:           h.currency,
      amenities:          h.amenities,
      image_url:          h.imageUrl,
      booking_url:        h.bookingUrl,
      check_in:           h.checkIn,
      check_out:          h.checkOut,
      hotel_type:         h.hotelType,
      eco_certified:      h.ecoCertified,
      description:        h.description,
      ai_score,
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
    };
  });
}

// ── Label assignment ──────────────────────────────────────────────────────────

function assignLabels(scored: HotelOffer[]): void {
  if (scored.length === 0) return;

  const used = new Set<string>();
  const claim = (h: HotelOffer, label: string) => {
    if (!h.recommendation_label) { h.recommendation_label = label; used.add(label); }
  };

  // Best Overall: highest composite score
  const byScore  = [...scored].sort((a, b) => b.ai_score - a.ai_score);
  claim(byScore[0], "Best Overall");

  // Luxury Pick: highest stars (≥4), then best reviews — only if not already labelled
  const luxCandidates = scored.filter((h) => h.star_rating >= 4 && !h.recommendation_label);
  if (luxCandidates.length > 0) {
    const lux = luxCandidates.sort((a, b) =>
      b.star_rating !== a.star_rating
        ? b.star_rating - a.star_rating
        : b.overall_rating - a.overall_rating
    )[0];
    claim(lux, "Luxury Pick");
  }

  // Best Location: highest location_rating + walkability score
  const locCandidates = scored.filter((h) => !h.recommendation_label);
  if (locCandidates.length > 0) {
    const loc = locCandidates.sort(
      (a, b) =>
        (b.score_breakdown.location + b.score_breakdown.walkability) -
        (a.score_breakdown.location + a.score_breakdown.walkability)
    )[0];
    claim(loc, "Best Location");
  }

  // Budget Pick: lowest price with rating ≥ 3.5
  const budgetCandidates = scored
    .filter((h) => h.overall_rating >= 3.5 && !h.recommendation_label)
    .sort((a, b) => a.price_per_night - b.price_per_night);
  if (budgetCandidates.length > 0) claim(budgetCandidates[0], "Budget Pick");

  // Best Value: best reviews/rating relative to price (unlabelled only)
  const valueCandidates = scored.filter((h) => !h.recommendation_label);
  if (valueCandidates.length > 0) {
    const val = valueCandidates.sort(
      (a, b) =>
        (b.score_breakdown.reviews + b.score_breakdown.location - b.score_breakdown.price * 0.3) -
        (a.score_breakdown.reviews + a.score_breakdown.location - a.score_breakdown.price * 0.3)
    )[0];
    claim(val, "Best Value");
  }

  // Fill remaining
  for (const h of scored) {
    if (!h.recommendation_label) h.recommendation_label = "";
  }

  void used;
}

// ── Recommendation text ───────────────────────────────────────────────────────

function buildWhy(h: HotelOffer, all: HotelOffer[]): string {
  const cheapest    = all.reduce((a, b) => a.price_per_night <= b.price_per_night ? a : b);
  const priceDiff   = Math.round(h.price_per_night - cheapest.price_per_night);
  const parts: string[] = [];

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
  if (h.overall_rating >= 4.7)       parts.push("outstanding guest reviews");
  else if (h.overall_rating >= 4.4)  parts.push("excellent reviews");
  else if (h.overall_rating >= 4.0)  parts.push("very good reviews");
  else if (h.overall_rating >= 3.5)  parts.push("solid guest ratings");

  // Standout amenity
  const topAmenities = ["Pool", "Spa", "Free breakfast", "Gym", "Airport shuttle", "Restaurant"];
  const highlight = h.amenities.find((a) =>
    topAmenities.some((ta) => a.toLowerCase().includes(ta.toLowerCase()))
  );
  if (highlight && parts.length < 2) parts.push(`includes ${highlight.toLowerCase()}`);

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

// ── Night count helper ────────────────────────────────────────────────────────

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

  const destination = (body.destination as string | undefined)?.trim() ?? "";
  const check_in    = (body.check_in    as string | undefined)?.trim() ?? "";
  const check_out   = (body.check_out   as string | undefined)?.trim() ?? "";
  const guests      = Math.max(1, Math.min(8, Number(body.guests  ?? 2)));
  const rooms       = Math.max(1, Math.min(4, Number(body.rooms   ?? 1)));

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
  console.log(`[hotels] raw=${result.rawCount}  after_dedup=${deduped.length}  (${result.latencyMs}ms)`);

  const scored = scoreHotels(deduped).map((h) => ({ ...h, nights }));

  // Sort by score desc, then price asc
  scored.sort((a, b) =>
    b.ai_score !== a.ai_score ? b.ai_score - a.ai_score : a.price_per_night - b.price_per_night
  );

  assignLabels(scored);

  // Build recommendation text for each hotel
  for (const h of scored) {
    h.recommendation_why = buildWhy(h, scored);
  }

  return NextResponse.json({
    status: "ok",
    destination,
    check_in,
    check_out,
    nights,
    guests,
    rooms,
    offer_count: scored.length,
    offers: scored,
  });
}

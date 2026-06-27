// Test endpoint — call LiteAPI directly and return the raw mapped result.
// Use this to verify the 3-step flow before it's wired into the main search route.
//
// GET /api/hotels/liteapi?destination=Tokyo&checkIn=2026-07-01&checkOut=2026-07-05&adults=2&rooms=1
// GET /api/hotels/liteapi?probe=auth   ← just probe auth formats, no search

import { NextResponse } from "next/server";
import { detectAuthFormat, searchLiteApiHotels } from "../providers/liteapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const apiKey = (process.env.LITEAPI_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "LITEAPI_API_KEY is not set" }, { status: 500 });
  }

  // Auth probe-only mode: ?probe=auth
  if (searchParams.get("probe") === "auth") {
    console.log("[liteapi/route] auth probe requested");
    const format = await detectAuthFormat(apiKey);
    return NextResponse.json({
      working_format: format ?? null,
      key_prefix:     apiKey.slice(0, 8) + "...",
    });
  }

  const destination = searchParams.get("destination") ?? "";
  const checkIn     = searchParams.get("checkIn")     ?? "";
  const checkOut    = searchParams.get("checkOut")    ?? "";
  const adults      = Math.max(1, parseInt(searchParams.get("adults") ?? "2"));
  const rooms       = Math.max(1, parseInt(searchParams.get("rooms")  ?? "1"));

  if (!destination || !checkIn || !checkOut) {
    return NextResponse.json(
      { error: "destination, checkIn, and checkOut are required" },
      { status: 400 },
    );
  }

  const result = await searchLiteApiHotels(
    { destination, check_in: checkIn, check_out: checkOut, guests: adults, rooms },
    apiKey,
  );

  if (!result.hotels.length && result.rawCount === 0) {
    return NextResponse.json({ error: `City not found or auth failed: ${destination}` }, { status: 404 });
  }

  const hotelsWithRates = result.hotels.filter((h) => h.pricePerNight > 0);

  return NextResponse.json({
    destination,
    checkIn,
    checkOut,
    hotel_count:       result.hotels.length,
    hotels_with_rates: hotelsWithRates.length,
    latency_ms:        result.latencyMs,
    hotels: result.hotels.map((h) => ({
      id:          h.sourceHotelId,
      name:        h.name,
      location:    { lat: h.latitude, lng: h.longitude },
      rating:      h.starRating,
      image_url:   h.imageUrl,
      amenities:   h.amenities,
      description: h.description,
      price:       h.pricePerNight,
      currency:    h.currency,
    })),
  });
}

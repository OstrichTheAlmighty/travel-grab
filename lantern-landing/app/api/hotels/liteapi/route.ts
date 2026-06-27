// Test endpoint — call LiteAPI directly and return the raw mapped result.
// Use this to verify the field mapping before it's wired into the main search route.
//
// GET /api/hotels/liteapi?destination=Tokyo&check_in=2026-07-01&check_out=2026-07-05&guests=2&rooms=1

import { NextResponse } from "next/server";
import { searchLiteApiHotels } from "../providers/liteapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const destination = searchParams.get("destination") ?? "";
  const check_in    = searchParams.get("check_in")    ?? "";
  const check_out   = searchParams.get("check_out")   ?? "";
  const guests      = Math.max(1, parseInt(searchParams.get("guests") ?? "2"));
  const rooms       = Math.max(1, parseInt(searchParams.get("rooms")  ?? "1"));

  if (!destination || !check_in || !check_out) {
    return NextResponse.json(
      { error: "destination, check_in, and check_out are required" },
      { status: 400 },
    );
  }

  const apiKey = (process.env.LITEAPI_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "LITEAPI_API_KEY is not set" }, { status: 500 });
  }

  const result = await searchLiteApiHotels(
    { destination, check_in, check_out, guests, rooms },
    apiKey,
  );

  return NextResponse.json({
    destination,
    check_in,
    check_out,
    hotel_count:   result.hotels.length,
    raw_count:     result.rawCount,
    latency_ms:    result.latencyMs,
    hotels:        result.hotels,
  });
}

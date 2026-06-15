/**
 * TEMPORARY DEBUG ENDPOINT — remove before production launch.
 *
 * Returns the raw Duffel offer response for a given search before any
 * TravelGrab filtering, deduplication, ranking, or AI scoring.
 *
 * POST /api/debug-search
 * Body: { origin, destination, departure_date, return_date?, trip_type?, adults?, cabin_class? }
 *
 * Use this to verify whether Duffel is returning the expected fares.
 * Compare the response against Kayak/Google Flights to diagnose price discrepancies.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 55;

export async function POST(req: NextRequest) {
  // Guard: only allow in non-production or when DEBUG_SECRET matches
  const debugSecret = (process.env.DEBUG_SECRET ?? "").trim();
  if (debugSecret) {
    const provided = (req.headers.get("x-debug-secret") ?? "").trim();
    if (provided !== debugSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const apiKey = (process.env.DUFFEL_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Duffel API key not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const origin      = String(body.origin ?? "").trim().toUpperCase();
  const destination = String(body.destination ?? "").trim().toUpperCase();
  const departure_date = String(body.departure_date ?? "").trim();
  const return_date    = String(body.return_date ?? "").trim() || null;
  const trip_type      = String(body.trip_type ?? "roundtrip").trim().toLowerCase();
  const adults         = Math.max(1, Math.min(9, parseInt(String(body.adults ?? "1")) || 1));
  const cabin_class    = String(body.cabin_class ?? "economy").trim().toLowerCase();

  if (!/^[A-Z]{3}$/.test(origin))      return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(destination)) return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
  if (!departure_date)                  return NextResponse.json({ error: "Missing departure_date" }, { status: 400 });

  const slices: Array<{ origin: string; destination: string; departure_date: string }> = [
    { origin, destination, departure_date },
  ];
  if (trip_type === "roundtrip" && return_date) {
    slices.push({ origin: destination, destination: origin, departure_date: return_date });
  }

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        "Duffel-Version": "v2",
        "Content-Type":   "application/json",
        Accept:           "application/json",
      },
      body: JSON.stringify({
        data: {
          slices,
          passengers: Array.from({ length: adults }, () => ({ type: "adult" })),
          cabin_class,
        },
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: `Network error: ${String(err).slice(0, 120)}` }, { status: 502 });
  }

  const elapsed = Date.now() - t0;

  if (!resp.ok) {
    let msg = `Duffel error (${resp.status})`;
    try {
      const e = await resp.json() as { errors?: Array<{ message?: string }> };
      msg = e?.errors?.[0]?.message ?? msg;
    } catch { /* ignore */ }
    return NextResponse.json({ error: msg, status: resp.status }, { status: resp.status });
  }

  const duffelBody = await resp.json() as { data?: { offers?: unknown[] } };
  const offers = duffelBody?.data?.offers ?? [];

  // Build a summary of each offer so the caller can quickly spot-check prices/airlines
  // without wading through the full raw JSON for every offer.
  const summary = (offers as Array<Record<string, unknown>>).map((o) => {
    const sl0   = ((o.slices as Array<Record<string, unknown>>) ?? [])[0] ?? {};
    const segs  = (sl0.segments as Array<Record<string, unknown>>) ?? [];
    const first = segs[0] ?? {};
    const last  = segs[segs.length - 1] ?? {};
    const mc    = (first.marketing_carrier as Record<string, unknown>) ?? {};
    const pax0  = ((first.passengers as Array<Record<string, unknown>>) ?? [])[0] ?? {};
    return {
      id:           o.id,
      airline:      mc.name ?? (o.owner as Record<string, unknown>)?.name,
      airline_code: mc.iata_code,
      flight_number: first.marketing_carrier_flight_number,
      price:        o.total_amount,
      currency:     o.total_currency,
      stops:        Math.max(0, segs.length - 1),
      origin:       (first.origin as Record<string, unknown>)?.iata_code,
      destination:  (last.destination as Record<string, unknown>)?.iata_code,
      departing_at: first.departing_at,
      arriving_at:  last.arriving_at,
      slice_duration: sl0.duration,
      cabin:        pax0.cabin_class_marketing_name ?? pax0.cabin_class,
      fare_brand:   sl0.fare_brand_name ?? pax0.fare_brand_name,
    };
  });

  // Sort summary by price ascending for easy comparison
  summary.sort((a, b) => parseFloat(String(a.price ?? "0")) - parseFloat(String(b.price ?? "0")));

  return NextResponse.json({
    meta: {
      route:          `${origin}→${destination}`,
      departure_date,
      return_date,
      trip_type,
      adults,
      cabin_class,
      duffel_ms:      elapsed,
      total_offers:   offers.length,
      cheapest_price: summary[0]?.price ?? null,
      note:           "Raw Duffel response — no TravelGrab filtering, deduplication, ranking, or scoring applied.",
    },
    summary,
    raw_offers: offers,
  });
}

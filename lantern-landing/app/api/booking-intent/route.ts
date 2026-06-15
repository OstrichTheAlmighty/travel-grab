import { NextRequest, NextResponse } from "next/server";

// SECURITY: No API keys are used in this route.
// This endpoint only logs booking intent server-side.
// It intentionally does not initiate any payment or checkout flow.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON." }, { status: 400 });
  }

  const entry = {
    timestamp:     body.timestamp ?? new Date().toISOString(),
    airline:       body.airline,
    flight_number: body.flight_number,
    origin:        body.origin,
    destination:   body.destination,
    depart_time:   body.depart_time,
    arrive_time:   body.arrive_time,
    price:         body.price,
    score:         body.score,
    priorities:    body.priorities,
  };

  console.log("[booking-intent]", JSON.stringify(entry));

  return NextResponse.json({ status: "ok", message: "Booking interest saved." }, { status: 200 });
}

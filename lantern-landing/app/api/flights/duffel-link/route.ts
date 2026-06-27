// Creates a Duffel Links session and returns the hosted booking URL.
// The client tries this first when the user clicks "Book"; falls back to
// the White Label (book.travelgrab.ai) if this endpoint returns an error.

import { NextResponse } from "next/server";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

interface LinkSessionBody {
  origin:      string;
  destination: string;
  departDate:  string;
  returnDate?: string;
  adults?:     number;
}

export async function POST(req: Request) {
  const apiKey = (process.env.DUFFEL_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "DUFFEL_API_KEY not configured" }, { status: 503 });
  }

  let body: LinkSessionBody;
  try {
    body = await req.json() as LinkSessionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { origin, destination, departDate, returnDate, adults = 1 } = body;
  if (!origin || !destination || !departDate) {
    return NextResponse.json({ error: "origin, destination, and departDate are required" }, { status: 400 });
  }

  const passengers = Array.from({ length: Math.max(1, adults) }, () => ({ type: "adult" as const }));

  const flightSearch: Record<string, unknown> = {
    origin,
    destination,
    departure_date: departDate,
    passengers,
  };
  if (returnDate) flightSearch.return_date = returnDate;

  const payload = {
    data: {
      success_url:     "https://www.travelgrab.ai/booking-success",
      abandonment_url: "https://www.travelgrab.ai/flights",
      failure_url:     "https://www.travelgrab.ai/flights",
      flights: { search: flightSearch },
      markup: { amount: "20.00", currency: "USD" },
    },
  };

  console.log(`[duffel-link] creating session ${origin}→${destination} ${departDate}${returnDate ? " RT:" + returnDate : ""} adults=${adults}`);

  let resp: Response;
  try {
    resp = await fetch("https://api.duffel.com/links/sessions", {
      method:  "POST",
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        "Duffel-Version": "v2",
        "Content-Type":   "application/json",
        Accept:           "application/json",
      },
      body:   JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    console.error("[duffel-link] network error:", String(err));
    return NextResponse.json({ error: "Duffel API unreachable" }, { status: 502 });
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(`[duffel-link] HTTP ${resp.status}: ${text.slice(0, 300)}`);
    return NextResponse.json({ error: `Duffel error ${resp.status}`, detail: text.slice(0, 200) }, { status: resp.status >= 500 ? 502 : resp.status });
  }

  const data = await resp.json() as { data?: { url?: string } };
  const url  = data?.data?.url;

  if (!url) {
    console.error("[duffel-link] response missing url:", JSON.stringify(data).slice(0, 300));
    return NextResponse.json({ error: "Duffel returned no session URL" }, { status: 502 });
  }

  console.log(`[duffel-link] session created: ${url.slice(0, 80)}...`);
  return NextResponse.json({ url });
}

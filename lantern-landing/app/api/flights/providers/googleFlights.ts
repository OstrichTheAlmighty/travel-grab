import type {
  FlightSearchProvider,
  PerOfferDebugRow,
  ProviderDebugInfo,
  ProviderOffer,
  ProviderResult,
  SearchParams,
} from "./types";

type R = Record<string, unknown>;

// SerpAPI cabin class codes
const SERPAPI_CABIN: Record<string, string> = {
  economy: "1",
  premium_economy: "2",
  business: "3",
  first: "4",
};

function normalizeCabin(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("premium")) return "Premium Economy";
  if (lower.includes("business")) return "Business";
  if (lower.includes("first")) return "First";
  return "Economy";
}

// SerpAPI returns times as "YYYY-MM-DD HH:MM" (local, no offset).
// timeFromIso in route.ts expects a "T" separator, so we convert.
function serpapiTimeToIso(t: string): string {
  return t.replace(" ", "T") + ":00";
}

// ── GoogleFlightsProvider ─────────────────────────────────────────────────────

export class GoogleFlightsProvider implements FlightSearchProvider {
  readonly name = "GoogleFlights";
  readonly source = "google_flights" as const;

  constructor(private readonly apiKey: string) {}

  async search(params: SearchParams): Promise<ProviderResult> {
    const qs = new URLSearchParams({
      engine:         "google_flights",
      departure_id:   params.origin,
      arrival_id:     params.destination,
      outbound_date:  params.departure_date,
      currency:       "USD",
      hl:             "en",
      type:           params.trip_type === "roundtrip" ? "1" : "2",
      api_key:        this.apiKey,
    });

    if (params.trip_type === "roundtrip" && params.return_date) {
      qs.set("return_date", params.return_date);
    }

    const cabinCode = SERPAPI_CABIN[params.cabin_class];
    if (cabinCode && cabinCode !== "1") qs.set("travel_class", cabinCode);

    if (params.adults > 1) qs.set("adults", String(params.adults));

    // Redact key from debug payload
    const debugQs = new URLSearchParams(qs);
    debugQs.set("api_key", "[REDACTED]");
    const requestPayloadJson = `GET https://serpapi.com/search?${debugQs}`;

    const url = `https://serpapi.com/search?${qs}`;
    const t0 = Date.now();
    let resp: Response;

    try {
      resp = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      console.error("[google_flights] network error:", String(err).slice(0, 120));
      return emptyResult(requestPayloadJson, Date.now() - t0);
    }

    const latencyMs = Date.now() - t0;

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try {
        const e = await resp.json() as { error?: string };
        errMsg = e?.error ?? errMsg;
      } catch { /* ignore */ }
      console.error(`[google_flights] error: ${errMsg}`);
      return emptyResult(requestPayloadJson, latencyMs, resp.status);
    }

    const body = await resp.json() as R;
    const best  = (body.best_flights  as R[] | undefined) ?? [];
    const other = (body.other_flights as R[] | undefined) ?? [];
    const allRaw = [...best, ...other];

    // ── Temporary debug: verify full response shape ───────────────────────────
    const priceInsightsPresent = "price_insights" in body && body.price_insights != null;
    const uniqueAirlinesRaw = [
      ...new Set(
        allRaw.flatMap((r) =>
          ((r.flights as R[] | undefined) ?? []).map(
            (s) => (s.airline as string | undefined) ?? "?"
          )
        )
      ),
    ].join(", ");

    console.log(`\n[google_flights][debug] ─────────────────────────────────────────────`);
    console.log(`SERPAPI_BEST_FLIGHTS_COUNT:          ${best.length}`);
    console.log(`SERPAPI_OTHER_FLIGHTS_COUNT:         ${other.length}`);
    console.log(`SERPAPI_PRICE_INSIGHTS:              ${priceInsightsPresent ? "yes" : "no"}`);
    console.log(`SERPAPI_UNIQUE_AIRLINES_BEFORE_NORM: ${uniqueAirlinesRaw || "none"}`);
    console.log(`NORMALIZES_BOTH_BEST_AND_OTHER:      yes — allRaw = [...best, ...other] (${allRaw.length} total)`);
    console.log(`\nFIRST_3_BEST_FLIGHTS:`);
    best.slice(0, 3).forEach((r, i) =>
      console.log(`  [best:${i}] ${JSON.stringify(r).slice(0, 1000)}`)
    );
    console.log(`\nFIRST_3_OTHER_FLIGHTS:`);
    other.slice(0, 3).forEach((r, i) =>
      console.log(`  [other:${i}] ${JSON.stringify(r).slice(0, 1000)}`)
    );
    console.log(`[google_flights][debug] ─────────────────────────────────────────────\n`);
    // ── End temporary debug ───────────────────────────────────────────────────

    const offers: ProviderOffer[] = [];
    const perOfferRows: PerOfferDebugRow[] = [];

    for (const raw of allRaw) {
      const flights = (raw.flights as R[] | undefined) ?? [];
      const first   = flights[0] ?? {};
      const airlineName = (first.airline as string | undefined) ?? "";
      const flightNum   = (first.flight_number as string | undefined) ?? "";
      const rawPrice    = typeof raw.price === "number"
        ? raw.price
        : parseFloat(String(raw.price ?? "0")) || 0;

      perOfferRows.push({
        airline:     airlineName,
        airlineCode: flightNum.split(" ")[0] ?? "?",
        owner:       "google",
        price:       rawPrice > 0 ? `$${rawPrice.toFixed(0)}` : "?",
        stops:       Math.max(0, flights.length - 1),
        offerId:     (raw.departure_token as string | undefined) ?? flightNum,
        source:      "google_flights",
      });

      const offer = this.normalizeOffer(raw, params.origin, params.destination);
      if (offer) offers.push(offer);
    }

    const debug: ProviderDebugInfo = {
      httpStatus:         resp.status,
      latencyMs,
      rawOfferCount:      allRaw.length,
      requestPayloadJson,
      perOfferRows,
      extra: {
        best_count:             best.length,
        other_count:            other.length,
        normalized_count:       offers.length,
        price_insights_present: priceInsightsPresent,
      },
    };

    console.log(`[google_flights] best=${best.length} other=${other.length} normalized=${offers.length}  (${latencyMs}ms)`);

    return { offers, debug };
  }

  private normalizeOffer(raw: R, reqOrigin: string, reqDest: string): ProviderOffer | null {
    const flights = (raw.flights as R[] | undefined) ?? [];
    if (!flights.length) return null;

    const first = flights[0];
    const last  = flights[flights.length - 1];

    const depAirport = (first.departure_airport as R | undefined) ?? {};
    const arrAirport = (last.arrival_airport    as R | undefined) ?? {};

    const origin      = (depAirport.id as string | undefined) ?? reqOrigin;
    const destination = (arrAirport.id as string | undefined) ?? reqDest;

    const depTimeRaw = (depAirport.time as string | undefined) ?? "";
    const arrTimeRaw = (arrAirport.time as string | undefined) ?? "";
    if (!depTimeRaw || !arrTimeRaw) return null;

    const departureTime = serpapiTimeToIso(depTimeRaw);
    const arrivalTime   = serpapiTimeToIso(arrTimeRaw);

    const totalDuration = typeof raw.total_duration === "number" ? raw.total_duration : 0;
    if (totalDuration < 30) return null;

    const rawPrice = typeof raw.price === "number"
      ? raw.price
      : parseFloat(String(raw.price ?? "0")) || 0;
    if (rawPrice <= 0) return null;

    const airline     = (first.airline      as string | undefined) ?? "";
    const flightNum   = (first.flight_number as string | undefined) ?? "";
    if (!airline || !flightNum) return null;

    const airlineCode = flightNum.split(" ")[0] ?? "";

    const flightNumbers = flights
      .map((f) => (f.flight_number as string | undefined) ?? "")
      .filter(Boolean);

    const layovers = (raw.layovers as R[] | undefined) ?? [];
    const connectionAirports = layovers
      .map((l) => (l.id as string | undefined) ?? "")
      .filter(Boolean)
      .join(",");

    const stops      = Math.max(0, flights.length - 1);
    const cabin      = normalizeCabin((first.travel_class as string | undefined) ?? "Economy");
    // Build a stable composite ID from actual flight data so two itineraries with
    // different flight numbers or times never share the same sourceOfferId, even if
    // SerpAPI gives them the same departure_token.
    const compositeId = [
      ...flightNumbers,
      depTimeRaw.replace(/\D/g, ""),
      arrTimeRaw.replace(/\D/g, ""),
    ].join("_");
    const sourceId = compositeId.length > 4
      ? compositeId
      : ((raw.departure_token as string | undefined) ?? flightNumbers.join("+") ?? "gf_unknown");

    return {
      source:                 "google_flights",
      sourceOfferId:          sourceId,
      airline,
      airlineCode,
      flightNumbers:          flightNumbers.length > 0 ? flightNumbers : [flightNum],
      origin,
      destination,
      departureTime,
      arrivalTime,
      durationMinutes:        totalDuration,
      stops,
      connectionAirports,
      cabin,
      baggage:                "",
      price:                  rawPrice,
      currency:               "USD",
      isBookableInTravelGrab: false,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyResult(requestPayloadJson: string, latencyMs: number, httpStatus?: number): ProviderResult {
  return {
    offers: [],
    debug: { httpStatus, latencyMs, rawOfferCount: 0, requestPayloadJson, perOfferRows: [] },
  };
}

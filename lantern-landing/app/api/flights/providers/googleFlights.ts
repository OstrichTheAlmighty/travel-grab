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

    // Google Flights URL for this exact search (from SerpAPI metadata)
    const searchMetadata = (body.search_metadata as R | undefined) ?? {};
    const serpApiGoogleUrl = (searchMetadata.google_flights_url as string | undefined) ?? "";

    // ── Debug: response structure ─────────────────────────────────────────────
    if (allRaw.length > 0) {
      const firstResult = allRaw[0];
      const hasReturnFlights = "return_flights" in firstResult;
      const hasBookingOptions = "booking_options" in firstResult;
      const retCount = ((firstResult.return_flights as R[] | undefined) ?? []).length;
      console.log(`\n[google_flights][debug] best=${best.length} other=${other.length} total=${allRaw.length}`);
      console.log(`[google_flights][debug] first result keys: ${Object.keys(firstResult).join(", ")}`);
      console.log(`[google_flights][debug] return_flights: ${hasReturnFlights ? `YES (${retCount} segments)` : "NO"}`);
      console.log(`[google_flights][debug] booking_options: ${hasBookingOptions ? "YES" : "NO"}`);
      console.log(`[google_flights][debug] search google_flights_url: ${serpApiGoogleUrl || "not found"}\n`);
    }
    // ── End debug ─────────────────────────────────────────────────────────────

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

      const offer = this.normalizeOffer(raw, params.origin, params.destination, params.trip_type, serpApiGoogleUrl);
      if (offer) offers.push(offer);
    }

    // ── Debug: top result ─────────────────────────────────────────────────────
    if (offers.length > 0) {
      const top = offers[0];
      const depDate = top.departureTime.slice(0, 10);
      const retDate = top.returnDepartureTime ? top.returnDepartureTime.slice(0, 10) : null;
      const gLink = top.bookingUrl
        ?? (retDate
          ? `https://www.google.com/flights?hl=en#flt=${top.origin}.${top.destination}.${depDate}*${top.returnOrigin ?? top.destination}.${top.returnDestination ?? top.origin}.${retDate};c:USD;e:1;sd:1`
          : `https://www.google.com/flights?hl=en#flt=${top.origin}.${top.destination}.${depDate};c:USD;e:1;sd:1`);
      console.log(`[google_flights] GOOGLE_OUTBOUND_SEGMENTS=${(top.flightNumbers ?? []).join(" · ")}`);
      console.log(`[google_flights] GOOGLE_RETURN_SEGMENTS=${top.returnFlightNumbers?.join(" · ") ?? "n/a (one-way or missing)"}`);
      console.log(`[google_flights] GOOGLE_FLIGHTS_LINK=${gLink}`);
    }
    // ── End debug ─────────────────────────────────────────────────────────────

    const debug: ProviderDebugInfo = {
      httpStatus:         resp.status,
      latencyMs,
      rawOfferCount:      allRaw.length,
      requestPayloadJson,
      perOfferRows,
      extra: {
        best_count:       best.length,
        other_count:      other.length,
        normalized_count: offers.length,
      },
    };

    console.log(`[google_flights] best=${best.length} other=${other.length} normalized=${offers.length}  (${latencyMs}ms)`);

    return { offers, debug };
  }

  private normalizeOffer(
    raw: R,
    reqOrigin: string,
    reqDest: string,
    tripType: string,
    searchUrl: string,
  ): ProviderOffer | null {
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

    const layovers = (raw.layovers as R[] | undefined) ?? [];
    const connectionAirports = layovers
      .map((l) => (l.id as string | undefined) ?? "")
      .filter(Boolean)
      .join(",");

    // Compute outbound duration from individual segment + layover durations.
    // Avoids relying on total_duration which may include both legs for round trips.
    const flightDuration  = flights.reduce((s: number, f: R) => s + (typeof f.duration === "number" ? f.duration : 0), 0);
    const layoverDuration = layovers.reduce((s: number, l: R) => s + (typeof l.duration === "number" ? l.duration : 0), 0);
    const durationMinutes = (flightDuration + layoverDuration) || (typeof raw.total_duration === "number" ? raw.total_duration : 0);
    if (durationMinutes < 30) return null;

    const rawPrice = typeof raw.price === "number"
      ? raw.price
      : parseFloat(String(raw.price ?? "0")) || 0;
    if (rawPrice <= 0) return null;

    const airline   = (first.airline      as string | undefined) ?? "";
    const flightNum = (first.flight_number as string | undefined) ?? "";
    if (!airline || !flightNum) return null;

    const airlineCode = flightNum.split(" ")[0] ?? "";

    const flightNumbers = flights
      .map((f) => (f.flight_number as string | undefined) ?? "")
      .filter(Boolean);

    const stops = Math.max(0, flights.length - 1);
    const cabin = normalizeCabin((first.travel_class as string | undefined) ?? "Economy");

    // Build a stable composite ID from actual flight data
    const compositeId = [
      ...flightNumbers,
      depTimeRaw.replace(/\D/g, ""),
      arrTimeRaw.replace(/\D/g, ""),
    ].join("_");
    const sourceId = compositeId.length > 4
      ? compositeId
      : ((raw.departure_token as string | undefined) ?? flightNumbers.join("+") ?? "gf_unknown");

    // ── Return leg (round-trip) ───────────────────────────────────────────────
    const returnFlights = (raw.return_flights as R[] | undefined) ?? [];
    if (tripType === "roundtrip" && returnFlights.length === 0) {
      console.log(`[google_flights][filter_removed] ${airline} ${flightNum} reason="round-trip but no return_flights in SerpAPI result"`);
      return null;
    }

    let returnLegFields: Partial<ProviderOffer> = {};
    if (returnFlights.length > 0) {
      const firstRet  = returnFlights[0];
      const lastRet   = returnFlights[returnFlights.length - 1];
      const retDepAp  = (firstRet.departure_airport as R | undefined) ?? {};
      const retArrAp  = (lastRet.arrival_airport    as R | undefined) ?? {};
      const retDepRaw = (retDepAp.time as string | undefined) ?? "";
      const retArrRaw = (retArrAp.time as string | undefined) ?? "";
      const retFlightNumbers = returnFlights
        .map((f) => (f.flight_number as string | undefined) ?? "")
        .filter(Boolean);
      const retLayovers = (raw.return_layovers as R[] | undefined) ?? [];
      const retConnectionAirports = retLayovers
        .map((l) => (l.id as string | undefined) ?? "")
        .filter(Boolean)
        .join(",");
      const retFlightDur  = returnFlights.reduce((s: number, f: R) => s + (typeof f.duration === "number" ? f.duration : 0), 0);
      const retLayoverDur = retLayovers.reduce((s: number, l: R) => s + (typeof l.duration === "number" ? l.duration : 0), 0);
      const retDurMins = retFlightDur + retLayoverDur;
      returnLegFields = {
        returnOrigin:             (retDepAp.id as string | undefined) ?? reqDest,
        returnDestination:        (retArrAp.id as string | undefined) ?? reqOrigin,
        returnDepartureTime:      retDepRaw ? serpapiTimeToIso(retDepRaw) : undefined,
        returnArrivalTime:        retArrRaw ? serpapiTimeToIso(retArrRaw) : undefined,
        returnDurationMinutes:    retDurMins || undefined,
        returnStops:              Math.max(0, returnFlights.length - 1),
        returnConnectionAirports: retConnectionAirports || undefined,
        returnFlightNumbers:      retFlightNumbers.length > 0 ? retFlightNumbers : undefined,
      };
    }

    // Prefer a per-itinerary Google Flights link from booking_options; fall back to search URL
    const bookingOptions = (raw.booking_options as R[] | undefined) ?? [];
    const googleBooking = bookingOptions.find(
      (opt) => String(opt.book_with ?? "").toLowerCase().includes("google"),
    );
    const bookingUrl = (googleBooking?.link as string | undefined) ?? (searchUrl || undefined);

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
      durationMinutes,
      stops,
      connectionAirports,
      cabin,
      baggage:                "",
      price:                  rawPrice,
      currency:               "USD",
      isBookableInTravelGrab: false,
      bookingUrl,
      ...returnLegFields,
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

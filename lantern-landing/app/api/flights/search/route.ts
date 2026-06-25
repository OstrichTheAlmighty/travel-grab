import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminRequest } from "@/lib/auth-server";
import { checkUsage, incrementUsage } from "@/lib/usage";
import { getEnabledProviders } from "../providers";
import type { PerOfferDebugRow, ProviderOffer } from "../providers/types";

export const maxDuration = 55;

// ── Rate limiting ─────────────────────────────────────────────────────────────
// In-memory; resets on serverless cold start. Suitable for basic abuse protection.

const RATE_LIMIT_MAX = 15;         // max searches per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Evict stale entries if map grows large
  if (rateLimitMap.size > 10_000) {
    for (const [k, v] of rateLimitMap) {
      if (now - v.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(k);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Search result cache ───────────────────────────────────────────────────────
// 15-minute in-memory cache keyed on all search parameters + priorities.
// Prevents redundant Duffel API calls for identical searches.

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  offers: FlightOffer[];
  meta: Record<string, unknown>;
  cachedAt: number;
}

const searchCache = new Map<string, CacheEntry>();

function buildCacheKey(params: ValidatedParams, priorities: string[]): string {
  return JSON.stringify({
    o:    params.origin,
    d:    params.destination,
    dep:  params.departure_date,
    ret:  params.return_date,
    cab:  params.cabin_class,
    pax:  params.adults,
    type: params.trip_type,
    pri:  [...priorities].sort(), // sorted for key stability
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ValidatedParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  adults: number;
  cabin_class: string;
  trip_type: string;
}

export interface FlightOffer {
  airline: string;
  airline_code: string;
  flight_number: string;
  origin: string;
  destination: string;
  depart_time: string;
  arrive_time: string;
  duration: string;
  stops: number;
  stop_label: string;
  cabin: string;
  baggage: string;
  price_total: number;
  price_per_person: number;
  currency: string;
  ai_score: number;
  score_breakdown: Record<string, number>;
  recommendation_label: string;
  recommendation_why: string;
  recommendation_bullets: string[];
  wins_on: string[];
  tradeoffs: string[];
  comparison_summary: string;
  is_recommended: boolean;
  arrival_timing: string;
  jet_lag: string;
  travel_fatigue: string;
  city_access: string;
  aircraft_comfort: string;
  connection_airports: string;  // comma-separated IATA codes of intermediate airports (empty if nonstop)
  duration_minutes: number;     // total outbound itinerary minutes computed from timestamps (canonical duration)
  dedupe_group_size?: number;   // dev debug: how many codeshares collapsed into this offer
  offer_id?: string;            // provider offer ID for end-to-end debug tracing
  fare_brand?: string;          // fare brand name (e.g. "Basic Economy", "Main Cabin")
  source?: string;              // "duffel" | "amadeus" — which provider sourced this offer
  is_bookable?: boolean;        // true → can be booked in TravelGrab; false → search-only
  booking_url?: string;         // for search-only offers: link to external booking page
  outbound_flight_numbers?: string[];   // all outbound segment flight numbers
  return_origin?: string;
  return_destination?: string;
  return_depart_time?: string;
  return_arrive_time?: string;
  return_duration?: string;
  return_duration_minutes?: number;
  return_stops?: number;
  return_stop_label?: string;
  return_connection_airports?: string;
  return_flight_numbers?: string[];
  partial_round_trip?: boolean; // true when source=google_flights and return leg data is unavailable
}

// ── Airline IATA lookup ──────────────────────────────────────────────────────
// Sorted longest-key-first to prevent substring false-matches (e.g. "ana" inside "air canada")

const AIRLINE_IATA_MAP: Record<string, string> = {
  "swiss international air lines": "LX",
  "china eastern airlines": "MU",
  "china southern airlines": "CZ",
  "singapore airlines": "SQ",
  "malaysia airlines": "MH",
  "turkish airlines": "TK",
  "austrian airlines": "OS",
  "american airlines": "AA",
  "alaska airlines": "AS",
  "united airlines": "UA",
  "qatar airways": "QR",
  "british airways": "BA",
  "japan airlines": "JL",
  "virgin atlantic": "VS",
  "air new zealand": "NZ",
  "etihad airways": "EY",
  "garuda indonesia": "GA",
  "aegean airlines": "A3",
  "royal jordanian": "RJ",
  "tap air portugal": "TP",
  "thai airways": "TG",
  "korean air": "KE",
  "delta air lines": "DL",
  "all nippon airways": "NH",
  "jetblue airways": "B6",
  "southwest airlines": "WN",
  "air france": "AF",
  "air canada": "AC",
  "air china": "CA",
  "cathay pacific": "CX",
  "china eastern": "MU",
  "china southern": "CZ",
  "aer lingus": "EI",
  "lufthansa": "LH",
  "finnair": "AY",
  "iberia": "IB",
  "qantas": "QF",
  "emirates": "EK",
  "american": "AA",
  "etihad": "EY",
  "jetblue": "B6",
  "southwest": "WN",
  "singapore": "SQ",
  "malaysia": "MH",
  "garuda": "GA",
  "turkish": "TK",
  "aegean": "A3",
  "swiss": "LX",
  "united": "UA",
  "alaska": "AS",
  "delta": "DL",
  "qatar": "QR",
  "klm": "KL",
  "tap": "TP",
  "thai": "TG",
  "all nippon": "NH",
  "el al": "LY",
  "jal": "JL",
  "ana": "NH",
};

const AIRLINE_IATA_SORTED = Object.entries(AIRLINE_IATA_MAP).sort(
  (a, b) => b[0].length - a[0].length
);

// ── Utility ──────────────────────────────────────────────────────────────────

function airlineCode(airline: string, flightNumber: string): string {
  const fn = flightNumber.trim();
  if (fn) {
    const code = fn.split(/\s+/)[0].replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    if (code) return code;
  }
  const al = airline.toLowerCase();
  for (const [name, code] of AIRLINE_IATA_SORTED) {
    if (al.includes(name)) return code;
  }
  const initials = (airline.match(/[A-Za-z]+/g) ?? []).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return initials || "AIR";
}

function timeFromIso(value: string): string {
  if (!value) return "--:--";
  try {
    const t = value.includes("T") ? value.split("T")[1] : value;
    return t.slice(0, 5);
  } catch {
    return "--:--";
  }
}


// Convert integer minutes to a human-readable label ("10h 45m").
function minutesToDurationLabel(mins: number): string {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return h > 0 ? `${h}h` : `${m}m`;
}

function clockMinutes(time: string): number {
  try {
    const parts = time.trim().split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } catch {
    return 12 * 60;
  }
}

function median(values: number[]): number {
  const s = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function moneyUsd(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function flightKey(o: Partial<FlightOffer>): string {
  return [o.airline, o.flight_number, o.origin, o.destination, o.depart_time, o.arrive_time, o.price_total].join("|");
}

// ── Duffel response parsing ───────────────────────────────────────────────────


// Maps a normalized ProviderOffer into a FlightOffer ready for scoring.
// All provider-specific parsing has already been done by the provider itself.
function normalizeFlight(offer: ProviderOffer, adults: number, trip_type: string): FlightOffer | null {
  const { airline, airlineCode: code, flightNumbers, price, source, sourceOfferId, isBookableInTravelGrab } = offer;
  const flightNumber = flightNumbers[0] ?? "";

  if (!airline || !flightNumber || price <= 0) {
    console.log(
      `[${source}][filter_removed] id=${sourceOfferId} airline="${airline}" flight="${flightNumber}" ` +
      `price=$${price} reason="missing airline, flight number, or non-positive price"`
    );
    return null;
  }

  if (offer.durationMinutes <= 0) {
    console.log(
      `[${source}][filter_removed] id=${sourceOfferId} airline="${airline}" ${flightNumber} ` +
      `price=$${price} reason="zero durationMinutes"`
    );
    return null;
  }

  // Reject Duffel round-trip offers missing return leg data — these indicate a parsing failure
  if (trip_type === "roundtrip" && isBookableInTravelGrab && !offer.returnDepartureTime) {
    console.log(
      `[${source}][filter_removed] id=${sourceOfferId} airline="${airline}" ${flightNumber} ` +
      `price=$${price} reason="round-trip offer missing return leg"`
    );
    return null;
  }

  const stops = offer.stops;
  const durMins = offer.durationMinutes;
  const resolvedCode = code || airlineCode(airline, flightNumber);

  // Return leg fields
  const retStops = offer.returnStops ?? 0;
  const retStopLabel = retStops === 0 ? "Non-stop" : retStops === 1 ? "1 stop" : `${retStops} stops`;
  const returnLeg = offer.returnDepartureTime ? {
    return_origin:             offer.returnOrigin,
    return_destination:        offer.returnDestination,
    return_depart_time:        timeFromIso(offer.returnDepartureTime),
    return_arrive_time:        timeFromIso(offer.returnArrivalTime ?? ""),
    return_duration:           minutesToDurationLabel(offer.returnDurationMinutes ?? 0),
    return_duration_minutes:   offer.returnDurationMinutes,
    return_stops:              retStops,
    return_stop_label:         retStopLabel,
    return_connection_airports: offer.returnConnectionAirports,
    return_flight_numbers:     offer.returnFlightNumbers,
  } : {};

  return {
    airline,
    airline_code: resolvedCode,
    flight_number: flightNumber,
    outbound_flight_numbers: offer.flightNumbers,
    origin: offer.origin,
    destination: offer.destination,
    depart_time: timeFromIso(offer.departureTime),
    arrive_time: timeFromIso(offer.arrivalTime),
    duration: minutesToDurationLabel(durMins),
    duration_minutes: durMins,
    stops,
    stop_label: stops === 0 ? "Non-stop" : stops === 1 ? "1 stop" : `${stops} stops`,
    cabin: offer.cabin,
    baggage: offer.baggage,
    price_total: price,
    price_per_person: Math.round((price / Math.max(1, adults)) * 100) / 100,
    currency: offer.currency,
    // placeholders — filled in after scoring
    ai_score: 75,
    score_breakdown: {},
    recommendation_label: "Best value",
    recommendation_why: "",
    recommendation_bullets: [],
    wins_on: [],
    tradeoffs: [],
    comparison_summary: "",
    is_recommended: false,
    arrival_timing: "",
    jet_lag: "",
    travel_fatigue: "",
    city_access: "",
    aircraft_comfort: "",
    connection_airports: offer.connectionAirports,
    offer_id: sourceOfferId,
    fare_brand: offer.fareBrand ?? "",
    source,
    is_bookable: isBookableInTravelGrab,
    booking_url: offer.bookingUrl,
    partial_round_trip: source === "google_flights" && !offer.returnDepartureTime ? true : undefined,
    ...returnLeg,
  };
}

// ── Deduplication ────────────────────────────────────────────────────────────

function deduplicateOffers(offers: FlightOffer[]): FlightOffer[] {
  // Key: airline + flight numbers + route + times + stops + connections.
  // Including airline_code and flight numbers prevents distinct carriers at the same times from collapsing.
  // Price is intentionally excluded — the winner-selection logic below already keeps the cheapest version
  // within a group, so price in the key would only cause same-itinerary/different-bucket SerpAPI results
  // (best_flights vs other_flights returning the same flight at different prices) to show as duplicates.
  const itinKey = (o: FlightOffer) =>
    [
      o.airline_code,
      (o.outbound_flight_numbers ?? [o.flight_number]).join("+"),
      o.origin,
      o.destination,
      o.depart_time,
      o.arrive_time,
      o.duration,
      o.stops,
      o.connection_airports,
    ].join("|");

  // Prefer real carriers; Duffel test keys return synthetic "Duffel Airways" / code ZZ offers
  const isReal = (o: FlightOffer) =>
    !o.airline.toLowerCase().includes("duffel") && o.airline_code !== "ZZ";

  const groups = new Map<string, FlightOffer[]>();
  for (const o of offers) {
    const k = itinKey(o);
    const g = groups.get(k) ?? [];
    g.push(o);
    groups.set(k, g);
  }

  console.log(`\n=== DEDUPLICATION ===`);
  console.log(`Offers before dedupe: ${offers.length}`);
  console.log(`Unique itinerary keys: ${groups.size}`);

  const result: FlightOffer[] = [];
  let dupeCount = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push({ ...group[0], dedupe_group_size: 1 });
      continue;
    }
    dupeCount += group.length - 1;

    const winner = group.reduce((best, o) => {
      const diff = Math.abs(o.price_total - best.price_total);
      if (diff <= 10) {
        // Prefer bookable (Duffel) over search-only (future Amadeus) within $10
        if (o.is_bookable && !best.is_bookable) return o;
        if (!o.is_bookable && best.is_bookable) return best;
        // Then prefer real airlines over synthetic (test-mode ZZ offers)
        if (isReal(o) && !isReal(best)) return o;
        if (!isReal(o) && isReal(best)) return best;
      }
      return o.price_total < best.price_total ? o : best;
    });

    const removed = group.filter((o) => flightKey(o) !== flightKey(winner));
    removed.forEach((o) => {
      const reason = isReal(o) && !isReal(winner)
        ? "winner is real airline"
        : !isReal(o) && isReal(winner)
        ? "removed is synthetic airline"
        : o.price_total > winner.price_total
        ? `winner cheaper ($${winner.price_total.toFixed(0)} vs $${o.price_total.toFixed(0)})`
        : "same itinerary, winner preferred";
      console.log(
        `  [dedupe_removed] id=${o.offer_id ?? "?"} airline="${o.airline}" flight="${o.flight_number}" ` +
        `price=$${o.price_total.toFixed(0)} depart="${o.depart_time}" ` +
        `key="${itinKey(o)}" reason="${reason}"`
      );
    });

    result.push({ ...winner, dedupe_group_size: group.length });
  }

  console.log(`Offers after dedupe: ${result.length} (removed ${dupeCount} duplicates)`);
  return result;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreComponents(o: FlightOffer, medP: number, medD: number): Record<string, number> {
  const durMin = o.duration_minutes;
  const arrMin = clockMinutes(o.arrive_time);
  const priceSc = medP > 0 ? Math.max(-1, Math.min(1, ((medP - o.price_total) / medP) * 2)) : 0;
  const durSc = medD > 0 && durMin > 0 ? Math.max(-1, Math.min(1, ((medD - durMin) / medD) * 2)) : 0;
  const stopsSc = o.stops === 0 ? 1 : o.stops === 1 ? 0 : -0.5;
  const timingSc =
    arrMin >= 8 * 60 && arrMin <= 21 * 60 ? 1
    : arrMin >= 6 * 60 && arrMin < 8 * 60 ? 0.3
    : arrMin > 21 * 60 && arrMin <= 23 * 60 ? 0.1
    : -0.5;
  const cab = o.cabin.toLowerCase();
  const cabinSc = cab.includes("first") ? 0.5 : cab.includes("business") ? 0.3 : cab.includes("premium") ? 0.1 : 0;
  const baggageSc = o.baggage.trim() ? 0.2 : 0;

  // Jet lag score: shorter flights and fewer stops = less jet lag = higher score (-1 to 1)
  const jetLagRaw = (durMin >= 20 * 60 ? 3.5 : durMin >= 14 * 60 ? 2.5 : durMin >= 9 * 60 ? 1.5 : durMin >= 5 * 60 ? 0.7 : 0)
    + Math.min(1.5, o.stops * 0.5);
  const jetLagSc = Math.max(-1, Math.min(1, (2.5 - jetLagRaw) / 2.5));

  // Fatigue score: shorter flights, fewer stops, and good arrival timing = less fatigue = higher score (-1 to 1)
  const fatigueBase = durMin >= 20 * 60 ? 3.2 : durMin >= 14 * 60 ? 2.35 : durMin >= 9 * 60 ? 1.35 : durMin >= 5 * 60 ? 0.55 : 0;
  const fatiguePenalty = timingSc < 0 ? 1.35 : timingSc < 0.3 ? 0.45 : 0;
  const fatigueRaw = fatigueBase + Math.min(3.0, o.stops * 1.15) + fatiguePenalty;
  const fatigueSc = Math.max(-1, Math.min(1, (3.0 - fatigueRaw) / 3.0));

  // City access score: quality of ground transport from destination airport (-1 to 1)
  const cityGood = new Set(["LHR", "CDG", "AMS", "NRT", "HND", "SIN", "HKG", "DXB", "JFK", "LAX", "ORD", "LGA", "EWR"]);
  const cityLimited = new Set(["MXP", "BER", "IST", "YYZ", "YVR", "SYD", "ICN", "PEK", "PVG"]);
  const cityAccessSc = cityGood.has(o.destination) ? 1 : cityLimited.has(o.destination) ? -1 : 0;

  return {
    price:       Math.round(priceSc * 100) / 100,
    duration:    Math.round(durSc * 100) / 100,
    stops:       stopsSc,
    timing:      Math.round(timingSc * 100) / 100,
    cabin:       cabinSc,
    baggage:     baggageSc,
    jet_lag:     Math.round(jetLagSc * 100) / 100,
    fatigue:     Math.round(fatigueSc * 100) / 100,
    city_access: cityAccessSc,
  };
}

function buildScoreMap(offers: FlightOffer[]): Map<string, { score: number; breakdown: Record<string, number> }> {
  const medP = median(offers.map((o) => o.price_total));
  const medD = median(offers.map((o) => o.duration_minutes || 99999));
  const out = new Map<string, { score: number; breakdown: Record<string, number> }>();
  for (const o of offers) {
    const bd = scoreComponents(o, medP, medD);
    const weighted = bd.price * 0.35 + bd.duration * 0.2 + bd.stops * 0.2 + bd.timing * 0.1 + bd.cabin * 0.1 + bd.baggage * 0.05;
    const score = Math.round(Math.max(45, Math.min(99, 50 + weighted * 49)));
    out.set(flightKey(o), { score, breakdown: bd });
  }
  return out;
}

function arrivalTimingLabel(o: FlightOffer): string {
  const m = clockMinutes(o.arrive_time);
  if (m >= 8 * 60 && m <= 20 * 60) return "Great";
  if ((m >= 6 * 60 && m < 8 * 60) || (m > 20 * 60 && m <= 22 * 60)) return "Good";
  if (m > 22 * 60 || m < 4 * 60) return "Bad";
  return "Okay";
}

function cityAccessLevel(dest: string): string {
  const good = new Set(["LHR", "CDG", "AMS", "NRT", "HND", "SIN", "HKG", "DXB", "JFK", "LAX", "ORD", "LGA", "EWR"]);
  const limited = new Set(["MXP", "BER", "IST", "YYZ", "YVR", "SYD", "ICN", "PEK", "PVG"]);
  if (good.has(dest)) return "Good";
  if (limited.has(dest)) return "Limited";
  return "Moderate";
}

function aircraftComfort(o: FlightOffer): string {
  const c = o.cabin.toLowerCase();
  if (c.includes("first")) return "Excellent";
  if (c.includes("business")) return "Good";
  if (c.includes("premium")) return "Moderate";
  return "Basic";
}

function jetLagLabel(o: FlightOffer): string {
  const dur = o.duration_minutes;
  let score = dur >= 20 * 60 ? 3.5 : dur >= 14 * 60 ? 2.5 : dur >= 9 * 60 ? 1.5 : dur >= 5 * 60 ? 0.7 : 0;
  score += Math.min(1.5, o.stops * 0.5);
  if (score >= 4.5) return "Very High";
  if (score >= 2.8) return "High";
  if (score >= 1.2) return "Moderate";
  return "Low";
}

function travelFatigueLabel(o: FlightOffer): string {
  const dur = o.duration_minutes;
  let score = dur >= 20 * 60 ? 3.2 : dur >= 14 * 60 ? 2.35 : dur >= 9 * 60 ? 1.35 : dur >= 5 * 60 ? 0.55 : 0;
  score += Math.min(3.0, o.stops * 1.15);
  const timing = arrivalTimingLabel(o);
  if (timing === "Bad") score += 1.35;
  else if (timing === "Okay") score += 0.45;
  const c = o.cabin.toLowerCase();
  if (c.includes("business") || c.includes("first")) score -= 0.9;
  else if (c.includes("premium")) score -= 0.35;
  if (score >= 5.6) return "Very High";
  if (score >= 3.5) return "High";
  if (score >= 1.6) return "Moderate";
  return "Low";
}

// ── Comparison engine ─────────────────────────────────────────────────────────

const FATIGUE_RANK: Record<string, number> = { Low: 1, Moderate: 2, High: 3, "Very High": 4 };
const TIMING_RANK: Record<string, number> = { Great: 4, Good: 3, Okay: 2, Bad: 1 };
const COMFORT_RANK: Record<string, number> = { Excellent: 4, Good: 3, Moderate: 2, Basic: 1 };
const JET_LAG_RANK: Record<string, number> = { Low: 1, Moderate: 2, High: 3, "Very High": 4 };

function minuteLabel(mins: number): string {
  const a = Math.abs(Math.round(mins));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

interface OfferContext {
  cheapestPrice: number;
  fastestDurMins: number;
  cheapestDurMins: number;
  cheapestNonstopPrice: number | null;
  bestFatigueRank: number;
  bestTimingRank: number;
  bestComfortRank: number;
  bestJetLagRank: number;
  nonstopExists: boolean;
}

function buildOfferContext(offers: FlightOffer[]): OfferContext {
  const cheapestPrice = Math.min(...offers.map((o) => o.price_total));
  const fastestDurMins = Math.min(...offers.map((o) => o.duration_minutes || 99999));
  const cheapestOffer = offers.find((o) => o.price_total === cheapestPrice) ?? offers[0];
  const nonstops = offers.filter((o) => o.stops === 0);
  return {
    cheapestPrice,
    fastestDurMins,
    cheapestDurMins: cheapestOffer.duration_minutes || 99999,
    cheapestNonstopPrice: nonstops.length ? Math.min(...nonstops.map((o) => o.price_total)) : null,
    bestFatigueRank: Math.min(...offers.map((o) => FATIGUE_RANK[o.travel_fatigue] ?? 2)),
    bestTimingRank: Math.max(...offers.map((o) => TIMING_RANK[o.arrival_timing] ?? 2)),
    bestComfortRank: Math.max(...offers.map((o) => COMFORT_RANK[o.aircraft_comfort] ?? 1)),
    bestJetLagRank: Math.min(...offers.map((o) => JET_LAG_RANK[o.jet_lag] ?? 2)),
    nonstopExists: nonstops.length > 0,
  };
}

function buildWinsOn(o: FlightOffer, ctx: OfferContext, all: FlightOffer[]): string[] {
  const durMins = o.duration_minutes || 99999;
  const priceDiff = o.price_total - ctx.cheapestPrice;
  const durDiff = durMins - ctx.fastestDurMins;
  const timeSavedVsCheapest = ctx.cheapestDurMins - durMins;
  const fatigueRank = FATIGUE_RANK[o.travel_fatigue] ?? 2;
  const timingRank = TIMING_RANK[o.arrival_timing] ?? 2;
  const comfortRank = COMFORT_RANK[o.aircraft_comfort] ?? 1;
  const jetLagRank = JET_LAG_RANK[o.jet_lag] ?? 2;
  const wins: string[] = [];

  const partial  = !!o.partial_round_trip;
  const isFastest = durDiff <= 10;

  if (priceDiff <= 0) wins.push(`Lowest fare at ${moneyUsd(o.price_total)}`);
  if (isFastest) wins.push(partial ? `Fast outbound option at ${o.duration}` : `Fastest option at ${o.duration}`);

  if (o.stops === 0) {
    const withStops = all.filter((x) => x.stops > 0).length;
    if (withStops > 0)
      wins.push(`Nonstop — ${withStops} alternative${withStops !== 1 ? "s" : ""} require a connection`);
  }

  // Only add "faster than cheapest" when this offer is NOT already labeled the fastest — stacking
  // both bullets confuses the AI summariser into saying "closest alternative" instead of "cheapest option".
  if (!isFastest && timeSavedVsCheapest > 30 && priceDiff > 0) {
    wins.push(partial
      ? "Outbound is faster than comparable visible options"
      : (() => {
          const tLabel = timeSavedVsCheapest < 60
            ? `${timeSavedVsCheapest} minutes`
            : minuteLabel(timeSavedVsCheapest);
          return `${tLabel} faster than the cheapest option`;
        })()
    );
  }

  if (fatigueRank === ctx.bestFatigueRank) {
    const count = all.filter((x) => (FATIGUE_RANK[x.travel_fatigue] ?? 2) > fatigueRank).length;
    if (count > 0) wins.push(partial
      ? `Low outbound fatigue (${o.travel_fatigue})`
      : `Lowest travel fatigue (${o.travel_fatigue}) among visible results`
    );
  }

  if (timingRank === ctx.bestTimingRank && timingRank >= 3) {
    const count = all.filter((x) => (TIMING_RANK[x.arrival_timing] ?? 2) < timingRank).length;
    if (count > 0) wins.push(`Best arrival timing — ${o.arrival_timing.toLowerCase()} arrival`);
  }

  if (comfortRank === ctx.bestComfortRank && comfortRank >= 3) {
    const count = all.filter((x) => (COMFORT_RANK[x.aircraft_comfort] ?? 1) < comfortRank).length;
    if (count > 0) wins.push(`Best aircraft comfort (${o.aircraft_comfort.toLowerCase()})`);
  }

  if (jetLagRank === ctx.bestJetLagRank && jetLagRank <= 2) {
    const count = all.filter((x) => (JET_LAG_RANK[x.jet_lag] ?? 2) > jetLagRank).length;
    if (count > 0) wins.push(`Lowest jet lag risk (${o.jet_lag.toLowerCase()})`);
  }

  return wins.slice(0, 4);
}

function buildTradeoffsFor(o: FlightOffer, ctx: OfferContext, _all: FlightOffer[]): string[] {
  const durMins = o.duration_minutes || 99999;
  const priceDiff = o.price_total - ctx.cheapestPrice;
  const durDiff = durMins - ctx.fastestDurMins;
  const fatigueRank = FATIGUE_RANK[o.travel_fatigue] ?? 2;
  const timingRank = TIMING_RANK[o.arrival_timing] ?? 2;
  const comfortRank = COMFORT_RANK[o.aircraft_comfort] ?? 1;
  const jetLagRank = JET_LAG_RANK[o.jet_lag] ?? 2;
  const tradeoffs: string[] = [];

  if (priceDiff > ctx.cheapestPrice * 0.04)
    tradeoffs.push(`${moneyUsd(Math.round(priceDiff))} more than the cheapest option`);

  if (durDiff > 45)
    tradeoffs.push(`${minuteLabel(durDiff)} slower than the fastest option`);

  if (o.stops > 0 && ctx.nonstopExists)
    tradeoffs.push(o.stops === 1 ? "Requires a connection — nonstop options exist" : `Requires ${o.stops} connections`);

  if (fatigueRank > ctx.bestFatigueRank && fatigueRank >= 3) {
    const bestLabel = Object.entries(FATIGUE_RANK).find(([, v]) => v === ctx.bestFatigueRank)?.[0] ?? "Low";
    tradeoffs.push(`${o.travel_fatigue} travel fatigue — ${bestLabel.toLowerCase()}-fatigue options available`);
  }

  if (timingRank < ctx.bestTimingRank && timingRank <= 2)
    tradeoffs.push(`${o.arrival_timing} arrival — better-timed options available`);

  if (comfortRank < ctx.bestComfortRank && comfortRank <= 1)
    tradeoffs.push(`${o.aircraft_comfort} aircraft comfort`);

  if (jetLagRank > ctx.bestJetLagRank && jetLagRank >= 3)
    tradeoffs.push(`${o.jet_lag} jet lag risk on this route`);

  return tradeoffs.slice(0, 3);
}

function buildComparisonSummary(
  o: FlightOffer,
  wins: string[],
  tradeoffs: string[],
  ctx: OfferContext,
  all: FlightOffer[]
): string {
  if (all.length === 1)
    return `Only live fare returned — ${o.stops === 0 ? "nonstop" : "connecting"} at ${moneyUsd(o.price_total)}.`;

  const durMins = o.duration_minutes || 99999;
  const priceDiff = Math.round(o.price_total - ctx.cheapestPrice);
  const durDiff = durMins - ctx.fastestDurMins;
  const timeSavedVsCheapest = ctx.cheapestDurMins - durMins;
  const isCheapest = priceDiff <= 0;
  const isFastest = durDiff <= 10;
  const isNonstop = o.stops === 0;

  const qualityWins = wins.filter(
    (w) =>
      !w.startsWith("Lowest fare") &&
      !w.startsWith("Fastest option") &&
      !w.startsWith("Saves ") &&
      !w.startsWith("Nonstop —")
  );

  // Pattern A: nonstop + cheapest overall → best overall
  if (isNonstop && isCheapest) {
    const extra = qualityWins.find((w) => !w.includes("Nonstop"));
    return extra
      ? `Best overall: nonstop, lowest fare at ${moneyUsd(o.price_total)}, and ${extra.toLowerCase()}.`
      : `Best overall: nonstop at the lowest visible fare (${moneyUsd(o.price_total)}).`;
  }

  // Pattern B: cheapest but has tradeoffs
  if (isCheapest) {
    if (tradeoffs.length >= 2)
      return `Cheapest option, but ${tradeoffs[0].toLowerCase()} and ${tradeoffs[1].toLowerCase()}.`;
    if (tradeoffs.length === 1)
      return `Cheapest option at ${moneyUsd(o.price_total)}, but ${tradeoffs[0].toLowerCase()}.`;
    return `Lowest visible fare at ${moneyUsd(o.price_total)} with no major tradeoffs.`;
  }

  // Pattern C: nonstop + saves time — the gold standard tradeoff sentence
  if (isNonstop && timeSavedVsCheapest > 30 && priceDiff > 0) {
    const connectingOffers = all.filter((x) => x.stops > 0);
    const cheapestConnecting = connectingOffers.length > 0
      ? connectingOffers.reduce((a, b) => a.price_total <= b.price_total ? a : b)
      : null;
    const premium = cheapestConnecting ? Math.round(o.price_total - cheapestConnecting.price_total) : priceDiff;
    if (premium > 0 && premium <= 200)
      return `For ${moneyUsd(premium)} more, saves ${minuteLabel(timeSavedVsCheapest)} and avoids a connection.`;
  }

  // Pattern D: small premium over cheapest, saves meaningful time (connecting)
  if (!isNonstop && priceDiff > 0 && priceDiff <= 80 && timeSavedVsCheapest > 30)
    return `For ${moneyUsd(priceDiff)} more, saves ${minuteLabel(timeSavedVsCheapest)} over the cheapest option.`;

  // Pattern E: nonstop for modest premium, no big time saving
  if (isNonstop) {
    const connectingOffers = all.filter((x) => x.stops > 0);
    if (connectingOffers.length > 0) {
      const cheapestConnecting = connectingOffers.reduce((a, b) => a.price_total <= b.price_total ? a : b);
      const nonstopPremium = Math.round(o.price_total - cheapestConnecting.price_total);
      if (nonstopPremium > 0 && nonstopPremium <= 150)
        return `For ${moneyUsd(nonstopPremium)} more, avoids the connection — cheapest option requires a stop.`;
    }
    if (qualityWins.length > 0)
      return `Nonstop with ${qualityWins[0].toLowerCase()}, though ${moneyUsd(priceDiff)} more than the cheapest fare.`;
    return `Nonstop, ${moneyUsd(priceDiff)} more than cheapest — avoids connections entirely.`;
  }

  // Pattern F: fastest connecting but costs more
  if (isFastest && priceDiff > 0)
    return o.partial_round_trip
      ? `Fast outbound at ${o.duration}, ${moneyUsd(priceDiff)} more than the cheapest option.`
      : `Fastest at ${o.duration}, ${moneyUsd(priceDiff)} more than the cheapest option.`;

  // Pattern G: higher price, wins on quality metrics
  if (priceDiff > 0 && qualityWins.length >= 2)
    return `For ${moneyUsd(priceDiff)} more: ${qualityWins[0].toLowerCase()} and ${qualityWins[1].toLowerCase()}.`;
  if (priceDiff > 0 && qualityWins.length === 1)
    return `For ${moneyUsd(priceDiff)} more: ${qualityWins[0].toLowerCase()}.`;

  // Pattern H: nothing standout
  const nonPriceTradeoff = tradeoffs.find((t) => !t.toLowerCase().includes("more than the cheapest"));
  if (nonPriceTradeoff)
    return `${moneyUsd(priceDiff)} more than cheapest — ${nonPriceTradeoff.toLowerCase()}.`;
  if (priceDiff > 0)
    return `${moneyUsd(priceDiff)} more than cheapest with no standout advantages.`;
  return `Mid-range option at ${moneyUsd(o.price_total)}.`;
}

// ── Label-only recommendation map ─────────────────────────────────────────────

function buildRecommendationMap(
  offers: FlightOffer[],
  scoreMap: Map<string, { score: number; breakdown: Record<string, number> }>
): Map<string, { score: number; breakdown: Record<string, number>; label: string }> {
  const sc = (o: FlightOffer) => scoreMap.get(flightKey(o))?.score ?? 0;

  const COMFORT_RANK: Record<string, number> = { Excellent: 4, Good: 3, Moderate: 2, Basic: 1 };
  const TIMING_RANK:  Record<string, number> = { Great: 4, Good: 3, Okay: 2, Bad: 1 };
  const FATIGUE_RANK: Record<string, number> = { Low: 4, Moderate: 3, High: 2, "Very High": 1 };

  const pick = (cmp: (a: FlightOffer, b: FlightOffer) => FlightOffer) => offers.reduce(cmp);

  const aiPick      = pick((a, b) => sc(a) >= sc(b) ? a : b);
  const cheapestOff = pick((a, b) => a.price_total <= b.price_total ? a : b);
  const fastestOff  = pick((a, b) =>
    (a.duration_minutes || 99999) <= (b.duration_minutes || 99999) ? a : b);
  const comfortOff  = pick((a, b) => {
    const d = (COMFORT_RANK[aircraftComfort(a)] ?? 1) - (COMFORT_RANK[aircraftComfort(b)] ?? 1);
    return d !== 0 ? (d > 0 ? a : b) : (sc(a) >= sc(b) ? a : b);
  });
  const arrivalOff  = pick((a, b) => {
    const d = (TIMING_RANK[arrivalTimingLabel(a)] ?? 1) - (TIMING_RANK[arrivalTimingLabel(b)] ?? 1);
    return d !== 0 ? (d > 0 ? a : b) : (sc(a) >= sc(b) ? a : b);
  });
  const fatigueOff  = pick((a, b) => {
    const d = (FATIGUE_RANK[travelFatigueLabel(a)] ?? 1) - (FATIGUE_RANK[travelFatigueLabel(b)] ?? 1);
    return d !== 0 ? (d > 0 ? a : b) : (sc(a) >= sc(b) ? a : b);
  });
  const nonstops = offers.filter((o) => o.stops === 0);
  const nonstopOff = nonstops.length > 0
    ? nonstops.reduce((a, b) => sc(a) >= sc(b) ? a : b)
    : null;

  // Claim badges in priority order. Each offer gets at most one badge; each badge is assigned to
  // at most one offer. If the natural winner already holds a higher-priority badge, that badge
  // type goes unassigned rather than cascading to the runner-up (which would be misleading).
  const assignments = new Map<string, string>();
  const claim = (o: FlightOffer, label: string) => {
    const k = flightKey(o);
    if (!assignments.has(k)) assignments.set(k, label);
  };

  claim(aiPick,      "AI Pick");
  claim(cheapestOff, "Cheapest");
  claim(fastestOff,  "Fastest");
  if (nonstopOff) claim(nonstopOff, "Nonstop Pick");
  claim(comfortOff,  "Most Comfortable");
  claim(arrivalOff,  "Best Arrival");
  claim(fatigueOff,  "Lowest Fatigue");

  // Build result map; unclaimed offers carry no badge
  const result = new Map<string, { score: number; breakdown: Record<string, number>; label: string }>();
  for (const o of offers) {
    const key = flightKey(o);
    const sd = scoreMap.get(key) ?? { score: 75, breakdown: {} };
    result.set(key, { ...sd, label: assignments.get(key) ?? "" });
  }
  return result;
}

// ── OpenAI explanation enrichment ─────────────────────────────────────────────

async function generateOpenAIExplanation(
  pick: FlightOffer,
  all: FlightOffer[]
): Promise<{ advisor_summary: string; why_this: string[]; tradeoffs: string[]; comparison_note: string } | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const cheapest = all.reduce((a, b) => a.price_total <= b.price_total ? a : b);
  const fastest  = all.reduce((a, b) =>
    (a.duration_minutes || 99999) <= (b.duration_minutes || 99999) ? a : b);

  const fmt = (o: FlightOffer) => ({
    airline:                 o.airline,
    flight:                  o.flight_number,
    price_usd:               Math.round(o.price_total),
    duration:                o.duration,
    stops:                   o.stops,
    cabin:                   o.cabin,
    arrive_time:             o.arrive_time,
    arrival_timing:          o.arrival_timing,
    jet_lag:                 o.jet_lag,
    travel_fatigue:          o.travel_fatigue,
    aircraft_comfort:        o.aircraft_comfort,
    city_access:             o.city_access,
    ai_score:                o.ai_score,
    deterministic_wins:      o.wins_on,
    deterministic_tradeoffs: o.tradeoffs,
  });

  const alternatives = all
    .filter((o) => flightKey(o) !== flightKey(pick))
    .slice(0, 3)
    .map(fmt);

  const priceDiffVsCheapest = Math.round(pick.price_total - cheapest.price_total);

  const prompt = `You are a sharp, no-nonsense travel advisor. A scoring system already chose the top pick — accept that result and write honest, specific explanations only. Do NOT re-rank, question the scores, or introduce new opinions.

TOP PICK:
${JSON.stringify(fmt(pick), null, 2)}

ALTERNATIVES:
${JSON.stringify(alternatives, null, 2)}

Key facts:
- Cheapest: ${cheapest.airline} $${Math.round(cheapest.price_total)}
- Fastest: ${fastest.airline} ${fastest.duration}
- Top pick vs cheapest: ${priceDiffVsCheapest >= 0 ? `$${priceDiffVsCheapest} more` : `$${Math.abs(priceDiffVsCheapest)} cheaper`}

Write a JSON object with exactly these four keys. Follow every rule below.

RULES:
- Use exact numbers from the data (dollars, hours, minutes, times). Never say "significantly", "ideal", "unbeatable", "best choice", or "great option".
- advisor_summary: 1-2 sentences. State the clearest reason this flight wins, then one honest tradeoff if relevant. If it is cheap and fast, say so plainly. Do not explain short or obvious flights at length.
- why_this: 2-3 short bullets. Each must cite a specific number or fact. No filler.
- tradeoffs: 1-2 short bullets. Be honest. Use exact price or time differences. Omit if there are no real tradeoffs.
- comparison_note: 1 sentence. Compare top pick to the next cheapest alternative or next fastest alternative — be explicit about WHICH you are comparing to. Say "cheapest option" when comparing to cheapest. Say "next fastest" when comparing by time. NEVER use the phrase "closest alternative" — it is ambiguous and forbidden.

Example advisor_summary style: "This is the cheapest nonstop at $312, and it arrives at 14:30 — a reasonable time with low fatigue. The next option is $180 more for a similar flight time."

Example why_this style: ["Nonstop — saves ~1h 20m vs the cheapest connecting option", "$180 cheaper than the next nonstop", "Arrives at 14:30, avoiding late-night fatigue"]

Example tradeoffs style: ["Business class not available — economy only", "Slight layover risk on the return leg"]

{
  "advisor_summary": "...",
  "why_this": ["...", "..."],
  "tradeoffs": ["..."],
  "comparison_note": "..."
}`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.25,
        max_tokens: 450,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(tid);

    if (!resp.ok) {
      console.error(`[openai] HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
      return null;
    }

    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (data.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (
      typeof parsed.advisor_summary !== "string" ||
      !Array.isArray(parsed.why_this) ||
      !Array.isArray(parsed.tradeoffs) ||
      typeof parsed.comparison_note !== "string"
    ) {
      console.error("[openai] unexpected shape");
      return null;
    }

    return {
      advisor_summary: parsed.advisor_summary.trim(),
      why_this:        (parsed.why_this as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 3),
      tradeoffs:       (parsed.tradeoffs as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 2),
      comparison_note: parsed.comparison_note.trim(),
    };
  } catch (err) {
    console.error("[openai] error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── Multi-provider flight search pipeline ────────────────────────────────────

async function loadFlightOffers(params: ValidatedParams): Promise<{
  offers: FlightOffer[];
  meta: Record<string, unknown>;
}> {
  // ── Environment diagnostics (always log, even on early return) ────────────
  const diagSerpPresent  = typeof process.env.SERPAPI_API_KEY === "string" && process.env.SERPAPI_API_KEY.trim().length > 0;
  const diagVercelEnv    = process.env.VERCEL_ENV ?? "(not set)";
  const diagNodeEnv      = process.env.NODE_ENV   ?? "(not set)";
  console.log(
    `[env-diag] SERPAPI_ENV_NAME_CHECKED=SERPAPI_API_KEY` +
    `  SERPAPI_ENV_PRESENT=${diagSerpPresent}` +
    `  VERCEL_ENV=${diagVercelEnv}` +
    `  NODE_ENV=${diagNodeEnv}`
  );

  const providers = getEnabledProviders(process.env);

  if (providers.length === 0) {
    return { offers: [], meta: { status: "not_configured", message: "Flight search is temporarily unavailable." } };
  }

  // ── 1. Call all providers in parallel ─────────────────────────────────────
  const settled = await Promise.allSettled(providers.map((p) => p.search(params)));

  const allProviderOffers: ProviderOffer[] = [];
  const allDebugRows: PerOfferDebugRow[] = [];
  let totalRawOffers = 0;
  // Primary (Duffel) debug fields
  let primaryPayloadJson = "{}";
  let primaryHttpStatus: number | undefined;
  let primaryLatencyMs = 0;
  // SerpAPI / Google Flights debug fields
  let serpapiRawOffers = 0;
  let serpapiBestCount = 0;
  let serpapiOtherCount = 0;
  let serpapiNormalizedCount = 0;
  let serpapiIncompleteMissingReturn = 0;
  let serpapiDroppedMissingReturn = 0;
  let serpapiDroppedNoPrice = 0;
  let serpapiDroppedMissingSegments = 0;
  const serpapiDebugRows: PerOfferDebugRow[] = [];
  // Determine SerpAPI status independently of provider list
  const serpapiEnvKey = (process.env.SERPAPI_API_KEY ?? "").trim();
  let serpapiStatus = serpapiEnvKey ? "key present — awaiting response" : "missing key";

  for (const [i, result] of settled.entries()) {
    const p = providers[i];
    if (result.status === "fulfilled") {
      const { offers, debug } = result.value;
      allProviderOffers.push(...offers);
      allDebugRows.push(...debug.perOfferRows);
      totalRawOffers += debug.rawOfferCount;
      if (p.source === "duffel") {
        primaryPayloadJson = debug.requestPayloadJson;
        primaryHttpStatus  = debug.httpStatus;
        primaryLatencyMs   = debug.latencyMs;
      }
      if (p.source === "google_flights") {
        serpapiRawOffers                += debug.rawOfferCount;
        serpapiBestCount                += (debug.extra?.best_count                as number | undefined) ?? 0;
        serpapiOtherCount               += (debug.extra?.other_count               as number | undefined) ?? 0;
        serpapiNormalizedCount          += (debug.extra?.normalized_count          as number | undefined) ?? 0;
        serpapiIncompleteMissingReturn  += (debug.extra?.incomplete_missing_return as number | undefined) ?? 0;
        serpapiDroppedMissingReturn     += (debug.extra?.dropped_missing_return    as number | undefined) ?? 0;
        serpapiDroppedNoPrice           += (debug.extra?.dropped_no_price          as number | undefined) ?? 0;
        serpapiDroppedMissingSegments   += (debug.extra?.dropped_missing_segments  as number | undefined) ?? 0;
        serpapiDebugRows.push(...debug.perOfferRows);
        if (debug.httpStatus && debug.httpStatus >= 400) {
          serpapiStatus = `error HTTP ${debug.httpStatus}`;
        } else {
          serpapiStatus = `ok — ${debug.rawOfferCount} raw offers`;
        }
      }
      if (i === 0 && p.source !== "duffel") {
        // Fallback: if Duffel is not first provider, still capture primary payload
        primaryPayloadJson = primaryPayloadJson === "{}" ? debug.requestPayloadJson : primaryPayloadJson;
        if (!primaryHttpStatus) primaryHttpStatus = debug.httpStatus;
        if (!primaryLatencyMs) primaryLatencyMs = debug.latencyMs;
      }
      console.log(`[${p.name.toLowerCase()}] ${debug.rawOfferCount} raw → ${offers.length} normalized  (${debug.latencyMs}ms)`);
    } else {
      const errMsg = String(result.reason).slice(0, 120);
      console.error(`[${p.name.toLowerCase()}] failed: ${errMsg}`);
      if (p.source === "google_flights") {
        serpapiStatus = `error: ${errMsg.slice(0, 80)}`;
      }
    }
  }

  const enabledProviders = providers.map((p) => p.source).join(", ") || "none";
  console.log(`\n═══════════════════ PIPELINE DIAGNOSTICS ═══════════════════`);
  console.log(`ENABLED_PROVIDERS=${enabledProviders}`);
  console.log(`SERPAPI_ENV_PRESENT=${diagSerpPresent}`);
  console.log(`SERPAPI_STATUS=${serpapiStatus}`);
  console.log(`RAW_SERPAPI_OFFERS=${serpapiRawOffers}  (best=${serpapiBestCount} other=${serpapiOtherCount})`);
  console.log(`SERPAPI_PARSED_OFFERS=${serpapiNormalizedCount + serpapiDroppedMissingReturn + serpapiDroppedNoPrice + serpapiDroppedMissingSegments + serpapiIncompleteMissingReturn}`);
  console.log(`SERPAPI_INCOMPLETE_MISSING_RETURN=${serpapiIncompleteMissingReturn}  (passed through outbound-only)`);
  console.log(`SERPAPI_DROPPED_MISSING_RETURN=${serpapiDroppedMissingReturn}`);
  console.log(`SERPAPI_DROPPED_MISSING_PRICE=${serpapiDroppedNoPrice}`);
  console.log(`SERPAPI_DROPPED_MISSING_SEGMENTS=${serpapiDroppedMissingSegments}`);
  console.log(`SERPAPI_SURVIVED_VALIDATION=${serpapiNormalizedCount}`);
  console.log(`═════════════════════════════════════════════════════════════\n`);

  // SerpAPI aggregate stats for debug panel
  const serpapiAirlineCounts = new Map<string, number>();
  for (const r of serpapiDebugRows) {
    serpapiAirlineCounts.set(r.airlineCode, (serpapiAirlineCounts.get(r.airlineCode) ?? 0) + 1);
  }
  const serpapiAirlines = [...serpapiAirlineCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${code}(${n})`).join(", ");
  const serpapiPrices = serpapiDebugRows
    .map((r) => parseFloat(r.price.replace("$", "")) || Infinity)
    .filter(isFinite);
  const serpapiCheapest = serpapiPrices.length ? `$${Math.min(...serpapiPrices).toFixed(0)}` : "n/a";

  const providersUsed = providers.map((p) => p.name).join(", ");

  // Detect API key mode for debug (Duffel test vs live)
  const duffelKey = (process.env.DUFFEL_API_KEY ?? "").trim();
  const apiKeyMode = duffelKey.startsWith("duffel_live_") ? "LIVE" : duffelKey.startsWith("duffel_test_") ? "TEST (sandbox)" : "UNKNOWN";

  // Build aggregated airline + owner counts for debug
  const airlineCounts = new Map<string, { name: string; count: number }>();
  const ownerCounts   = new Map<string, { name: string; count: number }>();
  for (const r of allDebugRows) {
    const ae = airlineCounts.get(r.airlineCode);
    if (!ae) airlineCounts.set(r.airlineCode, { name: r.airline, count: 1 }); else ae.count++;
    const oe = ownerCounts.get(r.owner);
    if (!oe) ownerCounts.set(r.owner, { name: r.owner, count: 1 }); else oe.count++;
  }
  const uniqueAirlines = [...airlineCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code, e]) => `${code}(${e.count})`).join(", ");
  const uniqueOwnerIds = [...ownerCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code]) => code).join(", ");
  const cheapestRaw = allDebugRows.length
    ? Math.min(...allDebugRows.map((r) => parseFloat(r.price.replace("$", "")) || Infinity).filter(isFinite))
    : 0;

  console.log(`\nRAW_OFFERS_TOTAL=${totalRawOffers}  providers=${providersUsed}`);
  console.log(`AIRLINES_IN_RAW=${uniqueAirlines || "none"}`);

  // ── 2. Normalize ProviderOffer → FlightOffer ───────────────────────────────
  const normedFlights = allProviderOffers
    .map((o) => normalizeFlight(o, params.adults, params.trip_type))
    .filter(Boolean) as FlightOffer[];
  const providerDropped = allProviderOffers.length - normedFlights.length;
  console.log(`\nAFTER_FILTERING=${normedFlights.length}  (provider-level dropped ${totalRawOffers - allProviderOffers.length}, normalizeFlight dropped ${providerDropped})`);
  {
    const bySource = new Map<string, number>();
    for (const o of normedFlights) bySource.set(o.source ?? "unknown", (bySource.get(o.source ?? "unknown") ?? 0) + 1);
    const bySourceStr = [...bySource.entries()].map(([s, n]) => `${s}:${n}`).join("  ") || "none";
    console.log(`OFFERS_BEFORE_DEDUP_BY_SOURCE  ${bySourceStr}`);
  }

  // ── 3. Deduplicate across providers ───────────────────────────────────────
  const normed = deduplicateOffers(normedFlights);
  console.log(`\nAFTER_DEDUPLICATION=${normed.length}  (dropped ${normedFlights.length - normed.length})`);
  {
    const bySource = new Map<string, number>();
    for (const o of normed) bySource.set(o.source ?? "unknown", (bySource.get(o.source ?? "unknown") ?? 0) + 1);
    const bySourceStr = [...bySource.entries()].map(([s, n]) => `${s}:${n}`).join("  ") || "none";
    console.log(`OFFERS_AFTER_DEDUP_BY_SOURCE   ${bySourceStr}`);
  }

  if (!normed.length) {
    return {
      offers: [],
      meta: {
        status: "empty",
        message: "No fares found for these dates. Try different dates or airports.",
        raw_count: totalRawOffers,
        latency_ms: primaryLatencyMs,
      },
    };
  }

  // ── 4. Score ───────────────────────────────────────────────────────────────
  const scoreMap = buildScoreMap(normed);
  const recs = buildRecommendationMap(normed, scoreMap);
  console.log(`\nAFTER_RANKING=${normed.length}  (scoring reorders, never drops)`);

  let bestKey = "";
  let bestScore = -1;
  for (const [k, v] of recs) {
    if (v.score > bestScore) { bestScore = v.score; bestKey = k; }
  }

  // Pass 1: per-offer attributes
  const pass1 = normed.map((o) => {
    const key = flightKey(o);
    const rec = recs.get(key) ?? { score: 75, breakdown: {}, label: "Best value" };
    return {
      ...o,
      ai_score: rec.score,
      score_breakdown: rec.breakdown,
      recommendation_label: rec.label,
      is_recommended: key === bestKey,
      arrival_timing: arrivalTimingLabel(o),
      jet_lag: jetLagLabel(o),
      travel_fatigue: travelFatigueLabel(o),
      city_access: cityAccessLevel(o.destination),
      aircraft_comfort: aircraftComfort(o),
      recommendation_why: "",
      recommendation_bullets: [] as string[],
      wins_on: [] as string[],
      tradeoffs: [] as string[],
      comparison_summary: "",
    };
  });

  // Pass 2: cross-offer comparison
  const ctx = buildOfferContext(pass1);
  const enriched = pass1.map((o) => {
    const wins = buildWinsOn(o, ctx, pass1);
    const trofs = buildTradeoffsFor(o, ctx, pass1);
    const summary = buildComparisonSummary(o, wins, trofs, ctx, pass1);
    let why = summary;
    if (o.recommendation_label === "Alternative") {
      const priceDiff = Math.round(o.price_total - ctx.cheapestPrice);
      const pricePct = ctx.cheapestPrice > 0 ? priceDiff / ctx.cheapestPrice : 0;
      why = pricePct > 0.04
        ? `Alternative option — ${moneyUsd(priceDiff)} more than the cheapest fare${trofs.length > 0 ? `, with ${trofs[0].toLowerCase()}` : ""}.`
        : "Alternative option with a similar schedule and fare. Shown for comparison.";
    }
    return {
      ...o,
      wins_on: wins,
      tradeoffs: trofs,
      comparison_summary: "",
      recommendation_why: why,
      recommendation_bullets: wins,
    };
  });

  // Stable sort: recommended first, then score desc, price asc, duration asc, depart asc, airline asc
  enriched.sort((a, b) => {
    if (a.is_recommended !== b.is_recommended) return a.is_recommended ? -1 : 1;
    if (b.ai_score !== a.ai_score) return b.ai_score - a.ai_score;
    if (a.price_total !== b.price_total) return a.price_total - b.price_total;
    const aDur = a.duration_minutes || 99999;
    const bDur = b.duration_minutes || 99999;
    if (aDur !== bDur) return aDur - bDur;
    const aDepart = clockMinutes(a.depart_time);
    const bDepart = clockMinutes(b.depart_time);
    if (aDepart !== bDepart) return aDepart - bDepart;
    if (a.airline !== b.airline) return a.airline.localeCompare(b.airline);
    return a.flight_number.localeCompare(b.flight_number);
  });

  // ── 5. OpenAI enrichment for top pick ─────────────────────────────────────
  const cheapestAfterDedupe = normed.reduce((a, b) => a.price_total <= b.price_total ? a : b, normed[0]);
  console.log(`\nCHEAPEST_AFTER_DEDUP=$${cheapestAfterDedupe.price_total.toFixed(0)} (${cheapestAfterDedupe.airline} ${cheapestAfterDedupe.flight_number})`);

  const topPick = enriched.find((o) => o.is_recommended);
  if (topPick) {
    console.log(
      `\nTOP_PRICE_SOURCE=${topPick.source}  TOP_TOTAL_PRICE=$${topPick.price_total.toFixed(0)}`
    );
    console.log(`TOP_OUTBOUND_SEGMENTS=${(topPick.outbound_flight_numbers ?? [topPick.flight_number]).join(" · ")}`);
    console.log(`TOP_RETURN_SEGMENTS=${topPick.return_flight_numbers?.join(" · ") ?? "n/a (one-way or missing)"}`);
    console.log(
      `TOP_STOP_AIRPORTS=outbound:${topPick.connection_airports || "none"}  return:${topPick.return_connection_airports || "none"}`
    );
  }
  if (topPick && enriched.length >= 2) {
    const aiText = await generateOpenAIExplanation(topPick, enriched);
    if (aiText) {
      console.log("[openai] enriched top pick");
      topPick.recommendation_why     = aiText.advisor_summary;
      topPick.wins_on                = aiText.why_this;
      topPick.recommendation_bullets = aiText.why_this;
      topPick.tradeoffs              = aiText.tradeoffs;
      topPick.comparison_summary     = aiText.comparison_note;
    } else {
      console.log("[openai] using deterministic fallback");
    }
  }

  const cheapestRendered = enriched.reduce((a, b) => a.price_total <= b.price_total ? a : b, enriched[0]).price_total;
  console.log(`\nRENDERED_OFFERS=${enriched.length}  CHEAPEST_RENDERED=$${cheapestRendered.toFixed(0)}`);
  {
    const bySource = new Map<string, number>();
    for (const o of enriched) bySource.set(o.source ?? "unknown", (bySource.get(o.source ?? "unknown") ?? 0) + 1);
    const bySourceStr = [...bySource.entries()].map(([s, n]) => `${s}:${n}`).join("  ") || "none";
    console.log(`RENDERED_OFFERS_BY_SOURCE      ${bySourceStr}`);
  }

  return {
    offers: enriched,
    meta: {
      status: "ok",
      origin: params.origin,
      destination: params.destination,
      trip_type: params.trip_type,
      cabin_class: params.cabin_class,
      adults: params.adults,
      offer_count: enriched.length,
      latency_ms: primaryLatencyMs,
      providers: providersUsed,
      debugStats: {
        // ── Providers ─────────────────────────────────────────
        enabled_providers: enabledProviders,
        serpapi_status: serpapiStatus,
        serpapi_env_present: String(diagSerpPresent),
        serpapi_env_name_checked: "SERPAPI_API_KEY",
        vercel_env: diagVercelEnv,
        node_env: diagNodeEnv,
        // ── Request ────────────────────────────────────────────
        origin: params.origin,
        destination: params.destination,
        departure_date: params.departure_date,
        return_date: params.return_date ?? "none (one-way)",
        trip_type: params.trip_type,
        adults: params.adults,
        cabin_class: params.cabin_class,
        api_key_mode: apiKeyMode,
        carrier_filters: "none",
        content_source_filters: "none",
        limit_params: "none",
        request_payload_json: primaryPayloadJson,
        // ── Provider response ──────────────────────────────────
        duffel_http_status: primaryHttpStatus,
        duffel_latency_ms: primaryLatencyMs,
        raw_duffel_offers: totalRawOffers,
        unique_airlines: uniqueAirlines || "none",
        owner_ids: uniqueOwnerIds || "none",
        cheapest_raw: cheapestRaw > 0 && isFinite(cheapestRaw) ? `$${cheapestRaw.toFixed(0)}` : "n/a",
        // ── SerpAPI / Google Flights ───────────────────────────
        serpapi_best_count:    serpapiBestCount,
        serpapi_other_count:   serpapiOtherCount,
        serpapi_total_parsed:  serpapiNormalizedCount,
        raw_serpapi_offers:    serpapiRawOffers,
        serpapi_airlines:      serpapiAirlines || "none",
        serpapi_cheapest:      serpapiCheapest,
        raw_offer_rows: allDebugRows.map((r) => ({
          airline: r.airline,
          airline_code: r.airlineCode,
          owner: r.owner,
          price: r.price,
          stops: r.stops,
          offer_id: r.offerId,
        })),
        // ── Pipeline ───────────────────────────────────────────
        after_filtering: normedFlights.length,
        normalize_duffel_offer_dropped: totalRawOffers - allProviderOffers.length,
        normalize_flight_dropped: providerDropped,
        after_deduplication: normed.length,
        dedup_dropped: normedFlights.length - normed.length,
        after_ranking: normed.length,
        rendered_offers: enriched.length,
        cheapest_rendered: cheapestRendered > 0 ? `$${cheapestRendered.toFixed(0)}` : "n/a",
        origin_airports: params.origin,
        destination_airports: params.destination,
      },
    },
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateRequest(body: Record<string, unknown>): [ValidatedParams | null, string | null] {
  const origin = String(body.origin ?? "").trim().toUpperCase();
  const destination = String(body.destination ?? "").trim().toUpperCase();
  const departure_date = String(body.departure_date ?? "").trim();
  const return_date = String(body.return_date ?? "").trim() || null;
  const cabin_class = String(body.cabin_class ?? "economy").trim().toLowerCase();
  const trip_type = String(body.trip_type ?? "roundtrip").trim().toLowerCase();

  if (!/^[A-Z]{3}$/.test(origin)) return [null, "Invalid origin airport code."];
  if (!/^[A-Z]{3}$/.test(destination)) return [null, "Invalid destination airport code."];
  if (origin === destination) return [null, "Origin and destination must be different."];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departure_date)) return [null, "Invalid departure date format (YYYY-MM-DD)."];
  if (trip_type === "roundtrip") {
    if (!return_date) return [null, "Return date is required for round trips."];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(return_date)) return [null, "Invalid return date format (YYYY-MM-DD)."];
    if (return_date < departure_date) return [null, "Return date must be on or after departure date."];
  }

  const adults = Math.max(1, Math.min(9, parseInt(String(body.adults ?? "1")) || 1));
  const validCabins = ["economy", "premium_economy", "business", "first"];
  const validTypes = ["roundtrip", "oneway"];

  return [
    {
      origin,
      destination,
      departure_date,
      return_date,
      adults,
      cabin_class: validCabins.includes(cabin_class) ? cabin_class : "economy",
      trip_type: validTypes.includes(trip_type) ? trip_type : "roundtrip",
    },
    null,
  ];
}

// ── Route handler ─────────────────────────────────────────────────────────────
// SECURITY: DUFFEL_API_KEY and OPENAI_API_KEY are read exclusively from
// server-side environment variables and are never returned to the client.

export async function POST(req: NextRequest) {
  // Rate limiting — extract IP from Vercel/proxy headers
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { status: "rate_limited", message: "Too many searches. Please wait a few minutes before trying again." },
      { status: 429 }
    );
  }

  // Per-user daily quota (skipped for admin)
  if (!isAdminRequest(req)) {
    const authUser = await getUserFromRequest(req);
    if (authUser) {
      const { allowed, count, limit } = await checkUsage(authUser.id, "flights");
      if (!allowed) {
        return NextResponse.json(
          { status: "quota_exceeded", limitReached: true, message: `Daily limit reached — ${count}/${limit} flight searches used today. Resets at midnight UTC.` },
          { status: 429 }
        );
      }
      incrementUsage(authUser.id, "flights"); // optimistic, fire-and-forget
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON body." }, { status: 400 });
  }

  const [params, err] = validateRequest(body);
  if (!params) {
    return NextResponse.json({ status: "validation_error", message: err }, { status: 400 });
  }

  // Priorities are applied client-side and don't affect Duffel results;
  // included here for cache key stability when the client sends them.
  const priorities = Array.isArray(body.priorities)
    ? (body.priorities as unknown[]).filter((s): s is string => typeof s === "string")
    : [];

  // Cache check
  const cacheKey = buildCacheKey(params, priorities);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[cache] HIT ${params.origin}->${params.destination} ${params.departure_date}`);
    return NextResponse.json({ status: "ok", offers: cached.offers, meta: { ...cached.meta, cached: true } }, { status: 200 });
  }

  const { offers, meta } = await loadFlightOffers(params);

  if (meta.status === "not_configured") {
    return NextResponse.json({ status: "not_configured", message: meta.message }, { status: 503 });
  }
  if (meta.status === "error") {
    return NextResponse.json({ status: "error", message: meta.message }, { status: 502 });
  }
  if (!offers.length) {
    return NextResponse.json({ status: "empty", message: meta.message, offers: [] }, { status: 200 });
  }

  // Store in cache; evict expired entries if the map has grown
  searchCache.set(cacheKey, { offers, meta, cachedAt: Date.now() });
  if (searchCache.size > 500) {
    const threshold = Date.now() - CACHE_TTL_MS;
    for (const [k, v] of searchCache) {
      if (v.cachedAt < threshold) searchCache.delete(k);
    }
  }

  return NextResponse.json({ status: "ok", offers, meta }, { status: 200 });
}

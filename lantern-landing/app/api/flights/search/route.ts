import { NextRequest, NextResponse } from "next/server";

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

// Parse ISO 8601 duration string → total minutes.
// Handles PT19H35M, PT13H20M, P1DT2H10M, PT90M, etc.
function parseDurationMinutes(iso: string | null | undefined): number {
  if (!iso) return 0;
  const s = String(iso).toUpperCase();
  const m = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const days  = parseInt(m[1] ?? "0") || 0;
  const hours = parseInt(m[2] ?? "0") || 0;
  const mins  = parseInt(m[3] ?? "0") || 0;
  return days * 24 * 60 + hours * 60 + mins;
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

type DuffelRecord = Record<string, unknown>;

function segmentCabin(seg: DuffelRecord): string {
  const passengers = (seg.passengers as DuffelRecord[] | undefined) ?? [];
  const cabin =
    (passengers[0]?.cabin_class_marketing_name as string | undefined) ??
    (passengers[0]?.cabin_class as string | undefined) ??
    "Economy";
  return cabin.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractBaggage(offer: DuffelRecord): string {
  try {
    const conds = (offer.conditions as DuffelRecord | undefined) ?? {};
    const bags = (conds.baggage as DuffelRecord | undefined) ?? {};
    if (bags.quantity && Number(bags.quantity) > 0) {
      return `${bags.quantity} checked bag${Number(bags.quantity) > 1 ? "s" : ""}`;
    }
    for (const slice of ((offer.slices as DuffelRecord[]) ?? [])) {
      for (const seg of ((slice.segments as DuffelRecord[]) ?? [])) {
        for (const pax of ((seg.passengers as DuffelRecord[]) ?? [])) {
          for (const b of ((pax.baggages as DuffelRecord[]) ?? [])) {
            if (b.type === "checked" && Number(b.quantity) > 0) {
              return `${b.quantity} checked bag${Number(b.quantity) > 1 ? "s" : ""}`;
            }
          }
        }
      }
    }
  } catch { /* ignore */ }
  return "";
}

function airportIata(a: DuffelRecord | undefined): string {
  return (a?.iata_code as string | undefined) ?? (a?.name as string | undefined) ?? "";
}

// In Duffel v2 each connecting leg is its own slice, so `offer.slices` for a
// KIX→ICN→LAX round-trip looks like [KIX→ICN, ICN→LAX, LAX→ICN, ICN→KIX].
// We receive reqOrigin/reqDest to identify which slices form the outbound leg.
function normalizeDuffelOffer(offer: DuffelRecord, reqOrigin: string, reqDest: string): DuffelRecord | null {
  const slices = (offer.slices as DuffelRecord[]) ?? [];
  if (!slices.length) return null;

  // Collect every segment across every slice in offer order
  const allSegs: DuffelRecord[] = [];
  for (const sl of slices) {
    for (const seg of ((sl.segments as DuffelRecord[] | undefined) ?? [])) {
      allSegs.push(seg);
    }
  }
  if (!allSegs.length) return null;

  // Walk segments to find the outbound chain: start at reqOrigin, stop at reqDest.
  // Supports comma-separated metro codes ("KIX,ITM").
  const originSet = new Set(reqOrigin.split(",").map((c) => c.trim().toUpperCase()));
  const destSet   = new Set(reqDest.split(",").map((c) => c.trim().toUpperCase()));
  const outboundSegs: DuffelRecord[] = [];
  let started = false;
  for (const seg of allSegs) {
    const segOri  = airportIata(seg.origin      as DuffelRecord | undefined).toUpperCase();
    const segDest = airportIata(seg.destination as DuffelRecord | undefined).toUpperCase();
    if (!started && originSet.has(segOri)) started = true;
    if (started) {
      outboundSegs.push(seg);
      if (destSet.has(segDest)) break;
    }
  }

  // If outbound detection failed, fall back to ALL segments (not just the first slice).
  // Slices[0] alone would only cover the first connecting leg (e.g. KIX→ICN) and produce
  // a short, wrong duration. All segments gives a wrong but detectable result that the
  // timestamp-comparison filter below can catch and discard.
  const useSegs = outboundSegs.length > 0 ? outboundSegs : allSegs;
  if (!useSegs.length) return null;

  const firstSeg = useSegs[0];
  const lastSeg  = useSegs[useSegs.length - 1];
  const owner    = (offer.owner as DuffelRecord | undefined) ?? {};
  const mc       = (firstSeg.marketing_carrier as DuffelRecord | undefined) ?? {};
  const airline  = (mc.name as string) ?? (owner.name as string) ?? (owner.iata_code as string) ?? "";
  const mcCode   = (mc.iata_code as string) ?? "";
  const fn       = (firstSeg.marketing_carrier_flight_number as string) ?? "";

  const connectionAirports = useSegs
    .slice(0, -1)
    .map((seg) => airportIata(seg.destination as DuffelRecord | undefined))
    .filter(Boolean)
    .join(",");

  const dep = (firstSeg.departing_at as string) ?? "";
  const arr = (lastSeg.arriving_at   as string) ?? "";

  // Primary: Duffel's own slice.duration (ISO 8601, e.g. "PT19H35M") for the outbound
  // slice — it is pre-computed server-side and includes all layovers within the slice.
  // slices[0] is always the outbound direction (for both one-way and round-trip requests).
  const rawSliceDur = (slices[0].duration as string | undefined) ?? "";
  let durationMinutes = parseDurationMinutes(rawSliceDur);

  // Fallback: compute from ISO timestamps only when slice.duration is absent.
  // new Date() correctly handles timezone offsets in ISO 8601 strings.
  if (!durationMinutes && dep && arr) {
    const departMs = new Date(dep).getTime();
    const arriveMs = new Date(arr).getTime();
    if (!isNaN(departMs) && !isNaN(arriveMs) && arriveMs > departMs) {
      durationMinutes = Math.round((arriveMs - departMs) / 60000);
    }
  }

  if (durationMinutes < 60) {
    console.error(
      `[dur-reject] ${durationMinutes}min < 60min airline="${airline}" ${mcCode}${fn} ` +
      `slice_dur="${rawSliceDur}" dep="${dep}" arr="${arr}"`
    );
    return null;
  }

  // Informational only — short durations are valid for domestic short-haul (SFO→LAX ~80min).
  if (durationMinutes < 180) {
    console.log(
      `[dur-short] ${durationMinutes}min airline="${airline}" ${mcCode}${fn} ` +
      `slice_dur="${rawSliceDur}" dep="${dep}" arr="${arr}"`
    );
  }

  const h = Math.floor(durationMinutes / 60);
  const m = durationMinutes % 60;
  const durationIso = h > 0 && m > 0 ? `PT${h}H${m}M` : h > 0 ? `PT${h}H` : `PT${m}M`;

  return {
    airline,
    flight_number:       `${mcCode} ${fn}`.trim(),
    origin:              airportIata(firstSeg.origin      as DuffelRecord | undefined),
    destination:         airportIata(lastSeg.destination  as DuffelRecord | undefined),
    departure_time:      dep,
    arrival_time:        arr,
    duration:            durationIso,
    duration_minutes:    durationMinutes,
    stops:               Math.max(0, useSegs.length - 1),
    cabin:               segmentCabin(firstSeg),
    baggage:             extractBaggage(offer),
    price:               (offer.total_amount as string) ?? "0",
    currency:            (offer.total_currency as string) ?? "USD",
    connection_airports: connectionAirports,
    // Debug-only fields for server logs
    _raw_slice_dur:      rawSliceDur,
    _raw_dep:            dep,
    _raw_arr:            arr,
    _outbound_segs:      outboundSegs.length,
  };
}

function normalizeFlight(raw: DuffelRecord, adults: number): FlightOffer | null {
  const price = parseFloat(String(raw.price ?? "0"));
  const airline = String(raw.airline ?? "").trim();
  const flightNumber = String(raw.flight_number ?? "").trim();
  if (!airline || !flightNumber || price <= 0) return null;
  const stops = Number(raw.stops ?? 0);
  const durMins = Number(raw.duration_minutes ?? 0);
  // normalizeDuffelOffer already filters out duration_minutes < 60; this is a safety net.
  if (durMins <= 0) return null;
  return {
    airline,
    airline_code: airlineCode(airline, flightNumber),
    flight_number: flightNumber,
    origin: String(raw.origin ?? ""),
    destination: String(raw.destination ?? ""),
    depart_time: timeFromIso(String(raw.departure_time ?? "")),
    arrive_time: timeFromIso(String(raw.arrival_time ?? "")),
    duration: minutesToDurationLabel(durMins),
    duration_minutes: durMins,
    stops,
    stop_label: stops === 0 ? "Non-stop" : stops === 1 ? "1 stop" : `${stops} stops`,
    cabin: String(raw.cabin ?? "Economy"),
    baggage: String(raw.baggage ?? ""),
    price_total: price,
    price_per_person: Math.round((price / Math.max(1, adults)) * 100) / 100,
    currency: String(raw.currency ?? "USD"),
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
    connection_airports: String(raw.connection_airports ?? ""),
  };
}

// ── Deduplication ────────────────────────────────────────────────────────────

function deduplicateOffers(offers: FlightOffer[]): FlightOffer[] {
  // Key on itinerary + connection airports — collapses true codeshares but keeps distinct routings
  const itinKey = (o: FlightOffer) =>
    [o.origin, o.destination, o.depart_time, o.arrive_time, o.duration, o.stops, o.connection_airports].join("|");

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

  console.log(`[dedupe] unique_keys=${groups.size}`);
  groups.forEach((group, key) => {
    console.log(`  key="${key}" count=${group.length} airlines=[${group.map((o) => `${o.airline}(${o.airline_code})`).join(", ")}]`);
  });

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
        // Within $10 — prefer a real airline over a synthetic one
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
        ? `winner cheaper ($${winner.price_total} vs $${o.price_total})`
        : "same itinerary, winner preferred";
      console.log(
        `  [dedupe_removed] key="${itinKey(o)}" airline="${o.airline}" flight="${o.flight_number}" ` +
        `price=${o.price_total} duration="${o.duration}" depart="${o.depart_time}" reason="${reason}"`
      );
    });

    result.push({ ...winner, dedupe_group_size: group.length });
  }

  console.log(`[pipeline] 5_after_dedupe=${result.length} duplicates_removed=${dupeCount}`);
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

  if (priceDiff <= 0) wins.push(`Lowest fare at ${moneyUsd(o.price_total)}`);
  if (durDiff <= 10) wins.push(`Fastest option at ${o.duration}`);

  if (o.stops === 0) {
    const withStops = all.filter((x) => x.stops > 0).length;
    if (withStops > 0)
      wins.push(`Nonstop — ${withStops} alternative${withStops !== 1 ? "s" : ""} require a connection`);
  }

  if (timeSavedVsCheapest > 30 && priceDiff > 0) {
    const tLabel = timeSavedVsCheapest < 60
      ? `${timeSavedVsCheapest} minutes`
      : minuteLabel(timeSavedVsCheapest);
    wins.push(`${tLabel} faster than the cheapest option`);
  }

  if (fatigueRank === ctx.bestFatigueRank) {
    const count = all.filter((x) => (FATIGUE_RANK[x.travel_fatigue] ?? 2) > fatigueRank).length;
    if (count > 0) wins.push(`Lowest travel fatigue (${o.travel_fatigue}) among visible results`);
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

  // Pattern C: small premium over cheapest, but saves meaningful time
  if (priceDiff > 0 && priceDiff <= 75 && timeSavedVsCheapest > 30)
    return `Only ${moneyUsd(priceDiff)} more than the cheapest option but saves ${minuteLabel(timeSavedVsCheapest)}.`;

  // Pattern D: nonstop for modest premium over cheapest connecting option
  if (isNonstop) {
    const connectingOffers = all.filter((x) => x.stops > 0);
    if (connectingOffers.length > 0) {
      const cheapestConnecting = connectingOffers.reduce((a, b) => a.price_total <= b.price_total ? a : b);
      const nonstopPremium = Math.round(o.price_total - cheapestConnecting.price_total);
      if (nonstopPremium > 0 && nonstopPremium <= 120) {
        const extra = qualityWins.find((w) => !w.includes("Nonstop"));
        return extra
          ? `Nonstop for ${moneyUsd(nonstopPremium)} more than the cheapest connecting option, with ${extra.toLowerCase()}.`
          : `Nonstop for only ${moneyUsd(nonstopPremium)} more than the cheapest connecting option.`;
      }
    }
    // Nonstop but expensive
    if (qualityWins.length > 0)
      return `Nonstop with ${qualityWins[0].toLowerCase()}, though ${moneyUsd(priceDiff)} more than the cheapest fare.`;
    return `Nonstop option — ${moneyUsd(priceDiff)} more than cheapest, but avoids connections entirely.`;
  }

  // Pattern E: fastest (connecting) but costs more
  if (isFastest && priceDiff > 0)
    return `Fastest option at ${o.duration}, but costs ${moneyUsd(priceDiff)} more than the cheapest fare.`;

  // Pattern F: higher price, wins on quality metrics
  if (priceDiff > 0 && qualityWins.length >= 2)
    return `This flight costs ${moneyUsd(priceDiff)} more than the cheapest option, but ${qualityWins[0].toLowerCase()} and ${qualityWins[1].toLowerCase()}.`;
  if (priceDiff > 0 && qualityWins.length === 1)
    return `This flight costs ${moneyUsd(priceDiff)} more than the cheapest option, but ${qualityWins[0].toLowerCase()}.`;

  // Pattern G: nothing standout — pick a tradeoff that doesn't repeat the price amount
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
- comparison_note: 1 sentence. Compare top pick to the closest alternative using actual numbers (price gap, time gap, stops difference).

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

// ── Duffel API call ───────────────────────────────────────────────────────────

async function loadFlightOffers(params: ValidatedParams): Promise<{
  offers: FlightOffer[];
  meta: Record<string, unknown>;
}> {
  const apiKey = (process.env.DUFFEL_API_KEY ?? "").trim();
  if (!apiKey) {
    return { offers: [], meta: { status: "not_configured", message: "Flight search is temporarily unavailable." } };
  }

  const slices = [{ origin: params.origin, destination: params.destination, departure_date: params.departure_date }];
  if (params.trip_type === "roundtrip" && params.return_date) {
    slices.push({ origin: params.destination, destination: params.origin, departure_date: params.return_date });
  }

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(`https://api.duffel.com/air/offer_requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          slices,
          passengers: Array.from({ length: params.adults }, () => ({ type: "adult" })),
          cabin_class: params.cabin_class,
        },
      }),
    });
  } catch (err) {
    return { offers: [], meta: { status: "error", message: `Network error reaching Duffel: ${String(err).slice(0, 120)}` } };
  }

  const elapsed = Date.now() - t0;

  if (!resp.ok) {
    let msg = `Duffel API error (${resp.status}).`;
    try {
      const e = await resp.json() as { errors?: Array<{ message?: string }> };
      msg = e?.errors?.[0]?.message ?? msg;
    } catch { /* ignore */ }
    return { offers: [], meta: { status: "error", message: msg } };
  }

  const body = await resp.json() as { data?: { offers?: DuffelRecord[] } };
  const rawOffers = body?.data?.offers ?? [];

  // ── Step 1: raw Duffel offers ────────────────────────────────────────────────
  console.log(
    `[duffel_raw_count] ${rawOffers.length} ` +
    `request: ${params.origin}→${params.destination} ${params.departure_date}` +
    `${params.return_date ? `→${params.return_date}` : ""} ` +
    `cabin=${params.cabin_class} adults=${params.adults} trip=${params.trip_type} ` +
    `duffel_ms=${elapsed}`
  );

  // Log every raw offer so we can see what Duffel returned before any filtering
  for (let i = 0; i < rawOffers.length; i++) {
    const o = rawOffers[i] as DuffelRecord;
    const owner = (o.owner as DuffelRecord | undefined) ?? {};
    const offerSlices = (o.slices as DuffelRecord[] | undefined) ?? [];
    const sl0 = offerSlices[0];
    const segs0 = (sl0?.segments as DuffelRecord[] | undefined) ?? [];
    const firstSeg0 = segs0[0];
    const lastSeg0 = segs0[segs0.length - 1];
    const mc0 = (firstSeg0?.marketing_carrier as DuffelRecord | undefined) ?? {};
    const airline0 = (mc0.name as string) ?? (owner.name as string) ?? "?";
    const mcCode0 = (mc0.iata_code as string) ?? "";
    const fn0 = (firstSeg0?.marketing_carrier_flight_number as string) ?? "?";
    const price0 = (o.total_amount as string) ?? "?";
    const ori0 = ((firstSeg0?.origin as DuffelRecord | undefined)?.iata_code as string) ?? "?";
    // For multi-slice offers (round-trip v2), last seg of outbound slice[0]
    const dst0 = ((lastSeg0?.destination as DuffelRecord | undefined)?.iata_code as string) ?? "?";
    const dep0 = (firstSeg0?.departing_at as string) ?? "?";
    const arr0 = (lastSeg0?.arriving_at as string) ?? "?";
    const sliceDur0 = (sl0?.duration as string) ?? "null";
    const stops0 = Math.max(0, segs0.length - 1);
    console.log(
      `  [raw-${i + 1}] "${airline0}" ${mcCode0}${fn0} $${price0} ` +
      `${ori0}→${dst0} dep="${dep0}" arr="${arr0}" slice_dur="${sliceDur0}" stops=${stops0}`
    );
  }

  // ── Step 2: normalizeDuffelOffer (extracts outbound, computes duration) ───────
  const normedRaw = rawOffers.map((o) => normalizeDuffelOffer(o, params.origin, params.destination)).filter(Boolean) as DuffelRecord[];
  console.log(`[after_normalize_count] ${normedRaw.length} (dropped=${rawOffers.length - normedRaw.length})`);

  // Log first 20 normalized offers with full duration detail
  for (let i = 0; i < Math.min(20, normedRaw.length); i++) {
    const r = normedRaw[i];
    const mins = Number(r.duration_minutes ?? 0);
    console.log(
      `  [norm-${i + 1}] "${r.airline}" ${r.flight_number} ` +
      `slice_dur="${r._raw_slice_dur}" dep="${r._raw_dep}" arr="${r._raw_arr}" ` +
      `outbound_segs=${r._outbound_segs} parsed_mins=${mins} display="${minutesToDurationLabel(mins)}"`
    );
  }

  // ── Step 3: normalizeFlight (maps DuffelRecord → FlightOffer) ────────────────
  const normedFlights = normedRaw.map((r) => normalizeFlight(r, params.adults)).filter(Boolean) as FlightOffer[];
  console.log(`[after_normalize_count] ${normedFlights.length} FlightOffers (dropped=${normedRaw.length - normedFlights.length} by normalizeFlight)`);

  // No server-side city/metro aggregation — each search call is for a single IATA code pair.
  console.log(`[after_city_aggregation_count] ${normedFlights.length} (no-op: city grouping is client-only)`);

  // ── Inventory sanity check ────────────────────────────────────────────────────
  // Known high-frequency domestic routes where thin coverage indicates an API issue.
  // Bidirectional pairs — only one direction stored; checked symmetrically below.
  const MAJOR_DOMESTIC_ROUTES = new Set([
    "SFO-LAX", "LAX-SFO", "SFO-LAS", "LAS-SFO", "SFO-SEA", "SEA-SFO", "SFO-DEN", "DEN-SFO",
    "LAX-LAS", "LAS-LAX", "LAX-SEA", "SEA-LAX", "LAX-DEN", "DEN-LAX", "LAX-PHX", "PHX-LAX",
    "JFK-LAX", "LAX-JFK", "JFK-SFO", "SFO-JFK", "JFK-BOS", "BOS-JFK", "JFK-ORD", "ORD-JFK",
    "JFK-DCA", "DCA-JFK", "JFK-MIA", "MIA-JFK", "JFK-ATL", "ATL-JFK",
    "ORD-LAX", "LAX-ORD", "ORD-DFW", "DFW-ORD", "ORD-ATL", "ATL-ORD", "ORD-MIA", "MIA-ORD",
    "DFW-LAX", "LAX-DFW", "DFW-ATL", "ATL-DFW", "DFW-MIA", "MIA-DFW",
    "ATL-LAX", "LAX-ATL", "ATL-MIA", "MIA-ATL", "ATL-BOS", "BOS-ATL",
    "BOS-DCA", "DCA-BOS", "BOS-ORD", "ORD-BOS", "BOS-LAX", "LAX-BOS",
    "DEN-LAX", "LAX-DEN", "DEN-ORD", "ORD-DEN",
  ]);

  const routeKey = `${params.origin}-${params.destination}`;
  const isMajorDomestic = MAJOR_DOMESTIC_ROUTES.has(routeKey);
  const cheapestFare = normedFlights.length > 0
    ? Math.min(...normedFlights.map((o) => o.price_total))
    : 0;
  const nonstopCount = normedFlights.filter((o) => o.stops === 0).length;
  const carriers = [...new Set(normedFlights.map((o) => o.airline))].sort().join(", ");

  console.log(
    `[inventory_check] route=${routeKey} major_domestic=${isMajorDomestic} ` +
    `raw_duffel=${rawOffers.length} normalized=${normedFlights.length} ` +
    `nonstops=${nonstopCount} cheapest=$${cheapestFare.toFixed(0)} ` +
    `carriers=[${carriers || "none"}]`
  );

  if (isMajorDomestic) {
    const warnings: string[] = [];
    if (rawOffers.length < 20)   warnings.push(`only ${rawOffers.length} raw offers from Duffel (expected 20+)`);
    if (nonstopCount < 5)        warnings.push(`only ${nonstopCount} nonstop options after normalization (expected 5+)`);
    if (cheapestFare > 500 && cheapestFare > 0)
      warnings.push(`cheapest fare $${cheapestFare.toFixed(0)} is unusually high for a major domestic route`);
    if (warnings.length > 0) {
      console.warn(`[inventory_warning] possible limited API coverage on ${routeKey}: ${warnings.join("; ")}`);
    }
  }

  // ── Step 4: deduplicate ───────────────────────────────────────────────────────
  const normed = deduplicateOffers(normedFlights);
  console.log(`[after_dedupe_count] ${normed.length} (dropped=${normedFlights.length - normed.length} duplicates)`);

  if (!normed.length) {
    return {
      offers: [],
      meta: {
        status: "empty",
        message: "No fares found for these dates. Try different dates or airports.",
        raw_count: rawOffers.length,
        duffel_ms: elapsed,
      },
    };
  }

  // ── Step 5: score ─────────────────────────────────────────────────────────────
  const scoreMap = buildScoreMap(normed);
  const recs = buildRecommendationMap(normed, scoreMap);
  console.log(`[after_scoring_count] ${normed.length}`);

  let bestKey = "";
  let bestScore = -1;
  for (const [k, v] of recs) {
    if (v.score > bestScore) { bestScore = v.score; bestKey = k; }
  }

  // Pass 1: per-offer attributes (needed before cross-offer comparison)
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

  // Pass 2: cross-offer comparison data
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
      comparison_summary: "",   // populated only by OpenAI; deterministic path uses recommendation_why
      recommendation_why: why,
      recommendation_bullets: wins,
    };
  });

  // Stable 6-key sort: recommended first, then score desc, price asc,
  // duration_minutes asc, departure time asc, airline asc, flight number asc.
  // Every key is deterministic so identical searches produce identical order.
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

  // Augment top pick with OpenAI-generated human explanations (falls back to deterministic if unavailable)
  const topPick = enriched.find((o) => o.is_recommended);
  if (topPick && enriched.length >= 2) {
    const aiText = await generateOpenAIExplanation(topPick, enriched);
    if (aiText) {
      console.log("[openai] enriched top pick with AI explanations");
      topPick.recommendation_why     = aiText.advisor_summary;
      topPick.wins_on                = aiText.why_this;
      topPick.recommendation_bullets = aiText.why_this;
      topPick.tradeoffs              = aiText.tradeoffs;
      topPick.comparison_summary     = aiText.comparison_note;
    } else {
      console.log("[openai] using deterministic fallback");
    }
  }

  console.log(`[returned_to_frontend_count] ${enriched.length}`);
  enriched.forEach((o, i) => {
    console.log(
      `  [final-${i + 1}] "${o.airline}" ${o.flight_number} ` +
      `${o.depart_time}→${o.arrive_time} dur="${o.duration}" stops=${o.stops} ` +
      `conn="${o.connection_airports}" $${o.price_total} score=${o.ai_score} label="${o.recommendation_label}"`
    );
  });

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
      duffel_ms: elapsed,
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

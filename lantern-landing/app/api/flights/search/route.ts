import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

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

function durationLabel(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const raw = String(value).toUpperCase().replace(/^P/, "");
    const hm = raw.match(/(\d+)H/);
    const mm = raw.match(/(\d+)M/);
    const h = hm ? parseInt(hm[1]) : 0;
    const m = mm ? parseInt(mm[1]) : 0;
    if (!h && !m) return "";
    if (h && m) return `${h}h ${String(m).padStart(2, "0")}m`;
    return h ? `${h}h` : `${m}m`;
  } catch {
    return String(value);
  }
}

function durationMinutes(value: string | null | undefined): number {
  if (!value) return 0;
  try {
    const raw = String(value).toUpperCase().replace(/^P/, "");
    const h = raw.match(/(\d+)H/) ? parseInt(raw.match(/(\d+)H/)![1]) : 0;
    const m = raw.match(/(\d+)M/) ? parseInt(raw.match(/(\d+)M/)![1]) : 0;
    return h * 60 + m;
  } catch {
    return 0;
  }
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

function normalizeDuffelOffer(offer: DuffelRecord): DuffelRecord | null {
  const slices = (offer.slices as DuffelRecord[]) ?? [];
  if (!slices.length) return null;
  const firstSlice = slices[0];
  const segments = (firstSlice.segments as DuffelRecord[]) ?? [];
  if (!segments.length) return null;
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  const owner = (offer.owner as DuffelRecord | undefined) ?? {};
  const mc = (firstSeg.marketing_carrier as DuffelRecord | undefined) ?? {};
  const airline = (mc.name as string) ?? (owner.name as string) ?? (owner.iata_code as string) ?? "";
  const mcCode = (mc.iata_code as string) ?? "";
  const fn = (firstSeg.marketing_carrier_flight_number as string) ?? "";
  return {
    airline,
    flight_number: `${mcCode} ${fn}`.trim(),
    origin: airportIata(firstSeg.origin as DuffelRecord | undefined),
    destination: airportIata(lastSeg.destination as DuffelRecord | undefined),
    departure_time: (firstSeg.departing_at as string) ?? "",
    arrival_time: (lastSeg.arriving_at as string) ?? "",
    duration: (firstSlice.duration as string) ?? "",
    stops: Math.max(0, segments.length - 1),
    cabin: segmentCabin(firstSeg),
    baggage: extractBaggage(offer),
    price: (offer.total_amount as string) ?? "0",
    currency: (offer.total_currency as string) ?? "USD",
  };
}

function normalizeFlight(raw: DuffelRecord, adults: number): FlightOffer | null {
  const price = parseFloat(String(raw.price ?? "0"));
  const airline = String(raw.airline ?? "").trim();
  const flightNumber = String(raw.flight_number ?? "").trim();
  if (!airline || !flightNumber || price <= 0) return null;
  const stops = Number(raw.stops ?? 0);
  return {
    airline,
    airline_code: airlineCode(airline, flightNumber),
    flight_number: flightNumber,
    origin: String(raw.origin ?? ""),
    destination: String(raw.destination ?? ""),
    depart_time: timeFromIso(String(raw.departure_time ?? "")),
    arrive_time: timeFromIso(String(raw.arrival_time ?? "")),
    duration: durationLabel(String(raw.duration ?? "")),
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
  };
}

// ── Deduplication ────────────────────────────────────────────────────────────

function deduplicateOffers(offers: FlightOffer[]): FlightOffer[] {
  const best = new Map<string, FlightOffer>();
  for (const o of offers) {
    const key = [o.airline, o.flight_number, o.origin, o.destination, o.depart_time, o.arrive_time, o.duration, o.stops].join("|");
    const existing = best.get(key);
    if (!existing || o.price_total < existing.price_total) {
      best.set(key, o);
    }
  }
  return Array.from(best.values());
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreComponents(o: FlightOffer, medP: number, medD: number): Record<string, number> {
  const durMin = durationMinutes(o.duration);
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
  const medD = median(offers.map((o) => durationMinutes(o.duration) || 99999));
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
  const dur = durationMinutes(o.duration);
  let score = dur >= 20 * 60 ? 3.5 : dur >= 14 * 60 ? 2.5 : dur >= 9 * 60 ? 1.5 : dur >= 5 * 60 ? 0.7 : 0;
  score += Math.min(1.5, o.stops * 0.5);
  if (score >= 4.5) return "Very High";
  if (score >= 2.8) return "High";
  if (score >= 1.2) return "Moderate";
  return "Low";
}

function travelFatigueLabel(o: FlightOffer): string {
  const dur = durationMinutes(o.duration);
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
  const fastestDurMins = Math.min(...offers.map((o) => durationMinutes(o.duration) || 99999));
  const cheapestOffer = offers.find((o) => o.price_total === cheapestPrice) ?? offers[0];
  const nonstops = offers.filter((o) => o.stops === 0);
  return {
    cheapestPrice,
    fastestDurMins,
    cheapestDurMins: durationMinutes(cheapestOffer.duration) || 99999,
    cheapestNonstopPrice: nonstops.length ? Math.min(...nonstops.map((o) => o.price_total)) : null,
    bestFatigueRank: Math.min(...offers.map((o) => FATIGUE_RANK[o.travel_fatigue] ?? 2)),
    bestTimingRank: Math.max(...offers.map((o) => TIMING_RANK[o.arrival_timing] ?? 2)),
    bestComfortRank: Math.max(...offers.map((o) => COMFORT_RANK[o.aircraft_comfort] ?? 1)),
    bestJetLagRank: Math.min(...offers.map((o) => JET_LAG_RANK[o.jet_lag] ?? 2)),
    nonstopExists: nonstops.length > 0,
  };
}

function buildWinsOn(o: FlightOffer, ctx: OfferContext, all: FlightOffer[]): string[] {
  const durMins = durationMinutes(o.duration) || 99999;
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
      wins.push(`Nonstop while ${withStops} other${withStops !== 1 ? "s" : ""} require a connection`);
  }

  if (timeSavedVsCheapest > 30 && priceDiff > 0)
    wins.push(`Saves ${minuteLabel(timeSavedVsCheapest)} vs the cheapest option`);

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

function buildTradeoffsFor(o: FlightOffer, ctx: OfferContext, all: FlightOffer[]): string[] {
  const durMins = durationMinutes(o.duration) || 99999;
  const priceDiff = o.price_total - ctx.cheapestPrice;
  const durDiff = durMins - ctx.fastestDurMins;
  const fatigueRank = FATIGUE_RANK[o.travel_fatigue] ?? 2;
  const timingRank = TIMING_RANK[o.arrival_timing] ?? 2;
  const comfortRank = COMFORT_RANK[o.aircraft_comfort] ?? 1;
  const jetLagRank = JET_LAG_RANK[o.jet_lag] ?? 2;
  const tradeoffs: string[] = [];

  if (priceDiff > ctx.cheapestPrice * 0.04)
    tradeoffs.push(`${moneyUsd(Math.round(priceDiff))} more than the cheapest option`);

  if (durDiff > 45) {
    const fastestOffer = all.find((x) => (durationMinutes(x.duration) || 99999) === ctx.fastestDurMins);
    tradeoffs.push(
      fastestOffer
        ? `${minuteLabel(durDiff)} slower than the fastest option (${fastestOffer.duration})`
        : `${minuteLabel(durDiff)} slower than the fastest option`
    );
  }

  if (o.stops > 0 && ctx.nonstopExists)
    tradeoffs.push(o.stops === 1 ? "Requires a connection — nonstop options exist" : `Requires ${o.stops} connections`);

  if (fatigueRank > ctx.bestFatigueRank && fatigueRank >= 3) {
    const bestLabel = Object.entries(FATIGUE_RANK).find(([, v]) => v === ctx.bestFatigueRank)?.[0] ?? "Low";
    tradeoffs.push(`${o.travel_fatigue} travel fatigue — ${bestLabel.toLowerCase()}-fatigue options available`);
  }

  if (timingRank < ctx.bestTimingRank && timingRank <= 2)
    tradeoffs.push(`${o.arrival_timing} arrival — better-timed options available`);

  if (comfortRank < ctx.bestComfortRank && comfortRank <= 1) {
    const bestLabel = Object.entries(COMFORT_RANK).find(([, v]) => v === ctx.bestComfortRank)?.[0] ?? "Good";
    tradeoffs.push(`${o.aircraft_comfort} comfort vs ${bestLabel.toLowerCase()} on better options`);
  }

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

  const durMins = durationMinutes(o.duration) || 99999;
  const priceDiff = Math.round(o.price_total - ctx.cheapestPrice);
  const durDiff = durMins - ctx.fastestDurMins;
  const timeSavedVsCheapest = ctx.cheapestDurMins - durMins;
  const isCheapest = priceDiff <= 0;
  const isFastest = durDiff <= 10;
  const isNonstop = o.stops === 0;

  const qualityWins = wins.filter(
    (w) => !w.startsWith("Lowest fare") && !w.startsWith("Fastest option") && !w.startsWith("Saves ")
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
    return `Fastest option at ${o.duration}, though ${moneyUsd(priceDiff)} more than the cheapest fare.`;

  // Pattern F: higher price, wins on quality metrics
  if (priceDiff > 0 && qualityWins.length >= 2)
    return `Higher price, but ${qualityWins[0].toLowerCase()} and ${qualityWins[1].toLowerCase()}.`;
  if (priceDiff > 0 && qualityWins.length === 1)
    return `${moneyUsd(priceDiff)} more than cheapest, but ${qualityWins[0].toLowerCase()}.`;

  // Pattern G: nothing standout — state the key facts
  if (tradeoffs.length > 0)
    return `${moneyUsd(priceDiff)} more than cheapest — ${tradeoffs[0].toLowerCase()}.`;

  return `Mid-range option at ${moneyUsd(o.price_total)}.`;
}

// ── Label-only recommendation map ─────────────────────────────────────────────

function buildRecommendationMap(
  offers: FlightOffer[],
  scoreMap: Map<string, { score: number; breakdown: Record<string, number> }>
): Map<string, { score: number; breakdown: Record<string, number>; label: string }> {
  const cheapest = offers.reduce((a, b) => a.price_total <= b.price_total ? a : b);
  const fastest = offers.reduce((a, b) =>
    (durationMinutes(a.duration) || 99999) <= (durationMinutes(b.duration) || 99999) ? a : b
  );
  const bestOverall = offers.reduce((a, b) =>
    (scoreMap.get(flightKey(a))?.score ?? 0) >= (scoreMap.get(flightKey(b))?.score ?? 0) ? a : b
  );
  const nonstops = offers.filter((o) => o.stops === 0);
  const cheapestNonstop = nonstops.length ? nonstops.reduce((a, b) => a.price_total <= b.price_total ? a : b) : null;
  const baggageOpts = offers.filter((o) => o.baggage.trim());
  const baggageBest = baggageOpts.length ? baggageOpts.reduce((a, b) => a.price_total <= b.price_total ? a : b) : null;

  const result = new Map<string, { score: number; breakdown: Record<string, number>; label: string }>();
  for (const o of offers) {
    const key = flightKey(o);
    const sd = scoreMap.get(key) ?? { score: 75, breakdown: {} };
    let label = "Best value";
    if (cheapestNonstop && key === flightKey(cheapestNonstop)) label = "Cheapest nonstop";
    else if (key === flightKey(fastest)) label = "Fastest";
    else if (baggageBest && key === flightKey(baggageBest)) label = "Best baggage";
    else if (key === flightKey(bestOverall)) label = "Best overall";
    else if (key === flightKey(cheapest)) label = "Lowest fare";
    result.set(key, { ...sd, label });
  }
  return result;
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
  // Keep all offers including test/sandbox so search works with a Duffel test key
  const normedRaw = rawOffers.slice(0, 10).map(normalizeDuffelOffer).filter(Boolean) as DuffelRecord[];
  const normedAll = normedRaw.map((r) => normalizeFlight(r, params.adults)).filter(Boolean) as FlightOffer[];
  console.log(`[dedupe] offers before: ${normedAll.length}`);
  const normed = deduplicateOffers(normedAll);
  console.log(`[dedupe] offers after: ${normed.length}`);

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

  const scoreMap = buildScoreMap(normed);
  const recs = buildRecommendationMap(normed, scoreMap);

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
    return {
      ...o,
      wins_on: wins,
      tradeoffs: trofs,
      comparison_summary: summary,
      recommendation_why: summary,
      recommendation_bullets: wins,
    };
  });

  enriched.sort((a, b) => (a.is_recommended ? -1 : b.is_recommended ? 1 : 0) || (b.ai_score - a.ai_score));

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

export async function POST(req: NextRequest) {
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

  return NextResponse.json({ status: "ok", offers, meta }, { status: 200 });
}

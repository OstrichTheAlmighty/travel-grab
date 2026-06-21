/**
 * POST /api/itinerary/preview
 *
 * Stateless itinerary planner — no database required.
 * Accepts all trip data in the request body, runs the V1 deterministic
 * planner, and returns the planned days.
 *
 * Used by the Itinerary UI before a user has a persisted trip.
 */

import { NextRequest, NextResponse } from "next/server";
import { runPlanner } from "@/lib/itinerary/planner";
import type { ItineraryInput, PlannerActivity, LatLng, PlannedDay } from "@/lib/itinerary/types";

// ── AI day summaries (best-effort — absent key or timeout skips silently) ─────

interface AiDaySummaryResult {
  dayIndex: number;
  summary:  string;
  warnings: string[];
}

async function aiDaySummaries(
  days: PlannedDay[],
  destination: string,
): Promise<AiDaySummaryResult[]> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return [];

  // Build compact itinerary for AI (keep tokens low)
  const compact = days.map((d) => ({
    dayIndex: d.dayIndex,
    city:     d.cityLabel ?? d.geographicArea,
    date:     d.date,
    slots:    d.slots
      .filter((s) => s.kind === "activity" || s.kind === "intercity_transfer")
      .map((s) => ({
        time:     `${Math.floor(s.startMinutes / 60)}:${String(s.startMinutes % 60).padStart(2, "0")}`,
        title:    s.title,
        category: s.category ?? (s.kind === "intercity_transfer" ? "transfer" : ""),
        duration: `${s.durationMinutes}m`,
      })),
    warnings: (d.warnings ?? []).map((w) => w.message),
  }));

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:           "gpt-4o-mini",
      max_tokens:      1200,
      temperature:     0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role:    "system",
          content: `You are a world-class travel itinerary writer for ${destination}.
Given a list of planned days, return a JSON object:
{"days": [{"dayIndex": 0, "summary": "2-sentence description of why this day works — mention real place names and what makes the combination special", "warnings": ["optional warning only if genuinely problematic, otherwise empty array"]}]}

Be specific and enthusiastic. Keep summaries under 40 words. Only add warnings for real problems (not just busy days). Return every dayIndex provided.`,
        },
        {
          role:    "user",
          content: JSON.stringify(compact),
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return [];

  const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { days?: AiDaySummaryResult[] };
  return parsed.days ?? [];
}

// ── Rough city-centre coordinates for lat/lng fallback ────────────────────────

const CITY_CENTRES: Record<string, LatLng> = {
  tokyo:         { lat: 35.6762, lng: 139.6503 },
  osaka:         { lat: 34.6937, lng: 135.5023 },
  kyoto:         { lat: 35.0116, lng: 135.7681 },
  hiroshima:     { lat: 34.3853, lng: 132.4553 },
  nara:          { lat: 34.6851, lng: 135.8048 },
  fukuoka:       { lat: 33.5904, lng: 130.4017 },
  sapporo:       { lat: 43.0618, lng: 141.3545 },
  paris:         { lat: 48.8566, lng:   2.3522 },
  london:        { lat: 51.5074, lng:  -0.1278 },
  "new york":    { lat: 40.7128, lng: -74.0060 },
  "los angeles": { lat: 34.0522, lng:-118.2437 },
  barcelona:     { lat: 41.3851, lng:   2.1734 },
  rome:          { lat: 41.9028, lng:  12.4964 },
  amsterdam:     { lat: 52.3676, lng:   4.9041 },
  berlin:        { lat: 52.5200, lng:  13.4050 },
  dubai:         { lat: 25.2048, lng:  55.2708 },
  bangkok:       { lat: 13.7563, lng: 100.5018 },
  bali:          { lat: -8.4095, lng: 115.1889 },
  sydney:        { lat:-33.8688, lng: 151.2093 },
  "new zealand": { lat:-36.8509, lng: 174.7645 },
  singapore:     { lat:  1.3521, lng: 103.8198 },
  seoul:         { lat: 37.5665, lng: 126.9780 },
  "hong kong":   { lat: 22.3193, lng: 114.1694 },
  mexico:        { lat: 19.4326, lng: -99.1332 },
  lisbon:        { lat: 38.7169, lng:  -9.1395 },
  madrid:        { lat: 40.4168, lng:  -3.7038 },
};

function cityCenter(destination: string): LatLng {
  const key = destination.toLowerCase();
  for (const [name, coords] of Object.entries(CITY_CENTRES)) {
    if (key.includes(name)) return coords;
  }
  return { lat: 48.8566, lng: 2.3522 }; // Paris as ultimate fallback
}

// ── Smarter activity durations by category / title keywords ──────────────────

function categoryDuration(category: string, title: string = ""): number {
  const lc = `${category} ${title}`.toLowerCase();
  if (
    lc.includes("disney") || lc.includes("universal") ||
    lc.includes("theme park") || lc.includes("usp ") || lc.includes("bush")
  ) return 360;
  if (lc.includes("spa") || lc.includes("onsen") || lc.includes("hot spring") || lc.includes("bath")) return 120;
  if (lc.includes("museum") || lc.includes("gallery") || lc.includes(" art ")) return 90;
  if (lc.includes("shrine") || lc.includes("temple") || lc.includes("jinja") || lc.includes("ji ")) return 60;
  if (lc.includes("castle") || lc.includes("palace") || lc.includes("fort")) return 75;
  if (lc.includes("market") || lc.includes("bazaar")) return 90;
  if (lc.includes("park") || lc.includes("garden") || lc.includes("forest") || lc.includes("beach")) return 75;
  if (lc.includes("tower") || lc.includes("observation")) return 60;
  if (
    lc.includes("restaurant") || lc.includes("ramen") || lc.includes("sushi") ||
    lc.includes("cafe") || lc.includes("café") || lc.includes("izakaya")
  ) return 75;
  switch (category) {
    case "food":        return 75;
    case "nightlife":   return 120;
    case "culture":     return 90;
    case "adventure":   return 180;
    case "nature":      return 90;
    case "luxury":      return 120;
    case "hidden_gems": return 60;
    default:            return 90;
  }
}

// ── Activity-to-city assignment for multi-city trips ─────────────────────────

function getActivityCity(
  actIndex: number,
  totalActivities: number,
  cityStops: { city: string; days: number }[],
): string | null {
  if (cityStops.length === 0) return null;
  const totalDays = cityStops.reduce((s, c) => s + c.days, 0) || 1;
  const progress = (actIndex + 0.5) / Math.max(1, totalActivities);
  const targetDay = progress * totalDays;
  let cumDays = 0;
  for (const stop of cityStops) {
    cumDays += stop.days;
    if (targetDay <= cumDays) return stop.city;
  }
  return cityStops[cityStops.length - 1].city;
}

// ── Request body types ────────────────────────────────────────────────────────

interface PreviewActivity {
  title:            string;
  category?:        string;
  priority?:        1 | 2 | 3;
  lat?:             number;
  lng?:             number;
  durationMinutes?: number;
}

interface PreviewRequest {
  trip: {
    startDate:    string;
    endDate:      string;
    numTravelers: number;
    city:         string;
    destination:  string;
    cityStops?:   { city: string; days: number }[];
  };
  preferences?: Partial<{
    wakeTimeMinutes:      number;
    sleepTimeMinutes:     number;
    pace:                 "relaxed" | "moderate" | "packed";
    jetLagDays:           number;
    preferredTransitMode: string;
    maxWalkMinutes:       number;
    mealsPerDay:          number;
    breakfastDurationMin: number;
    lunchDurationMin:     number;
    dinnerDurationMin:    number;
    categories:           string[];
  }>;
  hotel?: {
    name:         string;
    lat?:         number;
    lng?:         number;
    checkInDate:  string;
    checkOutDate: string;
    timezone?:    string;
  };
  outboundFlight?: { arrivesAt: string };  // ISO datetime string
  returnFlight?:   { departsAt: string };  // ISO datetime string
  activities:      PreviewActivity[];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: PreviewRequest;
  try {
    body = (await req.json()) as PreviewRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.trip?.startDate || !body.trip?.endDate || !body.trip?.destination) {
    return NextResponse.json({ error: "trip.startDate, endDate, and destination are required" }, { status: 422 });
  }

  const centre   = cityCenter(body.trip.destination);
  const hotelLat = body.hotel?.lat ?? centre.lat;
  const hotelLng = body.hotel?.lng ?? centre.lng;

  const cityStops = (body.trip.cityStops ?? []).filter((c) => c.city.trim() && c.days > 0);

  // Build PlannerActivity list — use real coordinates when provided;
  // fall back to per-city centre (not random offsets) to avoid misleading fake distances.
  const activities: PlannerActivity[] = body.activities.map((a, i) => {
    const hasRealCoords = a.lat != null && a.lng != null;

    // Assign this activity to its city by proportional index, then use that city's centre
    const actCity = getActivityCity(i, body.activities.length, cityStops);
    const actCentre = actCity ? cityCenter(actCity) : centre;

    return {
      id:              `preview-${i}`,
      sourceId:        `preview-${i}`,
      title:           a.title || `Activity ${i + 1}`,
      category:        a.category ?? "culture",
      location:        hasRealCoords
        ? { lat: a.lat!, lng: a.lng! }
        : actCentre,
      durationMinutes: a.durationMinutes ?? categoryDuration(a.category ?? "culture", a.title),
      timeWindows:     [],
      userPriority:    a.priority ?? 3,
      rating:          0,
      reviewCount:     0,
      hasRealCoords,
    };
  });

  const prefs = body.preferences ?? {};

  const isFoodFocused = (prefs.categories ?? []).some(
    (c: string) => c.toLowerCase().includes("food"),
  );

  const input: ItineraryInput = {
    trip: {
      id:           "preview",
      startDate:    body.trip.startDate,
      endDate:      body.trip.endDate,
      numTravelers: body.trip.numTravelers ?? 1,
      city:         body.trip.city || body.trip.destination.split(",")[0].trim(),
      destination:  body.trip.destination,
      cityStops,
    },
    preferences: {
      wakeTimeMinutes:      prefs.wakeTimeMinutes      ?? 480,
      sleepTimeMinutes:     prefs.sleepTimeMinutes     ?? 1320,
      pace:                 prefs.pace                 ?? "moderate",
      jetLagDays:           prefs.jetLagDays           ?? 0,
      preferredTransitMode: prefs.preferredTransitMode ?? "transit",
      maxWalkMinutes:       prefs.maxWalkMinutes        ?? 20,
      mealsPerDay:          prefs.mealsPerDay           ?? 3,
      breakfastDurationMin: prefs.breakfastDurationMin ?? 30,
      lunchDurationMin:     prefs.lunchDurationMin      ?? 60,
      dinnerDurationMin:    prefs.dinnerDurationMin     ?? 75,
      isFoodFocused,
    },
    hotel: body.hotel
      ? {
          lat:          hotelLat,
          lng:          hotelLng,
          checkInDate:  body.hotel.checkInDate,
          checkOutDate: body.hotel.checkOutDate,
          name:         body.hotel.name,
          timezone:     body.hotel.timezone ?? null,
        }
      : null,
    outboundFlight: body.outboundFlight
      ? { arrivesAt: new Date(body.outboundFlight.arrivesAt) }
      : null,
    returnFlight: body.returnFlight
      ? { departsAt: new Date(body.returnFlight.departsAt) }
      : null,
    activities,
  };

  const output = runPlanner(input);

  // ── AI critique pass: generate day summaries and validate itinerary ───────────
  try {
    const summaryOutput = await aiDaySummaries(output.days, body.trip.destination);
    summaryOutput.forEach(({ dayIndex, summary, warnings }) => {
      const day = output.days[dayIndex];
      if (!day) return;
      if (summary) day.daySummary = summary;
      if (warnings?.length) {
        day.warnings = [...(day.warnings ?? []), ...warnings.map((w: string) => ({ type: "ai_note" as const, message: w }))];
      }
    });
  } catch {
    // AI pass is best-effort — never fail the response
  }

  return NextResponse.json(output);
}

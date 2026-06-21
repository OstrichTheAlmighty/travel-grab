/**
 * POST /api/itinerary/preview
 *
 * Stateless itinerary planner — no database required.
 * Accepts all trip data in the request body and returns planned days.
 *
 * City detection: T1=GPS coords, T2=savedCity field, T3=title keywords, T4=proportional
 * Scheduling: smartScheduler — activities first, meals after, nightlife at 8pm+
 */

import { NextRequest, NextResponse }  from "next/server";
import { profileActivity }             from "../activityProfiler";
import {
  smartScheduleItinerary,
  type SmartActivity,
  type SmartSchedulerInput,
} from "../smartScheduler";
import type { PlannedDay, DroppedActivity } from "@/lib/itinerary/types";

// ── AI day summaries (best-effort — absent key or timeout skips silently) ─────

interface AiDaySummaryResult {
  dayIndex: number;
  summary:  string;
  warnings: string[];
}

async function aiDaySummaries(
  days:        PlannedDay[],
  destination: string,
): Promise<AiDaySummaryResult[]> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return [];

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
        { role: "user", content: JSON.stringify(compact) },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) return [];

  const json    = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed  = JSON.parse(content) as { days?: AiDaySummaryResult[] };
  return parsed.days ?? [];
}

// ── City-centre coordinates ───────────────────────────────────────────────────

interface LatLng { lat: number; lng: number }

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
  return { lat: 48.8566, lng: 2.3522 };
}

// ── Duration fallback by category / title ─────────────────────────────────────

function categoryDuration(category: string, title = ""): number {
  const lc = `${category} ${title}`.toLowerCase();
  if (["disney", "universal", "theme park"].some((k) => lc.includes(k))) return 360;
  if (["spa", "onsen", "hot spring", "bath"].some((k) => lc.includes(k))) return 120;
  if (["museum", "gallery", " art "].some((k) => lc.includes(k))) return 90;
  if (["shrine", "temple", "jinja", "ji "].some((k) => lc.includes(k))) return 60;
  if (["castle", "palace", "fort"].some((k) => lc.includes(k))) return 75;
  if (["market", "bazaar"].some((k) => lc.includes(k))) return 90;
  if (["park", "garden", "forest", "beach"].some((k) => lc.includes(k))) return 75;
  if (["tower", "observation"].some((k) => lc.includes(k))) return 60;
  if (["restaurant", "ramen", "sushi", "cafe", "café", "izakaya"].some((k) => lc.includes(k))) return 75;
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

// ── City detection helpers ────────────────────────────────────────────────────

function normStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const LANDMARK_KEYWORDS: Array<[string, string]> = [
  // Tokyo
  ["senso-ji", "tokyo"], ["sensoji", "tokyo"], ["asakusa", "tokyo"],
  ["meiji shrine", "tokyo"], ["meiji jingu", "tokyo"],
  ["shibuya crossing", "tokyo"], ["shinjuku gyoen", "tokyo"],
  ["tokyo skytree", "tokyo"], ["tokyo tower", "tokyo"],
  ["tsukiji", "tokyo"], ["teamlab", "tokyo"],
  ["tokyo disneyland", "tokyo"], ["disney sea", "tokyo"], ["disneysea", "tokyo"],
  ["ueno park", "tokyo"], ["akihabara", "tokyo"], ["ginza", "tokyo"],
  ["odaiba", "tokyo"], ["harajuku", "tokyo"], ["takeshita", "tokyo"],
  ["roppongi", "tokyo"], ["shibuya", "tokyo"], ["shinjuku", "tokyo"],
  ["ikebukuro", "tokyo"], ["imperial palace", "tokyo"],
  // Kyoto
  ["fushimi inari", "kyoto"], ["fushimi-inari", "kyoto"],
  ["kiyomizu", "kyoto"], ["gion", "kyoto"], ["yasaka", "kyoto"],
  ["arashiyama", "kyoto"], ["bamboo grove", "kyoto"], ["bamboo forest", "kyoto"],
  ["kinkaku", "kyoto"], ["golden pavilion", "kyoto"],
  ["ryoan", "kyoto"], ["nijo castle", "kyoto"], ["nijo-jo", "kyoto"],
  ["philosopher", "kyoto"], ["daitoku", "kyoto"], ["nanzen", "kyoto"],
  ["nishiki", "kyoto"], ["togetsu", "kyoto"], ["tenryu", "kyoto"],
  // Osaka
  ["dotonbori", "osaka"], ["kuromon", "osaka"], ["shinsekai", "osaka"],
  ["tsutenkaku", "osaka"], ["universal studios", "osaka"], ["usj", "osaka"],
  ["kaiyukan", "osaka"], ["osaka aquarium", "osaka"],
  ["umeda sky", "osaka"], ["shinsaibashi", "osaka"], ["namba", "osaka"],
  ["osaka castle", "osaka"],
  // Hiroshima
  ["peace memorial", "hiroshima"], ["peace park", "hiroshima"],
  ["atomic bomb dome", "hiroshima"], ["a-bomb dome", "hiroshima"],
  ["genbaku", "hiroshima"], ["miyajima", "hiroshima"],
  ["itsukushima", "hiroshima"], ["hiroshima castle", "hiroshima"],
  // Nara
  ["todai-ji", "nara"], ["todaiji", "nara"], ["nara deer", "nara"],
  ["kasuga", "nara"], ["nara park", "nara"], ["horyu", "nara"],
  // Fukuoka
  ["dazaifu", "fukuoka"], ["ohori park", "fukuoka"],
  ["fukuoka castle", "fukuoka"], ["canal city", "fukuoka"],
  ["nakasu", "fukuoka"], ["tenjin", "fukuoka"],
];

function knownCityCenter(name: string): LatLng | null {
  const key = normStr(name);
  for (const [cityKey, coords] of Object.entries(CITY_CENTRES)) {
    if (key.includes(cityKey)) return coords;
  }
  return null;
}

function detectCityFromTitle(title: string): string | null {
  const n = normStr(title);
  for (const city of Object.keys(CITY_CENTRES)) {
    if (n.includes(city)) return city;
  }
  for (const [kw, city] of LANDMARK_KEYWORDS) {
    if (n.includes(normStr(kw))) return city;
  }
  return null;
}

function getActivityCity(
  actIndex:        number,
  totalActivities: number,
  cityStops:       { city: string; days: number }[],
): string | null {
  if (cityStops.length === 0) return null;
  const totalDays = cityStops.reduce((s, c) => s + c.days, 0) || 1;
  const progress  = (actIndex + 0.5) / Math.max(1, totalActivities);
  const targetDay = progress * totalDays;
  let cumDays = 0;
  for (const stop of cityStops) {
    cumDays += stop.days;
    if (targetDay <= cumDays) return stop.city;
  }
  return cityStops[cityStops.length - 1].city;
}

// ── Haversine + nearest city stop ─────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6371;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestStopCity(
  lat:   number,
  lng:   number,
  stops: { city: string; lat: number; lng: number }[],
): string {
  if (stops.length === 0) return "";
  let best     = stops[0];
  let bestDist = haversineKm(lat, lng, best.lat, best.lng);
  for (const stop of stops.slice(1)) {
    const d = haversineKm(lat, lng, stop.lat, stop.lng);
    if (d < bestDist) { best = stop; bestDist = d; }
  }
  return best.city;
}

function daysBetween(startDate: string, endDate: string): number {
  const a = new Date(startDate + "T00:00:00Z");
  const b = new Date(endDate   + "T00:00:00Z");
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

// ── Request body types ────────────────────────────────────────────────────────

interface PreviewActivity {
  title:            string;
  category?:        string;
  priority?:        1 | 2 | 3;
  lat?:             number;
  lng?:             number;
  durationMinutes?: number;
  city?:            string;
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
  outboundFlight?: { arrivesAt: string };
  returnFlight?:   { departsAt: string };
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
    return NextResponse.json(
      { error: "trip.startDate, endDate, and destination are required" },
      { status: 422 },
    );
  }

  const centre   = cityCenter(body.trip.destination);
  const hotelLat = body.hotel?.lat ?? centre.lat;
  const hotelLng = body.hotel?.lng ?? centre.lng;

  const cityStops = (body.trip.cityStops ?? [])
    .filter((c) => c.city.trim() && c.days > 0)
    .map((c) => {
      const cc = cityCenter(c.city);
      return { city: c.city, days: c.days, lat: cc.lat, lng: cc.lng };
    });

  const isMultiCity = cityStops.length > 1;

  // ── T1-T4 city detection ──────────────────────────────────────────────────
  interface ActivityDebugEntry {
    i:            number;
    title:        string;
    savedCity:    string | null;
    detectedCity: string | null;
    tier:         string;
    assignedCity: string;
  }
  const activityDebug: ActivityDebugEntry[] = [];
  const t4Dropped:     DroppedActivity[]    = [];
  const smartActivities: SmartActivity[]    = [];

  for (let i = 0; i < body.activities.length; i++) {
    const a     = body.activities[i];
    const title = a.title || `Activity ${i + 1}`;
    const dur   = a.durationMinutes ?? categoryDuration(a.category ?? "culture", title);
    const profile = profileActivity({ title, category: a.category, durationMinutes: dur });

    let assignedCity: string;
    let tier:         string;
    let detectedCity: string | null = null;

    if (a.lat != null && a.lng != null) {
      // T1: real GPS — find nearest city stop
      tier         = "T1:gps";
      assignedCity = isMultiCity
        ? nearestStopCity(a.lat, a.lng, cityStops)
        : body.trip.destination;
    } else if (isMultiCity) {
      // T2: city explicitly saved with the activity
      const cityFromSaved = a.city ? knownCityCenter(a.city) : null;
      if (cityFromSaved) {
        tier         = "T2:savedCity";
        assignedCity = a.city!;
        detectedCity = a.city!;
      } else {
        // T3: city name / landmark keyword in the activity title
        const det           = detectCityFromTitle(title);
        const cityFromTitle = det ? knownCityCenter(det) : null;
        if (cityFromTitle) {
          tier         = "T3:titleDetect";
          assignedCity = det!;
          detectedCity = det;
        } else {
          // T4: proportional fallback — unreliable for multi-city
          const fallback = getActivityCity(i, body.activities.length, cityStops) ?? body.trip.destination;
          tier           = "T4:proportional";
          detectedCity   = fallback;

          if (profile.activityType === "nightlife") {
            // T4 nightlife → pin to primary city (better than proportional)
            assignedCity = cityStops[0]?.city ?? body.trip.destination;
            console.log(`[CITY-NIGHTLIFE] T4 nightlife "${title}" → pinned to ${assignedCity}`);
          } else {
            // T4 non-nightlife → city unknown, surface as dropped
            console.log(`[CITY-DROP] T4 "${title}" (${a.category}) → city unknown, dropped`);
            t4Dropped.push({ sourceId: `preview-${i}`, title, reason: "City unknown for multi-city trip" });
            activityDebug.push({ i, title, savedCity: a.city ?? null, detectedCity, tier, assignedCity: "(dropped)" });
            continue;
          }
        }
      }
    } else {
      // Single-city or no city stops configured
      tier         = "T0:singleCity";
      assignedCity = body.trip.destination;
    }

    if (isMultiCity) {
      activityDebug.push({ i, title, savedCity: a.city ?? null, detectedCity, tier, assignedCity });
      console.log(
        `[preview/cityAssign] ${tier.padEnd(20)} | city=${assignedCity} | "${title}"`,
      );
    }

    smartActivities.push({
      sourceId:        `preview-${i}`,
      title,
      category:        a.category ?? "culture",
      durationMinutes: dur,
      lat:             a.lat ?? undefined,
      lng:             a.lng ?? undefined,
      assignedCity,
      profile,
    });
  }

  // ── Build SmartSchedulerInput ─────────────────────────────────────────────
  const prefs = body.preferences ?? {};

  // If no cityStops provided, synthesise a single-city stop from startDate/endDate
  const resolvedStops = cityStops.length > 0
    ? cityStops
    : [{
        city: body.trip.destination,
        days: daysBetween(body.trip.startDate, body.trip.endDate),
        lat:  centre.lat,
        lng:  centre.lng,
      }];

  const smartInput: SmartSchedulerInput = {
    startDate:  body.trip.startDate,
    cityStops:  resolvedStops,
    activities: smartActivities,
    preferences: {
      wakeTimeMinutes:      prefs.wakeTimeMinutes      ?? 480,
      sleepTimeMinutes:     prefs.sleepTimeMinutes     ?? 1320,
      pace:                 prefs.pace                 ?? "moderate",
      mealsPerDay:          prefs.mealsPerDay          ?? 3,
      breakfastDurationMin: prefs.breakfastDurationMin ?? 30,
      lunchDurationMin:     prefs.lunchDurationMin     ?? 60,
      dinnerDurationMin:    prefs.dinnerDurationMin    ?? 75,
    },
    hotel: body.hotel
      ? { name: body.hotel.name, checkInDate: body.hotel.checkInDate, checkOutDate: body.hotel.checkOutDate }
      : null,
    outboundArrivesAt: body.outboundFlight ? new Date(body.outboundFlight.arrivesAt) : null,
    returnDepartsAt:   body.returnFlight   ? new Date(body.returnFlight.departsAt)   : null,
  };

  const output = smartScheduleItinerary(smartInput);

  // Merge T4 drops into meta
  const allDropped = [...t4Dropped, ...output.dropped];
  output.meta.droppedActivities        = allDropped;
  output.meta.totalActivitiesDropped   = allDropped.length;
  output.meta.totalActivitiesScheduled = smartActivities.length - output.dropped.length;

  // ── Debug logging ─────────────────────────────────────────────────────────
  if (isMultiCity) {
    console.log("\n[preview/dayAssignments] ─────────────────────────────────────");
    for (const d of output.days) {
      const acts    = d.slots.filter((s) => s.kind === "activity").map((s) => s.title);
      const summary = acts.length > 0 ? acts.join(", ") : "(no activities)";
      console.log(
        `  Day ${String(d.dayIndex + 1).padStart(2)} (${(d.cityLabel ?? "?").padEnd(12)}) ` +
        `${d.totalActivityMinutes}min | ${summary}`,
      );
    }
    console.log("────────────────────────────────────────────────────────────\n");
  }

  // ── AI day summaries ──────────────────────────────────────────────────────
  try {
    const summaryOutput = await aiDaySummaries(output.days, body.trip.destination);
    summaryOutput.forEach(({ dayIndex, summary, warnings }) => {
      const day = output.days[dayIndex];
      if (!day) return;
      if (summary) day.daySummary = summary;
      if (warnings?.length) {
        day.warnings = [
          ...(day.warnings ?? []),
          ...warnings.map((w: string) => ({ type: "ai_note" as const, message: w })),
        ];
      }
    });
  } catch {
    // AI summaries are best-effort — never fail the response
  }

  const responseBody = {
    days: output.days,
    meta: output.meta,
    _debugCityAssignment: isMultiCity
      ? {
          cityStops:         resolvedStops.map((c) => ({ city: c.city, days: c.days })),
          activityDetection: activityDebug,
        }
      : undefined,
  };

  return NextResponse.json(responseBody);
}

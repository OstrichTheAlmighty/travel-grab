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
import type { ItineraryInput, PlannerActivity, LatLng } from "@/lib/itinerary/types";

// ── Rough city-centre coordinates for lat/lng fallback ────────────────────────

const CITY_CENTRES: Record<string, LatLng> = {
  tokyo:         { lat: 35.6762, lng: 139.6503 },
  osaka:         { lat: 34.6937, lng: 135.5023 },
  kyoto:         { lat: 35.0116, lng: 135.7681 },
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

// ── Request body types ────────────────────────────────────────────────────────

interface PreviewActivity {
  title:           string;
  category?:       string;
  priority?:       1 | 2 | 3;
  lat?:            number;
  lng?:            number;
  durationMinutes?: number;
}

interface PreviewRequest {
  trip: {
    startDate:    string;
    endDate:      string;
    numTravelers: number;
    city:         string;
    destination:  string;
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

  const centre = cityCenter(body.trip.destination);
  const hotelLat = body.hotel?.lat ?? centre.lat;
  const hotelLng = body.hotel?.lng ?? centre.lng;

  // Build PlannerActivity list — assign positions around hotel/city-centre for
  // activities that don't have explicit coordinates
  const activities: PlannerActivity[] = body.activities.map((a, i) => ({
    id:              `preview-${i}`,
    sourceId:        `preview-${i}`,
    title:           a.title || `Activity ${i + 1}`,
    category:        a.category ?? "culture",
    location: {
      lat: a.lat ?? hotelLat + (i % 3 - 1) * 0.008 + Math.floor(i / 3) * 0.005,
      lng: a.lng ?? hotelLng + (i % 3 - 1) * 0.010 + Math.floor(i / 3) * 0.005,
    },
    durationMinutes: a.durationMinutes ?? 90,
    timeWindows:     [],
    userPriority:    a.priority ?? 3,
    rating:          0,
    reviewCount:     0,
  }));

  const prefs = body.preferences ?? {};

  const input: ItineraryInput = {
    trip: {
      id:           "preview",
      startDate:    body.trip.startDate,
      endDate:      body.trip.endDate,
      numTravelers: body.trip.numTravelers ?? 1,
      city:         body.trip.city || body.trip.destination.split(",")[0].trim(),
      destination:  body.trip.destination,
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

  return NextResponse.json(output);
}

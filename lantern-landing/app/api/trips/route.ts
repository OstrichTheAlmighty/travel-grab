import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { NewTrip } from "@/lib/db/types";

function deviceId(req: NextRequest): string | null {
  return req.headers.get("x-device-id");
}

// GET /api/trips — list all trips for this device
export async function GET(req: NextRequest) {
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const rows = await db
    .select()
    .from(trips)
    .where(eq(trips.deviceId, did))
    .orderBy(trips.createdAt);

  return NextResponse.json({ trips: rows });
}

// POST /api/trips — create a new trip
export async function POST(req: NextRequest) {
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const body = (await req.json()) as {
    destination: string;
    city:        string;
    country:     string;
    startDate:   string;
    endDate:     string;
    numTravelers?: number;
  };

  if (!body.destination || !body.city || !body.country || !body.startDate || !body.endDate) {
    return NextResponse.json({ error: "destination, city, country, startDate, endDate are required" }, { status: 422 });
  }

  const insert: NewTrip = {
    deviceId:     did,
    destination:  body.destination,
    city:         body.city,
    country:      body.country,
    startDate:    body.startDate,
    endDate:      body.endDate,
    numTravelers: body.numTravelers ?? 1,
  };

  const [trip] = await db.insert(trips).values(insert).returning();

  // Seed empty preferences row so callers don't need to POST preferences separately
  await db.insert(tripPreferences).values({ tripId: trip.id }).onConflictDoNothing();

  return NextResponse.json({ trip }, { status: 201 });
}

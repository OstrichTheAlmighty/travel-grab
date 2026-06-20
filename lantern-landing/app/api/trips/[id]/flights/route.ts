import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripFlights } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { NewTripFlight } from "@/lib/db/types";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

async function ownedTrip(tripId: string, did: string) {
  const [row] = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.deviceId, did)));
  return row ?? null;
}

// GET /api/trips/[id]/flights
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const flights = await db.select().from(tripFlights).where(eq(tripFlights.tripId, id));
  return NextResponse.json({ flights });
}

// POST /api/trips/[id]/flights — save a flight to the trip
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Omit<NewTripFlight, "tripId">;

  const [flight] = await db
    .insert(tripFlights)
    .values({ ...body, tripId: id })
    .returning();

  return NextResponse.json({ flight }, { status: 201 });
}

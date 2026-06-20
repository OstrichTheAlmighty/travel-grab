import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripHotels } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { NewTripHotel } from "@/lib/db/types";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

async function ownedTrip(tripId: string, did: string) {
  const [row] = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.deviceId, did)));
  return row ?? null;
}

// GET /api/trips/[id]/hotels
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hotels = await db.select().from(tripHotels).where(eq(tripHotels.tripId, id));
  return NextResponse.json({ hotels });
}

// POST /api/trips/[id]/hotels
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Omit<NewTripHotel, "tripId">;

  const [hotel] = await db
    .insert(tripHotels)
    .values({ ...body, tripId: id })
    .returning();

  return NextResponse.json({ hotel }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripPreferences, tripFlights, tripHotels, tripActivities } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest): string | null {
  return req.headers.get("x-device-id");
}

async function ownedTrip(tripId: string, did: string) {
  const [row] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.deviceId, did)));
  return row ?? null;
}

// GET /api/trips/[id] — full trip with nested relations
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const trip = await ownedTrip(id, did);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [preferences, flights, hotels, activities] = await Promise.all([
    db.select().from(tripPreferences).where(eq(tripPreferences.tripId, id)).then((r) => r[0] ?? null),
    db.select().from(tripFlights).where(eq(tripFlights.tripId, id)),
    db.select().from(tripHotels).where(eq(tripHotels.tripId, id)),
    db.select().from(tripActivities).where(eq(tripActivities.tripId, id)),
  ]);

  return NextResponse.json({ trip: { ...trip, preferences, flights, hotels, activities } });
}

// PATCH /api/trips/[id] — update status, dates, numTravelers
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const trip = await ownedTrip(id, did);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Partial<{
    destination:  string;
    city:         string;
    country:      string;
    startDate:    string;
    endDate:      string;
    numTravelers: number;
    status:       string;
  }>;

  const [updated] = await db
    .update(trips)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(trips.id, id))
    .returning();

  return NextResponse.json({ trip: updated });
}

// DELETE /api/trips/[id] — soft-delete not needed at this stage; hard delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const trip = await ownedTrip(id, did);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(trips).where(eq(trips.id, id));
  return new NextResponse(null, { status: 204 });
}

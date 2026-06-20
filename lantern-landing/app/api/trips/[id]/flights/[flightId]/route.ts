import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripFlights } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

// DELETE /api/trips/[id]/flights/[flightId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; flightId: string }> },
) {
  const { id, flightId } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const [trip] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.deviceId, did)));
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await db
    .delete(tripFlights)
    .where(and(eq(tripFlights.id, flightId), eq(tripFlights.tripId, id)))
    .returning({ id: tripFlights.id });

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

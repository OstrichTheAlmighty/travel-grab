import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripHotels } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

// DELETE /api/trips/[id]/hotels/[hotelId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; hotelId: string }> },
) {
  const { id, hotelId } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const [trip] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.deviceId, did)));
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await db
    .delete(tripHotels)
    .where(and(eq(tripHotels.id, hotelId), eq(tripHotels.tripId, id)))
    .returning({ id: tripHotels.id });

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripActivities } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

// PATCH /api/trips/[id]/activities/[activityId] — update priority, notes, dayHint
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const { id, activityId } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const [trip] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.deviceId, did)));
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as Partial<{
    userPriority: number;
    userNotes:    string;
    dayHint:      number | null;
  }>;

  const [activity] = await db
    .update(tripActivities)
    .set(body)
    .where(and(eq(tripActivities.id, activityId), eq(tripActivities.tripId, id)))
    .returning();

  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ activity });
}

// DELETE /api/trips/[id]/activities/[activityId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const { id, activityId } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const [trip] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.deviceId, did)));
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await db
    .delete(tripActivities)
    .where(and(eq(tripActivities.id, activityId), eq(tripActivities.tripId, id)))
    .returning({ id: tripActivities.id });

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

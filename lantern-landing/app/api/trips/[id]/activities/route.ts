import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripActivities } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { NewTripActivity } from "@/lib/db/types";
import type { ActivitySnapshot } from "@/lib/db/schema";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

async function ownedTrip(tripId: string, did: string) {
  const [row] = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.deviceId, did)));
  return row ?? null;
}

// GET /api/trips/[id]/activities
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const activities = await db.select().from(tripActivities).where(eq(tripActivities.tripId, id));
  return NextResponse.json({ activities });
}

// POST /api/trips/[id]/activities — add activity to trip
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    sourceId:     string;
    snapshot:     ActivitySnapshot;
    userPriority?: number;
    userNotes?:   string;
    dayHint?:     number;
  };

  if (!body.sourceId || !body.snapshot) {
    return NextResponse.json({ error: "sourceId and snapshot are required" }, { status: 422 });
  }

  const insert: NewTripActivity = {
    tripId:       id,
    sourceId:     body.sourceId,
    snapshot:     body.snapshot,
    userPriority: body.userPriority ?? 3,
    userNotes:    body.userNotes,
    dayHint:      body.dayHint,
  };

  const [activity] = await db
    .insert(tripActivities)
    .values(insert)
    .onConflictDoUpdate({
      target: [tripActivities.tripId, tripActivities.sourceId],
      set:    {
        snapshot:     body.snapshot,
        userPriority: body.userPriority ?? 3,
        userNotes:    body.userNotes,
        dayHint:      body.dayHint,
      },
    })
    .returning();

  return NextResponse.json({ activity }, { status: 201 });
}

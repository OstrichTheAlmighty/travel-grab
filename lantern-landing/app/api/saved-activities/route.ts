import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedActivities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { NewSavedActivity } from "@/lib/db/types";
import type { ActivitySnapshot } from "@/lib/db/schema";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

// GET /api/saved-activities — all saved activities for this device
export async function GET(req: NextRequest) {
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  // Optionally filter by destination
  const destination = req.nextUrl.searchParams.get("destination");

  let rows;
  if (destination) {
    const { and, eq: drizzleEq } = await import("drizzle-orm");
    rows = await db
      .select()
      .from(savedActivities)
      .where(and(drizzleEq(savedActivities.deviceId, did), drizzleEq(savedActivities.destination, destination)));
  } else {
    rows = await db.select().from(savedActivities).where(eq(savedActivities.deviceId, did));
  }

  return NextResponse.json({ savedActivities: rows });
}

// POST /api/saved-activities — save or update an activity
export async function POST(req: NextRequest) {
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const body = (await req.json()) as {
    sourceId:    string;
    destination: string;
    city:        string;
    country:     string;
    snapshot:    ActivitySnapshot;
  };

  if (!body.sourceId || !body.snapshot || !body.destination) {
    return NextResponse.json({ error: "sourceId, destination, and snapshot are required" }, { status: 422 });
  }

  const insert: NewSavedActivity = {
    deviceId:    did,
    sourceId:    body.sourceId,
    destination: body.destination,
    city:        body.city,
    country:     body.country,
    snapshot:    body.snapshot,
  };

  const [saved] = await db
    .insert(savedActivities)
    .values(insert)
    .onConflictDoUpdate({
      target: [savedActivities.deviceId, savedActivities.sourceId],
      set:    { snapshot: body.snapshot, savedAt: new Date() },
    })
    .returning();

  return NextResponse.json({ savedActivity: saved }, { status: 201 });
}

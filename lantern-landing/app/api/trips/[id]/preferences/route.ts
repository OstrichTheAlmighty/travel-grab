import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripPreferences } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest) {
  return req.headers.get("x-device-id");
}

async function ownedTrip(tripId: string, did: string) {
  const [row] = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.deviceId, did)));
  return row ?? null;
}

// GET /api/trips/[id]/preferences
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [prefs] = await db.select().from(tripPreferences).where(eq(tripPreferences.tripId, id));
  return NextResponse.json({ preferences: prefs ?? null });
}

// PUT /api/trips/[id]/preferences — upsert (full replacement of mutable fields)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  const [prefs] = await db
    .insert(tripPreferences)
    .values({ tripId: id, ...body })
    .onConflictDoUpdate({
      target: tripPreferences.tripId,
      set:    { ...body, updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json({ preferences: prefs });
}

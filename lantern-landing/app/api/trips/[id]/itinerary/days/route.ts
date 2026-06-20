import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, itineraryDrafts, itineraryDays, itinerarySlots } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

// GET /api/trips/[id]/itinerary/days — all days + slots for the active draft
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const [trip] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.deviceId, did)));
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [draft] = await db
    .select()
    .from(itineraryDrafts)
    .where(and(eq(itineraryDrafts.tripId, id), eq(itineraryDrafts.isActive, true)));

  if (!draft) return NextResponse.json({ days: [] });

  const days = await db
    .select()
    .from(itineraryDays)
    .where(eq(itineraryDays.draftId, draft.id));

  // Fetch slots for all days
  const allSlots = await Promise.all(
    days.map((day) =>
      db.select().from(itinerarySlots).where(eq(itinerarySlots.dayId, day.id)),
    ),
  );

  const daysWithSlots = days.map((day, i) => ({
    ...day,
    slots: allSlots[i] ?? [],
  }));

  return NextResponse.json({ days: daysWithSlots, draftStatus: draft.status });
}

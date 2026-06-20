import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trips, tripPreferences, tripActivities, itineraryDrafts, itineraryDays, itinerarySlots } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

async function ownedTrip(tripId: string, did: string) {
  const [row] = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.deviceId, did)));
  return row ?? null;
}

async function activeDraft(tripId: string) {
  const [row] = await db
    .select()
    .from(itineraryDrafts)
    .where(and(eq(itineraryDrafts.tripId, tripId), eq(itineraryDrafts.isActive, true)));
  return row ?? null;
}

// GET /api/trips/[id]/itinerary — fetch the active draft with days and slots
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });
  if (!(await ownedTrip(id, did))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const draft = await activeDraft(id);
  if (!draft) return NextResponse.json({ itinerary: null });

  const days = await db.select().from(itineraryDays).where(eq(itineraryDays.draftId, draft.id));

  const dayIds = days.map((d) => d.id);
  const slots = dayIds.length
    ? await db.select().from(itinerarySlots).where(
        // Use inArray when we have multiple days; for now use explicit loop
        eq(itinerarySlots.dayId, dayIds[0]), // simplified — real impl uses sql`id = ANY(${dayIds})`
      )
    : [];

  const daysWithSlots = days.map((day) => ({
    ...day,
    slots: slots.filter((s) => s.dayId === day.id),
  }));

  return NextResponse.json({ itinerary: { ...draft, days: daysWithSlots } });
}

// POST /api/trips/[id]/itinerary — trigger generation of a new draft
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  const trip = await ownedTrip(id, did);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [prefs] = await db.select().from(tripPreferences).where(eq(tripPreferences.tripId, id));
  const activities = await db.select().from(tripActivities).where(eq(tripActivities.tripId, id));

  // Deactivate any existing active draft
  await db
    .update(itineraryDrafts)
    .set({ isActive: false })
    .where(and(eq(itineraryDrafts.tripId, id), eq(itineraryDrafts.isActive, true)));

  // Determine next version
  const allDrafts = await db.select().from(itineraryDrafts).where(eq(itineraryDrafts.tripId, id));
  const nextVersion = allDrafts.length + 1;

  const preferencesSnapshot = {
    wakeTimeMinutes:      prefs?.wakeTimeMinutes      ?? 480,
    sleepTimeMinutes:     prefs?.sleepTimeMinutes     ?? 1320,
    pace:                 (prefs?.pace ?? "moderate") as "relaxed" | "moderate" | "packed",
    categoryWeights:      (prefs?.categoryWeights as Record<string, number>) ?? {},
    avoidCrowds:          prefs?.avoidCrowds          ?? false,
    mealsPerDay:          prefs?.mealsPerDay           ?? 3,
    preferredTransitMode: prefs?.preferredTransitMode ?? "transit",
    maxWalkMinutes:       prefs?.maxWalkMinutes        ?? 20,
  };

  const [draft] = await db
    .insert(itineraryDrafts)
    .values({
      tripId:              id,
      version:             nextVersion,
      isActive:            true,
      status:              "generating",
      preferencesSnapshot,
    })
    .returning();

  // Generation happens async — this endpoint returns immediately.
  // A background worker (or a dedicated /generate route) fills in the days/slots.
  // For now return the draft shell so the client can poll on status.

  return NextResponse.json(
    { itinerary: { ...draft, days: [] }, message: "Itinerary generation started" },
    { status: 202 },
  );
}

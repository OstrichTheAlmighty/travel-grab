/**
 * POST /api/trips/[id]/itinerary/generate
 *
 * Synchronously runs the V1 deterministic itinerary planner and persists
 * the result to itinerary_drafts / itinerary_days / itinerary_slots.
 *
 * Returns the full planned itinerary in a single response — no polling needed
 * for the deterministic engine.  When an LLM planning pass is added in V2,
 * this endpoint can return 202 and the caller can poll GET /itinerary.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  trips,
  tripPreferences,
  tripFlights,
  tripHotels,
  tripActivities,
  itineraryDrafts,
  itineraryDays,
  itinerarySlots,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { runPlanner, snapshotToPlanner } from "@/lib/itinerary/planner";
import type { PlannedSlot } from "@/lib/itinerary/types";
import type { TransitSegment } from "@/lib/db/schema";

function deviceId(req: NextRequest) {
  return req.headers.get("x-device-id");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  // ── 1. Load trip (with ownership check) ────────────────────────────────────
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.deviceId, did)));

  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // ── 2. Load related data in parallel ──────────────────────────────────────
  const [prefs, flights, hotels, rawActivities] = await Promise.all([
    db.select().from(tripPreferences).where(eq(tripPreferences.tripId, tripId)).then((r) => r[0] ?? null),
    db.select().from(tripFlights).where(eq(tripFlights.tripId, tripId)),
    db.select().from(tripHotels).where(eq(tripHotels.tripId, tripId)),
    db.select().from(tripActivities).where(eq(tripActivities.tripId, tripId)),
  ]);

  // ── 3. Convert DB rows to planner types ───────────────────────────────────
  const plannerActivities = rawActivities
    .map((row) => snapshotToPlanner({ id: row.id, sourceId: row.sourceId, snapshot: row.snapshot, userPriority: row.userPriority }))
    .filter(Boolean) as ReturnType<typeof snapshotToPlanner>[];

  const outboundFlight = flights.find((f) => f.direction === "outbound") ?? null;
  const returnFlight   = flights.find((f) => f.direction === "return")   ?? null;

  const hotel = hotels[0] ?? null;

  const preferences = {
    wakeTimeMinutes:      prefs?.wakeTimeMinutes      ?? 480,
    sleepTimeMinutes:     prefs?.sleepTimeMinutes     ?? 1320,
    pace:                 ((prefs?.pace ?? "moderate") as "relaxed" | "moderate" | "packed"),
    jetLagDays:           prefs?.jetLagDays           ?? 0,
    preferredTransitMode: prefs?.preferredTransitMode ?? "transit",
    maxWalkMinutes:       prefs?.maxWalkMinutes        ?? 20,
    mealsPerDay:          prefs?.mealsPerDay           ?? 3,
    breakfastDurationMin: prefs?.breakfastDurationMin ?? 30,
    lunchDurationMin:     prefs?.lunchDurationMin      ?? 60,
    dinnerDurationMin:    prefs?.dinnerDurationMin     ?? 75,
  };

  const plannerInput = {
    trip: {
      id:           trip.id,
      startDate:    trip.startDate,
      endDate:      trip.endDate,
      numTravelers: trip.numTravelers,
      city:         trip.city,
      destination:  trip.destination,
    },
    preferences,
    hotel: hotel
      ? {
          lat:          hotel.lat ? Number(hotel.lat) : null,
          lng:          hotel.lng ? Number(hotel.lng) : null,
          checkInDate:  hotel.checkInDate,
          checkOutDate: hotel.checkOutDate,
          name:         hotel.name,
          timezone:     hotel.timezone,
        }
      : null,
    outboundFlight: outboundFlight ? { arrivesAt: new Date(outboundFlight.arrivesAt) } : null,
    returnFlight:   returnFlight   ? { departsAt: new Date(returnFlight.departsAt)   } : null,
    activities: plannerActivities.filter(Boolean) as NonNullable<typeof plannerActivities[0]>[],
  };

  // ── 4. Run the planner ────────────────────────────────────────────────────
  const output = runPlanner(plannerInput);

  // ── 5. Persist: deactivate old drafts, create new draft ──────────────────
  await db
    .update(itineraryDrafts)
    .set({ isActive: false })
    .where(and(eq(itineraryDrafts.tripId, tripId), eq(itineraryDrafts.isActive, true)));

  const allDrafts = await db
    .select({ id: itineraryDrafts.id })
    .from(itineraryDrafts)
    .where(eq(itineraryDrafts.tripId, tripId));

  const preferencesSnapshot = {
    wakeTimeMinutes:      preferences.wakeTimeMinutes,
    sleepTimeMinutes:     preferences.sleepTimeMinutes,
    pace:                 preferences.pace,
    categoryWeights:      {} as Record<string, number>,
    avoidCrowds:          false,
    mealsPerDay:          preferences.mealsPerDay,
    preferredTransitMode: preferences.preferredTransitMode,
    maxWalkMinutes:       preferences.maxWalkMinutes,
  };

  const [draft] = await db
    .insert(itineraryDrafts)
    .values({
      tripId,
      version:             allDrafts.length + 1,
      isActive:            true,
      status:              "ready",
      preferencesSnapshot,
      planningMeta:        {
        solverDurationMs: output.meta.solverDurationMs,
        clusterLabels:    output.days.map((d) => d.geographicArea),
        conflicts:        output.meta.conflicts.map((c) => ({
          type:        c.type,
          description: c.description,
          suggestions: [{ action: "manual", description: c.suggestion, autoApply: false }],
        })),
      },
      generatedAt:         new Date(),
    })
    .returning();

  // ── 6. Persist days + slots ───────────────────────────────────────────────
  const savedDays = await Promise.all(
    output.days.map((day) =>
      db
        .insert(itineraryDays)
        .values({
          draftId:        draft.id,
          dayIndex:       day.dayIndex,
          date:           day.date,
          theme:          day.theme,
          summary:        buildDaySummary(day.slots.filter((s) => s.kind === "activity").length, day.theme),
          geographicArea: day.geographicArea,
        })
        .returning()
        .then((r) => r[0]),
    ),
  );

  await Promise.all(
    savedDays.flatMap((savedDay, di) => {
      const planDay = output.days[di];
      return planDay.slots.map((slot, pos) =>
        db.insert(itinerarySlots).values(slotToInsert(savedDay.id, pos, slot)),
      );
    }),
  );

  // ── 7. Update trip status ─────────────────────────────────────────────────
  await db
    .update(trips)
    .set({ status: "planning", updatedAt: new Date() })
    .where(eq(trips.id, tripId));

  // ── 8. Return full itinerary ──────────────────────────────────────────────
  const responseBody = {
    draftId:   draft.id,
    version:   draft.version,
    status:    draft.status,
    days:      output.days,
    meta:      output.meta,
  };

  return NextResponse.json({ itinerary: responseBody }, { status: 201 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDaySummary(activityCount: number, theme: string): string {
  if (activityCount === 0) return "A relaxed day — explore at your own pace.";
  if (activityCount === 1) return `A focused day centred on ${theme}.`;
  return `${activityCount} activities: ${theme}.`;
}

function slotToInsert(dayId: string, position: number, slot: PlannedSlot) {
  const transitToNext: TransitSegment | undefined = slot.transit
    ? {
        mode:            slot.transit.mode,
        durationMinutes: slot.transit.durationMinutes,
        distanceKm:      slot.transit.distanceKm,
        computedAt:      new Date().toISOString(),
      }
    : undefined;

  return {
    dayId,
    position,
    kind:                  slot.kind,
    tripActivityId:        slot.tripActivityId ?? null,
    scheduledStartMinutes: slot.startMinutes,
    scheduledEndMinutes:   slot.endMinutes,
    durationMinutes:       slot.durationMinutes,
    transitToNext:         transitToNext ?? null,
    aiNotes:               slot.explanation,
    userNotes:             slot.note ?? null,
  };
}

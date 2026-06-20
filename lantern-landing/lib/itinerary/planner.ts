/**
 * Deterministic itinerary planner (V1 — no LLM).
 *
 * Pipeline:
 *   1. Compute per-day boundaries (effective start/end times, jet-lag adjustment)
 *   2. Cluster activities geographically (k-means, k = full scheduling days)
 *   3. For each day, run the nearest-neighbour scheduler
 *   4. Build PlannedDay output with themes and metadata
 */

import { clusterByLocation } from "./geo";
import { scheduleDay, formatTime } from "./scheduler";
import type {
  ItineraryInput,
  PlannerOutput,
  PlannedDay,
  DayBoundary,
  DroppedActivity,
  PlanningConflict,
  LatLng,
  TransitMode,
  PlannerActivity,
} from "./types";

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  return Math.round((e - s) / 86_400_000);
}

function minutesFromDate(d: Date, baseDate: string): number {
  const midnight = new Date(baseDate + "T00:00:00Z").getTime();
  return Math.round((d.getTime() - midnight) / 60_000);
}

// ── Build per-day boundaries ──────────────────────────────────────────────────

function buildDayBoundaries(input: ItineraryInput): DayBoundary[] {
  const { trip, preferences, outboundFlight, returnFlight } = input;
  const numDays = daysBetween(trip.startDate, trip.endDate) + 1;
  const boundaries: DayBoundary[] = [];

  for (let i = 0; i < numDays; i++) {
    const date = addDays(trip.startDate, i);
    const isArrivalDay   = i === 0;
    const isDepartureDay = i === numDays - 1 && numDays > 1;

    // Default window from preferences
    let effectiveStart = preferences.wakeTimeMinutes;
    let effectiveEnd   = preferences.sleepTimeMinutes;

    // Jet-lag adjustment: push start later for first N days
    if (i < preferences.jetLagDays) {
      const lagShift = Math.round((preferences.jetLagDays - i) * 45);
      effectiveStart = Math.min(effectiveStart + lagShift, 11 * 60);
    }

    // Arrival day: start from when the traveller can actually leave the airport
    if (isArrivalDay && outboundFlight) {
      const arrivalMinutes = minutesFromDate(outboundFlight.arrivesAt, date);
      // +90 min: customs, baggage, transit to hotel, quick freshen-up
      const ready = arrivalMinutes + 90;
      if (ready > effectiveStart) effectiveStart = Math.min(ready, 20 * 60);
    }

    // Departure day: must leave for airport with enough lead time
    if (isDepartureDay && returnFlight) {
      const depMinutes = minutesFromDate(returnFlight.departsAt, date);
      // Need to be at airport 2h before domestic, 3h before international
      effectiveEnd = Math.min(effectiveEnd, depMinutes - 3 * 60);
    }

    boundaries.push({
      dayIndex: i,
      date,
      effectiveStartMinutes: Math.max(6 * 60, effectiveStart),
      effectiveEndMinutes:   Math.min(23 * 60, Math.max(effectiveEnd, effectiveStart + 2 * 60)),
      isArrivalDay,
      isDepartureDay,
    });
  }

  return boundaries;
}

// ── Theme / area labelling ────────────────────────────────────────────────────

function buildTheme(activities: PlannerActivity[], dayIndex: number, city: string): { theme: string; area: string } {
  if (activities.length === 0) {
    return { theme: "Arrival day — settle in", area: city };
  }

  // Most common category
  const categoryCounts = new Map<string, number>();
  for (const a of activities) {
    categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
  }
  const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Use activity titles to build a concise theme
  const titles = activities
    .sort((a, b) => a.userPriority - b.userPriority)
    .slice(0, 2)
    .map((a) => a.title);

  const categoryLabel: Record<string, string> = {
    culture:     "Culture & History",
    food:        "Food & Drink",
    nature:      "Nature & Outdoors",
    adventure:   "Adventure",
    shopping:    "Shopping & Markets",
    nightlife:   "Nightlife",
    wellness:    "Wellness & Relaxation",
    family:      "Family Day",
    art:         "Art & Galleries",
    entertainment: "Entertainment",
  };

  const theme =
    titles.length >= 2
      ? `${titles[0]} & ${titles[1]}`
      : titles.length === 1
        ? titles[0]
        : categoryLabel[topCategory] ?? "Exploring";

  return {
    theme: dayIndex === 0 ? `Arrival & ${theme}` : theme,
    area:  city,
  };
}

// ── Main planner ──────────────────────────────────────────────────────────────

export function runPlanner(input: ItineraryInput): PlannerOutput {
  const start = Date.now();
  const { trip, preferences, hotel, activities } = input;

  const transitMode = (
    ["walking", "transit", "driving"].includes(preferences.preferredTransitMode)
      ? preferences.preferredTransitMode
      : "transit"
  ) as TransitMode;

  const hotelLocation: LatLng | null =
    hotel?.lat != null && hotel?.lng != null
      ? { lat: Number(hotel.lat), lng: Number(hotel.lng) }
      : null;

  const boundaries = buildDayBoundaries(input);

  // Full scheduling days = days where we have meaningful time (skip days with < 2h available)
  const schedulingDays = boundaries.filter(
    (b) => b.effectiveEndMinutes - b.effectiveStartMinutes >= 120,
  );

  const allDropped: DroppedActivity[] = [];
  const conflicts: PlanningConflict[] = [];

  // ── Geographic clustering ─────────────────────────────────────────────────
  const k = Math.max(1, schedulingDays.length);

  let clusterAssignments: number[];
  if (activities.length === 0) {
    clusterAssignments = [];
  } else if (activities.length <= k) {
    // Fewer activities than days — assign one per day
    clusterAssignments = activities.map((_, i) => i);
  } else {
    const locations = activities.map((a) => a.location);
    clusterAssignments = clusterByLocation(locations, k);
  }

  // Map cluster index → activity list
  const clusterMap = new Map<number, PlannerActivity[]>();
  for (let i = 0; i < activities.length; i++) {
    const c = clusterAssignments[i];
    if (!clusterMap.has(c)) clusterMap.set(c, []);
    clusterMap.get(c)!.push(activities[i]);
  }

  // ── Build each day ────────────────────────────────────────────────────────
  const days: PlannedDay[] = boundaries.map((boundary) => {
    // Map schedulingDay index → cluster index (0-based within scheduling days)
    const schedIdx = schedulingDays.findIndex((d) => d.dayIndex === boundary.dayIndex);
    const dayActivities = schedIdx >= 0 ? (clusterMap.get(schedIdx) ?? []) : [];

    const { slots, dropped } = scheduleDay({
      activities:    dayActivities,
      boundary,
      hotelLocation,
      transitMode,
      pace:          preferences.pace,
      mealsPerDay:   preferences.mealsPerDay,
      mealDurations: {
        breakfast: preferences.breakfastDurationMin,
        lunch:     preferences.lunchDurationMin,
        dinner:    preferences.dinnerDurationMin,
      },
    });

    allDropped.push(...dropped);

    const { theme, area } = buildTheme(dayActivities, boundary.dayIndex, trip.city);

    const scheduledActivities = slots.filter((s) => s.kind === "activity");

    // Detect capacity conflicts (not enough time for all assigned activities)
    const assignedCount = dayActivities.length;
    if (dropped.length > 0 && assignedCount > 0) {
      conflicts.push({
        type:        "capacity",
        description: `Day ${boundary.dayIndex + 1}: ${dropped.length} activit${dropped.length > 1 ? "ies" : "y"} could not fit`,
        suggestion:  "Reduce pace, remove lower-priority activities, or add an extra day.",
      });
    }

    // Detect short available window
    const availableHours = (boundary.effectiveEndMinutes - boundary.effectiveStartMinutes) / 60;
    if (availableHours < 4 && scheduledActivities.length < assignedCount) {
      conflicts.push({
        type:        "short_day",
        description: `Day ${boundary.dayIndex + 1} has only ${availableHours.toFixed(1)}h available (arrival/departure constraint)`,
        suggestion:  "Consider moving some activities to adjacent days.",
      });
    }

    return {
      dayIndex:               boundary.dayIndex,
      date:                   boundary.date,
      theme,
      geographicArea:         area,
      slots,
      scheduledActivityCount: scheduledActivities.length,
      totalActivityMinutes:   scheduledActivities.reduce((s, sl) => s + sl.durationMinutes, 0),
    };
  });

  const totalScheduled = days.reduce((s, d) => s + d.scheduledActivityCount, 0);

  return {
    days,
    meta: {
      solverDurationMs:         Date.now() - start,
      totalActivitiesScheduled: totalScheduled,
      totalActivitiesDropped:   allDropped.length,
      droppedActivities:        allDropped,
      conflicts,
    },
  };
}

// ── Snapshot converter ────────────────────────────────────────────────────────
// Converts a raw ActivitySnapshot (from the DB) into a PlannerActivity.
// All fields have safe defaults — the planner never throws on partial data.

/* eslint-disable @typescript-eslint/no-explicit-any */
export function snapshotToPlanner(
  dbRow: { id: string; sourceId: string; snapshot: any; userPriority: number },
): PlannerActivity | null {
  const snap = dbRow.snapshot;
  if (!snap || typeof snap !== "object") return null;

  const lat = snap.location?.lat;
  const lng = snap.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    id:              dbRow.id,
    sourceId:        dbRow.sourceId,
    title:           snap.title ?? "(untitled)",
    category:        snap.category ?? "other",
    location:        { lat, lng },
    durationMinutes: snap.duration?.typical ?? 90,
    timeWindows:     Array.isArray(snap.timeWindows) ? snap.timeWindows : [],
    userPriority:    dbRow.userPriority ?? 3,
    rating:          typeof snap.rating === "number" ? snap.rating : 0,
    reviewCount:     typeof snap.reviewCount === "number" ? snap.reviewCount : 0,
  };
}

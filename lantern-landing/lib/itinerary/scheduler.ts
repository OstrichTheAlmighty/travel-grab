import { estimateTransit } from "./geo";
import type {
  LatLng,
  PlannerActivity,
  PlannedSlot,
  DroppedActivity,
  SchedulerInput,
  SchedulerOutput,
  TimeWindow,
  TransitMode,
} from "./types";

// ── Time formatting (used in explanation strings) ─────────────────────────────

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Opening-hours helpers ─────────────────────────────────────────────────────

/** Returns the latest minute you can arrive and still enter. */
function latestEntry(w: TimeWindow): number {
  return w.lastEntry ?? w.closesAt - 30;
}

function windowsForDay(activity: PlannerActivity, dow: number): TimeWindow[] {
  if (activity.timeWindows.length === 0) return [];
  return activity.timeWindows.filter((w) => w.dayOfWeek.includes(dow));
}

/** True if the place is open on this day of week at all. */
function isOpenOnDay(activity: PlannerActivity, dow: number): boolean {
  if (activity.timeWindows.length === 0) return true;
  return windowsForDay(activity, dow).length > 0;
}

/**
 * Returns the last minute you can arrive and enter the venue.
 * -1 = closed; Infinity = no data (treat as always open).
 */
function lastEntryForDay(activity: PlannerActivity, dow: number): number {
  if (activity.timeWindows.length === 0) return Infinity;
  const windows = windowsForDay(activity, dow);
  if (windows.length === 0) return -1;
  return Math.max(...windows.map(latestEntry));
}

/** Earliest opening minute on this day (or 0 if no data). */
function firstOpeningForDay(activity: PlannerActivity, dow: number): number {
  if (activity.timeWindows.length === 0) return 0;
  const windows = windowsForDay(activity, dow);
  if (windows.length === 0) return Infinity;
  return Math.min(...windows.map((w) => w.opensAt));
}

// ── Pace-adjusted duration ────────────────────────────────────────────────────

function adjustedDuration(base: number, pace: SchedulerInput["pace"]): number {
  const factor = pace === "relaxed" ? 1.25 : pace === "packed" ? 0.8 : 1.0;
  return Math.round(base * factor);
}

// ── Meal helpers ──────────────────────────────────────────────────────────────

function mealSlot(
  kind: "Breakfast" | "Lunch" | "Dinner",
  startMinutes: number,
  durationMinutes: number,
): PlannedSlot {
  return {
    kind: "meal",
    startMinutes,
    endMinutes: startMinutes + durationMinutes,
    durationMinutes,
    title: kind,
    explanation:
      kind === "Breakfast"
        ? "Morning meal before the day begins"
        : kind === "Lunch"
          ? "Midday break — find a local restaurant or street food nearby"
          : "Evening meal — a great time to try a neighbourhood favourite",
  };
}

const BREAKFAST_WINDOW = { start: 7 * 60, end: 9 * 60 + 30 };
const LUNCH_WINDOW     = { start: 11 * 60 + 30, end: 14 * 60 };

// ── Explanation builder ───────────────────────────────────────────────────────

function buildExplanation(
  activity: PlannerActivity,
  arrivalTime: number,
  dow: number,
  transit: { durationMinutes: number; distanceKm: number },
): string {
  const windows = windowsForDay(activity, dow);
  const openNote =
    windows.length > 0
      ? `Open until ${formatTime(Math.max(...windows.map((w) => w.closesAt)))}.`
      : "";
  const hasReal = activity.hasRealCoords !== false;
  const transitNote = !hasReal
    ? "Nearby."
    : transit.durationMinutes >= 8
      ? `${transit.durationMinutes} min travel (${transit.distanceKm} km).`
      : "Nearby.";
  const crowdNote =
    activity.category === "culture" && arrivalTime < 10 * 60
      ? "Early arrival avoids crowds."
      : "";
  return [transitNote, openNote, crowdNote].filter(Boolean).join(" ");
}

// ── Meal placement ────────────────────────────────────────────────────────────

type OccupiedSlot = { start: number; end: number };

/**
 * Find the first time >= targetMinute at which [t, t+duration] doesn't overlap
 * any slot in `occupied`. Returns null if it can't fit before endMinutes.
 *
 * Uses an iterative "push past any conflict" loop — simpler and safer than a
 * one-pass scan which can miss overlapping intervals.
 */
function findGap(
  targetMinute: number,
  duration: number,
  occupied: OccupiedSlot[],
  endMinutes: number,
): number | null {
  let t = targetMinute;
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of occupied) {
      // [t, t+duration) overlaps [o.start, o.end) ?
      if (t < o.end && t + duration > o.start) {
        t = o.end; // push past the conflicting slot
        changed = true;
      }
    }
  }
  return t + duration <= endMinutes ? t : null;
}

/**
 * Schedule meals for a day after all activities have been placed.
 *
 * Rules (user-specified):
 *   departure day          → no meals
 *   travel day (xfer>60m)  → dinner only (after last activity)
 *   lastEnd ≤ 12:30pm      → breakfast only
 *   lastEnd ≤ 5pm          → breakfast + lunch
 *   lastEnd > 5pm          → breakfast + lunch + dinner
 *
 * Lunch formula : first_activity_start + 4h  (full day)
 *               : 11:30am or firstStart+1h   (half day)
 * Dinner formula: last_activity_end + 30min
 *
 * Every meal is placed in the first gap at or after its target time so it
 * never overlaps an existing slot.
 */
function scheduleMeals(
  slots: PlannedSlot[],
  boundary: SchedulerInput["boundary"],
  intercityTransfer: SchedulerInput["intercityTransfer"],
  pace: SchedulerInput["pace"],
  mealsPerDay: number,
  mealDurations: { breakfast: number; lunch: number; dinner: number },
): void {
  // Departure days: skip all meals (eating at airport/during transit)
  if (boundary.isDepartureDay) {
    console.log(`[MEAL-SCHEDULE] Day ${boundary.dayIndex + 1}: departure day → no meals`);
    return;
  }

  const actSlots = slots.filter((s) => s.kind === "activity");
  if (actSlots.length === 0) {
    console.log(`[MEAL-SCHEDULE] Day ${boundary.dayIndex + 1}: no activities scheduled → no meals`);
    return;
  }

  const firstActivityStart = Math.min(...actSlots.map((s) => s.startMinutes));
  const lastActivityEnd    = Math.max(...actSlots.map((s) => s.endMinutes));
  const isTravelDay        = (intercityTransfer?.durationMinutes ?? 0) > 60;

  const TWELVE_THIRTY = 12 * 60 + 30; // 750 min
  const FIVE_PM       = 17 * 60;      // 1020 min

  // Build occupied intervals from all non-meal slots (sorted for findGap)
  const occupied: OccupiedSlot[] = slots
    .filter((s) => s.kind !== "meal")
    .map((s) => ({ start: s.startMinutes, end: s.endMinutes }))
    .sort((a, b) => a.start - b.start);

  const placed: string[] = [];

  // ── Breakfast ──────────────────────────────────────────────────────────────
  if (mealsPerDay >= 3 && pace !== "packed") {
    const bfTarget = Math.max(boundary.effectiveStartMinutes, BREAKFAST_WINDOW.start);
    const bfTime = findGap(bfTarget, mealDurations.breakfast, occupied, firstActivityStart);
    if (bfTime !== null) {
      slots.push(mealSlot("Breakfast", bfTime, mealDurations.breakfast));
      occupied.push({ start: bfTime, end: bfTime + mealDurations.breakfast });
      occupied.sort((a, b) => a.start - b.start);
      placed.push(`Breakfast@${formatTime(bfTime)}`);
    }
  }

  // ── Lunch & Dinner based on how long the day runs ─────────────────────────
  if (isTravelDay) {
    // Heavy travel day: 1 meal max — dinner after last activity
    if (mealsPerDay >= 1) {
      const dinnerTarget = lastActivityEnd + 30;
      const dinnerTime = findGap(dinnerTarget, mealDurations.dinner, occupied, boundary.effectiveEndMinutes);
      if (dinnerTime !== null) {
        slots.push(mealSlot("Dinner", dinnerTime, mealDurations.dinner));
        placed.push(`Dinner@${formatTime(dinnerTime)}`);
      }
    }
  } else if (lastActivityEnd <= TWELVE_THIRTY) {
    // Very short day ending before 12:30pm — breakfast only (already placed above)
  } else if (lastActivityEnd <= FIVE_PM) {
    // Half day ending before 5pm — add lunch
    if (mealsPerDay >= 2) {
      // Place lunch in the first gap at or after 11:30am (or 1h after first activity,
      // whichever is later), but only up to lastActivityEnd
      const lunchTarget = Math.max(LUNCH_WINDOW.start, firstActivityStart + 60);
      const lunchTime = findGap(lunchTarget, mealDurations.lunch, occupied, boundary.effectiveEndMinutes);
      if (lunchTime !== null && lunchTime < lastActivityEnd) {
        slots.push(mealSlot("Lunch", lunchTime, mealDurations.lunch));
        placed.push(`Lunch@${formatTime(lunchTime)}`);
      }
    }
  } else {
    // Full day ending after 5pm — lunch + dinner
    if (mealsPerDay >= 2) {
      // Lunch: first_activity_start + 4 hours (user-specified formula)
      const lunchTarget = Math.max(firstActivityStart + 4 * 60, LUNCH_WINDOW.start);
      const lunchTime = findGap(lunchTarget, mealDurations.lunch, occupied, boundary.effectiveEndMinutes);
      if (lunchTime !== null) {
        slots.push(mealSlot("Lunch", lunchTime, mealDurations.lunch));
        occupied.push({ start: lunchTime, end: lunchTime + mealDurations.lunch });
        occupied.sort((a, b) => a.start - b.start);
        placed.push(`Lunch@${formatTime(lunchTime)}`);
      }
    }
    if (mealsPerDay >= 1) {
      // Dinner: last_activity_end + 30 min
      const dinnerTarget = lastActivityEnd + 30;
      const dinnerTime = findGap(dinnerTarget, mealDurations.dinner, occupied, boundary.effectiveEndMinutes);
      if (dinnerTime !== null) {
        slots.push(mealSlot("Dinner", dinnerTime, mealDurations.dinner));
        placed.push(`Dinner@${formatTime(dinnerTime)}`);
      }
    }
  }

  console.log(
    `[MEAL-SCHEDULE] Day ${boundary.dayIndex + 1}: ` +
    `activities ${formatTime(firstActivityStart)}–${formatTime(lastActivityEnd)} | ` +
    `isTravelDay=${isTravelDay} | ` +
    (placed.length > 0 ? placed.join(", ") : "no meals placed"),
  );
}

// ── Core scheduler ────────────────────────────────────────────────────────────

export function scheduleDay(input: SchedulerInput): SchedulerOutput {
  const {
    activities,
    boundary,
    hotelLocation,
    transitMode,
    pace,
    mealsPerDay,
    mealDurations,
    intercityTransfer,
  } = input;

  const dow = new Date(boundary.date + "T12:00:00Z").getDay();
  const slots: PlannedSlot[] = [];
  const dropped: DroppedActivity[] = [];

  let currentMinute   = boundary.effectiveStartMinutes;
  let currentLocation: LatLng | null = hotelLocation;

  const foodCap = input.isFoodFocused ? 4 : 2;
  let foodSlotsScheduled    = 0;
  let lastActivityCategory: string | null = null;

  // ── Arrival-day hotel check-in ────────────────────────────────────────────
  if (boundary.isArrivalDay) {
    slots.push({
      kind:            "hotel_checkin",
      startMinutes:    currentMinute,
      endMinutes:      currentMinute + 45,
      durationMinutes: 45,
      title:           "Hotel check-in",
      explanation:     "Settle in, freshen up, drop luggage before exploring.",
    });
    currentMinute += 45;
  }

  // ── Intercity transfer ────────────────────────────────────────────────────
  if (intercityTransfer) {
    const { durationMinutes, description, toCity } = intercityTransfer;
    const dh = Math.floor(durationMinutes / 60);
    const dm = durationMinutes % 60;
    const durStr = dh > 0 ? `${dh}h${dm > 0 ? ` ${dm}m` : ""}` : `${dm}m`;
    const cityShort = toCity.split(",")[0].trim();
    slots.push({
      kind:           "intercity_transfer",
      startMinutes:   currentMinute,
      endMinutes:     currentMinute + durationMinutes,
      durationMinutes,
      title:          `Travel to ${cityShort}`,
      explanation:    `${description} · ~${durStr}. Allow extra time for station navigation and hotel check-in.`,
    });
    currentMinute += durationMinutes + 30;
  }

  // ── Departure-day hotel check-out ─────────────────────────────────────────
  if (boundary.isDepartureDay) {
    const checkoutMinute = Math.min(11 * 60, boundary.effectiveStartMinutes + 30);
    slots.push({
      kind:            "hotel_checkout",
      startMinutes:    checkoutMinute,
      endMinutes:      checkoutMinute + 30,
      durationMinutes: 30,
      title:           "Hotel check-out",
      explanation:     "Check out and store luggage with the concierge if needed.",
    });
    currentMinute = Math.max(currentMinute, checkoutMinute + 30);
  }

  // ── Pre-filter: remove activities closed today ────────────────────────────
  const available: PlannerActivity[] = [];
  for (const a of activities) {
    if (!isOpenOnDay(a, dow)) {
      dropped.push({ sourceId: a.sourceId, title: a.title, reason: "Closed on this day of the week" });
    } else {
      available.push(a);
    }
  }

  available.sort((a, b) => {
    if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
    return firstOpeningForDay(a, dow) - firstOpeningForDay(b, dow);
  });

  const remaining = new Set(available);

  // ── Activity scheduling loop ──────────────────────────────────────────────
  // Schedule all activities without inserting any meals. Meals are placed
  // post-hoc by scheduleMeals() based on the final activity bounds, so they
  // never overlap or interrupt an activity in progress.
  while (remaining.size > 0 && currentMinute < boundary.effectiveEndMinutes) {
    const candidates: Array<{ activity: PlannerActivity; transitDur: number; arrival: number }> = [];

    for (const a of remaining) {
      const origin  = currentLocation ?? a.location;
      const transit = estimateTransit(origin, a.location, transitMode);
      const arrival = currentMinute + (currentLocation ? transit.durationMinutes : 0);
      const entry   = lastEntryForDay(a, dow);
      const opening = firstOpeningForDay(a, dow);

      const effectiveArrival = Math.max(arrival, opening);
      const departure = effectiveArrival + adjustedDuration(a.durationMinutes, pace);

      if (entry === -1) continue;
      if (entry !== Infinity && arrival > entry) continue;
      if (departure > boundary.effectiveEndMinutes) continue;

      if (a.category === "food" && foodSlotsScheduled >= foodCap) continue;
      if (a.category === "food" && lastActivityCategory === "food" && !input.isFoodFocused) continue;

      candidates.push({ activity: a, transitDur: transit.durationMinutes, arrival: effectiveArrival });
    }

    if (candidates.length === 0) {
      const nextOpen = [...remaining].reduce((best, a) => {
        const opening = firstOpeningForDay(a, dow);
        return opening > currentMinute && opening < best ? opening : best;
      }, Infinity);

      if (nextOpen < boundary.effectiveEndMinutes - 30) {
        const freeEnd = Math.min(nextOpen, boundary.effectiveEndMinutes);
        slots.push({
          kind:            "free_time",
          startMinutes:    currentMinute,
          endMinutes:      freeEnd,
          durationMinutes: freeEnd - currentMinute,
          title:           "Free time",
          explanation:     `Next venue opens at ${formatTime(nextOpen)} — wander, browse a market, or grab a drink.`,
          location:        currentLocation ?? undefined,
        });
        currentMinute = freeEnd;
      } else {
        for (const a of remaining) {
          dropped.push({ sourceId: a.sourceId, title: a.title, reason: "Could not fit within available time" });
        }
        break;
      }
      continue;
    }

    candidates.sort((a, b) => {
      if (a.activity.userPriority !== b.activity.userPriority) {
        return a.activity.userPriority - b.activity.userPriority;
      }
      return a.transitDur - b.transitDur;
    });

    const { activity: next, transitDur, arrival } = candidates[0];
    remaining.delete(next);

    if (next.category === "food") foodSlotsScheduled++;
    lastActivityCategory = next.category;

    const origin  = currentLocation ?? next.location;
    const transit = estimateTransit(origin, next.location, transitMode);
    const dur      = adjustedDuration(next.durationMinutes, pace);
    const actStart = arrival;
    const actEnd   = actStart + dur;

    if (currentLocation && transit.durationMinutes >= 8 && next.hasRealCoords !== false) {
      slots.push({
        kind:            "free_time",
        startMinutes:    currentMinute,
        endMinutes:      currentMinute + transit.durationMinutes,
        durationMinutes: transit.durationMinutes,
        title:           `Travel to ${next.title}`,
        location:        next.location,
        transit: {
          mode:            transitMode,
          durationMinutes: transit.durationMinutes,
          distanceKm:      transit.distanceKm,
          coordsSource:    "real",
        },
        explanation: `${transit.distanceKm} km · ~${transit.durationMinutes} min by ${transitMode}`,
      });
    }

    if (actStart > currentMinute + transitDur + 5) {
      slots.push({
        kind:            "free_time",
        startMinutes:    currentMinute + transitDur,
        endMinutes:      actStart,
        durationMinutes: actStart - (currentMinute + transitDur),
        title:           `Arrive early — ${next.title}`,
        explanation:     `Opens at ${formatTime(actStart)}. Grab a coffee or explore the surrounding area.`,
        location:        next.location,
      });
    }

    slots.push({
      kind:            "activity",
      startMinutes:    actStart,
      endMinutes:      actEnd,
      durationMinutes: dur,
      tripActivityId:  next.id,
      sourceId:        next.sourceId,
      title:           next.title,
      location:        next.location,
      category:        next.category,
      transit: (currentLocation && transit.durationMinutes < 8 && next.hasRealCoords !== false) ? {
        mode:            transitMode,
        durationMinutes: transit.durationMinutes,
        distanceKm:      transit.distanceKm,
        coordsSource:    "real" as const,
      } : undefined,
      explanation: buildExplanation(next, actStart, dow, transit),
    });

    currentMinute   = actEnd;
    currentLocation = next.location;
  }

  // ── Post-activity meal placement ──────────────────────────────────────────
  // Meals go in natural gaps after activities are fully scheduled. The
  // scheduleMeals() function never pushes a meal on top of an activity.
  scheduleMeals(slots, boundary, intercityTransfer, pace, mealsPerDay, mealDurations);

  // Sort everything chronologically
  slots.sort((a, b) => a.startMinutes - b.startMinutes);

  // ── Airport transfer on departure day ─────────────────────────────────────
  if (boundary.isDepartureDay) {
    const transferStart = boundary.effectiveEndMinutes;
    slots.push({
      kind:            "airport_transfer",
      startMinutes:    transferStart,
      endMinutes:      transferStart + 60,
      durationMinutes: 60,
      title:           "Airport transfer",
      explanation:     "Head to the airport — allow at least 90 minutes before departure.",
    });
  }

  return { slots, dropped };
}

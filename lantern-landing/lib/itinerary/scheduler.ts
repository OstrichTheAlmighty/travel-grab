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
  if (activity.timeWindows.length === 0) return true; // no data → assume open
  return windowsForDay(activity, dow).length > 0;
}

/**
 * Returns the last minute you can arrive and enter the venue.
 * Returns -1 if closed on this day.
 * Returns Infinity if we have no opening-hours data (treat as always open).
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

interface MealState {
  breakfastInserted: boolean;
  lunchInserted: boolean;
  dinnerInserted: boolean;
}

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

// Meal windows (minutes from midnight)
const BREAKFAST_WINDOW = { start: 7 * 60, end: 9 * 60 + 30 };
const LUNCH_WINDOW     = { start: 11 * 60 + 30, end: 14 * 60 };
const DINNER_WINDOW    = { start: 18 * 60, end: 21 * 60 };

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
  // Suppress distance when activity uses city-centre fallback coordinates
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

  const dow = new Date(boundary.date + "T12:00:00Z").getDay(); // UTC noon → stable day of week
  const slots: PlannedSlot[] = [];
  const dropped: DroppedActivity[] = [];
  const meals: MealState = { breakfastInserted: false, lunchInserted: false, dinnerInserted: false };

  let currentMinute  = boundary.effectiveStartMinutes;
  let currentLocation: LatLng | null = hotelLocation;

  // Category balance tracking
  const foodCap = input.isFoodFocused ? 4 : 2;
  let foodSlotsScheduled = 0;
  let lastActivityCategory: string | null = null;

  // ── Arrival-day hotel check-in ────────────────────────────────────────────
  if (boundary.isArrivalDay) {
    slots.push({
      kind:        "hotel_checkin",
      startMinutes: currentMinute,
      endMinutes:  currentMinute + 45,
      durationMinutes: 45,
      title:       "Hotel check-in",
      explanation: "Settle in, freshen up, drop luggage before exploring.",
    });
    currentMinute += 45;
  }

  // ── Intercity transfer (first day of each new city in a multi-city trip) ──
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
    currentMinute += durationMinutes + 30; // +30 min to settle into new city
  }

  // ── Departure-day hotel check-out ─────────────────────────────────────────
  if (boundary.isDepartureDay) {
    const checkoutMinute = Math.min(11 * 60, boundary.effectiveStartMinutes + 30);
    slots.push({
      kind:        "hotel_checkout",
      startMinutes: checkoutMinute,
      endMinutes:  checkoutMinute + 30,
      durationMinutes: 30,
      title:       "Hotel check-out",
      explanation: "Check out and store luggage with the concierge if needed.",
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

  // Sort: priority ASC, then earliest opening ASC (ensures must-dos get first pick)
  available.sort((a, b) => {
    if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
    return firstOpeningForDay(a, dow) - firstOpeningForDay(b, dow);
  });

  const remaining = new Set(available);

  // ── Breakfast (before first activity, pace ≠ packed) ─────────────────────
  if (
    mealsPerDay >= 3 &&
    pace !== "packed" &&
    currentMinute <= BREAKFAST_WINDOW.end
  ) {
    const start = Math.max(currentMinute, BREAKFAST_WINDOW.start);
    slots.push(mealSlot("Breakfast", start, mealDurations.breakfast));
    currentMinute = start + mealDurations.breakfast;
    meals.breakfastInserted = true;
  }

  // ── Main greedy nearest-neighbour loop ────────────────────────────────────
  while (remaining.size > 0 && currentMinute < boundary.effectiveEndMinutes) {
    // Check meal windows before picking next activity
    currentMinute = maybeInsertMeal("Lunch", currentMinute, boundary.effectiveEndMinutes, meals, mealsPerDay, mealDurations, slots);
    currentMinute = maybeInsertMeal("Dinner", currentMinute, boundary.effectiveEndMinutes, meals, mealsPerDay, mealDurations, slots);

    // Build candidate list: activities that fit before closing + before end of day
    const candidates: Array<{ activity: PlannerActivity; transitDur: number; arrival: number }> = [];

    for (const a of remaining) {
      const origin = currentLocation ?? a.location;
      const transit = estimateTransit(origin, a.location, transitMode);
      const arrival = currentMinute + (currentLocation ? transit.durationMinutes : 0);
      const entry   = lastEntryForDay(a, dow);
      const opening = firstOpeningForDay(a, dow);

      // Can arrive after opening (with waiting allowed) and before last-entry cutoff
      const effectiveArrival = Math.max(arrival, opening);
      const departure = effectiveArrival + adjustedDuration(a.durationMinutes, pace);

      if (entry === -1) continue;                           // closed today (already filtered, just in case)
      if (entry !== Infinity && arrival > entry) continue;  // arrive too late
      if (departure > boundary.effectiveEndMinutes) continue; // runs past end of day

      // Food cap: skip food activities if daily limit reached
      if (a.category === "food" && foodSlotsScheduled >= foodCap) continue;

      // Avoid back-to-back food unless food-focused
      if (
        a.category === "food" &&
        lastActivityCategory === "food" &&
        !input.isFoodFocused
      ) continue;

      candidates.push({ activity: a, transitDur: transit.durationMinutes, arrival: effectiveArrival });
    }

    if (candidates.length === 0) {
      // Nothing fits now — look for the next opening that might unlock something
      const nextOpen = [...remaining].reduce((best, a) => {
        const opening = firstOpeningForDay(a, dow);
        return opening > currentMinute && opening < best ? opening : best;
      }, Infinity);

      if (nextOpen < boundary.effectiveEndMinutes - 30) {
        // Free time until the next venue opens
        const freeEnd = Math.min(nextOpen, boundary.effectiveEndMinutes);
        slots.push({
          kind:        "free_time",
          startMinutes: currentMinute,
          endMinutes:  freeEnd,
          durationMinutes: freeEnd - currentMinute,
          title:       "Free time",
          explanation: `Next venue opens at ${formatTime(nextOpen)} — wander, browse a market, or grab a drink.`,
          location:    currentLocation ?? undefined,
        });
        currentMinute = freeEnd;
      } else {
        // Drop whatever's left
        for (const a of remaining) {
          dropped.push({ sourceId: a.sourceId, title: a.title, reason: "Could not fit within available time" });
        }
        break;
      }
      continue;
    }

    // Pick nearest by transit time (prefer must-do at equal distance)
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

    const origin = currentLocation ?? next.location;
    const transit = estimateTransit(origin, next.location, transitMode);
    const dur = adjustedDuration(next.durationMinutes, pace);
    const actStart = arrival;
    const actEnd   = actStart + dur;

    // Transit slot — only when meaningful, prior location known, and coords are real
    if (currentLocation && transit.durationMinutes >= 8 && next.hasRealCoords !== false) {
      slots.push({
        kind:        "free_time",
        startMinutes: currentMinute,
        endMinutes:  currentMinute + transit.durationMinutes,
        durationMinutes: transit.durationMinutes,
        title:       `Travel to ${next.title}`,
        location:    next.location,
        transit: {
          mode:            transitMode,
          durationMinutes: transit.durationMinutes,
          distanceKm:      transit.distanceKm,
          coordsSource:    "real",
        },
        explanation: `${transit.distanceKm} km · ~${transit.durationMinutes} min by ${transitMode}`,
      });
    }

    // Brief wait if arriving before opening
    if (actStart > currentMinute + transitDur + 5) {
      slots.push({
        kind:        "free_time",
        startMinutes: currentMinute + transitDur,
        endMinutes:  actStart,
        durationMinutes: actStart - (currentMinute + transitDur),
        title:       `Arrive early — ${next.title}`,
        explanation: `Opens at ${formatTime(actStart)}. Grab a coffee or explore the surrounding area.`,
        location:    next.location,
      });
    }

    slots.push({
      kind:           "activity",
      startMinutes:   actStart,
      endMinutes:     actEnd,
      durationMinutes: dur,
      tripActivityId: next.id,
      sourceId:       next.sourceId,
      title:          next.title,
      location:       next.location,
      category:       next.category,
      transit: (currentLocation && transit.durationMinutes < 8 && next.hasRealCoords !== false) ? {
        mode:            transitMode,
        durationMinutes: transit.durationMinutes,
        distanceKm:      transit.distanceKm,
        coordsSource:    "real" as const,
      } : undefined,
      explanation: buildExplanation(next, actStart, dow, transit),
    });

    currentMinute  = actEnd;
    currentLocation = next.location;
  }

  // ── End-of-day dinner if not yet inserted ─────────────────────────────────
  currentMinute = maybeInsertMeal("Dinner", currentMinute, boundary.effectiveEndMinutes, meals, mealsPerDay, mealDurations, slots);

  // ── Airport transfer on departure day ────────────────────────────────────
  if (boundary.isDepartureDay) {
    const transferStart = boundary.effectiveEndMinutes;
    slots.push({
      kind:        "airport_transfer",
      startMinutes: transferStart,
      endMinutes:  transferStart + 60,
      durationMinutes: 60,
      title:       "Airport transfer",
      explanation: "Head to the airport — allow at least 90 minutes before departure.",
    });
  }

  return { slots, dropped };
}

// ── Helper: insert meal slot if appropriate ──────────────────────────────────

function maybeInsertMeal(
  kind: "Breakfast" | "Lunch" | "Dinner",
  currentMinute: number,
  endMinutes: number,
  meals: MealState,
  mealsPerDay: number,
  mealDurations: { breakfast: number; lunch: number; dinner: number },
  slots: PlannedSlot[],
): number {
  if (kind === "Breakfast" && meals.breakfastInserted) return currentMinute;
  if (kind === "Lunch"     && meals.lunchInserted)     return currentMinute;
  if (kind === "Dinner"    && meals.dinnerInserted)     return currentMinute;

  const window =
    kind === "Breakfast" ? BREAKFAST_WINDOW :
    kind === "Lunch"     ? LUNCH_WINDOW     :
                           DINNER_WINDOW;

  const duration =
    kind === "Breakfast" ? mealDurations.breakfast :
    kind === "Lunch"     ? mealDurations.lunch      :
                           mealDurations.dinner;

  // Meal should be inserted if we're within its window (or past it but haven't eaten yet for dinner)
  const withinWindow = currentMinute >= window.start && currentMinute < window.end;
  const pastWindowNoFood = kind === "Dinner" && currentMinute >= window.end && !meals.dinnerInserted;

  if (!withinWindow && !pastWindowNoFood) return currentMinute;

  // Minimum meals threshold
  const requiredMeals =
    kind === "Breakfast" ? 3 :   // only add breakfast if mealsPerDay >= 3
    kind === "Lunch"     ? 2 :   // add lunch if mealsPerDay >= 2
                           1;    // always add dinner

  if (mealsPerDay < requiredMeals) return currentMinute;

  const mealStart = Math.max(currentMinute, window.start);
  if (mealStart + duration > endMinutes) return currentMinute;

  slots.push(mealSlot(kind, mealStart, duration));
  if (kind === "Breakfast") meals.breakfastInserted = true;
  if (kind === "Lunch")     meals.lunchInserted     = true;
  if (kind === "Dinner")    meals.dinnerInserted     = true;

  return mealStart + duration;
}

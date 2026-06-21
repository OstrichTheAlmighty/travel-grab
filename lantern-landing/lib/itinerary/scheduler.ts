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

// ── Time formatting ───────────────────────────────────────────────────────────

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Activity-type helpers ─────────────────────────────────────────────────────

/**
 * Nightlife must start at or after 8pm. Detect by category (authoritative) or
 * title keywords as a safety net for activities without a nightlife category.
 */
function isNightlifeActivity(a: PlannerActivity): boolean {
  if (a.category === "nightlife") return true;
  const t = a.title.toLowerCase();
  return (
    t.includes("nightclub") ||
    t.includes("burlesque") ||
    t.includes("club") ||
    t.includes(" lounge") ||
    // "bar" but not "ramen bar / sushi bar / tempura bar" which are daytime food
    (t.includes(" bar") && !t.includes("ramen") && !t.includes("sushi") && !t.includes("tempura"))
  );
}

/**
 * A food-category activity that is clearly a sit-down meal (≥45 min).
 * If one of these is scheduled within a meal window, skip the generic meal.
 */
function isMealTypeActivity(a: PlannerActivity): boolean {
  return a.category === "food" && a.durationMinutes >= 45;
}

// ── Opening-hours helpers ─────────────────────────────────────────────────────

function latestEntry(w: TimeWindow): number {
  return w.lastEntry ?? w.closesAt - 30;
}

function windowsForDay(activity: PlannerActivity, dow: number): TimeWindow[] {
  if (activity.timeWindows.length === 0) return [];
  return activity.timeWindows.filter((w) => w.dayOfWeek.includes(dow));
}

function isOpenOnDay(activity: PlannerActivity, dow: number): boolean {
  if (activity.timeWindows.length === 0) return true;
  return windowsForDay(activity, dow).length > 0;
}

function lastEntryForDay(activity: PlannerActivity, dow: number): number {
  if (activity.timeWindows.length === 0) return Infinity;
  const windows = windowsForDay(activity, dow);
  if (windows.length === 0) return -1;
  return Math.max(...windows.map(latestEntry));
}

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
const NIGHTLIFE_START  = 20 * 60; // 8pm — earliest nightlife slot

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

// ── Gap finder ────────────────────────────────────────────────────────────────

type OccupiedSlot = { start: number; end: number };

/**
 * Find the first time >= targetMinute where [t, t+duration) fits without
 * overlapping any occupied slot. Iterates until no conflicts remain.
 * Returns null if it can't fit before endMinutes.
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
      if (t < o.end && t + duration > o.start) {
        t = o.end;
        changed = true;
      }
    }
  }
  return t + duration <= endMinutes ? t : null;
}

// ── Meal placement ────────────────────────────────────────────────────────────

/**
 * Place meals after all daytime activities have been scheduled.
 *
 * Rules:
 *   departure day          → no meals
 *   travel day (xfer>60m)  → dinner only (after last daytime activity)
 *   lastDaytimeEnd ≤ 12:30 → breakfast only
 *   lastDaytimeEnd ≤ 5pm   → breakfast + lunch
 *   lastDaytimeEnd > 5pm   → breakfast + lunch + dinner
 *
 * Nightlife slots are excluded from the daytime bounds — dinner is placed
 * after the last sightseeing/culture/food activity, before nightlife.
 *
 * Generic meal blocks are skipped for any meal window already covered by a
 * food-category activity (restaurants replace generic meals, no double-count).
 */
function scheduleMeals(
  slots: PlannedSlot[],
  boundary: SchedulerInput["boundary"],
  intercityTransfer: SchedulerInput["intercityTransfer"],
  pace: SchedulerInput["pace"],
  mealsPerDay: number,
  mealDurations: { breakfast: number; lunch: number; dinner: number },
): void {
  if (boundary.isDepartureDay) {
    console.log(`[MEAL-SCHEDULE] Day ${boundary.dayIndex + 1}: departure day → no meals`);
    return;
  }

  // Use DAYTIME activity slots only — exclude nightlife when computing meal bounds
  const daytimeActSlots = slots.filter(
    (s) => s.kind === "activity" && s.category !== "nightlife",
  );
  if (daytimeActSlots.length === 0) {
    console.log(`[MEAL-SCHEDULE] Day ${boundary.dayIndex + 1}: no daytime activities → no meals`);
    return;
  }

  const firstActivityStart = Math.min(...daytimeActSlots.map((s) => s.startMinutes));
  const lastActivityEnd    = Math.max(...daytimeActSlots.map((s) => s.endMinutes));
  const isTravelDay        = (intercityTransfer?.durationMinutes ?? 0) > 60;

  // Detect food-category activities that already cover a meal window → skip generic meal
  const foodCovered = (windowStart: number, windowEnd: number) =>
    daytimeActSlots.some(
      (s) => s.category === "food" && s.startMinutes >= windowStart && s.startMinutes < windowEnd,
    );
  const restaurantCoversBreakfast = foodCovered(7 * 60, 10 * 60);
  const restaurantCoversLunch     = foodCovered(11 * 60, 14 * 60);
  const restaurantCoversDinner    = foodCovered(18 * 60, 21 * 60);

  const TWELVE_THIRTY = 12 * 60 + 30;
  const FIVE_PM       = 17 * 60;

  // Occupied intervals for gap insertion (non-meal slots)
  const occupied: OccupiedSlot[] = slots
    .filter((s) => s.kind !== "meal")
    .map((s) => ({ start: s.startMinutes, end: s.endMinutes }))
    .sort((a, b) => a.start - b.start);

  const placed: string[] = [];
  const skipped: string[] = [];

  const insertMeal = (kind: "Breakfast" | "Lunch" | "Dinner", target: number, dur: number, upTo: number) => {
    const t = findGap(target, dur, occupied, upTo);
    if (t !== null) {
      slots.push(mealSlot(kind, t, dur));
      occupied.push({ start: t, end: t + dur });
      occupied.sort((a, b) => a.start - b.start);
      placed.push(`${kind}@${formatTime(t)}`);
    }
  };

  // ── Breakfast ──────────────────────────────────────────────────────────────
  if (mealsPerDay >= 3 && pace !== "packed") {
    if (restaurantCoversBreakfast) {
      skipped.push("Breakfast(restaurant)");
    } else {
      const bfTarget = Math.max(boundary.effectiveStartMinutes, BREAKFAST_WINDOW.start);
      insertMeal("Breakfast", bfTarget, mealDurations.breakfast, firstActivityStart);
    }
  }

  // ── Lunch & Dinner ─────────────────────────────────────────────────────────
  if (isTravelDay) {
    if (mealsPerDay >= 1) {
      if (restaurantCoversDinner) {
        skipped.push("Dinner(restaurant)");
      } else {
        insertMeal("Dinner", lastActivityEnd + 30, mealDurations.dinner, boundary.effectiveEndMinutes);
      }
    }
  } else if (lastActivityEnd <= TWELVE_THIRTY) {
    // Short day — breakfast only
  } else if (lastActivityEnd <= FIVE_PM) {
    if (mealsPerDay >= 2) {
      if (restaurantCoversLunch) {
        skipped.push("Lunch(restaurant)");
      } else {
        const lunchTarget = Math.max(LUNCH_WINDOW.start, firstActivityStart + 60);
        const lunchEnd = findGap(lunchTarget, mealDurations.lunch, occupied, boundary.effectiveEndMinutes);
        if (lunchEnd !== null && lunchEnd < lastActivityEnd) {
          insertMeal("Lunch", lunchTarget, mealDurations.lunch, boundary.effectiveEndMinutes);
        }
      }
    }
  } else {
    if (mealsPerDay >= 2) {
      if (restaurantCoversLunch) {
        skipped.push("Lunch(restaurant)");
      } else {
        insertMeal("Lunch", Math.max(firstActivityStart + 4 * 60, LUNCH_WINDOW.start), mealDurations.lunch, boundary.effectiveEndMinutes);
      }
    }
    if (mealsPerDay >= 1) {
      if (restaurantCoversDinner) {
        skipped.push("Dinner(restaurant)");
      } else {
        insertMeal("Dinner", lastActivityEnd + 30, mealDurations.dinner, boundary.effectiveEndMinutes);
      }
    }
  }

  const summary = [
    placed.length > 0 ? placed.join(", ") : "",
    skipped.length > 0 ? `skipped: ${skipped.join(", ")}` : "",
  ].filter(Boolean).join(" | ") || "no meals placed";

  console.log(
    `[MEAL-SCHEDULE] Day ${boundary.dayIndex + 1}: ` +
    `activities ${formatTime(firstActivityStart)}–${formatTime(lastActivityEnd)} | ` +
    `isTravelDay=${isTravelDay} | ${summary}`,
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

  // ── Separate nightlife from daytime activities ────────────────────────────
  // Nightlife must start at 8pm or later. Separating it prevents the greedy
  // loop from scheduling a nightclub at noon just because it has no time data.
  const daytimeActivities  = activities.filter((a) => !isNightlifeActivity(a));
  const nightlifeActivities = activities.filter((a) => isNightlifeActivity(a));

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

  // ── Pre-filter: remove daytime activities closed today ────────────────────
  const available: PlannerActivity[] = [];
  for (const a of daytimeActivities) {
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

  // ── Daytime activity scheduling loop ─────────────────────────────────────
  // Nightlife is excluded here and scheduled in a separate pass below.
  // No meals are inserted during this loop — they're placed post-hoc.
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

  // ── Meals — placed after all daytime activities, before nightlife ─────────
  scheduleMeals(slots, boundary, intercityTransfer, pace, mealsPerDay, mealDurations);

  // ── Nightlife — always at 8pm or later ───────────────────────────────────
  // Scheduled after meals so dinner appears before the nightlife block.
  if (nightlifeActivities.length > 0 && !boundary.isDepartureDay) {
    let nightCursor = NIGHTLIFE_START; // 20:00

    for (const a of nightlifeActivities) {
      if (!isOpenOnDay(a, dow)) {
        dropped.push({ sourceId: a.sourceId, title: a.title, reason: "Closed on this day of the week" });
        continue;
      }

      const dur = adjustedDuration(a.durationMinutes, pace);

      // Find a free slot at or after 8pm
      const nightOccupied: OccupiedSlot[] = slots
        .map((s) => ({ start: s.startMinutes, end: s.endMinutes }));
      const startAt = findGap(nightCursor, dur, nightOccupied, boundary.effectiveEndMinutes);

      if (startAt === null) {
        dropped.push({
          sourceId: a.sourceId,
          title:    a.title,
          reason:   "No available slot after 8pm within the day",
        });
        console.log(`[NIGHTLIFE] DROPPED "${a.title}" — no slot after 8pm`);
        continue;
      }

      slots.push({
        kind:            "activity",
        startMinutes:    startAt,
        endMinutes:      startAt + dur,
        durationMinutes: dur,
        tripActivityId:  a.id,
        sourceId:        a.sourceId,
        title:           a.title,
        location:        a.location,
        category:        a.category,
        explanation:     "Evening — best experienced after 8pm.",
      });

      nightCursor = startAt + dur + 30; // 30 min gap between nightlife venues
      console.log(`[NIGHTLIFE] "${a.title}" → ${formatTime(startAt)}–${formatTime(startAt + dur)}`);
    }
  }

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

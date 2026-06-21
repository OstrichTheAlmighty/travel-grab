// FRESH SCHEDULER — Clean, Simple, Explicit
// Activity-type detection, nightlife at 8pm+, meals from activity flow.
//
// This module is imported by preview/route.ts to classify activities and drive
// the nightlife / meal logic. The multi-city geographic assignment and knapsack
// packing still live in lib/itinerary/planner.ts — that part works correctly
// and this scheduler layers activity-type awareness on top of it.

export type ActivityType =
  | "nightlife"
  | "travel"
  | "restaurant"
  | "sightseeing";

export interface ScheduledActivity {
  title:      string;
  category:   string;
  duration:   number;  // minutes
  city:       string;
  type:       ActivityType | "meal";
  start_time: number;  // minutes from midnight
  end_time:   number;
}

export interface SchedulerDay {
  dayIndex:   number;
  city:       string;
  date:       string;   // ISO YYYY-MM-DD
  activities: ScheduledActivity[];
}

// ── Phase 1: Detect Activity Type ────────────────────────────────────────────

export function getActivityType(activity: { title?: string; category?: string; durationMinutes?: number; duration?: number }): ActivityType {
  const title    = (activity.title    ?? "").toLowerCase();
  const category = (activity.category ?? "").toLowerCase();
  const duration = activity.durationMinutes ?? activity.duration ?? 0;

  // NIGHTLIFE — must be 8pm+ regardless of anything else
  if (
    category === "nightlife" ||
    title.includes("nightclub") ||
    title.includes("burlesque") ||
    title.includes("club") ||
    title.includes(" lounge") ||
    // "bar" but NOT ramen/sushi/tempura bars which are daytime food
    (title.includes(" bar") &&
      !title.includes("ramen") &&
      !title.includes("sushi") &&
      !title.includes("tempura"))
  ) return "nightlife";

  // TRAVEL / TRANSFER
  if (title.includes("travel to") || title.includes("transfer")) return "travel";

  // RESTAURANT — food-category with enough duration to be a sit-down meal
  if ((category === "food" || category === "cuisine") && duration >= 45) {
    const restaurantKeywords = [
      "ramen", "yakiniku", "kaiseki", "restaurant", "sushi", "tonkatsu",
      "gyoza", "wagyu", "seafood", "grill", "okonomiyaki", "izakaya",
      "tempura", "omakase",
    ];
    if (restaurantKeywords.some((kw) => title.includes(kw))) return "restaurant";
  }

  return "sightseeing";
}

export function formatMinutes(minutes: number): string {
  const h    = Math.floor(minutes / 60) % 24;
  const m    = minutes % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Phase 2: Travel capacity deduction ───────────────────────────────────────

export function sightseeingCapacity(day: SchedulerDay): number {
  const BASE = 7 * 60;
  const travelMin = day.activities
    .filter((a) => a.type === "travel")
    .reduce((s, a) => s + a.duration, 0);

  if (travelMin > 90) return 4 * 60; // >1.5h travel → 4h cap
  if (travelMin > 60) return 5 * 60; // >1h travel → 5h cap
  return BASE;
}

// ── Phase 3: Meal placement ───────────────────────────────────────────────────

export function placeMealsForDay(day: SchedulerDay, debug: string[]): void {
  const daytime = day.activities.filter(
    (a) => a.type !== "nightlife" && a.type !== "travel" && a.type !== "meal",
  );

  if (daytime.length === 0) {
    debug.push(`  [Day ${day.dayIndex}] No daytime activities → no meals`);
    return;
  }

  const firstStart = Math.min(...daytime.map((a) => a.start_time));
  const lastEnd    = Math.max(...daytime.map((a) => a.end_time));

  // If a restaurant activity already covers a meal window, skip the generic slot
  const hasFoodAt = (wStart: number, wEnd: number) =>
    day.activities.some(
      (a) => (a.type === "restaurant" || a.category === "food") &&
             a.start_time >= wStart && a.start_time < wEnd,
    );

  const skipBreakfast = hasFoodAt(7 * 60, 10 * 60);
  const skipLunch     = hasFoodAt(11 * 60, 14 * 60);
  const skipDinner    = hasFoodAt(18 * 60, 21 * 60);

  const TWELVE_THIRTY = 12 * 60 + 30;
  const FIVE_PM       = 17 * 60;

  const add = (title: "Breakfast" | "Lunch" | "Dinner", start: number, dur: number) => {
    day.activities.push({
      title,
      category: "Meal",
      duration: dur,
      city:     day.city,
      type:     "meal",
      start_time: start,
      end_time:   start + dur,
    });
  };

  // Breakfast: before first activity
  if (!skipBreakfast && firstStart > 7 * 60) {
    add("Breakfast", firstStart - 45, 30);
  }

  if (lastEnd <= TWELVE_THIRTY) {
    // Very short day — no lunch/dinner
  } else if (lastEnd <= FIVE_PM) {
    // Half day — lunch only
    if (!skipLunch) {
      const morning   = daytime.filter((a) => a.end_time <= 12 * 60);
      const afternoon = daytime.filter((a) => a.start_time >= 12 * 60);
      const lunchStart = (morning.length > 0 && afternoon.length > 0)
        ? Math.max(...morning.map((a) => a.end_time)) + 15
        : 12 * 60;
      add("Lunch", lunchStart, 60);
    }
  } else {
    // Full day — lunch + dinner
    if (!skipLunch) {
      const morning   = daytime.filter((a) => a.end_time <= 12 * 60);
      const afternoon = daytime.filter((a) => a.start_time >= 12 * 60);
      const lunchStart = (morning.length > 0 && afternoon.length > 0)
        ? Math.max(...morning.map((a) => a.end_time)) + 15
        : 12 * 60;
      add("Lunch", lunchStart, 60);
    }
    if (!skipDinner) {
      add("Dinner", lastEnd + 30, 90);
    }
  }

  const skips = [
    skipBreakfast ? "Breakfast(restaurant)" : "",
    skipLunch     ? "Lunch(restaurant)"     : "",
    skipDinner    ? "Dinner(restaurant)"    : "",
  ].filter(Boolean);

  const meals = day.activities
    .filter((a) => a.type === "meal")
    .map((a) => `${a.title}@${formatMinutes(a.start_time)}`);

  debug.push(
    `  [Day ${day.dayIndex}] sightseeing ${formatMinutes(firstStart)}–${formatMinutes(lastEnd)}` +
    ` → meals: [${meals.join(", ") || "NONE"}]` +
    (skips.length > 0 ? ` | skipped: ${skips.join(", ")}` : ""),
  );

  // Sort by start time
  day.activities.sort((a, b) => a.start_time - b.start_time);
}

// ── Phase 4: Validation ───────────────────────────────────────────────────────

export function validateDay(day: SchedulerDay, debug: string[]): number {
  let errors = 0;
  for (const a of day.activities) {
    if (a.type === "nightlife" && a.start_time < 20 * 60) {
      debug.push(`  ❌ Day ${day.dayIndex}: "${a.title}" at ${formatMinutes(a.start_time)} (nightlife must be 8pm+)`);
      errors++;
    }
  }
  return errors;
}

// ── Main export: classify activities ─────────────────────────────────────────
// Called by preview/route.ts to annotate activities with their type before
// passing them to the planner. The planner's city-assignment and knapsack
// logic is unchanged; this just adds type metadata so the scheduler in
// lib/itinerary/scheduler.ts can use it for nightlife/meal handling.

export function classifyActivities(
  rawActivities: Array<{ title?: string; category?: string; durationMinutes?: number; duration?: number }>,
  debug: string[],
): Array<{ type: ActivityType }> {
  debug.push(`[CLASSIFY] ${rawActivities.length} activities:`);
  return rawActivities.map((a) => {
    const type = getActivityType(a);
    debug.push(`  [TYPE] "${a.title}" → ${type}`);
    return { type };
  });
}

import { classifyDay }         from "./dayClassifier";
import type { ActivityProfile } from "./activityProfiler";
import type {
  PlannedDay, PlannedSlot, DroppedActivity, PlannerMeta,
} from "@/lib/itinerary/types";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SmartActivity {
  sourceId:        string;
  title:           string;
  category:        string;
  durationMinutes: number;
  lat?:            number;
  lng?:            number;
  assignedCity:    string;   // city name (will be normalised for matching)
  profile:         ActivityProfile;
}

export interface SmartSchedulerInput {
  startDate:   string;   // ISO YYYY-MM-DD
  cityStops:   { city: string; days: number; lat: number; lng: number }[];
  activities:  SmartActivity[];
  preferences: {
    wakeTimeMinutes:      number;   // default 480 (8 AM)
    sleepTimeMinutes:     number;   // default 1320 (10 PM)
    pace:                 "relaxed" | "moderate" | "packed";
    mealsPerDay:          number;
    breakfastDurationMin: number;
    lunchDurationMin:     number;
    dinnerDurationMin:    number;
  };
  hotel:             { name: string; checkInDate: string; checkOutDate: string } | null;
  outboundArrivesAt: Date | null;
  returnDepartsAt:   Date | null;
}

export interface SmartSchedulerOutput {
  days:    PlannedDay[];
  dropped: DroppedActivity[];
  meta:    PlannerMeta;
}

// ── Internal day structure ────────────────────────────────────────────────────

interface ScheduleDay {
  dayIndex:             number;
  date:                 string;
  city:                 string;
  cityNorm:             string;
  isFirstInCity:        boolean;
  isLastInCity:         boolean;
  isFirstOverall:       boolean;
  isLastOverall:        boolean;
  hasIntercityTransfer: boolean;
  fromCity:             string | null;
  activities:           SmartActivity[];
  unplacedIds:          Set<string>;
}

type OccupiedSlot = { start: number; end: number };

// ── Step 1: Expand city stops → individual days ───────────────────────────────

function expandDays(
  startDate: string,
  cityStops: { city: string; days: number }[],
): ScheduleDay[] {
  const result: ScheduleDay[] = [];
  let dayIndex = 0;

  for (let si = 0; si < cityStops.length; si++) {
    const stop     = cityStops[si];
    const prevStop = si > 0 ? cityStops[si - 1] : null;

    for (let d = 0; d < stop.days; d++) {
      result.push({
        dayIndex,
        date:                 isoDateOffset(startDate, dayIndex),
        city:                 stop.city,
        cityNorm:             normCity(stop.city),
        isFirstInCity:        d === 0,
        isLastInCity:         d === stop.days - 1,
        isFirstOverall:       dayIndex === 0,
        isLastOverall:        false,
        hasIntercityTransfer: d === 0 && si > 0,
        fromCity:             d === 0 && prevStop ? prevStop.city : null,
        activities:           [],
        unplacedIds:          new Set(),
      });
      dayIndex++;
    }
  }

  if (result.length > 0) result[result.length - 1].isLastOverall = true;
  return result;
}

// ── Step 2: Assign activities to days ─────────────────────────────────────────

function assignActivitiesToDays(
  days:       ScheduleDay[],
  activities: SmartActivity[],
): void {
  // Group days by normalised city
  const daysByCity = new Map<string, ScheduleDay[]>();
  for (const day of days) {
    if (!daysByCity.has(day.cityNorm)) daysByCity.set(day.cityNorm, []);
    daysByCity.get(day.cityNorm)!.push(day);
  }

  // Group activities by normalised assigned city
  const actsByCity = new Map<string, SmartActivity[]>();
  for (const act of activities) {
    const ck = normCity(act.assignedCity);
    if (!actsByCity.has(ck)) actsByCity.set(ck, []);
    actsByCity.get(ck)!.push(act);
  }

  const assigned = new Set<string>();

  for (const [cityNorm, cityDays] of daysByCity) {
    // Find matching activities (handles "tokyo" matching "tokyo, japan" etc.)
    let cityActs: SmartActivity[] | undefined;
    for (const [k, v] of actsByCity) {
      if (k.includes(cityNorm) || cityNorm.includes(k)) {
        cityActs = v;
        break;
      }
    }
    if (!cityActs || cityActs.length === 0) continue;

    const nightlife = cityActs.filter((a) => a.profile.activityType === "nightlife");
    const daytime   = cityActs.filter((a) => a.profile.activityType !== "nightlife");

    // Round-robin distribute daytime activities across city days
    daytime.forEach((act, i) => {
      cityDays[i % cityDays.length].activities.push(act);
      assigned.add(act.sourceId);
    });

    // Nightlife goes on later days in the city stay (not the departure day)
    const nightDays = [...cityDays].filter((d) => !d.isLastOverall);
    const nightTargets = nightDays.length > 0 ? nightDays : cityDays;
    nightlife.forEach((act, i) => {
      // Prefer last available night → work backwards
      const idx = nightTargets.length - 1 - (i % nightTargets.length);
      nightTargets[idx].activities.push(act);
      assigned.add(act.sourceId);
    });
  }

  // Fallback: unassigned activities (city name mismatch) → primary city days
  const unassigned = activities.filter((a) => !assigned.has(a.sourceId));
  if (unassigned.length > 0 && days.length > 0) {
    const primaryNorm = days[0].cityNorm;
    const primaryDays = daysByCity.get(primaryNorm) ?? [days[0]];
    unassigned.forEach((act, i) => {
      primaryDays[i % primaryDays.length].activities.push(act);
    });
  }
}

// ── Step 3: Build timeline for a single day ───────────────────────────────────

function buildDayTimeline(
  day:               ScheduleDay,
  prefs:             SmartSchedulerInput["preferences"],
  outboundArrivesAt: Date | null,
  returnDepartsAt:   Date | null,
): PlannedSlot[] {
  const { wakeTimeMinutes, sleepTimeMinutes } = prefs;
  const slots: PlannedSlot[]     = [];
  const occupied: OccupiedSlot[] = [];

  // Effective day window
  let dayStart = wakeTimeMinutes;
  let dayEnd   = sleepTimeMinutes;

  if (day.isFirstOverall && outboundArrivesAt) {
    const arrMins = outboundArrivesAt.getUTCHours() * 60 + outboundArrivesAt.getUTCMinutes();
    dayStart = Math.max(dayStart, arrMins + 90); // 90 min for baggage + transport
  }
  if (day.isLastOverall && returnDepartsAt) {
    const depMins = returnDepartsAt.getUTCHours() * 60 + returnDepartsAt.getUTCMinutes();
    dayEnd = Math.min(dayEnd, depMins - 180); // need 3h buffer to airport
  }

  let cursor = dayStart;

  // Intercity transfer at the start of the day
  if (day.hasIntercityTransfer && day.fromCity) {
    const fromCity = day.fromCity.split(",")[0].trim();
    const toCity   = day.city.split(",")[0].trim();
    const dur      = 150;
    push(slots, occupied, {
      kind:            "intercity_transfer",
      startMinutes:    cursor,
      endMinutes:      cursor + dur,
      durationMinutes: dur,
      title:           `Travel: ${fromCity} → ${toCity}`,
      explanation:     `Journey from ${fromCity} to ${toCity}`,
    });
    cursor += dur + 30;
  }

  // Hotel check-in (first day of a new city, but not day 0 of the whole trip)
  if (day.isFirstInCity && !day.isFirstOverall) {
    const checkIn = Math.max(cursor, 14 * 60); // not before 2 PM
    push(slots, occupied, {
      kind:            "hotel_checkin",
      startMinutes:    checkIn,
      endMinutes:      checkIn + 30,
      durationMinutes: 30,
      title:           "Hotel Check-in",
      explanation:     "Check in to your accommodation",
    });
    cursor = Math.max(cursor, checkIn + 45);
  }

  // Hotel checkout (last day of a city, before travelling on)
  if (day.isLastInCity && !day.isLastOverall && !day.isFirstInCity) {
    const checkout = Math.max(cursor, 10 * 60); // by 10 AM
    push(slots, occupied, {
      kind:            "hotel_checkout",
      startMinutes:    checkout,
      endMinutes:      checkout + 30,
      durationMinutes: 30,
      title:           "Hotel Checkout",
      explanation:     "Check out and store luggage if needed",
    });
    cursor = Math.max(cursor, checkout + 30);
  }

  // Split activities into daytime vs nightlife
  const daytime   = day.activities.filter((a) => a.profile.activityType !== "nightlife");
  const nightlife = day.activities.filter((a) => a.profile.activityType === "nightlife");

  // Daytime activities start at 9 AM at the earliest
  let dayCursor = Math.max(cursor, 9 * 60);

  // Sort: morning-preference first, then flexible, then afternoon
  const prefOrder: Record<string, number> = { morning: 0, flexible: 1, afternoon: 2, evening: 3 };
  const sortedDaytime = [...daytime].sort(
    (a, b) => (prefOrder[a.profile.timePreference] ?? 1) - (prefOrder[b.profile.timePreference] ?? 1),
  );

  for (const act of sortedDaytime) {
    const dur   = act.profile.durationMinutes;
    const start = findGap(dayCursor, dur, occupied, dayEnd - 120); // leave 2h buffer before day end
    if (start === null) {
      day.unplacedIds.add(act.sourceId);
      continue;
    }
    push(slots, occupied, {
      kind:            "activity",
      startMinutes:    start,
      endMinutes:      start + dur,
      durationMinutes: dur,
      title:           act.title,
      sourceId:        act.sourceId,
      category:        act.category,
      explanation:     `${formatTime(start)} – ${formatTime(start + dur)}`,
    });
    dayCursor = start + dur + 25; // 25 min transit gap between activities
  }

  // Meals — placed AFTER all daytime activities so we know their time range
  if (!day.isLastOverall) {
    const dayActSlots = slots.filter((s) => s.kind === "activity");
    if (dayActSlots.length > 0) {
      const firstStart = Math.min(...dayActSlots.map((s) => s.startMinutes));
      const lastEnd    = Math.max(...dayActSlots.map((s) => s.endMinutes));
      placeMeals(slots, occupied, firstStart, lastEnd, day.hasIntercityTransfer, prefs);
    }
  }

  // Nightlife — 8 PM+, only on non-departure days
  if (!day.isLastOverall) {
    let nightCursor = 20 * 60;
    for (const act of nightlife) {
      const dur   = act.profile.durationMinutes;
      const start = findGap(nightCursor, dur, occupied, dayEnd);
      if (start === null) {
        day.unplacedIds.add(act.sourceId);
        continue;
      }
      push(slots, occupied, {
        kind:            "activity",
        startMinutes:    start,
        endMinutes:      start + dur,
        durationMinutes: dur,
        title:           act.title,
        sourceId:        act.sourceId,
        category:        act.category,
        explanation:     `Nightlife — from ${formatTime(start)}`,
      });
      nightCursor = start + dur + 30;
    }
  }

  slots.sort((a, b) => a.startMinutes - b.startMinutes);
  return slots;
}

function push(slots: PlannedSlot[], occupied: OccupiedSlot[], slot: PlannedSlot): void {
  slots.push(slot);
  occupied.push({ start: slot.startMinutes, end: slot.endMinutes });
}

// ── Meal placement ────────────────────────────────────────────────────────────

function placeMeals(
  slots:       PlannedSlot[],
  occupied:    OccupiedSlot[],
  firstStart:  number,
  lastEnd:     number,
  isTravelDay: boolean,
  prefs:       SmartSchedulerInput["preferences"],
): void {
  const { breakfastDurationMin: bkDur, lunchDurationMin: lunchDur, dinnerDurationMin: dinnerDur, mealsPerDay } = prefs;
  if (mealsPerDay === 0) return;

  const hasFood = (ws: number, we: number) =>
    slots.some(
      (s) => (s.kind === "meal" || (s.kind === "activity" && s.category === "food")) &&
             s.startMinutes >= ws && s.startMinutes < we,
    );

  const addMeal = (title: string, target: number, dur: number) => {
    const start = findGap(target, dur, occupied, 23 * 60);
    if (start === null || start + dur > 23 * 60) return;
    push(slots, occupied, {
      kind:            "meal",
      startMinutes:    start,
      endMinutes:      start + dur,
      durationMinutes: dur,
      title,
      explanation:     "Find a local restaurant or café nearby",
    });
  };

  // Travel days get dinner only (busy with transit)
  if (isTravelDay) {
    if (!hasFood(17 * 60, 22 * 60)) addMeal("Dinner", lastEnd + 30, dinnerDur);
    return;
  }

  // Breakfast — before first activity if enough time
  if (!hasFood(7 * 60, 10 * 60) && firstStart > 7 * 60 + 45) {
    addMeal("Breakfast", firstStart - bkDur - 15, bkDur);
  }

  if (lastEnd <= 12 * 60 + 30) return; // very short day

  // Lunch
  if (!hasFood(11 * 60, 14 * 60)) {
    addMeal("Lunch", 12 * 60, lunchDur);
  }

  if (lastEnd <= 17 * 60) return; // half day

  // Dinner
  if (!hasFood(17 * 60, 21 * 60)) {
    addMeal("Dinner", lastEnd + 30, dinnerDur);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function findGap(
  target:     number,
  duration:   number,
  occupied:   OccupiedSlot[],
  endMinutes: number,
): number | null {
  let t = target;
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

function isoDateOffset(startDate: string, offsetDays: number): string {
  const d = new Date(startDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

export function normCity(city: string): string {
  return city.toLowerCase().split(",")[0].trim();
}

function formatTime(minutes: number): string {
  const h   = Math.floor(minutes / 60) % 24;
  const m   = minutes % 60;
  const p   = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${p}`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function smartScheduleItinerary(input: SmartSchedulerInput): SmartSchedulerOutput {
  const t0 = Date.now();

  // 1. Expand city stops to individual days
  const scheduleDays = expandDays(input.startDate, input.cityStops);

  // 2. Distribute activities across days by city
  assignActivitiesToDays(scheduleDays, input.activities);

  // 3. Build timeline for each day
  const plannedDays: PlannedDay[] = scheduleDays.map((day) => {
    const slots = buildDayTimeline(
      day,
      input.preferences,
      input.outboundArrivesAt,
      input.returnDepartsAt,
    );

    const character = classifyDay({
      dayIndex:             day.dayIndex,
      city:                 day.city,
      date:                 day.date,
      isArrivalDay:         day.isFirstOverall,
      isDepartureDay:       day.isLastOverall,
      hasIntercityTransfer: day.hasIntercityTransfer,
      profiles:             day.activities.map((a) => a.profile),
    });

    const actSlots = slots.filter((s) => s.kind === "activity");
    return {
      dayIndex:               day.dayIndex,
      date:                   day.date,
      theme:                  character.theme,
      geographicArea:         character.geographicArea,
      cityLabel:              day.city,
      slots,
      scheduledActivityCount: actSlots.length,
      totalActivityMinutes:   actSlots.reduce((sum, s) => sum + s.durationMinutes, 0),
    };
  });

  // 4. Collect dropped activities
  const assignedIds = new Set(
    scheduleDays.flatMap((d) => d.activities.map((a) => a.sourceId)),
  );
  const unplacedIds = new Set(
    scheduleDays.flatMap((d) => [...d.unplacedIds]),
  );

  const dropped: DroppedActivity[] = [
    ...input.activities
      .filter((a) => !assignedIds.has(a.sourceId))
      .map((a) => ({ sourceId: a.sourceId, title: a.title, reason: "Exceeded daily activity capacity" })),
    ...input.activities
      .filter((a) => assignedIds.has(a.sourceId) && unplacedIds.has(a.sourceId))
      .map((a) => ({ sourceId: a.sourceId, title: a.title, reason: "No available time slot" })),
  ];

  return {
    days: plannedDays,
    dropped,
    meta: {
      solverDurationMs:         Date.now() - t0,
      totalActivitiesScheduled: input.activities.length - dropped.length,
      totalActivitiesDropped:   dropped.length,
      droppedActivities:        dropped,
      conflicts:                [],
    },
  };
}

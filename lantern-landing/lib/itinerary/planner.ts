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
import { scheduleDay } from "./scheduler";
import { deduplicateActivities } from "./dedup";

// ── Intercity route lookup (Japan-focused, extendable) ────────────────────────

const INTERCITY_ROUTES: Record<string, { durationMinutes: number; description: string }> = {
  "tokyo-osaka":      { durationMinutes: 150, description: "Shinkansen Nozomi · Shinagawa → Shin-Osaka" },
  "osaka-tokyo":      { durationMinutes: 150, description: "Shinkansen Nozomi · Shin-Osaka → Shinagawa" },
  "tokyo-kyoto":      { durationMinutes: 135, description: "Shinkansen Nozomi · Shinagawa → Kyoto" },
  "kyoto-tokyo":      { durationMinutes: 135, description: "Shinkansen Nozomi · Kyoto → Shinagawa" },
  "osaka-kyoto":      { durationMinutes: 30,  description: "JR Rapid Service · Osaka → Kyoto" },
  "kyoto-osaka":      { durationMinutes: 30,  description: "JR Rapid Service · Kyoto → Osaka" },
  "kyoto-hiroshima":  { durationMinutes: 90,  description: "Shinkansen Hikari/Kodama · Kyoto → Hiroshima" },
  "hiroshima-kyoto":  { durationMinutes: 90,  description: "Shinkansen Hikari/Kodama · Hiroshima → Kyoto" },
  "osaka-hiroshima":  { durationMinutes: 75,  description: "Shinkansen Nozomi · Shin-Osaka → Hiroshima" },
  "hiroshima-osaka":  { durationMinutes: 75,  description: "Shinkansen Nozomi · Hiroshima → Shin-Osaka" },
  "tokyo-hiroshima":  { durationMinutes: 240, description: "Shinkansen Nozomi · Shinagawa → Hiroshima" },
  "hiroshima-tokyo":  { durationMinutes: 240, description: "Shinkansen Nozomi · Hiroshima → Shinagawa" },
  "osaka-fukuoka":    { durationMinutes: 120, description: "Shinkansen Nozomi · Shin-Osaka → Hakata" },
  "fukuoka-osaka":    { durationMinutes: 120, description: "Shinkansen Nozomi · Hakata → Shin-Osaka" },
  "tokyo-fukuoka":    { durationMinutes: 300, description: "Shinkansen Nozomi · Shinagawa → Hakata" },
  "fukuoka-tokyo":    { durationMinutes: 300, description: "Shinkansen Nozomi · Hakata → Shinagawa" },
  "kyoto-nara":       { durationMinutes: 45,  description: "JR Nara Line · Kyoto → Nara" },
  "nara-kyoto":       { durationMinutes: 45,  description: "JR Nara Line · Nara → Kyoto" },
  "osaka-nara":       { durationMinutes: 40,  description: "Kintetsu/JR · Osaka → Nara" },
  "nara-osaka":       { durationMinutes: 40,  description: "Kintetsu/JR · Nara → Osaka" },
  "paris-london":     { durationMinutes: 150, description: "Eurostar · Paris Gare du Nord → London St Pancras" },
  "london-paris":     { durationMinutes: 150, description: "Eurostar · London St Pancras → Paris Gare du Nord" },
  "paris-amsterdam":  { durationMinutes: 200, description: "Thalys/Eurostar · Paris → Amsterdam Centraal" },
  "amsterdam-paris":  { durationMinutes: 200, description: "Thalys/Eurostar · Amsterdam Centraal → Paris" },
  "barcelona-madrid": { durationMinutes: 150, description: "AVE High-Speed · Barcelona Sants → Madrid Atocha" },
  "madrid-barcelona": { durationMinutes: 150, description: "AVE High-Speed · Madrid Atocha → Barcelona Sants" },
};

// ── Landmark priority keywords per city ────────────────────────────────────────
// Activities whose titles contain these keywords (case-insensitive) get userPriority
// boosted to 1 (must-schedule) unless they already have a higher priority.

const CITY_LANDMARKS: Record<string, string[]> = {
  hiroshima: [
    "peace memorial", "peace park", "atomic bomb dome", "genbaku", "genbaku dome",
    "miyajima", "itsukushima", "torii", "momijidani", "hiroshima castle",
  ],
  kyoto: [
    "fushimi inari", "kiyomizu", "gion", "yasaka", "nishiki",
    "arashiyama", "bamboo", "kinkaku", "golden pavilion", "ryoan",
    "nijo", "philosopher", "daitoku", "nanzen",
  ],
  osaka: [
    "dotonbori", "osaka castle", "umeda", "harukas", "kuromon",
    "shinsekai", "tsutenkaku", "universal studios", "usj",
    "osaka aquarium", "kaiyukan",
  ],
  tokyo: [
    "senso-ji", "sensoji", "asakusa", "meiji jingu", "meiji shrine",
    "shibuya crossing", "shinjuku gyoen", "skytree", "tokyo tower",
    "tsukiji", "teamlab", "disneyland", "disney sea", "ueno", "imperial palace",
  ],
  nara: [
    "todai-ji", "todaiji", "deer park", "kasuga", "nishino",
    "nara park", "horyu",
  ],
  fukuoka: [
    "ohori park", "fukuoka castle", "dazaifu", "canal city",
    "yatai", "tenjin", "nakasu",
  ],
};

function boostLandmarks(acts: PlannerActivity[], city: string): PlannerActivity[] {
  const keywords = CITY_LANDMARKS[city.toLowerCase().split(",")[0].trim()] ?? [];
  if (keywords.length === 0) return acts;

  return acts.map((act) => {
    const titleLc = act.title.toLowerCase();
    const isLandmark = keywords.some((kw) => titleLc.includes(kw));
    if (isLandmark && act.userPriority > 1) {
      return { ...act, userPriority: 1 };
    }
    return act;
  });
}

interface CitySegment { city: string; startDay: number; endDay: number; }

function buildCitySegments(stops: { city: string; days: number }[]): CitySegment[] {
  const segments: CitySegment[] = [];
  let day = 0;
  for (const stop of stops) {
    if (stop.city.trim() && stop.days > 0) {
      segments.push({ city: stop.city, startDay: day, endDay: day + stop.days });
      day += stop.days;
    }
  }
  return segments;
}

function getCityForDay(segments: CitySegment[], dayIndex: number, def: string): string {
  for (const seg of segments) {
    if (dayIndex >= seg.startDay && dayIndex < seg.endDay) return seg.city;
  }
  return def;
}

function getCityTransition(segments: CitySegment[], dayIndex: number): { fromCity: string; toCity: string } | null {
  for (let i = 1; i < segments.length; i++) {
    if (dayIndex === segments[i].startDay) {
      return { fromCity: segments[i - 1].city, toCity: segments[i].city };
    }
  }
  return null;
}

function getIntercityRoute(from: string, to: string): { durationMinutes: number; description: string } {
  const key = `${from.toLowerCase().split(",")[0].trim()}-${to.toLowerCase().split(",")[0].trim()}`;
  return INTERCITY_ROUTES[key] ?? { durationMinutes: 90, description: `Intercity transfer to ${to.split(",")[0].trim()}` };
}
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
  DayWarning,
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

  // ── Multi-city route segments ─────────────────────────────────────────────
  const citySegments = buildCitySegments(trip.cityStops ?? []);
  const isMultiCity = citySegments.length > 1;

  // ── Deduplication (remove chain repeats, near-duplicate names) ───────────────
  const dedupedActivities = deduplicateActivities(activities);

  // ── Activity distribution ─────────────────────────────────────────────────
  // For multi-city trips: distribute activities proportionally across city day segments.
  // For single-city or no segment info: fall back to geographic k-means clustering.
  let dayActivityMap: Map<number, PlannerActivity[]>;

  if (isMultiCity && dedupedActivities.length > 0) {
    // Proportional distribution: each scheduling day gets activities from its city segment
    dayActivityMap = new Map();

    // Group activities by city segment (proportional to activity index)
    const segmentActivities = new Map<number, PlannerActivity[]>();
    dedupedActivities.forEach((act, i) => {
      const progress = (i + 0.5) / dedupedActivities.length;
      const targetSegIdx = (() => {
        let cumDays = 0;
        const totalDays = citySegments.reduce((s, seg) => s + (seg.endDay - seg.startDay), 0) || 1;
        const targetDay = progress * totalDays;
        for (let si = 0; si < citySegments.length; si++) {
          cumDays += citySegments[si].endDay - citySegments[si].startDay;
          if (targetDay <= cumDays) return si;
        }
        return citySegments.length - 1;
      })();
      if (!segmentActivities.has(targetSegIdx)) segmentActivities.set(targetSegIdx, []);
      segmentActivities.get(targetSegIdx)!.push(act);
    });

    // Assign segment activities across that segment's scheduling days
    schedulingDays.forEach((b, schedIdx) => {
      const seg = citySegments.findIndex(
        (seg) => b.dayIndex >= seg.startDay && b.dayIndex < seg.endDay,
      );
      const segIdx = seg >= 0 ? seg : 0;
      const segDays = schedulingDays.filter((bd) => {
        const s = citySegments[segIdx];
        return s && bd.dayIndex >= s.startDay && bd.dayIndex < s.endDay;
      });
      const segActs = segmentActivities.get(segIdx) ?? [];
      const posInSeg = segDays.findIndex((d) => d.dayIndex === b.dayIndex);
      const totalSegDays = segDays.length || 1;
      // Slice this day's share of the segment's activities
      const startIdx = Math.round((posInSeg / totalSegDays) * segActs.length);
      const endIdx   = Math.round(((posInSeg + 1) / totalSegDays) * segActs.length);
      dayActivityMap.set(schedIdx, segActs.slice(startIdx, endIdx));
    });
  } else {
    // ── Geographic clustering (single-city fallback) ──────────────────────
    const k = Math.max(1, schedulingDays.length);
    let clusterAssignments: number[];
    if (dedupedActivities.length === 0) {
      clusterAssignments = [];
    } else if (dedupedActivities.length <= k) {
      clusterAssignments = dedupedActivities.map((_, i) => i);
    } else {
      const locations = dedupedActivities.map((a) => a.location);
      clusterAssignments = clusterByLocation(locations, k);
    }
    const clusterMap = new Map<number, PlannerActivity[]>();
    for (let i = 0; i < dedupedActivities.length; i++) {
      const c = clusterAssignments[i];
      if (!clusterMap.has(c)) clusterMap.set(c, []);
      clusterMap.get(c)!.push(dedupedActivities[i]);
    }
    dayActivityMap = clusterMap;
  }

  // ── Build each day ────────────────────────────────────────────────────────
  const days: PlannedDay[] = boundaries.map((boundary) => {
    const schedIdx = schedulingDays.findIndex((d) => d.dayIndex === boundary.dayIndex);

    // Compute city first so we can boost landmarks before scheduling
    const dayCity = getCityForDay(citySegments, boundary.dayIndex, trip.city);

    const rawDayActivities = schedIdx >= 0 ? (dayActivityMap.get(schedIdx) ?? []) : [];
    const dayActivities = boostLandmarks(rawDayActivities, dayCity);

    const transition = getCityTransition(citySegments, boundary.dayIndex);
    const intercityTransfer = transition
      ? { ...getIntercityRoute(transition.fromCity, transition.toCity), ...transition }
      : undefined;

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
      intercityTransfer,
      isFoodFocused: preferences.isFoodFocused ?? false,
    });

    allDropped.push(...dropped);

    const { theme, area } = buildTheme(dayActivities, boundary.dayIndex, dayCity);

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

    // ── Rules-based day warnings ─────────────────────────────────────────
    const dayWarnings: DayWarning[] = [];
    const activityCount = scheduledActivities.length;
    const foodSlots = slots.filter(
      (s) => s.kind === "activity" && s.category === "food"
    ).length;
    const transitSlots = slots.filter(
      (s) => s.kind === "free_time" && s.transit != null
    ).length;
    const lastSlotEnd = slots.length > 0 ? slots[slots.length - 1].endMinutes : 0;
    const paceCap = preferences.pace === "packed" ? 8 : preferences.pace === "relaxed" ? 5 : 6;

    if (activityCount > paceCap) {
      dayWarnings.push({ type: "packed", message: `${activityCount} activities — this is a full day. Consider dropping one for breathing room.` });
    }
    if (foodSlots > (preferences.isFoodFocused ? 3 : 2)) {
      dayWarnings.push({ type: "food_heavy", message: `${foodSlots} food stops in one day — the day skews towards eating. Swap one for a landmark.` });
    }
    if (transitSlots >= 3) {
      dayWarnings.push({ type: "transit_heavy", message: "Multiple transit hops — consider grouping nearby attractions together." });
    }
    if (lastSlotEnd > 22 * 60) {
      dayWarnings.push({ type: "late_night", message: "Schedule runs past 10 PM. Consider ending earlier, especially if flying the next day." });
    }
    if (boundary.isArrivalDay && activityCount >= 4) {
      dayWarnings.push({ type: "flight_recovery", message: "Arrival day with many activities. Jet lag can hit hard — consider a lighter first day." });
    }

    return {
      dayIndex:               boundary.dayIndex,
      date:                   boundary.date,
      theme,
      geographicArea:         area,
      cityLabel:              dayCity,
      warnings:               dayWarnings.length > 0 ? dayWarnings : undefined,
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


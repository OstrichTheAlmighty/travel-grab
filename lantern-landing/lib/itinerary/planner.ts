/**
 * Deterministic itinerary planner — two-pass with rebalancing.
 *
 * Pipeline:
 *   1. Compute per-day boundaries (effective start/end, jet-lag, flight times)
 *   2. Deduplicate + group activities by city segment
 *   3. Capacity-aware bin-packing: assign activities to days respecting each
 *      day's realistic activity budget (arrival cap, travel-day reduction, etc.)
 *   4. Pass 1: schedule each day; collect "could not fit" drops
 *   5. Rebalance: redistribute drops to the lightest eligible day in the same
 *      city segment; re-schedule modified days (pass 2)
 *   6. Fatigue tracking: accumulate across days; warn when score > 8
 */

import { clusterByLocation } from "./geo";
import { scheduleDay } from "./scheduler";
import { deduplicateActivities } from "./dedup";
import type {
  ItineraryInput,
  PlannerOutput,
  PlannedDay,
  PlannedSlot,
  DayBoundary,
  DroppedActivity,
  PlanningConflict,
  LatLng,
  TransitMode,
  PlannerActivity,
  DayWarning,
  Pace,
} from "./types";

// ── Intercity route lookup ────────────────────────────────────────────────────

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

// ── Landmark priority keywords per city ───────────────────────────────────────

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
    "todai-ji", "todaiji", "deer park", "kasuga", "nara park", "horyu",
  ],
  fukuoka: [
    "ohori park", "fukuoka castle", "dazaifu", "canal city", "yatai", "tenjin", "nakasu",
  ],
};

function boostLandmarks(acts: PlannerActivity[], city: string): PlannerActivity[] {
  const keywords = CITY_LANDMARKS[city.toLowerCase().split(",")[0].trim()] ?? [];
  if (keywords.length === 0) return acts;
  return acts.map((act) => {
    const isLandmark = keywords.some((kw) => act.title.toLowerCase().includes(kw));
    return isLandmark && act.userPriority > 1 ? { ...act, userPriority: 1 } : act;
  });
}

// ── City segment helpers ──────────────────────────────────────────────────────

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

function getSegmentForDay(segments: CitySegment[], dayIndex: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (dayIndex >= segments[i].startDay && dayIndex < segments[i].endDay) return i;
  }
  return -1;
}

function getCityTransition(
  segments: CitySegment[],
  dayIndex: number,
): { fromCity: string; toCity: string } | null {
  for (let i = 1; i < segments.length; i++) {
    if (dayIndex === segments[i].startDay) {
      return { fromCity: segments[i - 1].city, toCity: segments[i].city };
    }
  }
  return null;
}

function getIntercityRoute(from: string, to: string): { durationMinutes: number; description: string } {
  const key = `${from.toLowerCase().split(",")[0].trim()}-${to.toLowerCase().split(",")[0].trim()}`;
  return INTERCITY_ROUTES[key] ?? {
    durationMinutes: 90,
    description: `Intercity transfer to ${to.split(",")[0].trim()}`,
  };
}

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

// ── Capacity estimation ───────────────────────────────────────────────────────

/**
 * How many minutes of sightseeing activity a day can realistically hold.
 * Used for distribution (not scheduling — the scheduler is the source of truth).
 */
function dayActivityCapacityMinutes(
  boundary: DayBoundary,
  intercityTransferMin: number,
  pace: Pace,
): number {
  // Hard caps for constrained days
  if (boundary.isArrivalDay)   return 150;  // 2.5h — check-in + one light activity
  if (boundary.isDepartureDay) return 90;   // 1.5h — breakfast + one short stop

  // Baseline: target 6h of activities for moderate pace
  const BASE = 360;
  const paceFactor = pace === "packed" ? 1.3 : pace === "relaxed" ? 0.75 : 1.0;
  let cap = Math.round(BASE * paceFactor);

  // Travel days lose capacity: subtract transfer time + 90 min station/hotel buffer
  if (intercityTransferMin > 0) {
    cap = Math.max(60, cap - intercityTransferMin - 90);
  }

  return cap;
}

// ── Per-day boundary builder ──────────────────────────────────────────────────

function buildDayBoundaries(input: ItineraryInput): DayBoundary[] {
  const { trip, preferences, outboundFlight, returnFlight } = input;
  const numDays = daysBetween(trip.startDate, trip.endDate) + 1;
  const boundaries: DayBoundary[] = [];

  for (let i = 0; i < numDays; i++) {
    const date = addDays(trip.startDate, i);
    const isArrivalDay   = i === 0;
    const isDepartureDay = i === numDays - 1 && numDays > 1;

    let effectiveStart = preferences.wakeTimeMinutes;
    let effectiveEnd   = preferences.sleepTimeMinutes;

    if (i < preferences.jetLagDays) {
      const lagShift = Math.round((preferences.jetLagDays - i) * 45);
      effectiveStart = Math.min(effectiveStart + lagShift, 11 * 60);
    }

    if (isArrivalDay && outboundFlight) {
      const arrivalMinutes = minutesFromDate(outboundFlight.arrivesAt, date);
      const ready = arrivalMinutes + 90; // customs + luggage + transit to hotel
      if (ready > effectiveStart) effectiveStart = Math.min(ready, 20 * 60);
    }

    if (isDepartureDay && returnFlight) {
      const depMinutes = minutesFromDate(returnFlight.departsAt, date);
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

// ── Theme labelling ───────────────────────────────────────────────────────────

function buildTheme(
  activities: PlannerActivity[],
  dayIndex: number,
  city: string,
): { theme: string; area: string } {
  if (activities.length === 0) return { theme: "Arrival day — settle in", area: city };

  const categoryCounts = new Map<string, number>();
  for (const a of activities) {
    categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
  }

  const titles = [...activities]
    .sort((a, b) => a.userPriority - b.userPriority)
    .slice(0, 2)
    .map((a) => a.title);

  const theme =
    titles.length >= 2
      ? `${titles[0]} & ${titles[1]}`
      : titles.length === 1
        ? titles[0]
        : "Exploring";

  return {
    theme: dayIndex === 0 ? `Arrival & ${theme}` : theme,
    area:  city,
  };
}

// ── Capacity-aware bin-packing ────────────────────────────────────────────────

/**
 * Assign activities to scheduling days using a knapsack-style approach.
 * Heavy items (long duration) placed on high-capacity days; light items fill gaps.
 * Arrival/departure days capped strictly.
 *
 * Returns: schedIdx → PlannerActivity[]
 */
function packActivitiesIntoDays(
  activities: PlannerActivity[],
  segDays: Array<{ b: DayBoundary; schedIdx: number }>,
  intercityTransferMap: Map<number, number>,
  pace: Pace,
): Map<number, PlannerActivity[]> {
  const caps = new Map(
    segDays.map(({ b, schedIdx }) => [
      schedIdx,
      dayActivityCapacityMinutes(b, intercityTransferMap.get(b.dayIndex) ?? 0, pace),
    ]),
  );
  const used  = new Map(segDays.map(({ schedIdx }) => [schedIdx, 0]));
  const lists = new Map<number, PlannerActivity[]>(
    segDays.map(({ schedIdx }) => [schedIdx, []]),
  );

  // Sort: priority 1 first, then by duration DESC so heavy items get first pick of full days
  const sorted = [...activities].sort((a, b) => {
    if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
    return b.durationMinutes - a.durationMinutes;
  });

  for (const act of sorted) {
    // Find day with most remaining capacity that fits (and respects arrival/departure limits)
    let bestIdx  = -1;
    let bestRem  = -1;

    for (const { b, schedIdx } of segDays) {
      // Hard constraints on constrained days
      if (b.isArrivalDay   && act.durationMinutes > 90) continue;
      if (b.isDepartureDay && act.durationMinutes > 60) continue;

      const remaining = (caps.get(schedIdx) ?? 0) - (used.get(schedIdx) ?? 0);
      if (remaining >= act.durationMinutes && remaining > bestRem) {
        bestRem = remaining;
        bestIdx = schedIdx;
      }
    }

    // Overflow: no day has exact room — use lightest non-constrained day
    if (bestIdx === -1) {
      let maxRem = -Infinity;
      for (const { b, schedIdx } of segDays) {
        if (b.isArrivalDay && act.durationMinutes > 90)   continue;
        if (b.isDepartureDay && act.durationMinutes > 60) continue;
        const rem = (caps.get(schedIdx) ?? 0) - (used.get(schedIdx) ?? 0);
        if (rem > maxRem) { maxRem = rem; bestIdx = schedIdx; }
      }
    }

    // Last resort: any day (arrival/departure constraints dropped — scheduler will handle it)
    if (bestIdx === -1) {
      let maxRem = -Infinity;
      for (const { schedIdx } of segDays) {
        const rem = (caps.get(schedIdx) ?? 0) - (used.get(schedIdx) ?? 0);
        if (rem > maxRem) { maxRem = rem; bestIdx = schedIdx; }
      }
    }

    if (bestIdx !== -1) {
      used.set(bestIdx,  (used.get(bestIdx)  ?? 0) + act.durationMinutes);
      lists.get(bestIdx)!.push(act);
    }
  }

  return lists;
}

// ── Scheduler call helper ─────────────────────────────────────────────────────

function runScheduleDay(
  schedIdx: number,
  schedulingDays: DayBoundary[],
  citySegments: CitySegment[],
  dayActivityMap: Map<number, PlannerActivity[]>,
  hotelLocation: LatLng | null,
  transitMode: TransitMode,
  preferences: ItineraryInput["preferences"],
  defaultCity: string,
): { slots: PlannedSlot[]; dropped: DroppedActivity[]; scheduledMin: number } {
  const b = schedulingDays[schedIdx];
  const dayCity = getCityForDay(citySegments, b.dayIndex, defaultCity);
  const rawActs = dayActivityMap.get(schedIdx) ?? [];
  const dayActs = boostLandmarks(rawActs, dayCity);
  const transition = getCityTransition(citySegments, b.dayIndex);
  const intercityTransfer = transition
    ? { ...getIntercityRoute(transition.fromCity, transition.toCity), ...transition }
    : undefined;

  const { slots, dropped } = scheduleDay({
    activities:    dayActs,
    boundary:      b,
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

  const scheduledMin = slots
    .filter((s) => s.kind === "activity")
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  return { slots, dropped, scheduledMin };
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

  const boundaries    = buildDayBoundaries(input);
  const schedulingDays = boundaries.filter(
    (b) => b.effectiveEndMinutes - b.effectiveStartMinutes >= 120,
  );

  const allDropped:  DroppedActivity[]  = [];
  const conflicts:   PlanningConflict[] = [];

  // ── City segments ─────────────────────────────────────────────────────────
  let citySegments = buildCitySegments(trip.cityStops ?? []);
  const isMultiCity = citySegments.length > 1;

  // For single-city trips, synthesise one segment covering the whole trip
  if (citySegments.length === 0) {
    citySegments = [{ city: trip.city, startDay: 0, endDay: boundaries.length }];
  }

  // ── Deduplication ─────────────────────────────────────────────────────────
  const dedupedActivities = deduplicateActivities(activities);

  // Build sourceId → PlannerActivity lookup (used for rebalancing)
  const actBySourceId = new Map(dedupedActivities.map((a) => [a.sourceId, a]));

  // ── Precompute intercity transfer minutes per dayIndex ─────────────────────
  const intercityTransferMap = new Map<number, number>();
  for (const b of schedulingDays) {
    const transition = getCityTransition(citySegments, b.dayIndex);
    if (transition) {
      intercityTransferMap.set(
        b.dayIndex,
        getIntercityRoute(transition.fromCity, transition.toCity).durationMinutes,
      );
    }
  }

  // ── Group activities by city segment ───────────────────────────────────────
  const segmentActivities = new Map<number, PlannerActivity[]>();

  if (isMultiCity) {
    dedupedActivities.forEach((act, i) => {
      const progress = (i + 0.5) / dedupedActivities.length;
      const totalDays = citySegments.reduce((s, seg) => s + (seg.endDay - seg.startDay), 0) || 1;
      const targetDay = progress * totalDays;
      let segIdx = citySegments.length - 1;
      let cumDays = 0;
      for (let si = 0; si < citySegments.length; si++) {
        cumDays += citySegments[si].endDay - citySegments[si].startDay;
        if (targetDay <= cumDays) { segIdx = si; break; }
      }
      if (!segmentActivities.has(segIdx)) segmentActivities.set(segIdx, []);
      segmentActivities.get(segIdx)!.push(act);
    });
  } else {
    // Single city: geographic k-means clustering, then treat each cluster as its own mini-segment
    const k = Math.max(1, schedulingDays.length);
    let assignments: number[];
    if (dedupedActivities.length === 0) {
      assignments = [];
    } else if (dedupedActivities.length <= k) {
      assignments = dedupedActivities.map((_, i) => i);
    } else {
      assignments = clusterByLocation(dedupedActivities.map((a) => a.location), k);
    }
    const clusterMap = new Map<number, PlannerActivity[]>();
    for (let i = 0; i < dedupedActivities.length; i++) {
      const c = assignments[i];
      if (!clusterMap.has(c)) clusterMap.set(c, []);
      clusterMap.get(c)!.push(dedupedActivities[i]);
    }
    // Merge clusters into a single pool; packing distributes them across days
    const allActs = [...clusterMap.values()].flat();
    segmentActivities.set(0, allActs);
  }

  // ── Capacity-aware distribution ────────────────────────────────────────────
  const dayActivityMap = new Map<number, PlannerActivity[]>();

  for (let segIdx = 0; segIdx < citySegments.length; segIdx++) {
    const seg = citySegments[segIdx];
    const segDays = schedulingDays
      .map((b, si) => ({ b, schedIdx: si }))
      .filter(({ b }) => b.dayIndex >= seg.startDay && b.dayIndex < seg.endDay);

    if (segDays.length === 0) continue;

    const acts = segmentActivities.get(segIdx) ?? [];
    const packed = packActivitiesIntoDays(acts, segDays, intercityTransferMap, preferences.pace);
    for (const [schedIdx, list] of packed) {
      dayActivityMap.set(schedIdx, list);
    }
  }

  // ── Pass 1: Schedule every day ─────────────────────────────────────────────
  interface PassResult {
    slots:       PlannedSlot[];
    droppedActs: PlannerActivity[];  // "could not fit" only — full objects
    scheduledMin: number;
  }
  const passResults = new Map<number, PassResult>();

  for (let si = 0; si < schedulingDays.length; si++) {
    const { slots, dropped, scheduledMin } = runScheduleDay(
      si, schedulingDays, citySegments, dayActivityMap, hotelLocation,
      transitMode, preferences, trip.city,
    );

    // Separate "closed" drops (permanent) from "couldn't fit" (rebalanceable)
    const droppedActs: PlannerActivity[] = [];
    for (const d of dropped) {
      if (d.reason === "Could not fit within available time") {
        const act = actBySourceId.get(d.sourceId);
        if (act) { droppedActs.push(act); continue; }
      }
      allDropped.push(d); // closed / genuinely impossible
    }

    passResults.set(si, { slots, droppedActs, scheduledMin });
  }

  // ── Rebalance: redistribute "could not fit" activities ────────────────────
  // Collect all overflow, grouped by city segment
  const overflowBySegment = new Map<number, PlannerActivity[]>();

  for (let si = 0; si < schedulingDays.length; si++) {
    const result = passResults.get(si);
    if (!result || result.droppedActs.length === 0) continue;

    const b    = schedulingDays[si];
    const segI = getSegmentForDay(citySegments, b.dayIndex);
    if (segI === -1) continue;

    if (!overflowBySegment.has(segI)) overflowBySegment.set(segI, []);
    overflowBySegment.get(segI)!.push(...result.droppedActs);
  }

  const needsReschedule = new Set<number>();

  for (const [segIdx, overflow] of overflowBySegment) {
    const seg = citySegments[segIdx];
    if (!seg) continue;

    // Sort: priority-1 first, then shortest duration (easier to fit)
    overflow.sort((a, b) => {
      if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
      return a.durationMinutes - b.durationMinutes;
    });

    // Days in this segment sorted by scheduled minutes ASC (lightest first)
    const segSchedDays = schedulingDays
      .map((b, si) => ({ b, si }))
      .filter(({ b }) => b.dayIndex >= seg.startDay && b.dayIndex < seg.endDay)
      .sort((a, b) => (passResults.get(a.si)?.scheduledMin ?? 0) - (passResults.get(b.si)?.scheduledMin ?? 0));

    for (const act of overflow) {
      for (const { b, si } of segSchedDays) {
        if (b.isArrivalDay   && act.durationMinutes > 90) continue;
        if (b.isDepartureDay && act.durationMinutes > 60) continue;

        const current = passResults.get(si)?.scheduledMin ?? 0;
        const target  = dayActivityCapacityMinutes(
          b, intercityTransferMap.get(b.dayIndex) ?? 0, preferences.pace,
        );

        // Accept if lightest day still has headroom (10% tolerance)
        if (current + act.durationMinutes <= target * 1.1) {
          const existing = dayActivityMap.get(si) ?? [];
          if (!existing.some((a) => a.sourceId === act.sourceId)) {
            dayActivityMap.set(si, [...existing, act]);
            needsReschedule.add(si);
            // Update estimated scheduledMin so subsequent iterations see updated load
            const res = passResults.get(si);
            if (res) res.scheduledMin += act.durationMinutes;
          }
          break;
        }
      }
      // If no day accepted it, it'll be permanently dropped after pass 2
    }
  }

  // ── Pass 2: Re-schedule only the days that received overflow ──────────────
  for (const si of needsReschedule) {
    const { slots, dropped, scheduledMin } = runScheduleDay(
      si, schedulingDays, citySegments, dayActivityMap, hotelLocation,
      transitMode, preferences, trip.city,
    );
    passResults.set(si, { slots, droppedActs: [], scheduledMin });
    for (const d of dropped) allDropped.push(d); // anything still dropped is truly unschedulable
  }

  // ── Build final day array with fatigue tracking ───────────────────────────
  let cumulativeFatigue = 0;
  const days: PlannedDay[] = boundaries.map((boundary) => {
    const si     = schedulingDays.findIndex((d) => d.dayIndex === boundary.dayIndex);
    const result = si >= 0 ? passResults.get(si) : null;
    const slots  = result?.slots ?? [];

    const dayCity      = getCityForDay(citySegments, boundary.dayIndex, trip.city);
    const rawActs      = si >= 0 ? (dayActivityMap.get(si) ?? []) : [];
    const dayActivities = boostLandmarks(rawActs, dayCity);

    const scheduledActivities = slots.filter((s) => s.kind === "activity");
    const activityMinutes = scheduledActivities.reduce((s, sl) => s + sl.durationMinutes, 0);
    const activityHours   = activityMinutes / 60;

    // Fatigue accumulation
    if (activityHours >= 8)      cumulativeFatigue += 3;
    else if (activityHours >= 6) cumulativeFatigue += 1;
    else if (activityHours <= 4) cumulativeFatigue = Math.max(0, cumulativeFatigue - 2);

    // Conflict detection
    const dropped = si >= 0
      ? (overflowBySegment.get(getSegmentForDay(citySegments, boundary.dayIndex))
           ?.filter((a) => !(dayActivityMap.get(si) ?? []).some((b) => b.sourceId === a.sourceId)) ?? [])
      : [];
    if (dropped.length > 0 && dayActivities.length > 0) {
      conflicts.push({
        type:        "capacity",
        description: `Day ${boundary.dayIndex + 1}: ${dropped.length} activit${dropped.length > 1 ? "ies" : "y"} redistributed`,
        suggestion:  "Activities moved to lighter days automatically.",
      });
    }

    const availableHours = (boundary.effectiveEndMinutes - boundary.effectiveStartMinutes) / 60;
    if (availableHours < 4 && scheduledActivities.length < dayActivities.length) {
      conflicts.push({
        type:        "short_day",
        description: `Day ${boundary.dayIndex + 1} has only ${availableHours.toFixed(1)}h available`,
        suggestion:  "Consider moving some activities to adjacent days.",
      });
    }

    // Rules-based day warnings
    const dayWarnings: DayWarning[] = [];
    const foodSlots   = slots.filter((s) => s.kind === "activity" && s.category === "food").length;
    const transitSlots = slots.filter((s) => s.kind === "free_time" && s.transit != null).length;
    const lastSlotEnd = slots.length > 0 ? slots[slots.length - 1].endMinutes : 0;
    const paceCap     = preferences.pace === "packed" ? 8 : preferences.pace === "relaxed" ? 5 : 6;

    if (scheduledActivities.length > paceCap) {
      dayWarnings.push({ type: "packed", message: `${scheduledActivities.length} activities — full day. Consider dropping one.` });
    }
    if (foodSlots > (preferences.isFoodFocused ? 3 : 2)) {
      dayWarnings.push({ type: "food_heavy", message: `${foodSlots} food stops — swap one for a landmark.` });
    }
    if (transitSlots >= 3) {
      dayWarnings.push({ type: "transit_heavy", message: "Multiple transit hops — group nearby attractions together." });
    }
    if (lastSlotEnd > 22 * 60) {
      dayWarnings.push({ type: "late_night", message: "Schedule runs past 10 PM." });
    }
    if (boundary.isArrivalDay && scheduledActivities.length >= 3) {
      dayWarnings.push({ type: "flight_recovery", message: "Arrival day — jet lag can hit hard. This is already capped at 2.5h of activities." });
    }
    if (cumulativeFatigue > 8) {
      dayWarnings.push({ type: "packed", message: `Fatigue score ${cumulativeFatigue} — consider a lighter next day (museums, cafés, parks).` });
    }

    const { theme, area } = buildTheme(dayActivities, boundary.dayIndex, dayCity);

    return {
      dayIndex:               boundary.dayIndex,
      date:                   boundary.date,
      theme,
      geographicArea:         area,
      cityLabel:              dayCity,
      warnings:               dayWarnings.length > 0 ? dayWarnings : undefined,
      fatigueScore:           cumulativeFatigue,
      slots,
      scheduledActivityCount: scheduledActivities.length,
      totalActivityMinutes:   activityMinutes,
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

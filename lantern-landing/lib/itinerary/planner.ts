/**
 * Deterministic itinerary planner — two-pass with rebalancing.
 *
 * Pipeline:
 *   1. Compute per-day boundaries (effective start/end, jet-lag, flight times)
 *   2. Deduplicate + pre-filter activities to fit total day capacity budget
 *   3. Group activities by city segment using COORDINATES (haversine to city centre)
 *   4. Capacity-aware bin-packing: assign activities to days respecting each day's budget
 *   5. Pass 1: schedule each day; collect "could not fit" drops
 *   6. Fatigue enforcement (AFTER Pass 1): compute ACTUAL fatigue from real scheduled
 *      minutes; trim any day where prev-day fatigue > 10 to 4h max; excess → overflow
 *   7. Rebalance: redistribute drops/excess to lightest eligible day IN THE SAME CITY
 *      SEGMENT — city guard: activity's nearest city must match the target day's city
 *   8. Pass 2: re-schedule modified days (overflow recipients + fatigue-trimmed days)
 *   9. Build final day array: track cumulative fatigue, emit warnings, theme each day
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

// ── Geometry ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
    "peace memorial", "peace park", "atomic bomb dome", "genbaku",
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
  nara:    ["todai-ji", "todaiji", "deer park", "kasuga", "nara park", "horyu"],
  fukuoka: ["ohori park", "fukuoka castle", "dazaifu", "canal city", "yatai", "tenjin", "nakasu"],
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

interface CitySegment {
  city:     string;
  startDay: number;
  endDay:   number;
  lat?:     number;
  lng?:     number;
}

function buildCitySegments(
  stops: { city: string; days: number; lat?: number; lng?: number }[],
): CitySegment[] {
  const segments: CitySegment[] = [];
  let day = 0;
  for (const stop of stops) {
    if (stop.city.trim() && stop.days > 0) {
      segments.push({
        city:     stop.city,
        startDay: day,
        endDay:   day + stop.days,
        lat:      stop.lat,
        lng:      stop.lng,
      });
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

function getSegmentIndexForDay(segments: CitySegment[], dayIndex: number): number {
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
    description:     `Intercity transfer to ${to.split(",")[0].trim()}`,
  };
}

/**
 * Returns the segment index whose city centre is nearest to (lat, lng).
 * Falls back to 0 if no segment has coordinates.
 */
function nearestCitySegment(lat: number, lng: number, segments: CitySegment[]): number {
  let bestIdx  = 0;
  let bestDist = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.lat == null || s.lng == null) continue;
    const d = haversineKm(lat, lng, s.lat, s.lng);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
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
 * Realistic activity budget for a day in minutes.
 *
 * Hard limits (applied regardless of pace):
 *   - Arrival day:                 150 min (2.5h)
 *   - Departure day:               90 min  (1.5h)
 *   - Travel day (transfer > 60m): 240 min (4h) — Shinkansen-length transfers
 *
 * Fatigue enforcement is intentionally NOT applied here.
 * It is applied POST Pass 1, using actual scheduled minutes (not estimates).
 */
function dayActivityCapacityMinutes(
  boundary:             DayBoundary,
  intercityTransferMin: number,
  pace:                 Pace,
): number {
  if (boundary.isArrivalDay)   return 150;
  if (boundary.isDepartureDay) return 90;

  const BASE       = 360;
  const paceFactor = pace === "packed" ? 1.3 : pace === "relaxed" ? 0.75 : 1.0;
  let cap          = Math.round(BASE * paceFactor);

  if (intercityTransferMin > 60) {
    cap = Math.min(cap, 240);
  } else if (intercityTransferMin > 0) {
    cap = Math.max(90, cap - intercityTransferMin - 60);
  }

  return cap;
}

// ── Per-day boundary builder ──────────────────────────────────────────────────

function buildDayBoundaries(input: ItineraryInput): DayBoundary[] {
  const { trip, preferences, outboundFlight, returnFlight } = input;
  const numDays    = daysBetween(trip.startDate, trip.endDate) + 1;
  const boundaries: DayBoundary[] = [];

  for (let i = 0; i < numDays; i++) {
    const date           = addDays(trip.startDate, i);
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
      const ready          = arrivalMinutes + 90;
      if (ready > effectiveStart) effectiveStart = Math.min(ready, 20 * 60);
    }

    if (isDepartureDay && returnFlight) {
      const depMinutes = minutesFromDate(returnFlight.departsAt, date);
      effectiveEnd     = Math.min(effectiveEnd, depMinutes - 3 * 60);
    }

    boundaries.push({
      dayIndex:              i,
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
  dayIndex:   number,
  city:       string,
): { theme: string; area: string } {
  if (activities.length === 0) return { theme: "Arrival day — settle in", area: city };

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

  return { theme: dayIndex === 0 ? `Arrival & ${theme}` : theme, area: city };
}

// ── Capacity-aware bin-packing ────────────────────────────────────────────────

function packActivitiesIntoDays(
  activities: PlannerActivity[],
  segDays:    Array<{ b: DayBoundary; schedIdx: number; cap: number }>,
): Map<number, PlannerActivity[]> {
  const used  = new Map(segDays.map(({ schedIdx }) => [schedIdx, 0]));
  const lists = new Map<number, PlannerActivity[]>(segDays.map(({ schedIdx }) => [schedIdx, []]));

  const sorted = [...activities].sort((a, b) => {
    if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
    return b.durationMinutes - a.durationMinutes;
  });

  for (const act of sorted) {
    let bestIdx = -1;
    let bestRem = -1;

    for (const { b, schedIdx, cap } of segDays) {
      if (b.isArrivalDay   && act.durationMinutes > 90) continue;
      if (b.isDepartureDay && act.durationMinutes > 60) continue;

      const remaining = cap - (used.get(schedIdx) ?? 0);
      if (remaining >= act.durationMinutes && remaining > bestRem) {
        bestRem = remaining;
        bestIdx = schedIdx;
      }
    }

    // Overflow: no exact fit — use lightest non-constrained day
    if (bestIdx === -1) {
      let maxRem = -Infinity;
      for (const { b, schedIdx, cap } of segDays) {
        if (b.isArrivalDay   && act.durationMinutes > 90) continue;
        if (b.isDepartureDay && act.durationMinutes > 60) continue;
        const rem = cap - (used.get(schedIdx) ?? 0);
        if (rem > maxRem) { maxRem = rem; bestIdx = schedIdx; }
      }
    }

    // Last resort: any day
    if (bestIdx === -1) {
      let maxRem = -Infinity;
      for (const { schedIdx, cap } of segDays) {
        const rem = cap - (used.get(schedIdx) ?? 0);
        if (rem > maxRem) { maxRem = rem; bestIdx = schedIdx; }
      }
    }

    if (bestIdx !== -1) {
      used.set(bestIdx, (used.get(bestIdx) ?? 0) + act.durationMinutes);
      lists.get(bestIdx)!.push(act);
    }
  }

  return lists;
}

// ── Scheduler call helper ─────────────────────────────────────────────────────

function runScheduleDay(
  schedIdx:       number,
  schedulingDays: DayBoundary[],
  citySegments:   CitySegment[],
  dayActivityMap: Map<number, PlannerActivity[]>,
  hotelLocation:  LatLng | null,
  transitMode:    TransitMode,
  preferences:    ItineraryInput["preferences"],
  defaultCity:    string,
): { slots: PlannedSlot[]; dropped: DroppedActivity[]; scheduledMin: number } {
  const b       = schedulingDays[schedIdx];
  const dayCity = getCityForDay(citySegments, b.dayIndex, defaultCity);
  const rawActs = dayActivityMap.get(schedIdx) ?? [];
  const dayActs = boostLandmarks(rawActs, dayCity);

  const transition        = getCityTransition(citySegments, b.dayIndex);
  const intercityTransfer = transition
    ? { ...getIntercityRoute(transition.fromCity, transition.toCity), ...transition }
    : undefined;

  const { slots, dropped } = scheduleDay({
    activities:     dayActs,
    boundary:       b,
    hotelLocation,
    transitMode,
    pace:           preferences.pace,
    mealsPerDay:    preferences.mealsPerDay,
    mealDurations:  {
      breakfast: preferences.breakfastDurationMin,
      lunch:     preferences.lunchDurationMin,
      dinner:    preferences.dinnerDurationMin,
    },
    intercityTransfer,
    isFoodFocused:  preferences.isFoodFocused ?? false,
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

  const boundaries     = buildDayBoundaries(input);
  const schedulingDays = boundaries.filter(
    (b) => b.effectiveEndMinutes - b.effectiveStartMinutes >= 120,
  );

  const allDropped: DroppedActivity[]  = [];
  const conflicts:  PlanningConflict[] = [];

  // ── City segments ─────────────────────────────────────────────────────────
  let citySegments = buildCitySegments(trip.cityStops ?? []);
  const isMultiCity = citySegments.length > 1;

  if (citySegments.length === 0) {
    citySegments = [{ city: trip.city, startDay: 0, endDay: boundaries.length }];
  }

  const segmentsHaveCoords = isMultiCity && citySegments.some((s) => s.lat != null);

  // ── Deduplication ─────────────────────────────────────────────────────────
  const dedupedActivities = deduplicateActivities(activities);
  const actBySourceId     = new Map(dedupedActivities.map((a) => [a.sourceId, a]));

  // ── Precompute intercity transfer minutes per scheduling day ───────────────
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

  // ── Base capacity caps ────────────────────────────────────────────────────
  // No fatigue adjustment here — fatigue is enforced POST Pass 1 using actual
  // scheduled minutes rather than estimates.
  const adjustedCaps = new Map<number, number>();
  for (let si = 0; si < schedulingDays.length; si++) {
    const b            = schedulingDays[si];
    const intercityMin = intercityTransferMap.get(b.dayIndex) ?? 0;
    adjustedCaps.set(si, dayActivityCapacityMinutes(b, intercityMin, preferences.pace));
  }

  // ── Activity budget pre-filter ────────────────────────────────────────────
  // For single-city trips: cap total activities to what realistically fits
  // (75% fill factor for transit, meals, buffer). All activities have identical
  // userPriority/rating so this is effectively a stable first-N slice.
  //
  // For multi-city trips: SKIP this global filter. Each segment groups its own
  // activities and packs only what fits into its days via knapsack — a global
  // budget cut would silently discard all later-city activities (e.g. Osaka and
  // Hiroshima activities saved after Tokyo/Kyoto would get zero budget slots).
  const totalCapacityMin = [...adjustedCaps.values()].reduce((s, c) => s + c, 0);
  const avgDuration = dedupedActivities.length > 0
    ? dedupedActivities.reduce((s, a) => s + a.durationMinutes, 0) / dedupedActivities.length
    : 90;
  const maxActivities = Math.ceil((totalCapacityMin * 0.75) / avgDuration);

  let schedulableActivities = dedupedActivities;
  if (!isMultiCity && dedupedActivities.length > maxActivities) {
    const sorted = [...dedupedActivities].sort((a, b) => {
      if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
      return (b.rating * Math.log1p(b.reviewCount)) - (a.rating * Math.log1p(a.reviewCount));
    });
    schedulableActivities = sorted.slice(0, maxActivities);
    console.log(`[planner/budget] Single-city: ${dedupedActivities.length} → ${schedulableActivities.length} activities (cap=${maxActivities})`);
  } else if (isMultiCity) {
    console.log(
      `[planner/budget] Multi-city: skipping global budget filter ` +
      `(${dedupedActivities.length} activities — each segment packs independently)`,
    );
  }

  // ── Reject T4:proportional activities for multi-city trips ───────────────
  // Activities without a confident city assignment (hasRealCoords=false) are
  // split by category before filtering:
  //
  //   Nightlife T4: KEPT — scheduled at 8pm+ in their own pass, so a slightly
  //     wrong-city day is acceptable and "disappearing nightlife" is worse.
  //     Assigned to primary city (segment 0) as the safest default.
  //
  //   All other T4: DROPPED to allDropped ("Also worth considering") to prevent
  //     daytime sightseeing activities from appearing in the wrong city.
  //
  // Safety valve: if ALL activities are T4, keep everything — proportional
  // assignment is better than an empty itinerary.
  if (isMultiCity && segmentsHaveCoords) {
    const confident        = schedulableActivities.filter((a) => a.hasRealCoords !== false);
    const unknownNightlife = schedulableActivities.filter((a) => a.hasRealCoords === false && a.category === "nightlife");
    const unknownOther     = schedulableActivities.filter((a) => a.hasRealCoords === false && a.category !== "nightlife");

    if ((unknownNightlife.length > 0 || unknownOther.length > 0) && confident.length > 0) {
      for (const act of unknownOther) {
        console.log(`[CITY-DROP] T4:proportional "${act.title}" (${act.category}) — city unknown, moved to 'Also worth considering'`);
        allDropped.push({ sourceId: act.sourceId, title: act.title, reason: "City unknown for multi-city trip" });
      }
      if (unknownNightlife.length > 0) {
        console.log(
          `[CITY-NIGHTLIFE] Keeping ${unknownNightlife.length} T4 nightlife activities` +
          ` — will assign to primary city (segment 0): ${unknownNightlife.map((a) => `"${a.title}"`).join(", ")}`,
        );
      }
      schedulableActivities = [...confident, ...unknownNightlife];
    } else if (unknownNightlife.length > 0 || unknownOther.length > 0) {
      console.log(
        `[CITY-DROP] All activities are T4:proportional — ` +
        `proceeding with proportional fallback (no T1/T2/T3 activities available)`,
      );
    }
  }

  // ── Group activities by city segment ──────────────────────────────────────
  // Multi-city with real coordinates: assign each activity to the nearest city
  // by haversine distance. T4:proportional activities are pre-filtered above
  // so only T1/T2/T3 activities reach this point for haversine assignment.
  const segmentActivities = new Map<number, PlannerActivity[]>();

  if (isMultiCity) {
    console.log(
      `[planner/segments] Multi-city: ${citySegments.map((s) => `${s.city}(days${s.startDay}-${s.endDay - 1})`).join(" → ")}` +
      ` | segmentsHaveCoords=${segmentsHaveCoords} | activities=${schedulableActivities.length}`,
    );

    schedulableActivities.forEach((act, i) => {
      let segIdx: number;
      let method: string;

      if (segmentsHaveCoords && act.hasRealCoords !== false) {
        segIdx = nearestCitySegment(act.location.lat, act.location.lng, citySegments);
        method = `haversine→${citySegments[segIdx]?.city ?? "?"}`;
      } else if (act.category === "nightlife") {
        // T4 nightlife: pin to primary city (segment 0). No GPS, but nightlife
        // is scheduled at 8pm+ separately — better to show on day 1-N of the
        // primary city than to misplace via proportional index.
        segIdx = 0;
        method = `nightlife-primary(${citySegments[0]?.city ?? "seg0"})`;
      } else {
        const progress  = (i + 0.5) / schedulableActivities.length;
        const totalDays = citySegments.reduce((s, seg) => s + (seg.endDay - seg.startDay), 0) || 1;
        const targetDay = progress * totalDays;
        segIdx          = citySegments.length - 1;
        let cumDays     = 0;
        for (let si = 0; si < citySegments.length; si++) {
          cumDays += citySegments[si].endDay - citySegments[si].startDay;
          if (targetDay <= cumDays) { segIdx = si; break; }
        }
        method = `proportional(i=${i},prog=${(progress * 100).toFixed(0)}%)→${citySegments[segIdx]?.city ?? "?"}`;
      }

      const assignedCity = citySegments[segIdx]?.city ?? "unknown";
      console.log(
        `[CITY-CHECK] segment=${segIdx} city=${assignedCity.padEnd(12)} | ` +
        `hasRealCoords=${String(act.hasRealCoords ?? true).padEnd(5)} | ` +
        `lat=${act.location.lat.toFixed(4)} lng=${act.location.lng.toFixed(4)} | ` +
        `method=${method} | "${act.title}"`,
      );

      if (!segmentActivities.has(segIdx)) segmentActivities.set(segIdx, []);
      segmentActivities.get(segIdx)!.push(act);
    });
  } else {
    const k = Math.max(1, schedulingDays.length);
    let assignments: number[];
    if (schedulableActivities.length === 0) {
      assignments = [];
    } else if (schedulableActivities.length <= k) {
      assignments = schedulableActivities.map((_, idx) => idx);
    } else {
      assignments = clusterByLocation(schedulableActivities.map((a) => a.location), k);
    }
    const allActs = new Map<number, PlannerActivity[]>();
    for (let i = 0; i < schedulableActivities.length; i++) {
      const c = assignments[i];
      if (!allActs.has(c)) allActs.set(c, []);
      allActs.get(c)!.push(schedulableActivities[i]);
    }
    segmentActivities.set(0, [...allActs.values()].flat());
  }

  // ── Capacity-aware distribution ────────────────────────────────────────────
  const dayActivityMap = new Map<number, PlannerActivity[]>();

  for (let segIdx = 0; segIdx < citySegments.length; segIdx++) {
    const seg     = citySegments[segIdx];
    const segDays = schedulingDays
      .map((b, si) => ({ b, schedIdx: si, cap: adjustedCaps.get(si) ?? 360 }))
      .filter(({ b }) => b.dayIndex >= seg.startDay && b.dayIndex < seg.endDay);

    if (segDays.length === 0) continue;

    const acts   = segmentActivities.get(segIdx) ?? [];
    const packed = packActivitiesIntoDays(acts, segDays);
    for (const [schedIdx, list] of packed) {
      dayActivityMap.set(schedIdx, list);
      if (isMultiCity && list.length > 0) {
        console.log(
          `[DAY-PACK] schedIdx=${schedIdx} dayIndex=${schedulingDays[schedIdx]?.dayIndex ?? "?"} ` +
          `city=${seg.city} | ${list.map((a) => `"${a.title}"`).join(", ")}`,
        );
      }
    }
  }

  // ── Pass 1: Schedule every day ─────────────────────────────────────────────
  interface PassResult {
    slots:        PlannedSlot[];
    droppedActs:  PlannerActivity[];  // "could not fit" activities (full objects)
    scheduledMin: number;             // actual activity minutes scheduled
  }
  const passResults = new Map<number, PassResult>();

  for (let si = 0; si < schedulingDays.length; si++) {
    const { slots, dropped, scheduledMin } = runScheduleDay(
      si, schedulingDays, citySegments, dayActivityMap,
      hotelLocation, transitMode, preferences, trip.city,
    );

    const droppedActs: PlannerActivity[] = [];
    for (const d of dropped) {
      if (d.reason === "Could not fit within available time") {
        const act = actBySourceId.get(d.sourceId);
        if (act) { droppedActs.push(act); continue; }
      }
      allDropped.push(d);
    }

    passResults.set(si, { slots, droppedActs, scheduledMin });
  }

  // ── Fatigue enforcement (post Pass 1) ─────────────────────────────────────
  // Use ACTUAL scheduled minutes from Pass 1 to compute real cumulative fatigue.
  // If the previous day's fatigue score exceeds 10, this day is hard-capped at
  // 240 min (4h). Activities trimmed by this cap join the overflow pool so they
  // can potentially be rescheduled on lighter days by the rebalancer below.

  let actualFatigue = 0;
  const actualFatigueAfter = new Map<number, number>();

  for (let si = 0; si < schedulingDays.length; si++) {
    const actHours = (passResults.get(si)?.scheduledMin ?? 0) / 60;
    if (actHours >= 8)      actualFatigue += 3;
    else if (actHours >= 6) actualFatigue += 1;
    else if (actHours <= 4) actualFatigue = Math.max(0, actualFatigue - 2);
    actualFatigueAfter.set(si, actualFatigue);
  }

  const fatigueCappedDays = new Set<number>();

  for (let si = 1; si < schedulingDays.length; si++) {
    const prevFatigue = actualFatigueAfter.get(si - 1) ?? 0;
    if (prevFatigue <= 10) continue;

    const FATIGUE_CAP = 240;

    // Lower the cap so the rebalancer won't add more to this day
    if ((adjustedCaps.get(si) ?? 360) > FATIGUE_CAP) {
      adjustedCaps.set(si, FATIGUE_CAP);
    }

    const currentScheduled = passResults.get(si)?.scheduledMin ?? 0;
    if (currentScheduled <= FATIGUE_CAP) continue;

    // Trim activities: keep highest-priority, shortest-duration items first
    const existingActs = dayActivityMap.get(si) ?? [];
    const sorted = [...existingActs].sort((a, b) => {
      if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
      return a.durationMinutes - b.durationMinutes;
    });

    let total = 0;
    const kept:   PlannerActivity[] = [];
    const excess: PlannerActivity[] = [];
    for (const act of sorted) {
      if (total + act.durationMinutes <= FATIGUE_CAP) {
        kept.push(act);
        total += act.durationMinutes;
      } else {
        excess.push(act);
      }
    }

    if (excess.length > 0) {
      dayActivityMap.set(si, kept);
      fatigueCappedDays.add(si);
      const res = passResults.get(si);
      if (res) {
        res.scheduledMin = total;
        // Merge excess into droppedActs so they flow into the rebalancer
        res.droppedActs.push(...excess);
      }
    }
  }

  // ── Rebalance: redistribute overflow to lighter days in same city segment ──
  // Sources of overflow:
  //   - "Could not fit" from Pass 1 scheduling (time window constraints)
  //   - Excess trimmed by fatigue enforcement above
  //
  // CITY GUARD: activities only move to days within the same city segment.
  // For multi-city trips with coordinates, nearestCitySegment() validates this.

  const overflowBySegment = new Map<number, PlannerActivity[]>();

  for (let si = 0; si < schedulingDays.length; si++) {
    const result = passResults.get(si);
    if (!result || result.droppedActs.length === 0) continue;

    const segIdx = getSegmentIndexForDay(citySegments, schedulingDays[si].dayIndex);
    if (segIdx === -1) continue;

    if (!overflowBySegment.has(segIdx)) overflowBySegment.set(segIdx, []);
    overflowBySegment.get(segIdx)!.push(...result.droppedActs);
  }

  // needsReschedule: days modified by rebalancing OR fatigue trimming
  const needsReschedule = new Set<number>(fatigueCappedDays);

  for (const [segIdx, overflow] of overflowBySegment) {
    const seg = citySegments[segIdx];
    if (!seg) continue;

    overflow.sort((a, b) => {
      if (a.userPriority !== b.userPriority) return a.userPriority - b.userPriority;
      return a.durationMinutes - b.durationMinutes;
    });

    const segSchedDays = schedulingDays
      .map((b, si) => ({ b, si }))
      .filter(({ b }) => b.dayIndex >= seg.startDay && b.dayIndex < seg.endDay)
      .sort((a, b) => (passResults.get(a.si)?.scheduledMin ?? 0) - (passResults.get(b.si)?.scheduledMin ?? 0));

    for (const act of overflow) {
      // City guard: verify activity belongs to this segment's city
      if (segmentsHaveCoords && act.hasRealCoords !== false) {
        const actSegIdx = nearestCitySegment(act.location.lat, act.location.lng, citySegments);
        if (actSegIdx !== segIdx) {
          console.log(
            `[CITY-GUARD] REJECT rebalance: "${act.title}" nearest=${citySegments[actSegIdx]?.city ?? "?"} ` +
            `≠ segment=${seg.city} (hasRealCoords=${String(act.hasRealCoords ?? true)})`,
          );
          continue; // wrong city — permanently drop
        }
      } else if (isMultiCity) {
        console.log(
          `[CITY-GUARD] SKIP guard for "${act.title}" (hasRealCoords=${String(act.hasRealCoords ?? true)}, ` +
          `segmentsHaveCoords=${segmentsHaveCoords}) — no coordinate check possible`,
        );
      }

      for (const { b, si } of segSchedDays) {
        if (b.isArrivalDay   && act.durationMinutes > 90) continue;
        if (b.isDepartureDay && act.durationMinutes > 60) continue;

        const current = passResults.get(si)?.scheduledMin ?? 0;
        const cap     = adjustedCaps.get(si) ?? 360;

        if (current + act.durationMinutes <= cap) {
          const existing = dayActivityMap.get(si) ?? [];
          if (!existing.some((a) => a.sourceId === act.sourceId)) {
            dayActivityMap.set(si, [...existing, act]);
            needsReschedule.add(si);
            const res = passResults.get(si);
            if (res) res.scheduledMin += act.durationMinutes;
          }
          break;
        }
      }
    }
  }

  // ── Pass 2: Re-schedule modified days ─────────────────────────────────────
  for (const si of needsReschedule) {
    const { slots, dropped, scheduledMin } = runScheduleDay(
      si, schedulingDays, citySegments, dayActivityMap,
      hotelLocation, transitMode, preferences, trip.city,
    );
    passResults.set(si, { slots, droppedActs: [], scheduledMin });
    for (const d of dropped) allDropped.push(d);
  }

  // ── Build final day array with fatigue tracking ───────────────────────────
  let cumulativeFatigue = 0;

  const days: PlannedDay[] = boundaries.map((boundary) => {
    const si     = schedulingDays.findIndex((d) => d.dayIndex === boundary.dayIndex);
    const result = si >= 0 ? passResults.get(si) : null;
    const slots  = result?.slots ?? [];

    const dayCity       = getCityForDay(citySegments, boundary.dayIndex, trip.city);
    const rawActs       = si >= 0 ? (dayActivityMap.get(si) ?? []) : [];
    const dayActivities = boostLandmarks(rawActs, dayCity);

    const scheduledActivities = slots.filter((s) => s.kind === "activity");
    const activityMinutes     = scheduledActivities.reduce((s, sl) => s + sl.durationMinutes, 0);
    const activityHours       = activityMinutes / 60;

    if (activityHours >= 8)      cumulativeFatigue += 3;
    else if (activityHours >= 6) cumulativeFatigue += 1;
    else if (activityHours <= 4) cumulativeFatigue = Math.max(0, cumulativeFatigue - 2);

    const availableHours = (boundary.effectiveEndMinutes - boundary.effectiveStartMinutes) / 60;
    if (dayActivities.length > 0 && scheduledActivities.length < dayActivities.length) {
      const dropCount = dayActivities.length - scheduledActivities.length;
      conflicts.push({
        type:        "capacity",
        description: `Day ${boundary.dayIndex + 1}: ${dropCount} activit${dropCount > 1 ? "ies" : "y"} moved or dropped`,
        suggestion:  "Activities redistributed to lighter days automatically.",
      });
    }
    if (availableHours < 4 && scheduledActivities.length < dayActivities.length) {
      conflicts.push({
        type:        "short_day",
        description: `Day ${boundary.dayIndex + 1} has only ${availableHours.toFixed(1)}h available`,
        suggestion:  "Consider moving some activities to adjacent days.",
      });
    }

    const dayWarnings: DayWarning[] = [];
    const foodSlots    = slots.filter((s) => s.kind === "activity" && s.category === "food").length;
    const transitSlots = slots.filter((s) => s.kind === "free_time" && s.transit != null).length;
    const lastSlotEnd  = slots.length > 0 ? slots[slots.length - 1].endMinutes : 0;
    const paceCap      = preferences.pace === "packed" ? 8 : preferences.pace === "relaxed" ? 5 : 6;

    if (scheduledActivities.length > paceCap) {
      dayWarnings.push({ type: "packed", message: `${scheduledActivities.length} activities — full day. Drop one for breathing room.` });
    }
    if (foodSlots > (preferences.isFoodFocused ? 3 : 2)) {
      dayWarnings.push({ type: "food_heavy", message: `${foodSlots} food stops — swap one for a landmark.` });
    }
    if (transitSlots >= 3) {
      dayWarnings.push({ type: "transit_heavy", message: "Multiple transit hops — group nearby attractions." });
    }
    if (lastSlotEnd > 22 * 60) {
      dayWarnings.push({ type: "late_night", message: "Schedule runs past 10 PM." });
    }
    if (boundary.isArrivalDay && scheduledActivities.length >= 3) {
      dayWarnings.push({ type: "flight_recovery", message: "Arrival day — capped at 2.5h of activities to manage jet lag." });
    }
    if (cumulativeFatigue > 10) {
      dayWarnings.push({
        type:    "packed",
        message: `Fatigue score ${cumulativeFatigue} — tomorrow is capped at 4h for recovery.`,
      });
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

  // ── Scheduling-complete summary ────────────────────────────────────────────
  if (isMultiCity) {
    console.log("\n[SCHEDULING-COMPLETE] ────────────────────────────────────────");
    console.log(`  Activities in: ${schedulableActivities.length} | scheduled: ${totalScheduled} | dropped: ${allDropped.length}`);
    for (const d of days) {
      const acts = d.slots.filter((s) => s.kind === "activity").map((s) => s.title);
      console.log(
        `  Day ${String(d.dayIndex + 1).padStart(2)} (${(d.cityLabel ?? "?").padEnd(12)}) ` +
        `${d.totalActivityMinutes}min | ${acts.length > 0 ? acts.join(", ") : "(no activities)"}`,
      );
    }
    console.log("──────────────────────────────────────────────────────────────\n");
  }

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

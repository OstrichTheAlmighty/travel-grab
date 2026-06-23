import Anthropic from "@anthropic-ai/sdk";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CityConfig {
  name: string;
  days: number;
  order: number;
}

interface ActivityInput {
  sourceId: string;
  title: string;
  category: string;
  estimatedDurationHours: number;
  isFullDay?: boolean;
  city?: string;  // saved city from the Activities page search context
}

interface ItineraryRequest {
  startDate: string;
  endDate: string;
  cities: CityConfig[];
  activities: ActivityInput[];
  userPreferences: {
    pace: "relaxed" | "moderate" | "packed";
    interests: string[];
    budgetLevel?: "budget" | "moderate" | "premium";
    wakeTime?: string;            // "HH:MM" 24h — from trip preferences
    cuisinePreferences?: string[]; // e.g. ["Street food", "Ramen & noodles"]
  };
  flights?: {
    outboundArrivesAt?: string;
    returnDepartsAt?: string;
    arrivalAirport?: string;
    departureAirport?: string;
  };
}

export interface DroppedActivity {
  sourceId: string;
  title: string;
  reason: string;
}

interface ClaudeScheduleItem {
  activity: string;
  time: string;
  duration: string;
  type: string;
  notes?: string;
}

interface ClaudeDay {
  dayIndex: number;
  date: string;
  city: string;
  theme: string;
  schedule: ClaudeScheduleItem[];
}

interface ClaudeItinerary {
  days: ClaudeDay[];
}

export interface GenerateItineraryResult extends ClaudeItinerary {
  _dropped: DroppedActivity[];
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateItinerary(input: ItineraryRequest): Promise<GenerateItineraryResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt =
    "You are a travel itinerary generator. Output ONLY valid JSON — no markdown, no backticks, no prose.";

  const userPrompt = buildPrompt(input);

  const response = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 4000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const stopReason = response.stop_reason;
  const content    = response.content[0];

  if (!content || content.type !== "text") throw new Error(`Unexpected response type: ${content?.type}`);

  let rawText = content.text.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  console.log(`[generateItinerary] stop_reason=${stopReason} chars=${rawText.length}`);

  let itinerary: ClaudeItinerary;

  if (stopReason === "max_tokens") {
    console.warn("[generateItinerary] Response truncated — attempting recovery");
    const recovered = recoverTruncatedJson(rawText) as ClaudeItinerary | null;
    if (recovered) {
      console.log("[generateItinerary] Recovery succeeded");
      itinerary = recovered;
    } else {
      throw new Error(
        `Claude response truncated at ${rawText.length} chars. First 500: ${rawText.slice(0, 500)}`,
      );
    }
  } else {
    try {
      itinerary = JSON.parse(rawText) as ClaudeItinerary;
    } catch (err) {
      const e = err as Error;
      console.error("[generateItinerary] JSON.parse failed:", e.message);
      console.error("[generateItinerary] Raw (first 1000):", rawText.slice(0, 1000));
      console.error("[generateItinerary] Raw (last  500):",  rawText.slice(-500));
      throw new Error(`JSON parse failed: ${e.message}. Last 200 chars: ${rawText.slice(-200)}`);
    }
  }

  // ── Post-processing ────────────────────────────────────────────────────────

  // 1. Remove duplicates (handles shrine/jinja/temple semantic equivalence)
  const { cleaned: deduped, duplicateDropped } = deduplicateSchedule(itinerary);

  // 2. Remove activities placed in the wrong city
  const { cleaned: geoValidated, geoViolations } = validateGeography(deduped, input);

  // 3. Remove last-day activities that run into the flight check-in window
  const { cleaned, lateViolations } = validateLastDayTimeline(geoValidated, input.flights);

  // 4. Find input activities Claude omitted entirely
  const missed = computeMissed(input.activities, cleaned);

  const dropped: DroppedActivity[] = [...duplicateDropped, ...geoViolations, ...lateViolations, ...missed];

  // ── Logging ───────────────────────────────────────────────────────────────
  const scheduledCount = (cleaned.days ?? [])
    .flatMap((d) => (d.schedule ?? []).filter((s) => s.type === "activity"))
    .length;

  console.log(
    `[generateItinerary] input=${input.activities.length} scheduled=${scheduledCount}` +
    ` dupes=${duplicateDropped.length} geo_violations=${geoViolations.length}` +
    ` late_violations=${lateViolations.length} missed=${missed.length}`,
  );
  if (duplicateDropped.length > 0) {
    console.log("[generateItinerary] Duplicates removed:", duplicateDropped.map((d) => d.title).join(" | "));
  }
  if (geoViolations.length > 0) {
    console.log("[generateItinerary] Geo violations:", geoViolations.map((d) => d.title).join(" | "));
  }
  if (lateViolations.length > 0) {
    console.log("[generateItinerary] Late-day violations:", lateViolations.map((d) => d.title).join(" | "));
  }
  if (missed.length > 0) {
    console.log("[generateItinerary] Not scheduled:", missed.map((d) => d.title).join(" | "));
  }

  return { ...cleaned, _dropped: dropped };
}

// ── Post-processing helpers ────────────────────────────────────────────────────

/**
 * Produces a dedup key that treats semantic equivalents as identical:
 *   - Shrine synonyms: jinja, jingu, taisha → "shrine"
 *   - Temple synonyms: dera, tera → "temple"
 *   - Subtitles after " - " or " – " are stripped
 *   - Generic descriptors like "Main Sanctuary" are stripped
 */
function toDedupeKey(title: string): string {
  let s = title.toLowerCase();
  // Unify shrine/temple synonyms while word boundaries are still clear
  s = s.replace(/\bjinja\b/g,  "shrine")
       .replace(/\bjingu\b/g,  "shrine")
       .replace(/\btaisha\b/g, "shrine")
       .replace(/\bdera\b/g,   "temple")
       .replace(/\btera\b/g,   "temple");
  // Strip subtitles after spaced dashes (not hyphens within a name like "To-ji")
  s = s.replace(/\s[-–—]\s.+$/, "");
  // Strip trailing generic descriptors
  s = s.replace(/\b(main sanctuary|hall of worship|inner sanctuary|outer shrine|main hall)\b.*/g, "");
  s = s.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  return s;
}

function deduplicateSchedule(itinerary: ClaudeItinerary): {
  cleaned: ClaudeItinerary;
  duplicateDropped: DroppedActivity[];
} {
  const seen = new Set<string>();
  const duplicateDropped: DroppedActivity[] = [];

  const cleanedDays = itinerary.days.map((day) => ({
    ...day,
    schedule: day.schedule.filter((item) => {
      // Meals, logistics, and transfers are allowed to recur (breakfast every day, etc.)
      if (item.type !== "activity") return true;

      const key = toDedupeKey(item.activity);
      if (seen.has(key)) {
        duplicateDropped.push({
          sourceId: "",
          title:    item.activity,
          reason:   "Duplicate: same location already scheduled on an earlier day",
        });
        return false;
      }
      seen.add(key);
      return true;
    }),
  }));

  return { cleaned: { ...itinerary, days: cleanedDays }, duplicateDropped };
}

// ── Geographic validation ──────────────────────────────────────────────────────

function normCity(city: string): string {
  return city.toLowerCase().split(",")[0].trim();
}

function citiesMatch(a: string, b: string): boolean {
  const aFirst = a.split(/[\s,]/)[0];
  const bFirst = b.split(/[\s,]/)[0];
  return aFirst === bFirst || a.includes(b) || b.includes(a);
}

function computeDayToCityMap(cities: CityConfig[]): Map<number, string> {
  const sorted = [...cities].sort((a, b) => a.order - b.order);
  const map = new Map<number, string>();
  let offset = 0;
  for (const city of sorted) {
    for (let i = 0; i < city.days; i++) {
      map.set(offset + i + 1, normCity(city.name));
    }
    offset += city.days;
  }
  return map;
}

function buildActivityCityMap(activities: ActivityInput[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of activities) {
    if (!a.city) continue;
    const city = normCity(a.city);
    map.set(toDedupeKey(a.title), city);
    map.set(normalise(a.title), city);
  }
  return map;
}

function findActivityCity(
  scheduledTitle: string,
  cityMap: Map<string, string>,
): string | null {
  const dkey = toDedupeKey(scheduledTitle);
  if (cityMap.has(dkey)) return cityMap.get(dkey)!;

  const norm = normalise(scheduledTitle);
  if (cityMap.has(norm)) return cityMap.get(norm)!;

  // Substring fallback — only when the overlapping token is specific enough (>6 chars)
  for (const [mapKey, city] of cityMap) {
    if (mapKey.length <= 6 || norm.length <= 6) continue;
    if (norm.includes(mapKey) || mapKey.includes(norm)) return city;
  }

  return null;
}

function validateGeography(
  itinerary: ClaudeItinerary,
  input: ItineraryRequest,
): { cleaned: ClaudeItinerary; geoViolations: DroppedActivity[] } {
  const dayToCity  = computeDayToCityMap(input.cities);
  const actCityMap = buildActivityCityMap(input.activities);
  const geoViolations: DroppedActivity[] = [];

  const cleanedDays = itinerary.days.map((day) => {
    const expectedCity = dayToCity.get(day.dayIndex);
    if (!expectedCity) return day;

    const schedule = day.schedule.filter((item) => {
      if (item.type !== "activity") return true;

      const actCity = findActivityCity(item.activity, actCityMap);
      if (!actCity) return true; // Unknown activity — trust Claude

      if (!citiesMatch(actCity, expectedCity)) {
        geoViolations.push({
          sourceId: "",
          title:    item.activity,
          reason:   `Geographic: activity is in ${actCity} but this is a ${day.city} day`,
        });
        console.error(
          `[geo-validate] Removed "${item.activity}" from Day ${day.dayIndex} (${day.city}): ` +
          `belongs in ${actCity}`,
        );
        return false;
      }
      return true;
    });

    return { ...day, schedule };
  });

  return { cleaned: { ...itinerary, days: cleanedDays }, geoViolations };
}

// ── Last-day timeline validation ───────────────────────────────────────────────

function validateLastDayTimeline(
  itinerary: ClaudeItinerary,
  flights: ItineraryRequest["flights"],
): { cleaned: ClaudeItinerary; lateViolations: DroppedActivity[] } {
  if (!flights?.returnDepartsAt) return { cleaned: itinerary, lateViolations: [] };

  const dep    = new Date(flights.returnDepartsAt);
  const depStr = dep.toTimeString().slice(0, 5);
  const [dh, dm] = depStr.split(":").map(Number);
  const depMin    = dh * 60 + dm;
  const cutoffMin = depMin - 120; // 2h buffer for airport

  const lateViolations: DroppedActivity[] = [];
  const lastDayIndex = Math.max(...itinerary.days.map((d) => d.dayIndex));

  const cleanedDays = itinerary.days.map((day) => {
    if (day.dayIndex !== lastDayIndex) return day;

    const schedule = day.schedule.filter((item) => {
      // Never remove airport / departure logistics
      const t = (item.activity ?? "").toLowerCase();
      if (item.type === "logistics" || item.type === "transfer") return true;
      if (t.includes("airport") || t.includes("departure") || t.includes("depart")) return true;

      const [sh, sm]  = (item.time ?? "09:00").split(":").map(Number);
      const startMin  = (sh ?? 9) * 60 + (sm ?? 0);
      const durMatch  = item.duration?.match(/(\d+(?:\.\d+)?)\s*h/i);
      const minMatch  = item.duration?.match(/(\d+)\s*m(?!o)/i);
      let durMin      = 0;
      if (durMatch) durMin += Math.round(parseFloat(durMatch[1]) * 60);
      if (minMatch) durMin += parseInt(minMatch[1]);
      if (!durMin)  durMin  = 60;
      const endMin = startMin + durMin;

      if (endMin > cutoffMin) {
        const endH = String(Math.floor(endMin / 60)).padStart(2, "0");
        const endM = String(endMin % 60).padStart(2, "0");
        const cutH = String(Math.floor(cutoffMin / 60)).padStart(2, "0");
        const cutM = String(cutoffMin % 60).padStart(2, "0");
        lateViolations.push({
          sourceId: "",
          title:    item.activity,
          reason:   `Last-day conflict: ends at ${endH}:${endM} but airport check-in needed by ${cutH}:${cutM}`,
        });
        console.warn(
          `[timeline-validate] Removed "${item.activity}" from last day: ` +
          `ends ${endH}:${endM}, cutoff ${cutH}:${cutM}`,
        );
        return false;
      }
      return true;
    });

    return { ...day, schedule };
  });

  return { cleaned: { ...itinerary, days: cleanedDays }, lateViolations };
}

// ── Missed-activity computation ────────────────────────────────────────────────

function computeMissed(
  inputActivities: ActivityInput[],
  itinerary: ClaudeItinerary,
): DroppedActivity[] {
  // Collect every activity title Claude scheduled (normalised)
  const scheduled = new Set<string>();
  for (const day of itinerary.days ?? []) {
    for (const item of day.schedule ?? []) {
      if (item.activity) scheduled.add(normalise(item.activity));
    }
  }

  return inputActivities
    .filter((a) => {
      const title = normalise(a.title);
      if (scheduled.has(title)) return false;
      for (const s of scheduled) {
        if (s.includes(title) || title.includes(s)) return false;
      }
      return true;
    })
    .map((a) => ({
      sourceId: a.sourceId,
      title:    a.title,
      reason:   `No time slot available: ${a.title} (${Math.round(a.estimatedDurationHours * 60)}m) couldn't fit — check pace preference in Preferences`,
    }));
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function recoverTruncatedJson(text: string): object | null {
  try { return JSON.parse(text); } catch { /* fall through */ }

  const lastComma = text.lastIndexOf("},");
  if (lastComma !== -1) {
    try { return JSON.parse(text.slice(0, lastComma + 1) + "]}"); } catch { /* fall through */ }
  }

  const lastBrace = text.lastIndexOf("}");
  if (lastBrace !== -1) {
    try { return JSON.parse(text.slice(0, lastBrace + 1)); } catch { /* fall through */ }
  }

  return null;
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildPrompt(input: ItineraryRequest): string {
  const sortedCities = [...input.cities].sort((a, b) => a.order - b.order);
  const totalDays    = sortedCities.reduce((s, c) => s + c.days, 0);
  const prefs        = input.userPreferences;

  // ── Wake time ────────────────────────────────────────────────────────────
  const wakeStr = prefs.wakeTime ?? "08:00";
  const [wakeH, wakeM] = wakeStr.split(":").map(Number);
  const wakeMin = wakeH * 60 + (wakeM ?? 0);
  // First sightseeing slot: wake + 45 min for breakfast
  const sightH = String(Math.floor((wakeMin + 45) / 60)).padStart(2, "0");
  const sightM = String((wakeMin + 45) % 60).padStart(2, "0");

  // ── Pace → max activity count per day ───────────────────────────────────
  // Activities counted: sightseeing = 1, meal = 1, casual stroll = 0.5
  // NOT counted: city-to-city transport, hotel check-in/out
  const paceActivityCount: Record<string, { min: number; max: number }> = {
    relaxed:  { min: 2, max: 3 },
    moderate: { min: 4, max: 5 },
    packed:   { min: 6, max: 8 },
  };
  const paceRange = paceActivityCount[prefs.pace] ?? paceActivityCount.moderate;

  // ── City schedule with date ranges ──────────────────────────────────────
  const start = new Date(input.startDate + "T00:00:00");
  let dayOffset = 0;
  const cityScheduleLines: string[] = [];
  const cityDateRanges: { name: string; startDay: number; endDay: number }[] = [];

  for (const city of sortedCities) {
    const from = new Date(start);
    from.setDate(from.getDate() + dayOffset);
    const to   = new Date(from);
    to.setDate(to.getDate() + city.days - 1);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr   = to.toISOString().slice(0, 10);
    cityScheduleLines.push(
      `  Days ${dayOffset + 1}–${dayOffset + city.days} (${fromStr} → ${toStr}): ${city.name}`,
    );
    cityDateRanges.push({ name: city.name, startDay: dayOffset + 1, endDay: dayOffset + city.days });
    dayOffset += city.days;
  }

  // ── Activities grouped by city ───────────────────────────────────────────
  const cityGroups = new Map<string, string[]>();
  const flexGroup: string[] = [];

  for (const city of sortedCities) {
    cityGroups.set(city.name, []);
  }

  for (const a of input.activities) {
    const savedCity = a.city?.toLowerCase().split(",")[0].trim() ?? "";
    const matched = savedCity
      ? sortedCities.find(
          (c) =>
            c.name.toLowerCase().includes(savedCity) ||
            savedCity.includes(c.name.toLowerCase().split(",")[0].trim()),
        )
      : null;

    const range = matched ? cityDateRanges.find((r) => r.name === matched.name) : null;
    const cityTag = range
      ? `[${matched!.name.split(",")[0].toUpperCase()}-ONLY, Days ${range.startDay}–${range.endDay}]`
      : "[FLEX]";

    const line =
      `  - [${a.sourceId.slice(0, 8)}] ${a.title} ${cityTag}` +
      ` (${a.estimatedDurationHours}h, ${a.category})` +
      (a.isFullDay ? " [FULL-DAY — needs its own day]" : "");

    if (matched) {
      cityGroups.get(matched.name)!.push(line);
    } else {
      flexGroup.push(line);
    }
  }

  const activityBlock = [
    ...sortedCities.map((c) => {
      const acts = cityGroups.get(c.name) ?? [];
      if (acts.length === 0) return null;
      const range = cityDateRanges.find((r) => r.name === c.name)!;
      return `${c.name} — schedule ONLY on Days ${range.startDay}–${range.endDay}:\n${acts.join("\n")}`;
    }).filter(Boolean),
    ...(flexGroup.length > 0 ? [`Flexible (any city):\n${flexGroup.join("\n")}`] : []),
  ].join("\n\n");

  // ── Flight constraints ───────────────────────────────────────────────────
  let flightBlock = "";
  if (input.flights?.outboundArrivesAt || input.flights?.returnDepartsAt) {
    flightBlock = "\n\nFLIGHT CONSTRAINTS — HARD RULES:";

    if (input.flights.outboundArrivesAt) {
      const arr  = new Date(input.flights.outboundArrivesAt);
      const arrT = arr.toTimeString().slice(0, 5);
      const [h, m] = arrT.split(":").map(Number);
      const firstT = `${String(Math.min(23, h + 2)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const apNote = input.flights.arrivalAirport ? ` at ${input.flights.arrivalAirport}` : "";
      flightBlock +=
        `\n- Day 1 (${input.startDate}): Outbound lands${apNote} at ${arrT}.` +
        ` No sightseeing before ${firstT}. Begin with: arrival → immigration → hotel check-in.`;
    }

    if (input.flights.returnDepartsAt) {
      const dep  = new Date(input.flights.returnDepartsAt);
      const depT = dep.toTimeString().slice(0, 5);
      const [h, m] = depT.split(":").map(Number);
      const leaveT = `${String(Math.max(0, h - 2)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const ap = input.flights.departureAirport ?? "departure airport";
      flightBlock +=
        `\n- Last day (${input.endDate}): Return departs from ${ap} at ${depT}.` +
        ` Leave hotel by ${leaveT}. No activity may end after ${leaveT}.` +
        ` Last schedule item must be departure to ${ap}. Use exactly "${ap}" — no other airport.`;
    }
  }

  // ── Budget rules ─────────────────────────────────────────────────────────
  let budgetBlock = "";
  if (prefs.budgetLevel === "budget") {
    budgetBlock = `

BUDGET-SAVVY RULES — NON-NEGOTIABLE:
- EXCLUDE theme parks entirely (Tokyo Disneyland, DisneySea, Universal Studios Japan, etc.)
- EXCLUDE paid attractions over $40/person unless they are a food/culinary experience
- Meals: average $10–20/person — prioritize street food, ramen shops, standing sushi bars, izakayas, food markets
- Prioritize FREE attractions: temples, shrines, parks, neighborhoods, markets, viewpoints
- ALLOWED: cooking classes ($40–50 ok), food tours ($25–45 ok), market visits (free–$15)
- DO NOT suggest expensive omakase, high-end kaiseki, or luxury hotel dining`;
  } else if (prefs.budgetLevel === "premium") {
    budgetBlock = `

PREMIUM EXPERIENCE RULES:
- Prioritize high-end, exclusive, and unique experiences
- Include fine dining: omakase sushi, kaiseki, or Michelin-starred restaurants
- Prefer private tours, skip crowded general-admission queues where premium options exist
- Include at least one luxury or bucket-list experience per city`;
  }

  // ── Food integration ──────────────────────────────────────────────────────
  const isFoodFocused = prefs.interests.some((i) =>
    i === "food_focused" || i === "food" || i === "culinary",
  );
  let foodBlock = "";
  if (isFoodFocused) {
    foodBlock = `

FOOD EXPERIENCES — AUTO-INCLUDE (in addition to listed activities):
For each city, proactively schedule at least:
1. Morning: a food market, fish market, or breakfast specialty spot (specific real name)
2. Lunch: a local specialty restaurant — ramen counter, sushi stall, noodle shop, or bento spot (real place name)
3. Dinner: an izakaya, yakitori bar, or food-focused evening experience (real place name)
These are mandatory food anchors per city. Label them type "meal".`;
  }

  // ── Cuisine preferences ───────────────────────────────────────────────────
  let cuisineBlock = "";
  const cuisine = prefs.cuisinePreferences ?? [];
  if (cuisine.length > 0) {
    const rules: string[] = [];
    if (cuisine.some((c) => c.toLowerCase().includes("street food")))
      rules.push("Include at least one street food stall or night market food alley");
    if (cuisine.some((c) => c.toLowerCase().includes("ramen")))
      rules.push("Schedule a dedicated ramen restaurant visit (real shop name, not generic)");
    if (cuisine.some((c) => c.toLowerCase().includes("izakaya")))
      rules.push("Schedule at least one izakaya evening — specifically an izakaya-style dinner");
    if (cuisine.some((c) => c.toLowerCase().includes("cooking")))
      rules.push("If schedule permits, include a cooking class (sushi-making, ramen workshop, tempura class)");
    if (cuisine.some((c) => c.toLowerCase().includes("sushi")))
      rules.push("Include a sushi counter or sushi market experience");
    if (cuisine.some((c) => c.toLowerCase().includes("fine dining") || c.toLowerCase().includes("omakase")))
      rules.push("Include one omakase or high-end Japanese dining experience");
    if (cuisine.some((c) => c.toLowerCase().includes("market")))
      rules.push("Include at least one indoor or outdoor food market visit");
    if (rules.length > 0) {
      cuisineBlock = `

CUISINE PREFERENCES (${cuisine.join(", ")}):
${rules.map((r) => `- ${r}`).join("\n")}`;
    }
  }

  // Fish market timing: only schedulable if wake time allows arriving by 06:30
  const fishMarketNote = wakeH >= 7
    ? " Note: fish markets like Tsukiji require 06:00 arrival — skip them if wake time is 07:00 or later."
    : "";

  return `Generate a ${totalDays}-day itinerary.

SCHEDULE:
${cityScheduleLines.join("\n")}

ACTIVITIES (${input.activities.length} — each tagged with city/day range):
${activityBlock.length > 0 ? activityBlock : "  (none — build from scratch)"}

PACE: ${prefs.pace} → ${paceRange.min}–${paceRange.max} countable activities/day
Count: sightseeing=1, meal=1, stroll=0.5, transport=0, hotel=0
Dinner (18:00–20:30) excluded from count. Interests: ${prefs.interests.join(", ")}${prefs.budgetLevel ? ` | Budget: ${prefs.budgetLevel}` : ""}

TIMING: Wake ${wakeStr}; sightseeing from ${sightH}:${sightM}.${fishMarketNote}
Meals: breakfast ${wakeStr}–10:00 | lunch 11:30–14:00 | dinner 18:00–20:30

CONSTRAINTS:
1. Dedup — each place once only across all days ("Itsukushima Jinja" = "Itsukushima Shrine" = same)
2. Geo — [CITY-ONLY, Days X–Y] tags absolute; never schedule outside tagged days
3. Full-day [FULL-DAY] events get their own day (count as 1 + dinner)
4. Transfer days: transit = 0 count; destination activities only after arrival${budgetBlock}${foodBlock}${cuisineBlock}${flightBlock}

Return ONLY this JSON — no text, no markdown:
{"days":[{"dayIndex":1,"date":"YYYY-MM-DD","city":"City, Country","theme":"2–4 word label","schedule":[{"time":"HH:MM","activity":"...","duration":"Xh","type":"activity|meal|transfer","notes":"5 words max"}]}]}`;
}
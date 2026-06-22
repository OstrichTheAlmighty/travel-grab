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
    budgetLevel?: "budget" | "mid" | "luxury";
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
  reasoning?: string;
  schedule: ClaudeScheduleItem[];
}

interface ClaudeItinerary {
  summary?: { theme: string; highlights: string[] };
  days: ClaudeDay[];
}

export interface GenerateItineraryResult extends ClaudeItinerary {
  _dropped: DroppedActivity[];
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateItinerary(input: ItineraryRequest): Promise<GenerateItineraryResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt =
    "You are an expert travel itinerary planner. " +
    "Output ONLY a single valid JSON object — no markdown, no backticks, no text before or after the JSON.";

  const userPrompt = buildPrompt(input);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const stopReason = response.stop_reason;
  const content    = response.content[0];

  if (content.type !== "text") throw new Error(`Unexpected response type: ${content.type}`);

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

  // 1. Remove duplicate activities (Claude sometimes schedules the same place twice)
  const { cleaned, duplicateDropped } = deduplicateSchedule(itinerary);

  // 2. Compute which input activities were not scheduled at all
  const missed = computeMissed(input.activities, cleaned);

  const dropped: DroppedActivity[] = [...duplicateDropped, ...missed];

  // ── Logging ───────────────────────────────────────────────────────────────
  const scheduledCount = (cleaned.days ?? [])
    .flatMap((d) => (d.schedule ?? []).filter((s) => s.type === "activity"))
    .length;

  console.log(
    `[generateItinerary] input=${input.activities.length} scheduled=${scheduledCount}` +
    ` dupes_removed=${duplicateDropped.length} missed=${missed.length}`,
  );
  if (duplicateDropped.length > 0) {
    console.log("[generateItinerary] Duplicates removed:", duplicateDropped.map((d) => d.title).join(" | "));
  }
  if (missed.length > 0) {
    console.log("[generateItinerary] Not scheduled:", missed.map((d) => d.title).join(" | "));
  }

  return { ...cleaned, _dropped: dropped };
}

// ── Post-processing helpers ────────────────────────────────────────────────────

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

      const key = normalise(item.activity);
      if (seen.has(key)) {
        duplicateDropped.push({
          sourceId: "",
          title:    item.activity,
          reason:   "Duplicate — already scheduled on an earlier day (removed)",
        });
        return false;
      }
      seen.add(key);
      return true;
    }),
  }));

  return { cleaned: { ...itinerary, days: cleanedDays }, duplicateDropped };
}

function computeMissed(
  inputActivities: ActivityInput[],
  itinerary: ClaudeItinerary,
): DroppedActivity[] {
  // Collect every activity title Claude scheduled (normalised)
  const scheduled = new Set<string>();
  for (const day of itinerary.days ?? []) {
    for (const item of day.schedule ?? []) {
      if (item.activity) {
        const n = normalise(item.activity);
        scheduled.add(n);
        // Add significant words so "Senso-ji Temple" matches "Senso-ji"
        n.split(/[\s–\-/]+/).forEach((w) => w.length > 4 && scheduled.add(w));
      }
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
      reason:   "Not scheduled — insufficient time or not assigned by AI",
    }));
}

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
    const line =
      `  - [${a.sourceId.slice(0, 8)}] ${a.title}` +
      ` (${a.estimatedDurationHours}h, ${a.category})` +
      (a.isFullDay ? " [FULL-DAY — needs its own day]" : "");

    // Match saved city to one of the trip cities
    const savedCity = a.city?.toLowerCase().split(",")[0].trim() ?? "";
    const matched = savedCity
      ? sortedCities.find(
          (c) =>
            c.name.toLowerCase().includes(savedCity) ||
            savedCity.includes(c.name.toLowerCase().split(",")[0].trim()),
        )
      : null;

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
      return `${c.name} (Days ${range.startDay}–${range.endDay}):\n${acts.join("\n")}`;
    }).filter(Boolean),
    ...(flexGroup.length > 0 ? [`Any city (schedule where they fit):\n${flexGroup.join("\n")}`] : []),
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
        ` Leave hotel by ${leaveT}. Last schedule item must be departure to ${ap}. Use exactly "${ap}" — no other airport.`;
    }
  }

  return `Generate a ${totalDays}-day travel itinerary.

CITY SCHEDULE (activities MUST stay in their assigned city on the correct days):
${cityScheduleLines.join("\n")}

ACTIVITIES (${input.activities.length} total — schedule as many as possible):
${activityBlock}

DUPLICATE RULE — CRITICAL: Each activity ID (shown in brackets) can appear AT MOST ONCE across all ${totalDays} days. Never schedule the same place twice, even under a slightly different name.

RESTAURANT TIMING RULE: Fish markets, breakfast cafes, and morning markets → 7am–12pm only. Lunch restaurants → 11:30am–2pm. Dinner → 5:30pm–8:30pm.

GEOGRAPHIC RULE: Only schedule city-assigned activities on that city's days. Do not backtrack (e.g., do not insert a Tokyo activity into a Kyoto day or vice versa).

PACE: ${input.userPreferences.pace} | Interests: ${input.userPreferences.interests.join(", ")}${input.userPreferences.budgetLevel ? ` | Budget: ${input.userPreferences.budgetLevel}` : ""}${flightBlock}

General rules:
- Meals: breakfast 7-9am, lunch 12-2pm, dinner 6-8pm
- Full-day activities [FULL-DAY] need their own day with only dinner added
- Transition days: include a travel/transfer item when moving city to city
- Keep "notes" and "reasoning" to 1 sentence each

Return ONLY this JSON structure (no other text, no markdown):
{
  "summary": {"theme": "...", "highlights": ["...", "..."]},
  "days": [
    {
      "dayIndex": 1,
      "date": "YYYY-MM-DD",
      "city": "City, Country",
      "theme": "...",
      "reasoning": "1 sentence",
      "schedule": [
        {"time": "HH:MM", "activity": "...", "duration": "Xh", "type": "activity|meal|logistics|transfer", "notes": "1 sentence"}
      ]
    }
  ]
}`;
}

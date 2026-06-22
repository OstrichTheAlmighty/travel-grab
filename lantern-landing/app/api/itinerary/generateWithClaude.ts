import Anthropic from "@anthropic-ai/sdk";

interface ItineraryRequest {
  startDate: string;
  endDate: string;
  cities: {
    name: string;
    days: number;
    order: number;
  }[];
  activities: {
    sourceId: string;
    title: string;
    category: string;
    estimatedDurationHours: number;
    isFullDay?: boolean;
  }[];
  userPreferences: {
    pace: "relaxed" | "moderate" | "packed";
    interests: string[];
    budgetLevel?: "budget" | "mid" | "luxury";
  };
  flights?: {
    outboundArrivesAt?: string;   // ISO timestamp — when flight lands on day 1
    returnDepartsAt?: string;     // ISO timestamp — when return flight leaves on last day
    arrivalAirport?: string;      // IATA code for inbound landing airport
    departureAirport?: string;    // IATA code for return flight departure airport
  };
}

interface DroppedActivity {
  sourceId: string;
  title: string;
  reason: string;
}

interface ClaudeItinerary {
  summary?: { theme: string; highlights: string[] };
  days: {
    dayIndex: number;
    date: string;
    city: string;
    theme: string;
    reasoning?: string;
    schedule: { activity: string; time: string; duration: string; type: string; notes?: string }[];
  }[];
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

  // ── Activity coverage ──────────────────────────────────────────────────────
  const dropped = computeDropped(input.activities, itinerary);
  const scheduledCount = (itinerary.days ?? [])
    .flatMap((d) => (d.schedule ?? []).filter((s) => s.type === "activity"))
    .length;

  console.log(
    `[generateItinerary] input=${input.activities.length} scheduled=${scheduledCount} dropped=${dropped.length}`,
  );
  if (dropped.length > 0) {
    console.log("[generateItinerary] Dropped activities:", dropped.map((d) => d.title).join(" | "));
  }

  return { ...itinerary, _dropped: dropped };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeDropped(
  inputActivities: ItineraryRequest["activities"],
  itinerary: ClaudeItinerary,
): DroppedActivity[] {
  // Build a normalised set of every activity title Claude scheduled
  const scheduled = new Set<string>();
  for (const day of itinerary.days ?? []) {
    for (const item of day.schedule ?? []) {
      if (item.activity) {
        const norm = item.activity.toLowerCase().trim();
        scheduled.add(norm);
        // Also add substrings so "Senso-ji Temple" matches "Senso-ji"
        norm.split(/[\s–-]+/).forEach((w) => w.length > 4 && scheduled.add(w));
      }
    }
  }

  return inputActivities
    .filter((a) => {
      const title = a.title.toLowerCase().trim();
      if (scheduled.has(title)) return false;
      // Partial match: if any scheduled item contains ≥60% of the input title
      for (const s of scheduled) {
        if (s.includes(title) || title.includes(s)) return false;
      }
      return true;
    })
    .map((a) => ({
      sourceId: a.sourceId,
      title:    a.title,
      reason:   "Not scheduled — insufficient time in itinerary",
    }));
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

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(input: ItineraryRequest): string {
  const totalDays     = input.cities.reduce((sum, c) => sum + c.days, 0);
  const citiesStr     = input.cities.map((c) => `${c.name} (${c.days} days)`).join(" → ");
  const activitiesStr = input.activities
    .map((a) => `- ${a.title} (${a.estimatedDurationHours}h, ${a.category})${a.isFullDay ? " [FULL-DAY]" : ""}`)
    .join("\n");

  // ── Flight constraint block ──────────────────────────────────────────────
  let flightBlock = "";
  if (input.flights?.outboundArrivesAt || input.flights?.returnDepartsAt) {
    flightBlock = "\n\nFLIGHT CONSTRAINTS — THESE ARE HARD RULES, DO NOT VIOLATE:";

    if (input.flights.outboundArrivesAt) {
      const arrDate = new Date(input.flights.outboundArrivesAt);
      const arrTime = arrDate.toTimeString().slice(0, 5); // "HH:MM"
      const [arrH, arrM] = arrTime.split(":").map(Number);
      const firstActH = Math.min(23, arrH + 2);
      const firstActTime = `${String(firstActH).padStart(2, "0")}:${String(arrM).padStart(2, "0")}`;
      const airportNote = input.flights.arrivalAirport
        ? ` at ${input.flights.arrivalAirport} airport`
        : "";
      flightBlock +=
        `\n- DAY 1 (${input.startDate}): Outbound flight lands${airportNote} at ${arrTime}.` +
        ` First sightseeing activity MUST NOT start before ${firstActTime}.` +
        ` Start Day 1 with: airport arrival → immigration/baggage → transit to hotel → hotel check-in.` +
        ` Only schedule light activities or dinner after ${firstActTime}.`;
    }

    if (input.flights.returnDepartsAt) {
      const depDate   = new Date(input.flights.returnDepartsAt);
      const depTime   = depDate.toTimeString().slice(0, 5); // "HH:MM"
      const [depH, depM] = depTime.split(":").map(Number);
      const transferH = Math.max(0, depH - 2);
      const transferTime = `${String(transferH).padStart(2, "0")}:${String(depM).padStart(2, "0")}`;
      const airport   = input.flights.departureAirport ?? "the departure airport";
      flightBlock +=
        `\n- LAST DAY (${input.endDate}): Return flight departs from ${airport} at ${depTime}.` +
        ` Schedule airport transfer/departure as the LAST item, leaving hotel by ${transferTime}.` +
        ` Use "${airport}" — do NOT use any other airport name.` +
        ` Only schedule morning activities that finish before ${transferTime}.`;
    }
  }

  return `Generate a ${totalDays}-day itinerary for: ${citiesStr}
Dates: ${input.startDate} to ${input.endDate}
Pace: ${input.userPreferences.pace} | Interests: ${input.userPreferences.interests.join(", ")}${input.userPreferences.budgetLevel ? ` | Budget: ${input.userPreferences.budgetLevel}` : ""}${flightBlock}

Activities to schedule (${input.activities.length} total — include as many as possible):
${activitiesStr || "(none — build a sightseeing day)"}

General rules:
- Meals: breakfast 7-9am, lunch 12-2pm, dinner 6-8pm
- Full-day activities [FULL-DAY] get their own dedicated day with only dinner added
- Account for city-to-city travel time on transition days
- Keep "notes" and "reasoning" fields to 1 sentence max

Return ONLY this JSON (no other text, no markdown fences):
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

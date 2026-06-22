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
    outboundArrivesAt: string;
    returnDepartsAt: string;
  };
}

export async function generateItinerary(input: ItineraryRequest) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an expert travel itinerary planner. Create personalized day-by-day itineraries.
Output ONLY a single valid JSON object — no markdown, no backticks, no commentary before or after.`;

  const userPrompt = buildPrompt(input);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      { role: "user", content: userPrompt },
    ],
  });

  const stopReason = response.stop_reason;
  const content    = response.content[0];

  if (content.type !== "text") {
    throw new Error(`Unexpected response type: ${content.type}`);
  }

  // Strip markdown fences if the model wrapped the response
  let rawText = content.text.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  console.log(`[generateItinerary] stop_reason=${stopReason} chars=${rawText.length}`);

  if (stopReason === "max_tokens") {
    console.warn("[generateItinerary] Response truncated — attempting recovery");
    const recovered = recoverTruncatedJson(rawText);
    if (recovered) {
      console.log("[generateItinerary] Recovery succeeded");
      return recovered;
    }
    throw new Error(
      `Claude response was truncated at ${rawText.length} chars. ` +
      `Raw (first 500): ${rawText.slice(0, 500)}`
    );
  }

  // Strip any stray backtick fences (shouldn't happen with prefill but be safe)
  let jsonText = rawText;
  if (jsonText.includes("```")) {
    jsonText = jsonText.replace(/```json\n?/g, "").replace(/```/g, "").trim();
  }

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    const parseErr = err as Error;
    console.error("[generateItinerary] JSON.parse failed:", parseErr.message);
    console.error("[generateItinerary] Raw (first 1000):", jsonText.slice(0, 1000));
    console.error("[generateItinerary] Raw (last 500):",  jsonText.slice(-500));
    throw new Error(
      `JSON parse failed: ${parseErr.message}. ` +
      `Raw snippet (last 200): ${jsonText.slice(-200)}`
    );
  }
}

// Best-effort recovery: trim to the last complete top-level key in the "days" array
function recoverTruncatedJson(text: string): object | null {
  // Try as-is first (maybe it ended cleanly)
  try { return JSON.parse(text); } catch { /* fall through */ }

  // Find the last complete day object by looking for the last "}," or "}]" pattern
  // inside the days array and close the structure around it
  const lastCompleteDay = text.lastIndexOf('},');
  if (lastCompleteDay === -1) return null;

  const truncated = text.slice(0, lastCompleteDay + 1) + "]}";
  try { return JSON.parse(truncated); } catch { /* fall through */ }

  // Wider search: close at the last complete object before the truncation point
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace === -1) return null;

  const attempt2 = text.slice(0, lastBrace + 1);
  try { return JSON.parse(attempt2); } catch { /* fall through */ }

  return null;
}

function buildPrompt(input: ItineraryRequest): string {
  const totalDays   = input.cities.reduce((sum, c) => sum + c.days, 0);
  const citiesStr   = input.cities.map((c) => `${c.name} (${c.days} days)`).join(" → ");
  const activitiesStr = input.activities
    .map((a) => `- ${a.title} (${a.estimatedDurationHours}h, ${a.category})${a.isFullDay ? " [FULL-DAY]" : ""}`)
    .join("\n");

  return `Generate a ${totalDays}-day itinerary for: ${citiesStr}
Dates: ${input.startDate} to ${input.endDate}
Pace: ${input.userPreferences.pace} | Interests: ${input.userPreferences.interests.join(", ")}${input.userPreferences.budgetLevel ? ` | Budget: ${input.userPreferences.budgetLevel}` : ""}

Activities (include ALL):
${activitiesStr || "(none — build a sightseeing day)"}

Rules:
- Meals: breakfast 7-9am, lunch 12-2pm, dinner 6-8pm
- Full-day activities get their own day with only dinner
- Account for city-to-city travel time
- Keep "notes" and "reasoning" fields SHORT (1 sentence max)

Return this exact JSON structure (no other text):
"summary":{"theme":"...","highlights":["...","..."]},
"days":[{"dayIndex":1,"date":"YYYY-MM-DD","city":"City, Country","theme":"...","reasoning":"1 sentence","schedule":[{"time":"HH:MM","activity":"...","duration":"Xh","type":"activity|meal|logistics|transfer","notes":"1 sentence"}]}]}`;
}

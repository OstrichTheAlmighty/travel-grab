import { NextRequest, NextResponse } from "next/server";
import type { TravelStyle } from "@/lib/trip-store";

const STYLE_LABELS: Record<TravelStyle, string> = {
  first_time_highlights: "first-time visitor highlights",
  food_focused:          "food and culinary experiences",
  culture_history:       "culture and history",
  hidden_gems:           "off-the-beaten-path hidden gems",
  luxury:                "luxury travel",
  budget:                "budget-conscious travel",
  family:                "family-friendly travel",
  nightlife:             "nightlife and entertainment",
  relaxed:               "slow travel and relaxation",
  packed:                "maximum experiences, packed itinerary",
};

export async function POST(req: NextRequest) {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
  }

  const body = await req.json() as {
    region:        string;
    travelStyles:  TravelStyle[];
    durationDays:  number;
    firstTime:     boolean | null;
  };

  const { region, travelStyles, durationDays, firstTime } = body;
  const days = Math.max(1, Math.min(60, durationDays || 7));

  const styleLabel = travelStyles.length > 0
    ? travelStyles.map((s) => STYLE_LABELS[s]).join(", ")
    : "general interest";

  const firstTimeStr =
    firstTime === true  ? " It's their first visit to this destination." :
    firstTime === false ? " They've been before and want something beyond the tourist trail." :
    "";

  const systemPrompt = `You are an expert travel planner. Suggest an ideal multi-city itinerary. Return ONLY valid JSON with no markdown or explanatory prose.`;

  const destinations = region.split(",").map((s) => s.trim()).filter(Boolean);
  const isMultiDestination = destinations.length > 1;
  const destinationNote = isMultiDestination
    ? `The traveler wants to visit these destinations IN THIS ORDER: ${destinations.map((d, i) => `${i + 1}. ${d}`).join("; ")}. Suggest cities within each destination in that sequence — all cities from destination 1 first, then destination 2, etc. Include at least one city per destination.`
    : `Destination: "${region}"`;

  const userPrompt = `Plan a ${days}-day trip. Travel style: ${styleLabel}.${firstTimeStr}

${destinationNote}

Return a JSON object:
{
  "cityStops": [
    { "city": "City Name, Country", "days": 3, "why": "One sentence on why this city fits this trip" }
  ],
  "summary": "One sentence describing this itinerary"
}

Rules:
- Total days across all cityStops must equal exactly ${days}
- Each city must be specific (e.g. "Kyoto, Japan" not just "Japan")
- If the input is already a specific city, return just that one city with all ${days} days
- For a single country/region, suggest 2–5 cities that form a logical travel route (minimize backtracking)
- For multiple destinations (in order), group cities by destination — visit each destination fully before moving on
- Weight city selection toward the stated travel styles`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`[suggest-cities] OpenAI HTTP ${resp.status}: ${text}`);
      return NextResponse.json({ error: "City suggestion failed" }, { status: 500 });
    }

    const data = await resp.json() as { choices: { message: { content: string } }[] };
    const content = data.choices[0]?.message.content ?? "{}";
    const parsed = JSON.parse(content) as {
      cityStops: { city: string; days: number; why: string }[];
      summary:   string;
    };

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[suggest-cities] error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to suggest cities" }, { status: 500 });
  }
}

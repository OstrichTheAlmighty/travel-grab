import Anthropic from "@anthropic-ai/sdk";

interface DropActivityInput {
  activity: {
    title: string;
    diagnostic?: {
      activityDuration?: number;
      type?: string;
      belongsInCity?: string;
    };
  };
  itinerary: {
    days: Array<{
      dayIndex: number;
      date: string;
      city: string;
      schedule: Array<{
        activity: string;
        time: string;
        duration: string;
        type: string;
      }>;
    }>;
  };
  tripPace: "relaxed" | "moderate" | "packed";
}

export interface ClaudePlacement {
  bestFitDays:     { dayIndex: number; city: string; reason: string }[];
  swapSuggestions: { dayIndex: number; city: string; replaceActivityTitle: string; replaceActivityDuration: number; reason: string }[];
  cannotFit:       boolean;
  explanation:     string;
}

export async function POST(req: Request) {
  try {
    const input = await req.json() as DropActivityInput;
    const { activity, itinerary, tripPace } = input;

    if (!activity || !itinerary) {
      return Response.json({ error: "Missing input" }, { status: 400 });
    }

    const cityHint = activity.diagnostic?.belongsInCity &&
      activity.diagnostic.belongsInCity !== "Flexible"
      ? `, which belongs in ${activity.diagnostic.belongsInCity}`
      : "";
    const durationHint = activity.diagnostic?.activityDuration
      ? ` (${activity.diagnostic.activityDuration} minutes)`
      : "";

    const prompt =
      `You are a travel itinerary assistant. A user wants to add the following dropped activity to their trip:\n\n` +
      `Activity: "${activity.title}"${durationHint}${cityHint}\n\n` +
      `Current itinerary (pace: ${tripPace}):\n` +
      JSON.stringify(itinerary.days, null, 2) + "\n\n" +
      `Find the best placement. Consider city matching (activity must be in the right city), ` +
      `day capacity (don't overload), and thematic fit with other activities on the day.\n\n` +
      `Rules:\n` +
      `- "bestFitDays" = days with enough capacity to simply add the activity (max 2–3 suggestions)\n` +
      `- "swapSuggestions" = days where replacing a lower-priority or similar activity makes sense (max 2)\n` +
      `- Set "cannotFit" to true only if there is genuinely no suitable placement\n` +
      `- "explanation" = one sentence summary of your recommendation\n\n` +
      `Return ONLY valid JSON — no markdown, no extra text:\n` +
      `{\n` +
      `  "bestFitDays": [{ "dayIndex": 2, "city": "Kyoto", "reason": "Good thematic fit — other temple visits on this day" }],\n` +
      `  "swapSuggestions": [{ "dayIndex": 3, "city": "Kyoto", "replaceActivityTitle": "Nijo Castle", "replaceActivityDuration": 90, "reason": "Both are historical sites with similar appeal" }],\n` +
      `  "cannotFit": false,\n` +
      `  "explanation": "Day 3 is the best fit given its cultural theme and available capacity"\n` +
      `}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== "text") {
      return Response.json({ error: "No response from Claude" }, { status: 500 });
    }

    let rawText = content.text.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const result = JSON.parse(rawText) as ClaudePlacement;
    return Response.json(result);

  } catch (error) {
    console.error("[suggest-placement]", error);
    return Response.json({ error: "Placement analysis failed" }, { status: 500 });
  }
}

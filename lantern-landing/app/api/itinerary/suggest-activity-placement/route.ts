import Anthropic from "@anthropic-ai/sdk";
import type { DroppedActivity, PlannerOutput } from "@/lib/itinerary/types";

type UIPace = "relaxed" | "balanced" | "packed";

export interface PlacementResult {
  canAddOnDays:    { dayIndex: number; city: string; capacity: string; suggestion: string }[];
  swapSuggestions: { dayIndex: number; city: string; replaceActivityTitle: string; replaceActivityDuration: number; suggestion: string }[];
  mustExtendCity:  boolean;
  noBestOption:    boolean;
}

export async function POST(req: Request) {
  try {
    const { droppedActivity, itinerary, tripPace } = await req.json() as {
      droppedActivity: DroppedActivity;
      itinerary:       PlannerOutput;
      tripPace:        UIPace;
    };

    if (!droppedActivity || !itinerary) {
      return Response.json({ error: "Missing input" }, { status: 400 });
    }

    const paceLabel = tripPace === "relaxed" ? "3/day" : tripPace === "packed" ? "8/day" : "5/day";

    const itinerarySummary = itinerary.days.map((day) => ({
      dayIndex:      day.dayIndex,
      city:          day.cityLabel ?? day.geographicArea ?? `Day ${day.dayIndex + 1}`,
      theme:         day.theme,
      activityCount: day.scheduledActivityCount,
      activities:    day.slots
        .filter((s) => s.kind === "activity")
        .map((s) => ({ title: s.title, durationMinutes: s.durationMinutes })),
    }));

    const cityHint = droppedActivity.diagnostic?.belongsInCity &&
      droppedActivity.diagnostic.belongsInCity !== "Flexible"
      ? `, which belongs in ${droppedActivity.diagnostic.belongsInCity}`
      : "";
    const durationHint = droppedActivity.diagnostic?.activityDuration
      ? ` (${droppedActivity.diagnostic.activityDuration} minutes)`
      : "";

    const prompt =
      `Activity to place: "${droppedActivity.title}"${durationHint}${cityHint}\n\n` +
      `Itinerary (${itinerary.days.length} days, pace: ${paceLabel}):\n` +
      JSON.stringify(itinerarySummary, null, 2) + "\n\n" +
      `Analyze where this activity fits best. Consider city matching, day capacity, and activity type.\n\n` +
      `Return ONLY valid JSON — no markdown, no explanation:\n` +
      `{\n` +
      `  "canAddOnDays": [{ "dayIndex": 0, "city": "Tokyo", "capacity": "2/5 activities", "suggestion": "Good fit after morning temple visit" }],\n` +
      `  "swapSuggestions": [{ "dayIndex": 2, "city": "Kyoto", "replaceActivityTitle": "Nijo Castle", "replaceActivityDuration": 90, "suggestion": "Both are historical sites — similar cultural value" }],\n` +
      `  "mustExtendCity": false,\n` +
      `  "noBestOption": false\n` +
      `}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1000,
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

    const result = JSON.parse(rawText) as PlacementResult;
    return Response.json(result);

  } catch (error) {
    console.error("[suggest-activity-placement]", error);
    return Response.json({ error: "Placement analysis failed" }, { status: 500 });
  }
}

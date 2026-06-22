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
  const systemPrompt = `You are an expert travel itinerary planner. Create personalized day-by-day itineraries that:
- Balance user interests and pace preferences
- Include proper meal timing (breakfast 7-9am, lunch 12-2pm, dinner 6-8pm)
- Schedule full-day activities on dedicated days with only dinner
- Provide realistic travel times between cities
- Suggest specific restaurants matched to activity flow
- Explain reasoning for each day's theme

Output ONLY valid JSON with no markdown or explanations.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt = buildPrompt(input);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const content = response.content[0];
if (content.type !== "text") throw new Error("Invalid response");

// Strip markdown backticks if Claude wrapped the response
let jsonText = content.text;
if (jsonText.includes("```")) {
  jsonText = jsonText.replace(/```json\n?/g, "").replace(/```/g, "").trim();
}

const itinerary = JSON.parse(jsonText);
return itinerary;
}

function buildPrompt(input: ItineraryRequest): string {
  const totalDays = input.cities.reduce((sum, c) => sum + c.days, 0);
  const citiesStr = input.cities.map((c) => `${c.name} (${c.days} days)`).join(" → ");
  const activitiesStr = input.activities
    .map((a) => `- ${a.title} (${a.estimatedDurationHours}h, ${a.category})${a.isFullDay ? " [FULL-DAY]" : ""}`)
    .join("\n");

  return `Generate a ${totalDays}-day travel itinerary for: ${citiesStr}

DATES: ${input.startDate} to ${input.endDate}

USER PREFERENCES:
- Pace: ${input.userPreferences.pace}
- Interests: ${input.userPreferences.interests.join(", ")}
${input.userPreferences.budgetLevel ? `- Budget: ${input.userPreferences.budgetLevel}` : ""}

ACTIVITIES TO INCLUDE (${input.activities.length} total):
${activitiesStr}

REQUIREMENTS:
1. Include ALL activities in the itinerary
2. Respect city durations exactly
3. Full-day activities (marked [FULL-DAY]) go on dedicated days
4. Proper meal timing: breakfast 7-9am, lunch 12-2pm, dinner 6-8pm
5. Account for travel time between cities
6. Suggest specific restaurant names
7. Brief explanation for each day's theme

OUTPUT FORMAT:
{
  "summary": {
    "theme": "string",
    "highlights": ["activity1", "activity2"]
  },
  "days": [
    {
      "dayIndex": 1,
      "date": "2026-06-22",
      "city": "Tokyo, Japan",
      "theme": "Arrival & rest",
      "reasoning": "Light activities after long flight",
      "schedule": [
        {
          "time": "15:30",
          "activity": "Hotel Check-in",
          "duration": "1h",
          "type": "logistics",
          "notes": "Rest and freshen up"
        },
        {
          "time": "19:00",
          "activity": "Dinner",
          "duration": "1.5h",
          "type": "meal",
          "recommendation": "Restaurant name"
        }
      ]
    }
  ]
}

Generate the complete itinerary. Return ONLY JSON, no markdown.`;
}
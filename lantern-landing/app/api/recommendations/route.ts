import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface AiRecommendation {
  id:            string;
  title:         string;
  city:          string;
  category:      string;
  estimatedCost: string;
  duration:      string;
  reason:        string;
  tags:          string[];
}

interface RecommendationsRequest {
  preferences:    string[];   // TravelStyle values
  cities:         string[];   // city names
  budget?:        string;
  pace?:          string;
  cuisine?:       string[];   // cuisine preference tags
  existingTitles?: string[];  // activities already saved — avoid re-recommending
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  first_time_highlights: "iconic must-see landmarks and top-rated classic attractions",
  food_focused:          "street food stalls, local restaurants, food markets, cooking classes, culinary tours",
  culture_history:       "temples, shrines, museums, historical sites, traditional arts and crafts",
  hidden_gems:           "off-beaten-path spots, local neighborhood favorites, lesser-known sites",
  luxury:                "fine dining, premium experiences, exclusive tours, high-end attractions",
  budget:                "free activities, street food under $15, open-air markets, self-guided walks",
  family:                "interactive museums, parks, amusement attractions, family-friendly sites",
  nightlife:             "bars, clubs, night markets, izakayas, evening entertainment districts",
  relaxed:               "scenic parks, cafes, gentle walks, gardens, low-key sightseeing",
  packed:                "efficient multi-site visits, popular highlights, maximum coverage",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RecommendationsRequest;
    const { preferences = [], cities = [], budget, pace, cuisine = [], existingTitles = [] } = body;

    if (!cities.length) {
      return NextResponse.json({ error: "cities required" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const cityList   = cities.filter(Boolean).join(", ");
    const styleDescs = preferences
      .map((p) => STYLE_DESCRIPTIONS[p] ?? p)
      .filter(Boolean)
      .join("; ");

    const cuisineNote = cuisine.length > 0
      ? `\nCuisine preferences: ${cuisine.join(", ")}`
      : "";

    const avoidNote = existingTitles.length > 0
      ? `\nDo NOT suggest these (already in their trip): ${existingTitles.slice(0, 25).join(", ")}`
      : "";

    const budgetLabel  = budget === "luxury" ? "Premium ($50+/person)" : budget === "budget" ? "Budget ($0-25/person)" : "Moderate ($25-50/person)";
    const paceLabel    = pace === "relaxed" ? "relaxed (3-4 activities/day max)" : pace === "packed" ? "packed (6+ activities/day)" : "balanced (4-5 activities/day)";
    const numCities    = cities.filter(Boolean).length;

    const prompt = `Recommend 10 specific, real travel activities for a visitor to ${cityList}.

Traveler profile:
- Interests: ${styleDescs || "general sightseeing"}${cuisineNote}
- Budget: ${budgetLabel}
- Pace: ${paceLabel}${avoidNote}

Return ONLY a JSON array of exactly 10 items (no markdown, no commentary, no code fences):
[
  {
    "title": "Specific real place or experience name",
    "city": "Exact city name from the list: ${cityList}",
    "category": "food|culture|adventure|nightlife|nature|hidden_gems|luxury",
    "estimatedCost": "$X-Y per person",
    "duration": "Xh",
    "reason": "One sentence explaining why this matches their specific interests and travel style",
    "tags": ["up to 3 concise tags"]
  }
]

Rules:
- Use real, specific place names that actually exist
- Distribute across all ${numCities} cit${numCities === 1 ? "y" : "ies"} proportionally
- Category mapping: food_focused→food, culture_history→culture, nightlife→nightlife, hidden_gems→hidden_gems, luxury→luxury; for budget/first_time use food or culture
- Budget traveler: estimatedCost ≤ $25, prioritize free and low-cost options
- Luxury traveler: estimatedCost $50+, premium experiences only
- Hidden gems traveler: non-touristy, local favorites, skip famous landmarks
- Return exactly 10 items, no more, no less`;

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 2000,
      system:     "You are an expert travel curator. Output ONLY a valid JSON array, no other text.",
      messages:   [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    let rawText = content.text.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = JSON.parse(rawText) as Omit<AiRecommendation, "id">[];

    const recommendations: AiRecommendation[] = parsed.map((r, i) => ({
      ...r,
      id: `ai-rec-${Date.now()}-${i}`,
    }));

    console.log(`[recommendations] Generated ${recommendations.length} recs for ${cityList}`);

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("[recommendations] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate recommendations" },
      { status: 500 },
    );
  }
}

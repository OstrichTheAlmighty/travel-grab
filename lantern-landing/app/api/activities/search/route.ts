import { NextRequest, NextResponse } from "next/server";
import type { Activity } from "../../../activities/data/types";
import { DESTINATION_DATA } from "../../../activities/data/tokyo";
import {
  getOrCreateInventory,
  convertInventoryToActivities,
  SKIP_TYPES,
  type CityInventory,
} from "../_inventory";

// ── AI whyVisit generation ────────────────────────────────────────────────────
// Runs at response time. Results are cached inside CityInventory.entries[id].whyVisit
// so they are not regenerated on subsequent requests.

async function generateWhyVisitBatch(
  activities: Activity[],
  inv: CityInventory,
): Promise<Map<string, string>> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return new Map();

  const items = activities.map((a) => {
    const entry = inv.entries.get(a.id);
    return {
      id:        a.id,
      name:      a.title,
      category:  a.category,
      city:      inv.city,
      editorial: entry?.place.editorialSummary?.text ?? null,
      types:     (entry?.place.types ?? []).filter((t) => !SKIP_TYPES.has(t)).slice(0, 6),
    };
  });

  const prompt = `You write concise "Why visit?" summaries for an activity card in a travel app. Each summary is shown when a user taps "Why visit?" on the card.

RULES — strictly enforced:
- Exactly 2 sentences. No more, no less.
- No ratings, star ratings, or review counts.
- Forbidden phrases: "must-see", "world-renowned", "vibrant", "bustling", "amazing", "popular attraction", "hidden gem", "unique experience".
- "Iconic" is allowed only when attached to a specific named feature (e.g. "the iconic Kaminarimon Gate"), never used alone.
- First sentence: what the visitor will specifically DO or SEE that is unique to this place. Name specific features, streets, rooms, items, or rituals where possible.
- Second sentence: who it is best for, OR what makes it stand out from similar attractions, OR a practical tip.
- Present tense. Visitor's perspective. Do not repeat the place name in both sentences.

Examples of the quality and specificity required:
- "Walk through the thundering Kaminarimon Gate and browse Nakamise Street's snack stalls before reaching the main hall of Tokyo's oldest temple. The blend of street food, incense, and active worship makes it unlike any other temple visit in the city."
- "Ride to the 350-metre observation floor for sweeping views across Tokyo's sprawl and, on clear days, Mount Fuji on the horizon. Sunset is the most rewarding time as the city lights begin to glow across every direction."

PLACES:
${JSON.stringify(items, null, 2)}

Return ONLY a JSON object mapping each place ID to its why_visit string.
{"ChIJ...": "Sentence one. Sentence two.", ...}`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", temperature: 0.4, max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(tid);
    if (!resp.ok) {
      console.error(`[activities/openai] HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
      return new Map();
    }

    const data   = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw    = (data.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const result = new Map<string, string>();
    for (const [id, text] of Object.entries(parsed)) {
      if (typeof text === "string" && text.trim()) result.set(id, text.trim());
    }
    console.log(`[activities/openai] whyVisit for ${result.size}/${activities.length} places`);
    return result;
  } catch (err) {
    console.error("[activities/openai] error:", err instanceof Error ? err.message : String(err));
    return new Map();
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const destination = (req.nextUrl.searchParams.get("destination") ?? "").trim();
  if (!destination) {
    return NextResponse.json({ error: "destination is required" }, { status: 400 });
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();

  // No API key — return mock data
  if (!apiKey) {
    console.warn("[activities/search] GOOGLE_PLACES_API_KEY not set — returning mock data");
    const mock = DESTINATION_DATA["Tokyo, Japan"];
    return NextResponse.json({
      activities:      mock.activities,
      city:            mock.city,
      country:         mock.country,
      source:          "mock",
      inventoryStatus: "ready" as const,
      inventorySize:   mock.activities.length,
    });
  }

  // Get or create inventory (waits up to 7s for first batch on a new city)
  const inv = await getOrCreateInventory(destination, apiKey);

  if (!inv || inv.entries.size === 0) {
    console.warn(`[activities/search] no inventory for "${destination}" — mock fallback`);
    const mock = DESTINATION_DATA["Tokyo, Japan"];
    return NextResponse.json({
      activities:      mock.activities,
      city:            mock.city,
      country:         mock.country,
      source:          "mock_fallback",
      inventoryStatus: "ready" as const,
      inventorySize:   mock.activities.length,
    });
  }

  // Convert inventory → sorted Activity[]
  const activities = convertInventoryToActivities(inv);

  // AI whyVisit — only for top-60 places that don't have cached text
  const needsAI = activities.slice(0, 60).filter((a) => !inv.entries.get(a.id)?.whyVisit);
  if (needsAI.length > 0) {
    const aiResults = await generateWhyVisitBatch(needsAI, inv);
    for (const [id, text] of aiResults) {
      const entry = inv.entries.get(id);
      if (entry) entry.whyVisit = text;  // cache in inventory
    }
  }

  // Apply all cached whyVisit texts to the activity list
  for (const activity of activities) {
    const cached = inv.entries.get(activity.id)?.whyVisit;
    if (cached) activity.whyVisit = cached;
  }

  // ── Debug ────────────────────────────────────────────────────────────────
  const totalIndexed   = inv.entries.size;
  const featuredCount  = activities.filter((a) => a.category !== "food").length; // rough proxy
  const foodCount      = activities.filter((a) => a.category === "food").length;
  const cultureCount   = activities.filter((a) => a.category === "culture").length;
  const nightlifeCount = activities.filter((a) => a.category === "nightlife").length;
  const adventureCount = activities.filter((a) => a.category === "adventure").length;
  const natureCount    = activities.filter((a) => a.category === "nature").length;
  const luxuryCount    = activities.filter((a) => a.category === "luxury").length;
  const hiddenGemCount = activities.filter((a) => a.category === "hidden_gems").length;
  console.log({
    totalIndexed,
    featuredCount,
    foodCount,
    cultureCount,
    nightlifeCount,
    adventureCount,
    natureCount,
    luxuryCount,
    hiddenGemCount,
    queriesCompleted: inv.queriesCompleted,
    queriesTotal:     inv.queriesTotal,
    inventoryStatus:  inv.status,
  });
  // ── End debug ─────────────────────────────────────────────────────────────

  return NextResponse.json({
    activities,
    city:              inv.city,
    country:           inv.country,
    source:            "places_api",
    inventoryStatus:   inv.status,
    inventorySize:     inv.entries.size,
    inventoryProgress: { completed: inv.queriesCompleted, total: inv.queriesTotal },
  });
}

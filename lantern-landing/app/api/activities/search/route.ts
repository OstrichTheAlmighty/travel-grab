import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminRequest } from "@/lib/auth-server";
import { checkUsage, incrementUsage } from "@/lib/usage";
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

  // Per-user daily quota (skipped for admin)
  if (!isAdminRequest(req)) {
    const authUser = await getUserFromRequest(req);
    if (authUser) {
      const { allowed, count, limit } = await checkUsage(authUser.id, "activities");
      if (!allowed) {
        return NextResponse.json(
          { error: `Daily limit reached — ${count}/${limit} activity searches used today. Resets at midnight UTC.`, limitReached: true },
          { status: 429 }
        );
      }
      incrementUsage(authUser.id, "activities");
    }
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

  // ── Cache / path diagnostics ────────────────────────────────────────────────
  console.log(`[activities/search] destination="${destination}"`);
  console.log(`[activities/search] RAW_INVENTORY_COUNT: ${inv?.entries.size ?? 0}  status=${inv?.status ?? "null"}  cacheSource=${inv?.cacheSource ?? "n/a"}  queriesCompleted=${inv?.queriesCompleted ?? 0}/${inv?.queriesTotal ?? 0}`);
  if (!inv || inv.entries.size === 0) {
    console.warn(`[activities/search] PATH=mock_fallback — inv null or empty, Tokyo hardcoded data returned for "${destination}"`);
  } else {
    console.log(`[activities/search] PATH=live_api — returning ${inv.entries.size} raw places for "${destination}"`);
  }
  // ───────────────────────────────────────────────────────────────────────────

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

  // Convert inventory → sorted Activity[] (snapshot of what's indexed right now)
  let activities = convertInventoryToActivities(inv);
  const snapshotSize = activities.length;

  // AI whyVisit — only for top-60 places that don't have cached text.
  // The background build continues concurrently during this await, so inv.entries
  // may grow significantly (or even complete) by the time we resume.
  const needsAI = activities.slice(0, 60).filter((a) => !inv.entries.get(a.id)?.whyVisit);
  if (needsAI.length > 0) {
    const aiResults = await generateWhyVisitBatch(needsAI, inv);
    for (const [id, text] of aiResults) {
      const entry = inv.entries.get(id);
      if (entry) entry.whyVisit = text;  // cache in inventory
    }
  }

  // If the background build completed while we were waiting for AI, re-convert now
  // so the response includes all indexed places (not just the seed-batch snapshot).
  // Without this, the client would receive inventoryStatus="ready" with only the
  // seed-batch activities, suppressing the polling re-fetch that would fix the count.
  if (inv.entries.size > snapshotSize) {
    console.log(
      `[activities/search] re-converting after AI: ` +
      `${snapshotSize} → ${inv.entries.size} entries (build progressed during AI wait)`,
    );
    activities = convertInventoryToActivities(inv);
  }

  // Apply all cached whyVisit texts to the (possibly expanded) activity list
  for (const activity of activities) {
    const cached = inv.entries.get(activity.id)?.whyVisit;
    if (cached) activity.whyVisit = cached;
  }

  // ── Pipeline diagnostic log ───────────────────────────────────────────────
  const foodCount      = activities.filter((a) => a.category === "food").length;
  const cultureCount   = activities.filter((a) => a.category === "culture").length;
  const nightlifeCount = activities.filter((a) => a.category === "nightlife").length;
  const adventureCount = activities.filter((a) => a.category === "adventure").length;
  const natureCount    = activities.filter((a) => a.category === "nature").length;
  const luxuryCount    = activities.filter((a) => a.category === "luxury").length;
  const hiddenGemCount = activities.filter((a) => a.category === "hidden_gems").length;
  const noPhotoCount   = activities.filter((a) => !a.photoRef).length;
  const noRatingCount  = activities.filter((a) => a.rating === 0).length;

  console.log("[activities pipeline]", {
    // Raw inventory size (may differ from activities if convert had errors)
    rawIndexed:        inv.entries.size,
    // Snapshot when convert was first called
    snapshotSize,
    // Final activities returned (after optional re-convert)
    displayableCount:  activities.length,
    // Category breakdown
    food:              foodCount,
    culture:           cultureCount,
    nightlife:         nightlifeCount,
    adventure:         adventureCount,
    nature:            natureCount,
    luxury:            luxuryCount,
    hidden_gems:       hiddenGemCount,
    // Notable non-dropped counts (all are in Browse All)
    noPhoto:           noPhotoCount,  // uses gradient fallback
    noRating:          noRatingCount,
    // Build status
    queriesCompleted:  inv.queriesCompleted,
    queriesTotal:      inv.queriesTotal,
    inventoryStatus:   inv.status,
  });
  // ── End pipeline log ──────────────────────────────────────────────────────

  const isDev = process.env.NODE_ENV !== "production" || process.env.DEBUG_PLACES === "1";

  return NextResponse.json({
    activities,
    city:              inv.city,
    country:           inv.country,
    source:            "places_api",
    inventoryStatus:   inv.status,
    // inventorySize always equals activities.length so the badge and Browse All
    // count always use the same dataset. The status polling also updates this
    // via result.inventorySize if the build is still running.
    inventorySize:     activities.length,
    inventoryProgress: { completed: inv.queriesCompleted, total: inv.queriesTotal },
    ...(isDev ? {
      _debug: {
        cacheSource:   inv.cacheSource ?? "api",
        apiCallsMade:  inv.apiCallsMade ?? inv.queriesCompleted,
        entriesLoaded: inv.entries.size,
      },
    } : {}),
  });
}

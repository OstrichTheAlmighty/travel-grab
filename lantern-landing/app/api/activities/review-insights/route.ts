import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { canSpend, recordGoogleUsage, recordServerCacheHit } from "@/lib/activities/google-usage";

// POST /api/activities/review-insights
// Body: { placeId, placeName, category, reviews: [{text, rating}] }
// Returns: ReviewInsights — synthesized from the review sample via OpenAI.
// Cached server-side by placeId (4-hour TTL) so repeated modal opens are free.

export interface ReviewInsights {
  guestsLove: string[];   // 3–4 positive themes
  watchOut:   string[];   // 2–3 complaints or cautions
  bestFor:    string[];   // 2–3 traveler types
  tips:       string[];   // 2–3 practical tips
  limited:    boolean;    // true when review sample is too sparse for confidence
}

interface IncomingReview {
  text:   string;
  rating: number;
}

interface RequestBody {
  placeId:  string;
  placeName: string;
  category: string;
  reviews:  IncomingReview[];
}

const cache = new Map<string, { insights: ReviewInsights; ts: number }>();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { placeId, placeName, category, reviews } = body;

  if (!placeId || !placeName || !Array.isArray(reviews)) {
    return NextResponse.json({ error: "placeId, placeName, and reviews are required" }, { status: 400 });
  }

  // Cache hit
  const hit = cache.get(placeId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    recordServerCacheHit();
    console.log(`[review-insights] cache hit placeId="${placeId}"`);
    return NextResponse.json(hit.insights);
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });
  }

  if (reviews.length === 0) {
    const empty: ReviewInsights = {
      guestsLove: [], watchOut: [], bestFor: [], tips: [], limited: true,
    };
    return NextResponse.json(empty);
  }

  if (!canSpend("review_insights") || !recordGoogleUsage("review_insights")) {
    return NextResponse.json({ downgraded: true, capReached: true }, { status: 200 });
  }

  const isLimited = reviews.length < 3;

  const reviewBlock = reviews
    .map((r, i) => `[${i + 1}] ${r.rating}★ — "${r.text.slice(0, 600)}"`)
    .join("\n");

  const prompt = `You analyze visitor reviews for a travel app. Extract structured insights for "${placeName}" (${category}).

Return ONLY a JSON object with this exact shape:
{
  "guestsLove": ["...", "...", "..."],
  "watchOut":   ["...", "..."],
  "bestFor":    ["...", "..."],
  "tips":       ["...", "..."],
  "limited":    ${isLimited}
}

RULES — strictly enforced:
- Only report what reviewers actually say. Do not invent claims not supported by the text.
- Be specific, not generic. "Queues reach 45 minutes at weekends" not "can get busy".
- Each bullet is max 12 words.
- guestsLove: 3–4 bullets on recurring positive themes (atmosphere, food, service, views, value).
- watchOut: 2–3 bullets on real complaints or cautions from reviewers. If no negatives exist, use 1 mild note.
- bestFor: 2–3 traveler types with a brief qualifier (e.g. "Families with young children", "Photographers at dawn").
- tips: 2–3 practical tips extracted from review content (best time, lines, reservations, what to order, etc.).
- If limited is true, lower your confidence accordingly and stick only to what evidence exists.

REVIEWS (${reviews.length}):
${reviewBlock}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:     "You respond only with valid JSON objects matching the exact shape requested. No markdown, no explanation.",
      messages:   [{ role: "user", content: prompt }],
    });

    const raw    = (msg.content[0]?.type === "text" ? msg.content[0].text : "").trim();
    const parsed = JSON.parse(raw) as Partial<ReviewInsights>;

    const insights: ReviewInsights = {
      guestsLove: Array.isArray(parsed.guestsLove) ? parsed.guestsLove.slice(0, 4) : [],
      watchOut:   Array.isArray(parsed.watchOut)   ? parsed.watchOut.slice(0, 3)   : [],
      bestFor:    Array.isArray(parsed.bestFor)     ? parsed.bestFor.slice(0, 3)    : [],
      tips:       Array.isArray(parsed.tips)        ? parsed.tips.slice(0, 3)       : [],
      limited:    isLimited || Boolean(parsed.limited),
    };

    cache.set(placeId, { insights, ts: Date.now() });
    console.log(
      `[review-insights] generated placeId="${placeId}" name="${placeName}" ` +
      `from ${reviews.length} reviews (limited=${insights.limited})`,
    );
    return NextResponse.json(insights);
  } catch (err) {
    console.error("[review-insights] Claude error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 502 });
  }
}

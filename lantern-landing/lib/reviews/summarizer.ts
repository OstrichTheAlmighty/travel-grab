import type { Review, ReviewSummary } from "./types";
import { emptySummary } from "./types";

// TODO: replace with durable cache (Vercel KV / Redis) for production.
// Keyed by a stable hash of the review texts so summaries regenerate if content changes.
const summaryCache = new Map<string, { summary: ReviewSummary; ts: number }>();

// TODO: replace with Upstash Redis / Vercel KV for durability across cold starts.
// 7-day TTL: summary only regenerates when review content changes (key includes review IDs).
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Simple deterministic key: sorted review IDs joined.
// If review content changes (e.g. new snippet), key changes → regenerate.
function summaryKey(hotelName: string, reviews: Review[]): string {
  const ids = reviews.map((r) => r.id).sort().join("|");
  return `${hotelName.toLowerCase().trim()}||${ids}`;
}

// ── Prompt ────────────────────────────────────────────────────────────────────
//
// Design principles:
//  1. Evidence-only: every bullet must be traceable to ≥2 reviews that explicitly
//     say the thing. No inference, no filling gaps with hotel-category knowledge.
//  2. Concrete over vague: "small rooms" beats "compact experience"; "noisy street"
//     beats "location drawbacks". The test: would a guest recognise this from their
//     own words?
//  3. Traveler-type claims (bestFor / notIdealFor) require explicit review support —
//     the reviews must name or clearly imply the traveler type, not just describe a
//     feature that could suit them.
//  4. Banned marketing language: the model is told to reject a specific list of
//     phrases that sound plausible but are rarely grounded in the actual text.
//  5. Temperature 0.1: near-deterministic extraction, not creative writing.

function buildPrompt(hotelName: string, city: string, reviews: Review[]): string {
  const reviewLines = reviews
    .filter((r) => r.text.trim().length > 10)
    .map((r, i) => `Review ${i + 1} (${r.rating}★): ${r.text.trim()}`)
    .join("\n\n");

  return `You are extracting themes from hotel guest reviews. Your only job is to report what the reviews actually say — not what you know about the hotel, city, or hotel category.

Hotel: ${hotelName}
City: ${city}
Reviews: ${reviews.length}

--- REVIEWS ---
${reviewLines}
--- END ---

RULES — read before writing a single word:

1. EVIDENCE REQUIREMENT
   A theme is valid only if it is explicitly stated or directly implied in 2 or more of the reviews above.
   If you are not certain a theme meets this bar, leave the array empty. An empty array is correct output.

2. CONCRETE LANGUAGE
   Write what guests observed, not conclusions you draw.
   Good: "Rooms are small", "Staff helped with luggage", "Street noise at night"
   Bad: "Compact but cozy rooms", "Exceptional service culture", "Vibrant urban atmosphere"

3. FORBIDDEN PHRASES
   Never use these unless 3+ reviews explicitly contain the word or phrase:
   boutique experience, luxury seekers, minimalist aesthetic, family friendly,
   romantic getaway, hidden gem, cozy retreat, urban explorer, ideal for couples,
   perfect for business, great for solo travelers, immersive experience.
   If you find yourself writing one of these, delete it and leave the slot empty.

4. TRAVELER TYPES (bestFor / notIdealFor only)
   Only include a traveler type if the reviews explicitly name it or describe a pattern
   that makes it unambiguous. "Near Shinjuku station" does not make it "ideal for tourists"
   unless reviews say so. "Small rooms" does not make it "not ideal for families" unless
   reviews complain about it in a family context.

5. FORMAT
   - Each bullet: plain English, max 8 words, no hotel name, no city name.
   - Max 4 bullets per category.
   - Return ONLY valid JSON — no prose, no markdown, no explanation.

{
  "guestsLove": ["...", ...],
  "commonComplaints": ["...", ...],
  "bestFor": ["...", ...],
  "notIdealFor": ["...", ...]
}`;
}

// ── OpenAI call ───────────────────────────────────────────────────────────────

type SummaryRaw = {
  guestsLove?: unknown;
  commonComplaints?: unknown;
  bestFor?: unknown;
  notIdealFor?: unknown;
};

function parseStrings(val: unknown, max: number): string[] {
  if (!Array.isArray(val)) return [];
  return (val as unknown[])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, max);
}

async function callOpenAI(prompt: string): Promise<SummaryRaw | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           "gpt-4o-mini",
        temperature:     0.1,
        max_tokens:      500,
        response_format: { type: "json_object" },
        messages:        [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(tid);

    if (!resp.ok) {
      console.error(`[summarizer] OpenAI HTTP ${resp.status}:`, (await resp.text()).slice(0, 200));
      return null;
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw  = (data.choices?.[0]?.message?.content ?? "").trim();
    return JSON.parse(raw) as SummaryRaw;
  } catch (err) {
    console.error("[summarizer] OpenAI error:", err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(tid);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GenerateSummaryResult {
  summary:  ReviewSummary;
  cacheHit: boolean;
}

export async function generateReviewSummary(
  hotelName: string,
  city: string,
  reviews: Review[],
): Promise<GenerateSummaryResult> {
  // Only summarise when there is text to work with
  const usable = reviews.filter((r) => r.text.trim().length > 10);
  if (usable.length === 0) return { summary: emptySummary, cacheHit: false };

  const key = summaryKey(hotelName, usable);
  const hit = summaryCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { summary: hit.summary, cacheHit: true };

  const prompt = buildPrompt(hotelName, city, usable);
  const raw    = await callOpenAI(prompt);

  if (!raw) {
    // OpenAI unavailable — return empty so the UI degrades gracefully
    return { summary: emptySummary, cacheHit: false };
  }

  const summary: ReviewSummary = {
    available:        true,
    limitedCoverage:  usable.length <= 3,
    guestsLove:       parseStrings(raw.guestsLove,       4),
    commonComplaints: parseStrings(raw.commonComplaints, 4),
    bestFor:          parseStrings(raw.bestFor,          4),
    notIdealFor:      parseStrings(raw.notIdealFor,      4),
  };

  // If the model returned no useful content, mark unavailable
  const hasContent =
    summary.guestsLove.length > 0 ||
    summary.commonComplaints.length > 0 ||
    summary.bestFor.length > 0 ||
    summary.notIdealFor.length > 0;

  if (!hasContent) return { summary: emptySummary, cacheHit: false };

  summaryCache.set(key, { summary, ts: Date.now() });
  console.log(
    `[summarizer] "${hotelName}" → ${summary.guestsLove.length} loves, ` +
    `${summary.commonComplaints.length} complaints, ` +
    `${summary.bestFor.length} best-for, ${summary.notIdealFor.length} not-ideal`,
  );

  return { summary, cacheHit: false };
}

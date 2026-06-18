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
//  1. Ground the model in the raw text — no external knowledge allowed.
//  2. Require recurrence: a theme must appear in ≥2 reviews or it is omitted.
//  3. Strict JSON schema with field guards so malformed output is rejected.
//  4. Bullet brevity (≤8 words) keeps the UI scannable.
//  5. Temperature 0.2 minimises hallucination while still producing fluent text.

function buildPrompt(hotelName: string, city: string, reviews: Review[]): string {
  const reviewLines = reviews
    .filter((r) => r.text.trim().length > 10)
    .map((r, i) => `Review ${i + 1} (${r.rating}★): ${r.text.trim()}`)
    .join("\n\n");

  return `You are analyzing hotel guest reviews to identify RECURRING themes.

Hotel: ${hotelName}
City: ${city}
Number of reviews: ${reviews.length}

--- REVIEW TEXT ---
${reviewLines}
--- END REVIEWS ---

Identify patterns that appear in AT LEAST 2 of the reviews above.

Rules (read carefully):
- ONLY include themes explicitly supported by multiple reviews. Do not invent or infer.
- Each bullet: plain English, max 8 words, no marketing language.
- Max 4 bullets per category. Omit a category entirely if no recurring theme exists.
- Do not duplicate the hotel name or city in the bullets.
- "bestFor" and "notIdealFor" describe traveler types or use cases, not features.

Return ONLY valid JSON with exactly these four keys (arrays may be empty):
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
        temperature:     0.2,
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

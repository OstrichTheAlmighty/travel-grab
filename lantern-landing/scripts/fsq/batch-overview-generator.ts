/**
 * Claude Haiku Batch API — Overview generation for FSQ activities.
 *
 * Uses Anthropic Message Batches API (50% discount) with prompt caching
 * on the system prompt (90% discount on cached tokens).
 *
 * Exports:
 *   submitOverviewBatch(activities) → batchId
 *   pollOverviewBatch(batchId)      → Map<placeId, overviewText>
 *   computeBatchCost(usage)         → { inputCost, outputCost, totalCost }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import type { NormalizedActivity } from "../../lib/activities/types";

// ── Model & pricing ───────────────────────────────────────────────────────────

const MODEL = "claude-haiku-4-5-20251001";

// Per-million-token rates (standard, before discounts)
const HAIKU_INPUT_PER_M  = 1.00;
const HAIKU_OUTPUT_PER_M = 5.00;
const BATCH_DISCOUNT     = 0.50;   // 50% off all tokens
const CACHE_READ_RATIO   = 0.10;   // 90% off cached-read tokens

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NeedingOverview {
  fsq_place_id: string;
  title: string;
  city: string;
  category: string;
  categoryLabels: string[];
  description?: string;
}

export interface BatchUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface BatchCost {
  inputCost: number;
  outputCost: number;
  cacheCreationCost: number;
  cacheReadCost: number;
  totalCost: number;
}

// ── System prompt (cached) ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You write concise, vivid activity overviews for a travel planning app.

Rules:
- 1–2 sentences, 25–40 words total
- Start directly with what makes this place worth visiting — no "This is" or "Located in"
- Mention the specific type of experience (sensory, historical, atmospheric, culinary)
- Sound like a knowledgeable friend, not a brochure
- Never use: "must-see", "hidden gem", "world-class", "stunning", "amazing", "incredible"
- Include the city name naturally if it adds context

Examples of good overviews:
"Monks still chant morning prayers beneath gilded stupas at this active Buddhist complex that has stood at Kyoto's edge for 1,200 years."
"Tuck into crispy-skinned duck confit at marble bistro tables while Parisians argue politics at the bar — this is the real Left Bank."
"Stand between two seas at the tip of a narrow peninsula where the Atlantic meets the Pacific in a sweep of crashing surf."`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function buildUserPrompt(activity: NeedingOverview): string {
  const labelList = activity.categoryLabels
    .map((l) => (l.includes(">") ? l.split(">").at(-1)?.trim() ?? l : l))
    .slice(0, 5)
    .join(", ");

  const lines = [
    `Place: ${activity.title}`,
    `City: ${activity.city}`,
    `Type: ${labelList || activity.category}`,
  ];
  if (activity.description && activity.description.length >= 20) {
    lines.push(`FSQ description: ${activity.description}`);
  }
  lines.push(`\nWrite a 1–2 sentence overview (25–40 words).`);
  return lines.join("\n");
}

// ── Cost computation ──────────────────────────────────────────────────────────

export function computeBatchCost(usage: BatchUsage): BatchCost {
  // Regular input tokens (not cached)
  const regularInput = usage.inputTokens - usage.cacheReadTokens - usage.cacheCreationTokens;

  const inputCost =
    (regularInput / 1_000_000) * HAIKU_INPUT_PER_M * BATCH_DISCOUNT;

  const cacheCreationCost =
    (usage.cacheCreationTokens / 1_000_000) * HAIKU_INPUT_PER_M * BATCH_DISCOUNT;

  const cacheReadCost =
    (usage.cacheReadTokens / 1_000_000) * HAIKU_INPUT_PER_M * CACHE_READ_RATIO * BATCH_DISCOUNT;

  const outputCost =
    (usage.outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M * BATCH_DISCOUNT;

  const totalCost = inputCost + cacheCreationCost + cacheReadCost + outputCost;

  return { inputCost, outputCost, cacheCreationCost, cacheReadCost, totalCost };
}

// ── Submit batch ──────────────────────────────────────────────────────────────

export async function submitOverviewBatch(
  activities: NeedingOverview[],
): Promise<string> {
  const client = new Anthropic();

  const requests = activities.map((activity) => ({
    custom_id: activity.fsq_place_id,
    params: {
      model: MODEL,
      max_tokens: 120,
      system: [
        {
          type: "text" as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [
        {
          role: "user" as const,
          content: buildUserPrompt(activity),
        },
      ],
    } satisfies MessageCreateParamsNonStreaming,
  }));

  console.log(`[batch-overview] Submitting batch of ${requests.length} requests…`);
  const batch = await client.messages.batches.create({ requests });
  console.log(`[batch-overview] Batch created: ${batch.id} (status: ${batch.processing_status})`);

  return batch.id;
}

// ── Poll until complete ───────────────────────────────────────────────────────

export async function pollOverviewBatch(
  batchId: string,
  pollIntervalMs = 30_000,
): Promise<{ overviews: Map<string, string>; usage: BatchUsage; cost: BatchCost }> {
  const client = new Anthropic();

  console.log(`[batch-overview] Polling ${batchId} every ${pollIntervalMs / 1000}s…`);

  while (true) {
    const status = await client.messages.batches.retrieve(batchId);

    if (status.processing_status === "ended") {
      console.log(
        `[batch-overview] Batch ended — succeeded: ${status.request_counts.succeeded}, errored: ${status.request_counts.errored}, expired: ${status.request_counts.expired}`,
      );
      break;
    }

    const processing = status.request_counts?.processing ?? "?";
    console.log(
      `[batch-overview] Status: ${status.processing_status} (${processing} processing) — waiting ${pollIntervalMs / 1000}s…`,
    );
    await sleep(pollIntervalMs);
  }

  // Stream results
  const overviews = new Map<string, string>();
  const usage: BatchUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  let errored = 0;

  for await (const result of await client.messages.batches.results(batchId)) {
    if (result.result.type === "succeeded") {
      const msg = result.result.message;

      // Accumulate token usage
      const u = msg.usage as unknown as Record<string, number>;
      usage.inputTokens += u.input_tokens ?? 0;
      usage.outputTokens += u.output_tokens ?? 0;
      usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      usage.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;

      // Extract text
      const textBlock = msg.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        const text = textBlock.text.trim();
        overviews.set(`fsq:${result.custom_id}`, text);
      }
    } else if (result.result.type === "errored") {
      errored++;
      const errType = result.result.error.type;
      console.warn(`[batch-overview] ${result.custom_id} errored (${errType})`);
    } else if (result.result.type === "expired") {
      errored++;
      console.warn(`[batch-overview] ${result.custom_id} expired`);
    }
  }

  const cost = computeBatchCost(usage);

  console.log(
    `[batch-overview] Done — ${overviews.size} overviews, ${errored} errors`,
  );
  console.log(
    `[batch-overview] Tokens — input: ${usage.inputTokens}, output: ${usage.outputTokens}, cache_read: ${usage.cacheReadTokens}, cache_create: ${usage.cacheCreationTokens}`,
  );
  console.log(
    `[batch-overview] Cost — $${cost.totalCost.toFixed(4)} total (input: $${cost.inputCost.toFixed(4)}, output: $${cost.outputCost.toFixed(4)}, cache_create: $${cost.cacheCreationCost.toFixed(4)}, cache_read: $${cost.cacheReadCost.toFixed(4)})`,
  );

  return { overviews, usage, cost };
}

// ── Convert NormalizedActivity → NeedingOverview ──────────────────────────────

export function toNeedingOverview(
  activity: NormalizedActivity,
  cityName: string,
): NeedingOverview {
  const meta = activity.source_metadata ?? {};
  const fsqPlaceId = activity.source_record_id ?? activity.id.replace(/^fsq:/, "");
  const categoryLabels: string[] = Array.isArray(meta.fsq_category_labels)
    ? (meta.fsq_category_labels as string[])
    : [];

  return {
    fsq_place_id: fsqPlaceId,
    title: activity.title,
    city: cityName,
    category: activity.category,
    categoryLabels,
    description: activity.description,
  };
}

/**
 * City-agnostic FSQ activity curation.
 *
 * Generalizes curateTokyoCatalog() for any city.  Tokyo-specific gates
 * (major attraction probes, ward geography caps, 80% metro share) are omitted.
 * The scoring model, chain detection, and quota logic are identical.
 */

import type { NormalizedActivity } from "../../../lib/activities/types";
import { normalizeName } from "./dedup";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CurationTier = "A" | "B";

export interface GenericCurationMetadata {
  tier: CurationTier;
  rank?: number;
  score: number;
  selection_reasons: string[];
  penalties: string[];
  probable_chain_id?: string;
  hidden_gem_candidate: boolean;
  score_components: Array<{ signal: string; amount: number }>;
}

export type GenericCuratedActivity = NormalizedActivity & {
  curation: GenericCurationMetadata;
};

export interface GenericCurationResult {
  tierA: GenericCuratedActivity[];
  tierB: GenericCuratedActivity[];
  stats: {
    cityName: string;
    total: number;
    tierACount: number;
    tierBCount: number;
    byCategory: Record<string, number>;
    chainsDetected: number;
    acceptancePassed: boolean;
  };
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORIES = ["culture", "nature", "adventure", "food", "nightlife", "luxury", "free"] as const;
type TGCategory = typeof CATEGORIES[number];

const CATEGORY_WEIGHTS: Record<string, number> = {
  culture: 0.21, nature: 0.19, adventure: 0.14, food: 0.20,
  nightlife: 0.11, luxury: 0.08, free: 0.07,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function metadata(activity: NormalizedActivity): Record<string, unknown> {
  return activity.source_metadata ?? {};
}

function labels(activity: NormalizedActivity): string[] {
  const value = metadata(activity).fsq_category_labels;
  return Array.isArray(value) ? value.map(String) : [];
}

function websiteDomain(activity: NormalizedActivity): string | null {
  if (!activity.website) return null;
  try {
    return new URL(activity.website).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const GENERIC_DOMAINS = new Set(["facebook.com", "instagram.com", "x.com", "twitter.com", "foursquare.com"]);

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreActivity(activity: NormalizedActivity): GenericCurationMetadata {
  const reasons: string[] = [];
  const penalties: string[] = [];
  const scoreComponents: Array<{ signal: string; amount: number }> = [];
  let score = 50;

  const apply = (signal: string, amount: number) => {
    score += amount;
    scoreComponents.push({ signal, amount });
  };

  const meta = metadata(activity);
  const categoryLabels = labels(activity);
  const labelText = categoryLabels.join(" ").toLowerCase();
  const specificity = categoryLabels.length;

  const travelScore = Number(meta.travel_value_score ?? 0);
  if (travelScore > 0) {
    const scaled = Math.round(((travelScore - 35) / 65) * 30);
    apply("travel_value_score", scaled);
  }

  if (activity.website) {
    const domain = websiteDomain(activity);
    if (domain && !GENERIC_DOMAINS.has(domain)) {
      apply("website_present", 12);
    }
  }

  if (meta.address) apply("address_present", 5);

  if (specificity >= 3) apply("specific_category", 10);
  else if (specificity >= 2) apply("moderate_category", 5);

  if (/museum|gallery|temple|shrine|castle|cathedral|historic|palace|landmark|monument/.test(labelText)) {
    apply("cultural_landmark", 18);
    reasons.push("cultural_landmark");
  }
  // Extra boost for high-draw attraction types that consistently reward travellers
  if (/museum|aquarium|zoo|botanical/.test(labelText)) {
    apply("major_attraction", 10);
    reasons.push("major_attraction");
  }
  if (/park|garden|nature|beach|waterfront|trail/.test(labelText)) {
    // Major outdoor destinations (national parks, botanical gardens, waterfalls, zoos)
    // score significantly higher than generic neighbourhood parks
    const isMajorOutdoor = /national.*park|botanical|waterfall|nature.*reserve|wildlife/.test(labelText);
    apply("outdoor_attraction", isMajorOutdoor ? 8 : 2);
    reasons.push("outdoor_nature");
  }
  if (/observation|tower|view/.test(labelText)) {
    apply("viewpoint", 6);
    reasons.push("viewpoint");
  }

  if (meta.chain_penalty_applied === true) {
    apply("chain_penalty", -10);
    penalties.push("chain");
  }
  if (meta.generic_business_penalty_applied === true) {
    apply("generic_business", -35);
    penalties.push("generic_business");
  }

  const category = activity.category as TGCategory;
  if ((category === "food" || category === "nightlife") && !activity.website && specificity < 4) {
    apply("ordinary_neighborhood_venue", -12);
    penalties.push("ordinary_neighborhood_venue");
  }

  if (reasons.length === 0) reasons.push("travel_relevant");
  const hiddenGem = score >= 72 && !activity.website && !penalties.includes("generic_business");
  if (hiddenGem) reasons.push("hidden_gem_candidate");

  return {
    tier: "B",
    score: Math.round(score * 10) / 10,
    selection_reasons: [...new Set(reasons)],
    penalties: [...new Set(penalties)],
    hidden_gem_candidate: hiddenGem,
    score_components: scoreComponents,
  };
}

// ── Chain detection ───────────────────────────────────────────────────────────

function detectChains(rows: GenericCuratedActivity[]): number {
  const domainGroups = new Map<string, GenericCuratedActivity[]>();
  const nameGroups = new Map<string, GenericCuratedActivity[]>();

  for (const row of rows) {
    const domain = websiteDomain(row);
    if (domain) {
      const stem = normalizeName(row.title).split(/\s+/)[0] ?? "";
      const key = `domain:${domain}:${row.category}:${stem}`;
      domainGroups.set(key, [...(domainGroups.get(key) ?? []), row]);
    }
    const nameKey = `name:${normalizeName(row.title)}:${row.category}`;
    nameGroups.set(nameKey, [...(nameGroups.get(nameKey) ?? []), row]);
  }

  const assigned = new Set<string>();
  let chainsDetected = 0;

  for (const [key, members] of [...domainGroups, ...nameGroups]) {
    const unique = members.filter((row) => !assigned.has(row.id));
    if (unique.length < 3) continue;
    chainsDetected++;
    for (const row of unique) {
      assigned.add(row.id);
      row.curation.probable_chain_id = key;
      row.curation.penalties.push("probable_chain_branch");
      row.curation.score -= 24;
      row.curation.score_components.push({ signal: "probable_chain_branch", amount: -24 });
    }
  }

  return chainsDetected;
}

// ── Adaptive quotas ───────────────────────────────────────────────────────────

function computeAdaptiveQuotas(
  candidateCounts: Record<string, number>,
  target: number,
): Record<string, number> {
  const quotas = Object.fromEntries(
    CATEGORIES.map((cat) => [cat, Math.min(candidateCounts[cat] ?? 0, Math.floor(target * CATEGORY_WEIGHTS[cat]))]),
  ) as Record<string, number>;

  let remaining = target - Object.values(quotas).reduce((sum, v) => sum + v, 0);
  while (remaining > 0) {
    const cat = CATEGORIES
      .filter((c) => quotas[c] < (candidateCounts[c] ?? 0) && quotas[c] < Math.floor(target * 0.45))
      .sort((a, b) => ((candidateCounts[b] ?? 0) - quotas[b]) - ((candidateCounts[a] ?? 0) - quotas[a]))[0];
    if (!cat) break;
    quotas[cat] += 1;
    remaining -= 1;
  }
  return quotas;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function curateCityGeneric(
  activities: NormalizedActivity[],
  cityName: string,
  target = 1_000,
): GenericCurationResult {
  const rows: GenericCuratedActivity[] = activities.map((activity) => ({
    ...activity,
    curation: scoreActivity(activity),
  }));

  const chainsDetected = detectChains(rows);

  const candidateCounts = Object.fromEntries(
    CATEGORIES.map((cat) => [cat, rows.filter((r) => r.category === cat).length]),
  );
  const quotas = computeAdaptiveQuotas(candidateCounts, target);

  const selected = new Set<string>();
  const chainSelected = new Map<string, number>();

  const canSelect = (row: GenericCuratedActivity): boolean => {
    if (row.curation.score < 55) return false;
    const chainId = row.curation.probable_chain_id;
    if (chainId && (chainSelected.get(chainId) ?? 0) >= 3) return false;
    return true;
  };

  const add = (row: GenericCuratedActivity, forced = false): boolean => {
    if (selected.has(row.id)) return false;
    if (!forced && !canSelect(row)) return false;
    selected.add(row.id);
    row.curation.tier = "A";
    const chainId = row.curation.probable_chain_id;
    if (chainId) chainSelected.set(chainId, (chainSelected.get(chainId) ?? 0) + 1);
    return true;
  };

  // Fill quotas per category
  for (const cat of CATEGORIES) {
    const catRows = rows
      .filter((r) => r.category === cat)
      .sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id));
    let catSelected = 0;
    for (const row of catRows) {
      if (catSelected >= quotas[cat]) break;
      if (add(row)) catSelected++;
    }
  }

  // Fill remaining slots from top-scorers if target not met
  for (const row of [...rows].sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id))) {
    if (selected.size >= target) break;
    const catCount = rows.filter((r) => selected.has(r.id) && r.category === row.category).length;
    if (catCount >= Math.floor(target * 0.45)) continue;
    add(row);
  }

  const tierA = rows
    .filter((r) => selected.has(r.id))
    .sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id));
  const tierB = rows
    .filter((r) => !selected.has(r.id))
    .sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id));

  tierA.forEach((row, i) => { row.curation.rank = i + 1; });

  const byCategory = Object.fromEntries(CATEGORIES.map((cat) => [cat, tierA.filter((r) => r.category === cat).length]));
  const represented = Object.values(byCategory).filter((n) => n > 0).length;
  const maxShare = Math.max(...Object.values(byCategory)) / Math.max(1, tierA.length);

  return {
    tierA,
    tierB,
    stats: {
      cityName,
      total: activities.length,
      tierACount: tierA.length,
      tierBCount: tierB.length,
      byCategory,
      chainsDetected,
      acceptancePassed: represented >= 4 && maxShare <= 0.55 && tierA.length >= 50,
    },
  };
}

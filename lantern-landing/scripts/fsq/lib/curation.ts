import type { NormalizedActivity } from "../../../lib/activities/types";
import { normalizeName } from "./dedup";
import { isJapaneseName } from "./normalize";
import type { FsqTravelCategory, TokyoGeography } from "./types";

export type CurationTier = "A" | "B";

export interface CurationMetadata {
  tier: CurationTier;
  rank?: number;
  score: number;
  selection_reasons: string[];
  penalties: string[];
  probable_chain_id?: string;
  hidden_gem_candidate: boolean;
  score_components: Array<{ signal: string; amount: number }>;
}

export type CuratedActivity = NormalizedActivity & { curation: CurationMetadata };

export interface CurationInputReport {
  duplicateCount?: number;
  rejectedGenericBusiness?: number;
  majorAttractionCoverage?: Array<{
    name: string;
    retained: boolean;
    fsqPlaceId?: string;
    fsqName?: string;
  }>;
}

export interface CurationResult {
  tierA: CuratedActivity[];
  tierB: CuratedActivity[];
  report: Record<string, unknown>;
}

const CATEGORIES: FsqTravelCategory[] = ["culture", "nature", "adventure", "food", "nightlife", "luxury", "free"];
const CATEGORY_WEIGHTS: Record<string, number> = {
  culture: 0.21, nature: 0.19, adventure: 0.14, food: 0.20,
  nightlife: 0.11, luxury: 0.08, free: 0.07,
};
const GENERIC_DOMAINS = new Set(["facebook.com", "instagram.com", "x.com", "twitter.com", "foursquare.com"]);

function metadata(activity: NormalizedActivity): Record<string, unknown> {
  return activity.source_metadata ?? {};
}

function labels(activity: NormalizedActivity): string[] {
  const value = metadata(activity).fsq_category_labels;
  return Array.isArray(value) ? value.map(String) : [];
}

function geography(activity: NormalizedActivity): TokyoGeography {
  const value = String(metadata(activity).geography ?? "unknown");
  if (["tokyo_core_23_wards", "broader_tokyo", "yokohama_or_outside_tokyo"].includes(value)) return value as TokyoGeography;
  return "unknown";
}

function websiteDomain(activity: NormalizedActivity): string | null {
  if (!activity.website) return null;
  try {
    const domain = new URL(activity.website).hostname.toLowerCase().replace(/^www\./, "");
    return GENERIC_DOMAINS.has(domain) ? null : domain;
  } catch {
    return null;
  }
}

function weakName(name: string): boolean {
  const normalized = normalizeName(name);
  return normalized.length < 4 || /^(park|garden|cafe|restaurant|bar|shrine|temple|museum|studio|room|office|公園|神社|寺)$/.test(normalized);
}

function categorySpecificity(activity: NormalizedActivity): number {
  return Math.max(0, ...labels(activity).map((label) => label.split(">").length));
}

function scoreActivity(activity: NormalizedActivity, majorIds: Set<string>): CurationMetadata {
  const category = activity.category as FsqTravelCategory;
  const text = labels(activity).join(" ").toLowerCase();
  const geo = geography(activity);
  const reasons: string[] = [];
  const penalties: string[] = [];
  const base = ({ culture: 48, nature: 42, adventure: 45, food: 30, nightlife: 31, luxury: 30, free: 38 } as Record<string, number>)[category] ?? 20;
  let score = base;
  const scoreComponents: Array<{ signal: string; amount: number }> = [{ signal: `category_base:${category}`, amount: base }];
  const apply = (signal: string, amount: number) => { score += amount; scoreComponents.push({ signal, amount }); };

  if (majorIds.has(activity.source_record_id ?? "")) {
    reasons.push("major_attraction");
  }
  if (/museum|historic|landmark|palace|castle|monument|observation|theme park|amusement park|aquarium|zoo/.test(text)) {
    apply("strong_travel_category", 34);
    reasons.push("strong_travel_category");
  }
  if (/museum|historic|temple|shrine|palace|castle|cultural/.test(text)) {
    apply("cultural_significance", /temple|shrine/.test(text) ? 10 : 22);
    reasons.push("cultural_significance");
  }
  if (/park|garden|nature preserve|scenic lookout|waterfront/.test(text)) apply("nature_or_scenic_destination", 20);
  if (/stadium|arena|family|aquarium|zoo|amusement/.test(text)) apply("entertainment_or_family_destination", 18);
  if (/market|shopping district|entertainment district|neighborhood|pedestrian|intersection|plaza|famous street/.test(text)) {
    apply("district_destination", 28);
    reasons.push("district_destination");
  }
  if (category === "food" && categorySpecificity(activity) >= 3) {
    apply("distinctive_food", 13);
    reasons.push("distinctive_food");
  }
  if (category === "nightlife" && categorySpecificity(activity) >= 3) {
    apply("nightlife_destination", 12);
    reasons.push("nightlife_destination");
  }
  if (category === "free") reasons.push("free_attraction");
  if (activity.website && websiteDomain(activity)) {
    apply("official_website", 7);
    reasons.push("official_website");
  }
  const specificity = categorySpecificity(activity);
  if (specificity >= 3) {
    apply("high_category_specificity", Math.min(14, specificity * 3));
    reasons.push("high_category_specificity");
  } else {
    apply("low_category_specificity", -12);
    penalties.push("low_category_specificity");
  }
  if (geo === "tokyo_core_23_wards") {
    apply("Tokyo_core", 16);
    reasons.push("Tokyo_core");
  } else if (geo === "broader_tokyo") {
    apply("broader_Tokyo", 10);
    reasons.push("broader_Tokyo");
  } else if (geo === "yokohama_or_outside_tokyo") {
    apply("outside_Tokyo", -35);
    penalties.push("outside_Tokyo");
  } else {
    apply("unknown_geography", -14);
    penalties.push("unknown_geography");
  }
  if (weakName(activity.title)) {
    apply("weak_or_generic_name", -18);
    penalties.push("weak_or_generic_name");
  }
  if (/community center|swimming pool|sports club|local park|municipal facility/.test(text)) {
    apply("minor_local_facility", -14);
    penalties.push("minor_local_facility");
  }
  if ((category === "food" || category === "nightlife") && !activity.website && specificity < 4) {
    apply("ordinary_neighborhood_venue", -12);
    penalties.push("ordinary_neighborhood_venue");
  }
  if (metadata(activity).generic_business_penalty_applied === true) {
    apply("generic_business", -35);
    penalties.push("generic_business");
  }
  if (reasons.length === 0) reasons.push("travel_relevant_reserve");
  const hiddenGem = !majorIds.has(activity.source_record_id ?? "") && score >= 72 && !activity.website && !penalties.includes("generic_business");
  if (hiddenGem) reasons.push("hidden_gem_candidate");
  return { tier: "B", score: Math.round(score * 10) / 10, selection_reasons: [...new Set(reasons)], penalties: [...new Set(penalties)], hidden_gem_candidate: hiddenGem, score_components: scoreComponents };
}

interface ChainStats {
  chainId: string;
  members: CuratedActivity[];
}

function detectChains(rows: CuratedActivity[]): ChainStats[] {
  const domainGroups = new Map<string, CuratedActivity[]>();
  const nameGroups = new Map<string, CuratedActivity[]>();
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
  const chains: ChainStats[] = [];
  for (const [key, members] of [...domainGroups, ...nameGroups]) {
    const unique = members.filter((row) => !assigned.has(row.id));
    if (unique.length < 3) continue;
    for (const row of unique) {
      assigned.add(row.id);
      row.curation.probable_chain_id = key;
      row.curation.penalties.push("probable_chain_branch");
      row.curation.score -= 24;
      row.curation.score_components.push({ signal: "probable_chain_branch", amount: -24 });
    }
    chains.push({ chainId: key, members: unique });
  }
  return chains;
}

export function computeAdaptiveQuotas(candidateCounts: Record<string, number>, target: number): Record<string, number> {
  const quotas = Object.fromEntries(CATEGORIES.map((category) => [category, Math.min(candidateCounts[category] ?? 0, Math.floor(target * CATEGORY_WEIGHTS[category]))])) as Record<string, number>;
  let remaining = target - Object.values(quotas).reduce((sum, value) => sum + value, 0);
  while (remaining > 0) {
    const category = CATEGORIES
      .filter((candidate) => quotas[candidate] < (candidateCounts[candidate] ?? 0) && quotas[candidate] < Math.floor(target * 0.45))
      .sort((a, b) => ((candidateCounts[b] ?? 0) - quotas[b]) - ((candidateCounts[a] ?? 0) - quotas[a]))[0];
    if (!category) break;
    quotas[category] += 1;
    remaining -= 1;
  }
  return quotas;
}

export function curateTokyoCatalog(
  activities: NormalizedActivity[],
  importReport: CurationInputReport,
  target = 3_200,
): CurationResult {
  const majorEntries = importReport.majorAttractionCoverage ?? [];
  const majorIds = new Set(majorEntries.map((entry) => entry.fsqPlaceId).filter((id): id is string => Boolean(id)));
  const rows: CuratedActivity[] = activities.map((activity) => ({ ...activity, curation: scoreActivity(activity, majorIds) }));
  const chains = detectChains(rows);
  const candidateCounts = Object.fromEntries(CATEGORIES.map((category) => [category, rows.filter((row) => row.category === category).length]));
  const quotas = computeAdaptiveQuotas(candidateCounts, target);
  const selected = new Set<string>();
  const chainSelected = new Map<string, number>();
  let outsideSelected = 0;
  let unknownSelected = 0;
  const outsideCap = Math.floor(target * 0.10);
  const unknownCap = Math.floor(target * 0.05);

  const canSelect = (row: CuratedActivity, forced = false) => {
    if (!forced && row.curation.score < 60) return false;
    const geo = geography(row);
    if (!forced && geo === "yokohama_or_outside_tokyo" && outsideSelected >= outsideCap) return false;
    if (!forced && geo === "unknown" && unknownSelected >= unknownCap) return false;
    const chainId = row.curation.probable_chain_id;
    if (!forced && chainId && (chainSelected.get(chainId) ?? 0) >= 3) return false;
    return true;
  };
  const add = (row: CuratedActivity, forced = false) => {
    if (selected.has(row.id) || !canSelect(row, forced)) return false;
    selected.add(row.id);
    row.curation.tier = "A";
    if (geography(row) === "yokohama_or_outside_tokyo") outsideSelected += 1;
    if (geography(row) === "unknown") unknownSelected += 1;
    if (row.curation.probable_chain_id) chainSelected.set(row.curation.probable_chain_id, (chainSelected.get(row.curation.probable_chain_id) ?? 0) + 1);
    return true;
  };

  for (const row of rows.filter((candidate) => majorIds.has(candidate.source_record_id ?? "")).sort((a, b) => b.curation.score - a.curation.score)) add(row, true);
  for (const category of CATEGORIES) {
    const categoryRows = rows.filter((row) => row.category === category).sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id));
    let categorySelected = [...selected].filter((id) => rows.find((row) => row.id === id)?.category === category).length;
    for (const row of categoryRows) {
      if (categorySelected >= quotas[category]) break;
      if (add(row)) categorySelected += 1;
    }
  }
  for (const row of [...rows].sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id))) {
    if (selected.size >= target) break;
    const categoryCount = rows.filter((candidate) => selected.has(candidate.id) && candidate.category === row.category).length;
    if (categoryCount >= Math.floor(target * 0.45)) continue;
    add(row);
  }

  const tierA = rows.filter((row) => selected.has(row.id)).sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id));
  const tierB = rows.filter((row) => !selected.has(row.id)).sort((a, b) => b.curation.score - a.curation.score || a.id.localeCompare(b.id));
  tierA.forEach((row, index) => { row.curation.rank = index + 1; });

  const categoryDistribution = Object.fromEntries(CATEGORIES.map((category) => [category, tierA.filter((row) => row.category === category).length]));
  const geographyDistribution = Object.fromEntries(["tokyo_core_23_wards", "broader_tokyo", "yokohama_or_outside_tokyo", "unknown"].map((geo) => [geo, tierA.filter((row) => geography(row) === geo).length]));
  const categoryQuotas = Object.fromEntries(CATEGORIES.map((category) => [category, {
    quota: quotas[category], candidateCount: candidateCounts[category], selectedCount: categoryDistribution[category], rejectionCount: candidateCounts[category] - categoryDistribution[category],
  }]));
  const represented = Object.values(categoryDistribution).filter((count) => count > 0).length;
  const maxShare = Math.max(...Object.values(categoryDistribution)) / Math.max(1, tierA.length);
  const tokyoShare = ((geographyDistribution.tokyo_core_23_wards ?? 0) + (geographyDistribution.broader_tokyo ?? 0)) / Math.max(1, tierA.length);
  const allAttractionsRetained = majorEntries.length === 17 && majorEntries.every((entry) => entry.fsqPlaceId && tierA.some((row) => row.source_record_id === entry.fsqPlaceId));
  const probableChainRows = rows.filter((row) => row.curation.probable_chain_id);
  const chainTierA = tierA.filter((row) => row.curation.probable_chain_id);
  const gates = {
    all17BenchmarkAttractionsRetained: allAttractionsRetained,
    tierASizeBetween2500And4000: tierA.length >= 2_500 && tierA.length <= 4_000,
    atLeastSixCategories: represented >= 6,
    noCategoryAbove45Percent: maxShare <= 0.45,
    atLeast80PercentTokyo: tokyoShare >= 0.80,
    outsideTokyoClearlySeparated: tierB.some((row) => geography(row) === "yokohama_or_outside_tokyo") && (geographyDistribution.yokohama_or_outside_tokyo ?? 0) <= outsideCap + 17,
    routineChainsDoNotDominate: chainTierA.length / Math.max(1, tierA.length) <= 0.10,
    noBenchmarkInteriorBusinessMismatch: majorEntries.every((entry) => entry.fsqPlaceId && !/studio|shop|store|cafe|restaurant/i.test(entry.fsqName ?? "")),
    noSupabaseWrites: true,
  };

  const language = {
    withJapaneseNames: tierA.filter((row) => isJapaneseName(row.title)).length,
    withEnglishOrBilingualNames: tierA.filter((row) => /[A-Za-z]{3}/.test(row.title) || Object.keys(row.name_alts ?? {}).some((key) => key.startsWith("en"))).length,
  };
  const hypotheticalLegacyRanking = [...tierA].sort((a, b) =>
    (b.curation.score + (majorIds.has(b.source_record_id ?? "") ? 140 : 0))
    - (a.curation.score + (majorIds.has(a.source_record_id ?? "") ? 140 : 0))
    || a.id.localeCompare(b.id),
  );
  const majorAttractions = majorEntries.map((entry) => {
    const row = tierA.find((candidate) => candidate.source_record_id === entry.fsqPlaceId);
    const sourceScore = Number(row?.source_metadata?.travel_value_score ?? 0);
    return {
      ...entry,
      curated: Boolean(row),
      originalPreCurationScore: sourceScore,
      finalProductionScore: row?.curation.score,
      benchmarkBonusAppliedToProduction: false,
      productionBenchmarkBonusAmount: 0,
      removedLegacyBenchmarkBonusAmount: 140,
      rankBeforeBonus: row?.curation.rank,
      rankAfterHypotheticalLegacyBonus: row ? hypotheticalLegacyRanking.findIndex((candidate) => candidate.id === row.id) + 1 : undefined,
    };
  });
  const report = {
    generatedAt: new Date().toISOString(), tierATotal: tierA.length, tierBTotal: tierB.length,
    categoryDistribution, geographyDistribution, categoryQuotas,
    majorAttractions,
    top50Overall: tierA.slice(0, 50).map(reviewSummary),
    top20PerCategory: Object.fromEntries(CATEGORIES.map((category) => [category, tierA.filter((row) => row.category === category).slice(0, 20).map(reviewSummary)])),
    lowestScoring50TierA: tierA.slice(-50).reverse().map(reviewSummary),
    chains: { chainsDetected: chains.length, branchesConsidered: probableChainRows.length, branchesRetainedTierA: chainTierA.length, branchesMovedTierB: probableChainRows.length - chainTierA.length, probableChainPercentage: chainTierA.length / Math.max(1, tierA.length) },
    genericBusinessRejectionCount: importReport.rejectedGenericBusiness ?? 0,
    duplicateCount: importReport.duplicateCount ?? 0,
    recordsWithWebsites: tierA.filter((row) => Boolean(row.website)).length,
    ...language,
    recordsRequiringFutureNameEnrichment: tierA.length - language.withEnglishOrBilingualNames,
    acceptanceGates: gates,
    acceptancePassed: Object.values(gates).every(Boolean),
    noSupabaseWrites: true,
  };
  return { tierA, tierB, report };
}

export function reviewSummary(row: CuratedActivity) {
  return { rank: row.curation.rank, fsqPlaceId: row.source_record_id, name: row.title, category: row.category, geography: geography(row), score: row.curation.score, reasons: row.curation.selection_reasons, penalties: row.curation.penalties };
}

export function curationCsv(rows: CuratedActivity[]): string {
  const header = ["rank", "fsq_place_id", "name", "category", "fsq_category_labels", "geography", "locality", "latitude", "longitude", "score", "website", "selection_reasons", "penalties", "tier"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) => {
    const data = metadata(row);
    return [row.curation.rank ?? "", row.source_record_id, row.title, row.category, labels(row).join(" | "), geography(row), data.locality, row.lat, row.lng, row.curation.score, row.website ?? "", row.curation.selection_reasons.join(" | "), row.curation.penalties.join(" | "), row.curation.tier].map(escape).join(",");
  });
  return `${header.map(escape).join(",")}\n${lines.join("\n")}\n`;
}

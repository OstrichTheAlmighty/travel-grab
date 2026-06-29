import type { EnrichedActivity } from "./wikimediaTypes";

export type HighlightEntityGroup = "museum" | "landmark_observation" | "park_nature" | "shrine_temple" | "district_market_shopping" | "amusement_family" | "sports" | "food" | "nightlife" | "other";

function sourceLabels(row: EnrichedActivity): string {
  const labels = row.source_metadata?.fsq_category_labels;
  return Array.isArray(labels) ? labels.join(" ").toLowerCase() : "";
}

export function entityGroup(row: EnrichedActivity): HighlightEntityGroup {
  const text = `${sourceLabels(row)} ${row.enrichment.entity_types.join(" ")}`.toLowerCase();
  if (/museum|gallery|博物館|美術館/.test(text)) return "museum";
  if (/amusement|theme park|aquarium|zoo|family attraction/.test(text)) return "amusement_family";
  if (/shrine|temple|spiritual|神社|神宮|寺/.test(text)) return "shrine_temple";
  if (/neighborhood|district|market|shopping|intersection|street|plaza/.test(text)) return "district_market_shopping";
  if (/park|garden|nature reserve|公園|庭園/.test(text)) return "park_nature";
  if (/tower|monument|palace|historic|observation|landmark|crossing/.test(text)) return "landmark_observation";
  if (/stadium|arena|sport|racecourse/.test(text)) return "sports";
  if (row.corrected_category === "food") return "food";
  if (row.corrected_category === "nightlife") return "nightlife";
  return "other";
}

export function rankingCategory(row: EnrichedActivity): string {
  const group = entityGroup(row);
  if (group === "district_market_shopping") return "shopping_districts";
  if (row.corrected_category === "adventure") return "adventure_family";
  return row.corrected_category;
}

function increment(map: Map<string, number>, key: string): void { map.set(key, (map.get(key) ?? 0) + 1); }

export function diversityAwareHighlights(rows: EnrichedActivity[], count = 100): EnrichedActivity[] {
  const remaining = [...rows].filter((row) => ["tokyo_core", "broader_tokyo"].includes(row.catalog_classification)).sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id));
  const selected: EnrichedActivity[] = [];
  const groupCounts = new Map<string, number>();
  while (selected.length < count && remaining.length) {
    const cap = selected.length < 30 ? 12 : 40;
    let index = remaining.findIndex((row) => (groupCounts.get(entityGroup(row)) ?? 0) < cap);
    if (index < 0) index = 0;
    const [row] = remaining.splice(index, 1);
    selected.push(row);
    increment(groupCounts, entityGroup(row));
  }
  return selected;
}

export function buildRankingCalibration(rows: EnrichedActivity[]) {
  const baseline = [...rows].filter((row) => ["tokyo_core", "broader_tokyo"].includes(row.catalog_classification)).sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id));
  const calibrated = diversityAwareHighlights(rows, 100);
  const preRanks = new Map(baseline.map((row, index) => [row.id, index + 1]));
  const postRanks = new Map(calibrated.map((row, index) => [row.id, index + 1]));
  const summary = (row: EnrichedActivity) => ({ fsqPlaceId: row.source_record_id, name: row.title, category: rankingCategory(row), entityTypeGroup: entityGroup(row), verified: row.enrichment.match_status === "verified", score: row.final_display_score, preCalibrationRank: preRanks.get(row.id), postCalibrationRank: postRanks.get(row.id), rankComponents: row.display_score_components, penalties: row.display_penalties });
  const distribution = (selected: EnrichedActivity[]) => ({
    categories: Object.fromEntries([...new Set(selected.map(rankingCategory))].map((category) => [category, selected.filter((row) => rankingCategory(row) === category).length])),
    entityTypes: Object.fromEntries([...new Set(selected.map(entityGroup))].map((group) => [group, selected.filter((row) => entityGroup(row) === group).length])),
  });
  const rankingNames = ["culture", "nature", "adventure_family", "food", "nightlife", "shopping_districts", "free"];
  return {
    overallTokyoHighlights: calibrated.map(summary),
    top30Distribution: distribution(calibrated.slice(0, 30)),
    top100Distribution: distribution(calibrated),
    categoryRankings: Object.fromEntries(rankingNames.map((category) => [category, baseline.filter((row) => rankingCategory(row) === category).slice(0, 100).map(summary)])),
    metroExcursions: [...rows].filter((row) => row.catalog_classification === "metro_excursion").sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id)).slice(0, 100).map(summary),
    rankAudit: baseline.map(summary),
    maxTop30EntityTypeShare: Math.max(...Object.values(distribution(calibrated.slice(0, 30)).entityTypes)) / Math.max(1, Math.min(30, calibrated.length)),
  };
}

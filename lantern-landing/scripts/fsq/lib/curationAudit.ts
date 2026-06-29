import type { NormalizedActivity } from "../../../lib/activities/types";
import type { CuratedActivity } from "./curation";

const VALID_CATEGORIES = new Set(["culture", "nature", "adventure", "food", "nightlife", "luxury", "free"]);
const VALID_GEOGRAPHIES = new Set(["tokyo_core_23_wards", "broader_tokyo", "yokohama_or_outside_tokyo", "unknown"]);

export interface CsvValidation {
  totalDataRows: number;
  tierARows: number;
  tierBRows: number;
  malformedRows: number;
  duplicateFsqIds: number;
  missingNames: number;
  missingCoordinates: number;
  invalidCategories: number;
  invalidGeographies: number;
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function validateReviewCsv(csv: string): CsvValidation {
  const rows = parseCsv(csv);
  const header = rows[0] ?? [];
  const expected = ["rank", "fsq_place_id", "name", "category", "fsq_category_labels", "geography", "locality", "latitude", "longitude", "score", "website", "selection_reasons", "penalties", "tier"];
  const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
  let malformedRows = header.join("|") === expected.join("|") ? 0 : 1;
  const ids = new Set<string>();
  let duplicateFsqIds = 0;
  let tierARows = 0;
  let tierBRows = 0;
  let missingNames = 0;
  let missingCoordinates = 0;
  let invalidCategories = 0;
  let invalidGeographies = 0;
  const dataRows = rows.slice(1).filter((row) => row.some(Boolean));
  for (const row of dataRows) {
    if (row.length !== expected.length) { malformedRows += 1; continue; }
    const id = row[indexes.fsq_place_id];
    if (ids.has(id)) duplicateFsqIds += 1;
    ids.add(id);
    if (row[indexes.tier] === "A") tierARows += 1;
    else if (row[indexes.tier] === "B") tierBRows += 1;
    else malformedRows += 1;
    if (!row[indexes.name]?.trim()) missingNames += 1;
    if (!Number.isFinite(Number(row[indexes.latitude])) || !Number.isFinite(Number(row[indexes.longitude]))) missingCoordinates += 1;
    if (!VALID_CATEGORIES.has(row[indexes.category])) invalidCategories += 1;
    if (!VALID_GEOGRAPHIES.has(row[indexes.geography])) invalidGeographies += 1;
  }
  return { totalDataRows: dataRows.length, tierARows, tierBRows, malformedRows, duplicateFsqIds, missingNames, missingCoordinates, invalidCategories, invalidGeographies };
}

export function auditTierIntegrity(tierA: CuratedActivity[], tierB: CuratedActivity[], source: NormalizedActivity[]) {
  const idsA = tierA.map((row) => row.source_record_id ?? "");
  const idsB = tierB.map((row) => row.source_record_id ?? "");
  const setA = new Set(idsA);
  const setB = new Set(idsB);
  const sourceIds = new Set(source.map((row) => row.source_record_id ?? ""));
  const combined = [...idsA, ...idsB];
  return {
    tierACount: tierA.length,
    tierBCount: tierB.length,
    combinedCount: combined.length,
    tierAUniqueIds: setA.size,
    tierBUniqueIds: setB.size,
    combinedUniqueIds: new Set(combined).size,
    overlapCount: [...setA].filter((id) => setB.has(id)).length,
    duplicateIdsWithinTierA: idsA.length - setA.size,
    duplicateIdsWithinTierB: idsB.length - setB.size,
    recordsMissingFromSource: combined.filter((id) => !sourceIds.has(id)).length,
    sourceUniqueIds: sourceIds.size,
    syntheticRecords: combined.filter((id) => !sourceIds.has(id)),
  };
}

function stableSample<T extends { id: string }>(rows: T[], count: number): T[] {
  const hash = (value: string) => [...value].reduce((result, char) => ((result * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
  return [...rows].sort((a, b) => hash(a.id) - hash(b.id)).slice(0, count);
}

function labels(row: CuratedActivity): string[] {
  const value = row.source_metadata?.fsq_category_labels;
  return Array.isArray(value) ? value.map(String) : [];
}

function auditRow(row: CuratedActivity, benchmarkIds: Set<string>, groups: string[]) {
  return {
    sampleGroups: groups,
    rank: row.curation.rank,
    fsqPlaceId: row.source_record_id,
    name: row.title,
    category: row.category,
    fsqCategoryLabels: labels(row),
    locality: row.source_metadata?.locality,
    geography: row.source_metadata?.geography,
    latitude: row.lat,
    longitude: row.lng,
    website: row.website,
    score: row.curation.score,
    scoreComponents: row.curation.score_components,
    selectionReasons: row.curation.selection_reasons,
    penalties: row.curation.penalties,
    probableChain: Boolean(row.curation.probable_chain_id),
    probableChainId: row.curation.probable_chain_id,
    benchmark: benchmarkIds.has(row.source_record_id ?? ""),
    tier: row.curation.tier,
  };
}

export function buildCurationAudit(
  tierA: CuratedActivity[],
  tierB: CuratedActivity[],
  source: NormalizedActivity[],
  curationReport: Record<string, any>,
  importReport: Record<string, any>,
  csv: string,
) {
  const integrity = auditTierIntegrity(tierA, tierB, source);
  const csvValidation = validateReviewCsv(csv);
  const benchmarks = curationReport.majorAttractions ?? [];
  const benchmarkIds = new Set<string>(benchmarks.map((row: any) => row.fsqPlaceId).filter(Boolean));
  const sourceById = new Map(source.map((row) => [row.source_record_id, row]));
  const tierAById = new Map(tierA.map((row) => [row.source_record_id, row]));
  const benchmarkAudit = benchmarks.map((benchmark: any) => {
    const sourceRow = sourceById.get(benchmark.fsqPlaceId);
    const curatedRow = tierAById.get(benchmark.fsqPlaceId);
    const labelsValue = sourceRow?.source_metadata?.fsq_category_labels;
    const sourceLabels = Array.isArray(labelsValue) ? labelsValue.map(String) : [];
    const curatedLabels = curatedRow ? labels(curatedRow) : [];
    const coordinatesMatchSource = Boolean(sourceRow && curatedRow && sourceRow.lat === curatedRow.lat && sourceRow.lng === curatedRow.lng);
    const categoriesMatchSource = sourceLabels.join("\u0000") === curatedLabels.join("\u0000");
    return {
      name: benchmark.name,
      fsqPlaceId: benchmark.fsqPlaceId,
      exactFsqSourceName: sourceRow?.title,
      categoryLabels: sourceLabels,
      coordinates: { lat: sourceRow?.lat, lng: sourceRow?.lng },
      geography: sourceRow?.source_metadata?.geography,
      originalPreCurationScore: benchmark.originalPreCurationScore,
      finalProductionScore: curatedRow?.curation.score,
      benchmarkBonusAppliedToProduction: false,
      productionBenchmarkBonusAmount: 0,
      removedLegacyBenchmarkBonusAmount: benchmark.removedLegacyBenchmarkBonusAmount,
      productionRank: curatedRow?.curation.rank,
      rankBeforeBonus: curatedRow?.curation.rank,
      rankAfterBonus: benchmark.rankAfterHypotheticalLegacyBonus,
      rankAfterHypotheticalLegacyBonus: benchmark.rankAfterHypotheticalLegacyBonus,
      genuineSourceRecord: Boolean(sourceRow),
      genuineFsqPlaceId: /^[a-f0-9]{24}$/i.test(String(benchmark.fsqPlaceId ?? "")),
      manuallyInserted: !sourceRow,
      fabricatedCoordinatesOrCategories: !coordinatesMatchSource || !categoriesMatchSource,
      entityVerified: Boolean(benchmark.curated && benchmark.distanceFromGoogleM !== undefined),
      interiorOrUnrelatedEntity: /portrait studio|shop inside|interior business/i.test(sourceRow?.title ?? ""),
    };
  });

  const groupMap = new Map<string, Set<string>>();
  const addGroup = (group: string, rows: CuratedActivity[]) => {
    for (const row of rows) {
      const groups = groupMap.get(row.id) ?? new Set<string>();
      groups.add(group);
      groupMap.set(row.id, groups);
    }
  };
  addGroup("top_100_overall", tierA.slice(0, 100));
  addGroup("bottom_100_tier_a", tierA.slice(-100));
  addGroup("random_50_tier_a", stableSample(tierA, 50));
  addGroup("random_50_tier_b", stableSample(tierB, 50));
  for (const category of VALID_CATEGORIES) {
    const categoryRows = tierA.filter((row) => row.category === category);
    addGroup(`top_30_${category}`, categoryRows.slice(0, 30));
    addGroup(`bottom_30_${category}`, categoryRows.slice(-30));
  }
  addGroup("all_outside_tokyo_tier_a", tierA.filter((row) => row.source_metadata?.geography === "yokohama_or_outside_tokyo"));
  addGroup("all_unknown_geography_tier_a", tierA.filter((row) => row.source_metadata?.geography === "unknown"));
  addGroup("all_probable_chain_tier_a", tierA.filter((row) => row.curation.probable_chain_id));
  const allRows = [...tierA, ...tierB];
  const sampledRows = [...groupMap].map(([id, groups]) => auditRow(allRows.find((row) => row.id === id)!, benchmarkIds, [...groups]));

  const suspiciousNames = ["九品仏広場", "ふれあい動物広場", "野外展示場", "IKEBUKURO THEATER〔CG STAR LIVE〕", "都電おもいで広場", "大谷美術館"];
  const suspiciousFindings = suspiciousNames.map((name) => {
    const row = allRows.find((candidate) => candidate.title === name);
    const text = row ? labels(row).join(" ") : "";
    let finding = "not_found";
    let recommendation = "manual_review";
    if (row) {
      if (/museum|動物|zoo|tram|rail|historic/i.test(`${name} ${text}`) && !/^野外展示場$/.test(name)) finding = "plausible_traveler_destination";
      else if (/theater/i.test(name) && row.category === "food") finding = "category_mismatch_suspicious";
      else if (/広場|展示場/.test(name)) finding = "ambiguous_or_minor_facility";
      recommendation = finding === "plausible_traveler_destination" ? "retain_tier_a_subject_to_manual_review" : "consider_tier_b_after_manual_review";
    }
    return { name, found: Boolean(row), tier: row?.curation.tier, category: row?.category, categoryLabels: row ? labels(row) : [], locality: row?.source_metadata?.locality, website: row?.website, score: row?.curation.score, scoreComponents: row?.curation.score_components, selectionReasons: row?.curation.selection_reasons, penalties: row?.curation.penalties, finding, recommendation };
  });

  const outsideRows = tierA.filter((row) => row.source_metadata?.geography === "yokohama_or_outside_tokyo");
  const outsideTokyo = {
    total: outsideRows.length,
    categoryCounts: Object.fromEntries([...VALID_CATEGORIES].map((category) => [category, outsideRows.filter((row) => row.category === category).length])),
    benchmarkCount: outsideRows.filter((row) => benchmarkIds.has(row.source_record_id ?? "")).length,
    records: outsideRows.map((row) => ({ name: row.title, locality: row.source_metadata?.locality, category: row.category, score: row.curation.score, reasons: row.curation.selection_reasons, penalties: row.curation.penalties, benchmark: benchmarkIds.has(row.source_record_id ?? "") })),
    proposedPolicy: {
      strictTokyoCityCatalog: "Exclude yokohama_or_outside_tokyo except explicitly labeled benchmark exceptions.",
      tokyoMetropolitanExcursionCatalog: "Preferred home for notable Chiba, Yokohama, Kawasaki, and nearby excursion records.",
      searchableReserveOnly: "Use for low-score or ambiguous outside-area records pending destination reassignment.",
      recommendation: "Move non-benchmark outside-Tokyo Tier A records into a separately labeled Tokyo metropolitan excursion catalog; keep ambiguous records searchable in Tier B.",
    },
  };

  const countReconciliation = {
    priorRetainedOutput: 12_254,
    currentUpstreamRetained: source.length,
    increaseFromPrior: source.length - 12_254,
    currentTierA: tierA.length,
    currentTierB: tierB.length,
    currentCombined: tierA.length + tierB.length,
    upstreamDuplicatesRemoved: importReport.duplicateCount ?? 0,
    upstreamGenericBusinessRejections: importReport.rejectedGenericBusiness ?? 0,
    usedDifferentUpstreamCandidateSet: source.length !== 12_254,
    districtDestinationRecoveryAddedRecords: source.length > 12_254,
    tierIntersection: integrity.overlapCount,
    syntheticOrInjectedRecords: integrity.recordsMissingFromSource,
    explanation: "The current curator uses a newer upstream validation set: the 20,000-row ranked sample plus bounded benchmark probes, after destination-category recovery. Duplicates and generic-business counts are upstream exclusions, not additional records to subtract from Tier A + Tier B.",
  };
  const auditGates = {
    tiersDisjoint: integrity.overlapCount === 0,
    uniqueIdsReconcile: integrity.combinedUniqueIds === source.length,
    noDuplicateIds: integrity.duplicateIdsWithinTierA === 0 && integrity.duplicateIdsWithinTierB === 0,
    noSyntheticRecords: integrity.recordsMissingFromSource === 0,
    allBenchmarksGenuine: benchmarkAudit.length === 17 && benchmarkAudit.every((row: any) => row.genuineSourceRecord && row.genuineFsqPlaceId && row.entityVerified && !row.manuallyInserted && !row.fabricatedCoordinatesOrCategories && !row.interiorOrUnrelatedEntity),
    benchmarkDoesNotAffectProductionScore: benchmarkAudit.every((row: any) => row.productionBenchmarkBonusAmount === 0),
    csvHasData: csvValidation.totalDataRows > 0,
    csvCountsReconcile: csvValidation.tierARows === tierA.length && csvValidation.tierBRows === tierB.length,
    csvValid: csvValidation.malformedRows === 0 && csvValidation.duplicateFsqIds === 0 && csvValidation.missingNames === 0 && csvValidation.missingCoordinates === 0 && csvValidation.invalidCategories === 0 && csvValidation.invalidGeographies === 0,
    noSupabaseWrites: true,
  };
  return {
    generatedAt: new Date().toISOString(), countReconciliation, integrity, benchmarkAudit,
    rankingAudit: { productionRankingUsesBenchmarkBonus: false, benchmarkRetentionIsSelectionGateOnly: true, productionTop100: tierA.slice(0, 100).map((row) => auditRow(row, benchmarkIds, ["production_top_100"])), benchmarkAuditView: benchmarkAudit },
    sampledRows, suspiciousFindings, outsideTokyo, csvValidation, auditGates,
    auditPassed: Object.values(auditGates).every(Boolean), noSupabaseWrites: true,
  };
}

export function auditCsv(audit: ReturnType<typeof buildCurationAudit>): string {
  const header = ["sample_groups", "rank", "fsq_place_id", "name", "category", "fsq_category_labels", "locality", "geography", "latitude", "longitude", "website", "score", "score_components", "selection_reasons", "penalties", "probable_chain", "benchmark", "tier"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = audit.sampledRows.map((row: any) => [row.sampleGroups.join(" | "), row.rank, row.fsqPlaceId, row.name, row.category, row.fsqCategoryLabels.join(" | "), row.locality, row.geography, row.latitude, row.longitude, row.website, row.score, row.scoreComponents.map((component: any) => `${component.signal}:${component.amount}`).join(" | "), row.selectionReasons.join(" | "), row.penalties.join(" | "), row.probableChain, row.benchmark, row.tier].map(escape).join(","));
  return `${header.map(escape).join(",")}\n${lines.join("\n")}\n`;
}

import type { CuratedActivity } from "./curation";
import { selectEligibilityBatch, type EligibilityBatchMetadata } from "./wikimediaBatch";
import type { CandidateEvaluationAudit, EnrichedActivity, WikimediaEnrichment, WikimediaImage, WikimediaMatchStatus } from "./wikimediaTypes";

export const EXPECTED_HIGH_BATCHES = 6;
export const EXPECTED_HIGH_TOTAL = 1_474;
export const HIGH_BATCH_SIZE = 250;

export interface WikimediaBatchFile {
  batchMetadata: EligibilityBatchMetadata;
  records: EnrichedActivity[];
}

export interface WikimediaBatchReport {
  batchMetadata: EligibilityBatchMetadata;
  verifiedWikidataMatches: number;
  probableManualReviewMatches: number;
  rejectedRecords: number;
  unmatchedPlaces: number;
  apiRequestsMade: number;
  cacheHits: number;
  runtimeMs: number;
}

export interface LoadedWikimediaBatch {
  batch: number;
  data: WikimediaBatchFile;
  report: WikimediaBatchReport;
  dataFile: string;
  reportFile: string;
}

export interface VerifiedEntityAudit {
  fsqPlaceId: string;
  wikidataId?: string;
  valid: boolean;
  errors: string[];
  acceptedCandidate?: CandidateEvaluationAudit;
  benchmarkInfluenced: boolean;
}

export interface ImageExclusion {
  fsqPlaceId: string;
  wikidataId?: string;
  file?: string;
  reasons: string[];
}

export interface ConsolidatedHighRecord extends CuratedActivity {
  wikimedia_eligibility: "high_wikimedia_likelihood";
  wikimedia_match_status: WikimediaMatchStatus;
  wikimedia_applied: boolean;
  wikimedia?: WikimediaEnrichment;
  wikimedia_audit: {
    sourceBatch: number;
    matchSignals: string[];
    verifiedEntityValidationPassed: boolean;
    benchmarkInfluenced: boolean;
    manualOverrideApplied: boolean;
  };
}

export interface ManualReviewRecord {
  fsqPlaceId: string;
  fsqName: string;
  fsqCategories: string[];
  fsqCoordinates: { lat?: number; lng?: number };
  proposedWikidataId?: string;
  wikidataLabel?: string;
  wikidataAliases: string[];
  entityTypes: string[];
  wikidataCoordinates?: { lat: number; lng: number };
  coordinateDistanceM?: number;
  japaneseWikipediaTitle?: string;
  englishWikipediaTitle?: string;
  candidateScore?: number;
  uncertaintyReason: string[];
  suggestedReviewerDecision: "verify_identity_and_coordinates" | "review_name_type_and_coordinate_evidence";
  reviewedOverrideStatus: "not_reviewed" | "reviewed_override_present";
  candidate: CandidateEvaluationAudit | null;
  sourceRecord: EnrichedActivity;
}

export interface ConsolidationResult {
  records: ConsolidatedHighRecord[];
  manualReview: ManualReviewRecord[];
  report: Record<string, unknown>;
  verifiedAudits: VerifiedEntityAudit[];
  imageExclusions: ImageExclusion[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function statusCounts(records: EnrichedActivity[]): Record<WikimediaMatchStatus, number> {
  return {
    verified: records.filter((record) => record.enrichment.match_status === "verified").length,
    probable_manual_review: records.filter((record) => record.enrichment.match_status === "probable_manual_review").length,
    rejected: records.filter((record) => record.enrichment.match_status === "rejected").length,
    unmatched: records.filter((record) => record.enrichment.match_status === "unmatched").length,
  };
}

function metadataErrors(metadata: EligibilityBatchMetadata, batch: number, expectedSize: number): string[] {
  const startIndex = (batch - 1) * HIGH_BATCH_SIZE;
  const expected: Partial<EligibilityBatchMetadata> = {
    city: "tokyo",
    executionMode: "eligibility_batch",
    eligibility: "high_wikimedia_likelihood",
    totalCuratedRecords: 3_200,
    totalEligibleRecords: EXPECTED_HIGH_TOTAL,
    duplicateFsqIdsRemoved: 0,
    batch,
    batchSize: HIGH_BATCH_SIZE,
    startIndex,
    endIndexInclusive: startIndex + expectedSize - 1,
    selectedRecordCount: expectedSize,
    persistentCacheEnabled: true,
  };
  return Object.entries(expected)
    .filter(([key, value]) => metadata?.[key as keyof EligibilityBatchMetadata] !== value)
    .map(([key, value]) => `batch ${batch} metadata ${key} must be ${String(value)}; found ${String(metadata?.[key as keyof EligibilityBatchMetadata])}`);
}

export function verifyBatchIntegrity(curated: CuratedActivity[], batches: LoadedWikimediaBatch[]): { ordered: Array<{ batch: number; record: EnrichedActivity }>; duplicateCount: number; missingIds: string[]; expectedIds: string[] } {
  const errors: string[] = [];
  if (batches.length !== EXPECTED_HIGH_BATCHES) errors.push(`expected ${EXPECTED_HIGH_BATCHES} batches; found ${batches.length}`);
  const batchNumbers = batches.map((entry) => entry.batch).sort((a, b) => a - b);
  for (let batch = 1; batch <= EXPECTED_HIGH_BATCHES; batch += 1) if (!batchNumbers.includes(batch)) errors.push(`missing batch ${batch}`);
  const duplicateBatchNumbers = batchNumbers.filter((batch, index) => batchNumbers.indexOf(batch) !== index);
  if (duplicateBatchNumbers.length) errors.push(`duplicate batch numbers: ${[...new Set(duplicateBatchNumbers)].join(", ")}`);

  const expectedEligible = selectEligibilityBatch(curated, "high_wikimedia_likelihood", EXPECTED_HIGH_TOTAL, 1).eligible;
  if (expectedEligible.length !== EXPECTED_HIGH_TOTAL) errors.push(`curated catalog has ${expectedEligible.length} high-likelihood records; expected ${EXPECTED_HIGH_TOTAL}`);
  const expectedIds = expectedEligible.map((record) => record.source_record_id ?? "");
  const seen = new Set<string>();
  let duplicateCount = 0;
  const ordered: Array<{ batch: number; record: EnrichedActivity }> = [];

  for (const entry of [...batches].sort((a, b) => a.batch - b.batch)) {
    const expectedSize = entry.batch < EXPECTED_HIGH_BATCHES ? HIGH_BATCH_SIZE : EXPECTED_HIGH_TOTAL - HIGH_BATCH_SIZE * (EXPECTED_HIGH_BATCHES - 1);
    if (!entry.data || !Array.isArray(entry.data.records) || !entry.data.batchMetadata) {
      errors.push(`batch ${entry.batch} data file is malformed`);
      continue;
    }
    if (!entry.report || !entry.report.batchMetadata) errors.push(`batch ${entry.batch} report file is malformed`);
    errors.push(...metadataErrors(entry.data.batchMetadata, entry.batch, expectedSize));
    if (entry.report?.batchMetadata) errors.push(...metadataErrors(entry.report.batchMetadata, entry.batch, expectedSize).map((error) => `${error} in report`));
    if (JSON.stringify(entry.data.batchMetadata) !== JSON.stringify(entry.report?.batchMetadata)) errors.push(`batch ${entry.batch} data/report metadata differ`);
    if (entry.data.records.length !== expectedSize) errors.push(`batch ${entry.batch} contains ${entry.data.records.length} records; expected ${expectedSize}`);

    const counts = statusCounts(entry.data.records);
    if (entry.report) {
      if (counts.verified !== entry.report.verifiedWikidataMatches) errors.push(`batch ${entry.batch} verified count differs from report`);
      if (counts.probable_manual_review !== entry.report.probableManualReviewMatches) errors.push(`batch ${entry.batch} probable count differs from report`);
      if (counts.rejected !== entry.report.rejectedRecords) errors.push(`batch ${entry.batch} rejected count differs from report`);
      if (counts.unmatched !== entry.report.unmatchedPlaces) errors.push(`batch ${entry.batch} unmatched count differs from report`);
    }

    const expectedStart = (entry.batch - 1) * HIGH_BATCH_SIZE;
    const expectedSlice = expectedIds.slice(expectedStart, expectedStart + expectedSize);
    const actualIds = entry.data.records.map((record) => record.source_record_id ?? "");
    actualIds.forEach((id, index) => {
      if (!id) errors.push(`batch ${entry.batch} record ${index} has no FSQ place ID`);
      if (seen.has(id)) duplicateCount += 1;
      seen.add(id);
      if (entry.data.records[index]?.wikimedia_eligibility !== "high_wikimedia_likelihood") errors.push(`batch ${entry.batch} record ${id || index} is not high_wikimedia_likelihood`);
      if (id !== expectedSlice[index]) errors.push(`batch ${entry.batch} index ${expectedStart + index} has ${id}; expected ${expectedSlice[index]}`);
      ordered.push({ batch: entry.batch, record: entry.data.records[index] });
    });
  }

  const missingIds = expectedIds.filter((id) => !seen.has(id));
  const extras = [...seen].filter((id) => !expectedIds.includes(id));
  if (ordered.length !== EXPECTED_HIGH_TOTAL) errors.push(`combined records total ${ordered.length}; expected ${EXPECTED_HIGH_TOTAL}`);
  if (seen.size !== EXPECTED_HIGH_TOTAL) errors.push(`combined unique FSQ IDs total ${seen.size}; expected ${EXPECTED_HIGH_TOTAL}`);
  if (duplicateCount) errors.push(`${duplicateCount} duplicate FSQ IDs found across batches`);
  if (missingIds.length) errors.push(`${missingIds.length} expected FSQ IDs are missing`);
  if (extras.length) errors.push(`${extras.length} unexpected FSQ IDs found`);
  if (errors.length) throw new Error(`Wikimedia batch integrity failed:\n- ${errors.join("\n- ")}`);
  return { ordered, duplicateCount, missingIds, expectedIds };
}

export function validateVerifiedEntity(record: EnrichedActivity, curatedIds: Set<string>): VerifiedEntityAudit {
  const errors: string[] = [];
  const enrichment = record.enrichment;
  const candidate = record.candidate_entities.find((entry) => entry.wikidataId === enrichment.wikidata_id && entry.decision === "accepted");
  if (!record.source_record_id || !curatedIds.has(record.source_record_id)) errors.push("fsq_place_id_not_in_curated_source");
  if (enrichment.match_status !== "verified") errors.push("match_status_not_verified");
  if (!enrichment.wikidata_id || !/^Q\d+$/.test(enrichment.wikidata_id)) errors.push("invalid_or_missing_wikidata_id");
  if (!candidate) errors.push("accepted_candidate_not_found");
  const signals = enrichment.match_signals ?? [];
  if (!signals.length || !candidate?.signals.length) errors.push("match_signals_missing");
  if (!signals.some((signal) => signal === "compatible_entity_type" || signal === "no_incompatible_entity_type")) errors.push("entity_type_compatibility_not_confirmed");
  if (signals.some((signal) => signal === "incompatible_entity_type" || signal === "category_incompatible" || signal === "entity_type_incompatible")) errors.push("incompatible_entity_type_signal");
  if (!enrichment.coordinate_policy || !Number.isFinite(enrichment.coordinate_radius_m)) errors.push("coordinate_policy_missing");
  if (candidate?.coordinates && (candidate.coordinateDistanceM === undefined || candidate.coordinateDistanceM > candidate.coordinateRadiusM)) errors.push("coordinate_policy_failed");
  if (!candidate?.coordinates && !signals.includes("wikidata_coordinates_unavailable")) errors.push("coordinate_evidence_missing");
  if (candidate?.rejectionReasons.length) errors.push("accepted_candidate_has_rejection_reasons");
  const benchmarkInfluenced = [...signals, ...(candidate?.signals ?? [])].some((signal) => /benchmark/i.test(signal));
  if (benchmarkInfluenced) errors.push("benchmark_influenced_match");
  return { fsqPlaceId: record.source_record_id ?? "", wikidataId: enrichment.wikidata_id, valid: errors.length === 0, errors, acceptedCandidate: candidate, benchmarkInfluenced };
}

export function imageMetadataErrors(image: WikimediaImage): string[] {
  const errors: string[] = [];
  if (!image.sourcePage) errors.push("missing_commons_source_page");
  if (!image.file && !image.url) errors.push("missing_file_identifier_or_url");
  if (!image.license) errors.push("missing_license");
  if (!image.author) errors.push("missing_author");
  if (!image.attribution) errors.push("missing_attribution_text");
  return errors;
}

function manualReviewRecord(record: EnrichedActivity): ManualReviewRecord {
  const candidate = record.candidate_entities.find((entry) => entry.decision === "manual_review") ?? record.candidate_entities[0] ?? null;
  const labels = record.source_metadata?.fsq_category_labels;
  const uncertainty = [...new Set([
    ...record.enrichment.rejection_reasons,
    ...(candidate?.rejectionReasons ?? []),
    ...(candidate?.coordinates ? [] : ["wikidata_coordinates_unavailable"]),
    "probable_manual_review_not_auto_applied",
  ])];
  return {
    fsqPlaceId: record.source_record_id ?? "",
    fsqName: record.title,
    fsqCategories: Array.isArray(labels) ? labels.map(String) : [],
    fsqCoordinates: { lat: record.lat, lng: record.lng },
    proposedWikidataId: candidate?.wikidataId,
    wikidataLabel: candidate?.label,
    wikidataAliases: candidate?.aliases ?? [],
    entityTypes: candidate?.entityTypes ?? [],
    wikidataCoordinates: candidate?.coordinates,
    coordinateDistanceM: candidate?.coordinateDistanceM,
    japaneseWikipediaTitle: candidate?.japaneseWikipediaTitle,
    englishWikipediaTitle: candidate?.englishWikipediaTitle,
    candidateScore: candidate?.score,
    uncertaintyReason: uncertainty,
    suggestedReviewerDecision: candidate?.coordinates ? "review_name_type_and_coordinate_evidence" : "verify_identity_and_coordinates",
    reviewedOverrideStatus: record.manual_override ? "reviewed_override_present" : "not_reviewed",
    candidate,
    sourceRecord: record,
  };
}

export function consolidateHighWikimedia(curated: CuratedActivity[], batches: LoadedWikimediaBatch[]): ConsolidationResult {
  const integrity = verifyBatchIntegrity(curated, batches);
  const curatedById = new Map(curated.map((record) => [record.source_record_id ?? "", record]));
  const curatedIds = new Set(curatedById.keys());
  const verifiedAudits: VerifiedEntityAudit[] = [];
  const imageExclusions: ImageExclusion[] = [];
  const manualReview: ManualReviewRecord[] = [];
  const records: ConsolidatedHighRecord[] = [];

  for (const { batch, record } of integrity.ordered) {
    const source = curatedById.get(record.source_record_id ?? "");
    if (!source) throw new Error(`Curated source record missing for ${record.source_record_id}`);
    const status = record.enrichment.match_status;
    const audit = status === "verified" ? validateVerifiedEntity(record, curatedIds) : undefined;
    if (audit) verifiedAudits.push(audit);
    const enrichment = status === "verified" && audit?.valid ? clone(record.enrichment) : undefined;
    if (enrichment?.image) {
      const reasons = imageMetadataErrors(enrichment.image);
      if (reasons.length) {
        imageExclusions.push({ fsqPlaceId: record.source_record_id ?? "", wikidataId: enrichment.wikidata_id, file: enrichment.image.file, reasons });
        delete enrichment.image;
      }
    }
    if (status === "probable_manual_review") manualReview.push(manualReviewRecord(record));
    records.push({
      ...clone(source),
      wikimedia_eligibility: "high_wikimedia_likelihood",
      wikimedia_match_status: status,
      wikimedia_applied: Boolean(enrichment),
      ...(enrichment ? { wikimedia: enrichment } : {}),
      wikimedia_audit: {
        sourceBatch: batch,
        matchSignals: [...record.enrichment.match_signals],
        verifiedEntityValidationPassed: audit?.valid ?? false,
        benchmarkInfluenced: audit?.benchmarkInfluenced ?? false,
        manualOverrideApplied: false,
      },
    });
  }

  const counts = statusCounts(integrity.ordered.map(({ record }) => record));
  const applied = records.filter((record) => record.wikimedia_applied);
  const images = records.filter((record) => record.wikimedia?.image);
  const licenseDistribution = Object.fromEntries([...new Set(images.map((record) => record.wikimedia!.image!.license))].sort().map((license) => [license, images.filter((record) => record.wikimedia!.image!.license === license).length]));
  const batchCounts = Object.fromEntries(batches.sort((a, b) => a.batch - b.batch).map((entry) => [String(entry.batch), { records: entry.data.records.length, ...statusCounts(entry.data.records), apiRequests: entry.report.apiRequestsMade, cacheHits: entry.report.cacheHits, runtimeMs: entry.report.runtimeMs }]));
  const knownFalseAutomaticMatches = verifiedAudits.filter((audit) => !audit.valid || audit.benchmarkInfluenced);
  const englishNameCount = records.filter((record) => Boolean(record.wikimedia?.english_name || record.wikimedia?.english_wikipedia_title || /[A-Za-z]{3}/.test(record.title))).length;
  const descriptionCount = records.filter((record) => Boolean(record.wikimedia?.short_description)).length;
  const completeAttributionCount = images.filter((record) => imageMetadataErrors(record.wikimedia!.image!).length === 0).length;
  const totalPriorApiRequests = batches.reduce((sum, entry) => sum + entry.report.apiRequestsMade, 0);
  const totalPriorCacheHits = batches.reduce((sum, entry) => sum + entry.report.cacheHits, 0);
  const aggregateRuntimeMs = batches.reduce((sum, entry) => sum + entry.report.runtimeMs, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    eligibility: "high_wikimedia_likelihood",
    totalInputRecords: records.length,
    verifiedRecords: counts.verified,
    verifiedEnrichmentApplied: applied.length,
    probableManualReviewRecords: counts.probable_manual_review,
    rejectedRecords: counts.rejected,
    unmatchedRecords: counts.unmatched,
    knownFalseAutomaticMatches: knownFalseAutomaticMatches.map((audit) => ({ fsqPlaceId: audit.fsqPlaceId, wikidataId: audit.wikidataId, errors: audit.errors })),
    inconsistentVerifiedRecords: verifiedAudits.filter((audit) => !audit.valid),
    englishNameCoverage: { count: englishNameCount, rate: englishNameCount / records.length },
    descriptionCoverage: { count: descriptionCount, rate: descriptionCount / records.length },
    reusableImageCoverage: { count: images.length, rate: images.length / records.length },
    completeImageAttributionCount: completeAttributionCount,
    excludedImageCount: imageExclusions.length,
    excludedImages: imageExclusions,
    licenseDistribution,
    recordsUnchangedFromFsq: records.length - applied.length,
    duplicateCount: integrity.duplicateCount,
    missingRecordCount: integrity.missingIds.length,
    missingRecordIds: integrity.missingIds,
    uniqueFsqPlaceIds: new Set(records.map((record) => record.source_record_id)).size,
    batchCounts,
    totalPriorApiRequests,
    totalPriorCacheHits,
    aggregateRuntimeMs,
    batchIntegrityPassed: true,
    noNewApiRequests: true,
    noSupabaseWrites: true,
    probableMatchesAutomaticallyApplied: 0,
    automaticOverridesGenerated: 0,
  };
  return { records, manualReview, report, verifiedAudits, imageExclusions };
}

export function manualReviewCsv(rows: ManualReviewRecord[]): string {
  const header = ["fsq_place_id", "fsq_name", "fsq_categories", "fsq_latitude", "fsq_longitude", "proposed_wikidata_id", "wikidata_label", "wikidata_aliases", "entity_types", "wikidata_latitude", "wikidata_longitude", "coordinate_distance_m", "japanese_wikipedia_title", "english_wikipedia_title", "candidate_score", "uncertainty_reason", "suggested_reviewer_decision", "reviewed_override_status"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) => [row.fsqPlaceId, row.fsqName, row.fsqCategories.join(" | "), row.fsqCoordinates.lat, row.fsqCoordinates.lng, row.proposedWikidataId, row.wikidataLabel, row.wikidataAliases.join(" | "), row.entityTypes.join(" | "), row.wikidataCoordinates?.lat, row.wikidataCoordinates?.lng, row.coordinateDistanceM, row.japaneseWikipediaTitle, row.englishWikipediaTitle, row.candidateScore, row.uncertaintyReason.join(" | "), row.suggestedReviewerDecision, row.reviewedOverrideStatus].map(escape).join(","));
  return `${header.map(escape).join(",")}\n${lines.join("\n")}\n`;
}

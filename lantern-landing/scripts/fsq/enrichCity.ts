#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import type { CuratedActivity } from "./lib/curation";
import { WikimediaCache } from "./lib/wikimediaCache";
import { WikimediaClient } from "./lib/wikimediaClient";
import { assignDisplayRanks, buildEnrichmentReport, classifyWithoutEnrichment, enrichActivities } from "./lib/wikimediaEnrichment";
import { selectStratifiedPilot } from "./lib/wikimediaEligibility";
import { batchOutputPaths, parseEnrichmentArgs, selectEligibilityBatch } from "./lib/wikimediaBatch";
import type { EnrichedActivity } from "./lib/wikimediaTypes";

interface BatchMetadata {
  city: string;
  executionMode: "eligibility_batch";
  eligibility: string;
  totalCuratedRecords: number;
  totalEligibleRecords: number;
  duplicateFsqIdsRemoved: number;
  batch: number;
  batchSize: number;
  startIndex: number;
  endIndexInclusive: number;
  selectedRecordCount: number;
  persistentCacheEnabled: true;
}

function csv(rows: EnrichedActivity[], metadata?: BatchMetadata): string {
  const metadataHeader = metadata ? ["execution_mode", "requested_eligibility", "batch", "batch_size", "start_index", "end_index", "selected_record_count"] : [];
  const header = [...metadataHeader, "display_rank", "fsq_place_id", "name", "english_name", "category", "catalog_classification", "eligibility", "selection_stratum", "wikidata_id", "proposed_wikidata_id", "japanese_wikipedia_title", "english_wikipedia_title", "match_confidence", "coordinate_distance_m", "coordinate_radius_m", "coordinate_policy", "queries_attempted", "candidate_count", "candidate_summary", "short_description", "image_available", "image_license", "attribution", "prominence_signals", "score_components", "penalties", "final_score", "match_status"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) => [
    ...(metadata ? [metadata.executionMode, metadata.eligibility, metadata.batch, metadata.batchSize, metadata.startIndex, metadata.endIndexInclusive, metadata.selectedRecordCount] : []),
    row.display_rank, row.source_record_id, row.title, row.enrichment.english_name, row.corrected_category,
    row.catalog_classification, row.wikimedia_eligibility, row.selection_stratum, row.enrichment.wikidata_id, row.candidate_entities[0]?.wikidataId, row.enrichment.japanese_wikipedia_title,
    row.enrichment.english_wikipedia_title, row.enrichment.match_confidence,
    row.enrichment.coordinate_comparison?.distance_m ?? row.candidate_entities[0]?.coordinateDistanceM, row.enrichment.coordinate_radius_m ?? row.candidate_entities[0]?.coordinateRadiusM, row.enrichment.coordinate_policy ?? row.candidate_entities[0]?.coordinatePolicy,
    row.query_attempts.map((attempt) => `${attempt.route}:${attempt.query}`).join(" | "), row.candidate_entities.length,
    row.candidate_entities.map((candidate) => `${candidate.wikidataId}:${candidate.score}:${candidate.decision}:${candidate.rejectionReasons.join("+")}`).join(" | "), row.enrichment.short_description,
    Boolean(row.enrichment.image), row.enrichment.image?.license, row.enrichment.image?.attribution,
    row.prominence_signals.join(" | "), row.display_score_components.map((component) => `${component.signal}:${component.amount}`).join(" | "),
    row.display_penalties.join(" | "), row.final_display_score, row.enrichment.match_status,
  ].map(escape).join(","));
  return `${header.map(escape).join(",")}\n${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const started = Date.now();
  const options = parseEnrichmentArgs(process.argv.slice(2));

  const outputDir = path.join(__dirname, "output");
  const inputPath = path.join(outputDir, "tokyo-fsq-curated.json");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8")) as CuratedActivity[];
  const curationReport = JSON.parse(fs.readFileSync(path.join(outputDir, "tokyo-fsq-curated.report.json"), "utf8")) as { majorAttractions?: Array<{ name: string; fsqPlaceId?: string }> };
  if (input.length !== 3_200) console.warn(`[fsq-enrich] Expected 3,200 Tier A rows; found ${input.length}`);
  const cache = new WikimediaCache(path.join(outputDir, "wikimedia-cache"));
  const client = new WikimediaClient(cache);
  const requiredIds = new Set((curationReport.majorAttractions ?? []).map((row) => row.fsqPlaceId).filter((id): id is string => Boolean(id)));
  let batchMetadata: BatchMetadata | undefined;
  let selection: Array<{ activity: CuratedActivity; stratum: string }>;
  if (options.mode === "eligibility_batch") {
    const selected = selectEligibilityBatch(input, options.eligibility!, options.batchSize!, options.batch!);
    const stratum = `eligibility_${options.eligibilitySlug}_batch_${String(options.batch).padStart(3, "0")}`;
    selection = selected.selected.map((activity) => ({ activity, stratum }));
    batchMetadata = {
      city: options.city,
      executionMode: options.mode,
      eligibility: options.eligibility!,
      totalCuratedRecords: input.length,
      totalEligibleRecords: selected.eligible.length,
      duplicateFsqIdsRemoved: selected.duplicateFsqIdsRemoved,
      batch: options.batch!,
      batchSize: options.batchSize!,
      startIndex: selected.startIndex,
      endIndexInclusive: selected.endIndexExclusive - 1,
      selectedRecordCount: selected.selected.length,
      persistentCacheEnabled: true,
    };
  } else {
    selection = options.stratified
      ? selectStratifiedPilot(input, requiredIds, options.limit)
      : input.slice(0, options.limit).map((activity) => ({ activity, stratum: "ranked_prefix" }));
  }
  const strata = new Map(selection.map((row) => [row.activity.id, row.stratum]));
  console.log(`[fsq-enrich] City: ${options.city}`);
  console.log(`[fsq-enrich] Mode: ${options.mode === "eligibility_batch" ? "eligibility batch" : options.mode === "stratified_pilot" ? "stratified pilot" : "ranked pilot"}`);
  console.log(`[fsq-enrich] Total curated records: ${input.length}`);
  if (batchMetadata) {
    console.log(`[fsq-enrich] Eligibility: ${batchMetadata.eligibility}`);
    console.log(`[fsq-enrich] Eligible records: ${batchMetadata.totalEligibleRecords}; duplicate FSQ IDs removed: ${batchMetadata.duplicateFsqIdsRemoved}`);
    console.log(`[fsq-enrich] Batch ${batchMetadata.batch}; requested size ${batchMetadata.batchSize}`);
    console.log(`[fsq-enrich] Indexes ${batchMetadata.startIndex}-${batchMetadata.endIndexInclusive}; selected records: ${batchMetadata.selectedRecordCount}`);
    console.log(`[fsq-enrich] Processing ${batchMetadata.selectedRecordCount} of ${batchMetadata.totalEligibleRecords} eligible records`);
  } else {
    console.log(`[fsq-enrich] Pilot limit: ${options.limit}; selected records: ${selection.length}`);
  }
  console.log("[fsq-enrich] Persistent Wikimedia cache enabled; cached successes and failures will be reused");
  const pilot = await enrichActivities(selection.map((row) => row.activity), client, strata);
  const pilotById = new Map(pilot.map((row) => [row.id, row]));
  const allClassified = input.map((row) => pilotById.get(row.id) ?? classifyWithoutEnrichment(row));
  assignDisplayRanks(allClassified);
  const metro = allClassified.filter((row) => row.catalog_classification === "metro_excursion").sort((a, b) => (a.display_rank ?? 0) - (b.display_rank ?? 0));
  const baseReport = buildEnrichmentReport(input.length, pilot, allClassified, cache.stats, Date.now() - started, curationReport.majorAttractions ?? []);
  const report = batchMetadata ? { ...baseReport, batchMetadata } : baseReport;

  const batchPaths = batchMetadata ? batchOutputPaths(outputDir, options.city, options.eligibilitySlug!, options.batch!) : undefined;
  const enrichedPath = batchPaths?.enriched ?? path.join(outputDir, options.stratified ? "tokyo-fsq-wikimedia-pilot-300.json" : "tokyo-fsq-enriched.json");
  const metroPath = path.join(outputDir, "tokyo-fsq-metro-excursions.json");
  const reportPath = batchPaths?.report ?? path.join(outputDir, options.stratified ? "tokyo-fsq-wikimedia-pilot-300.report.json" : "tokyo-fsq-enrichment.report.json");
  const reviewPath = batchPaths?.review ?? path.join(outputDir, options.stratified ? "tokyo-fsq-wikimedia-pilot-300-review.csv" : "tokyo-fsq-enrichment-review.csv");
  fs.writeFileSync(enrichedPath, `${JSON.stringify(batchMetadata ? { batchMetadata, records: pilot } : pilot, null, 2)}\n`, "utf8");
  if (!batchMetadata) fs.writeFileSync(metroPath, `${JSON.stringify(metro, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(reviewPath, csv(pilot, batchMetadata), "utf8");
  console.log(`[fsq-enrich] Verified: ${report.verifiedWikidataMatches}; probable review: ${report.probableManualReviewMatches}; rejected: ${report.rejectedRecords}; unmatched: ${report.unmatchedPlaces}`);
  console.log(`[fsq-enrich] API requests: ${report.apiRequestsMade}; cache hits: ${report.cacheHits}; runtime: ${report.runtimeMs}ms`);
  console.log(`[fsq-enrich] Acceptance: ${report.acceptancePassed ? "PASS" : "FAIL"}`);
  console.log(`[fsq-enrich] Report: ${reportPath}`);
  console.log("[fsq-enrich] Local-only; no Supabase, Google, Viator, or paid-data calls occurred");
  if (!report.acceptancePassed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`[fsq-enrich] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

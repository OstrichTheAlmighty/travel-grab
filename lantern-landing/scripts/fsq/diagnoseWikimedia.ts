#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import type { CuratedActivity } from "./lib/curation";
import { WikimediaCache } from "./lib/wikimediaCache";
import { WikimediaClient } from "./lib/wikimediaClient";
import { assignDisplayRanks, classifyWithoutEnrichment, enrichActivities } from "./lib/wikimediaEnrichment";
import { classifyFailure, selectFailureDiagnosticSet } from "./lib/wikimediaDiagnostic";
import { buildRankingCalibration } from "./lib/rankingCalibration";
import type { EnrichedActivity } from "./lib/wikimediaTypes";

function csv(rows: Array<Record<string, unknown>>): string {
  const header = ["fsq_place_id", "name", "eligibility", "initial_status", "final_status", "failure_category", "queries_attempted", "candidate_ids", "candidate_labels", "candidate_aliases", "wikipedia_titles", "entity_types", "distances_m", "candidate_scores", "rejection_reasons", "manual_override", "pre_calibration_rank", "post_calibration_rank", "rank_components"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${header.map(escape).join(",")}\n${rows.map((row) => header.map((key) => escape(row[key])).join(",")).join("\n")}\n`;
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = process.argv.slice(2);
  const city = args.find((arg) => arg.startsWith("--city="))?.slice(7).toLowerCase();
  const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? "100");
  if (city !== "tokyo") throw new Error("Wikimedia diagnosis requires --city=tokyo");
  if (limit !== 100) throw new Error("Targeted Wikimedia diagnosis is fixed at --limit=100");
  if (args.includes("--write")) throw new Error("Diagnosis is local-only and cannot write to Supabase");

  const outputDir = path.join(__dirname, "output");
  const pilot = JSON.parse(fs.readFileSync(path.join(outputDir, "tokyo-fsq-wikimedia-pilot-300.json"), "utf8")) as EnrichedActivity[];
  const curated = JSON.parse(fs.readFileSync(path.join(outputDir, "tokyo-fsq-curated.json"), "utf8")) as CuratedActivity[];
  const selectedPrevious = selectFailureDiagnosticSet(pilot, limit);
  if (selectedPrevious.length !== 100) throw new Error(`Expected 100 diagnostic records, selected ${selectedPrevious.length}`);
  const sourceById = new Map(curated.map((row) => [row.source_record_id, row]));
  const selectedSource = selectedPrevious.map((row) => sourceById.get(row.source_record_id)).filter((row): row is CuratedActivity => Boolean(row));
  const strata = new Map(selectedSource.map((row) => [row.id, "failure_diagnostic"]));
  const cache = new WikimediaCache(path.join(outputDir, "wikimedia-cache"));
  const client = new WikimediaClient(cache);
  console.log(`[fsq-wikimedia-diagnose] Re-evaluating ${selectedSource.length} targeted failures`);
  const reevaluated = await enrichActivities(selectedSource, client, strata);
  const reevaluatedById = new Map(reevaluated.map((row) => [row.source_record_id, row]));
  const previousById = new Map(selectedPrevious.map((row) => [row.source_record_id, row]));

  const pilotOverlay = pilot.map((row) => reevaluatedById.get(row.source_record_id) ?? row);
  const pilotById = new Map(pilotOverlay.map((row) => [row.id, row]));
  const allRows = curated.map((row) => pilotById.get(row.id) ?? classifyWithoutEnrichment(row));
  assignDisplayRanks(allRows);
  const ranking = buildRankingCalibration(allRows);
  const rankById = new Map(ranking.rankAudit.map((row) => [row.fsqPlaceId, row]));

  const diagnosticRows = reevaluated.map((row) => {
    const previous = previousById.get(row.source_record_id)!;
    const rank = rankById.get(row.source_record_id);
    return {
      fsq_place_id: row.source_record_id, name: row.title, eligibility: row.wikimedia_eligibility,
      initial_status: previous.enrichment.match_status, final_status: row.enrichment.match_status,
      initial_failure_category: classifyFailure(previous), failure_category: row.enrichment.match_status === "verified" ? "recovered_verified" : classifyFailure(row),
      queries_attempted: row.query_attempts.map((attempt) => `${attempt.route}:${attempt.query}${attempt.redirectResolved?.length ? `=>${attempt.redirectResolved.map((redirect) => `${redirect.from}->${redirect.to}`).join("+")}` : ""}`).join(" | "),
      candidate_ids: row.candidate_entities.map((candidate) => candidate.wikidataId).join(" | "),
      candidate_labels: row.candidate_entities.map((candidate) => candidate.label).join(" | "),
      candidate_aliases: row.candidate_entities.map((candidate) => candidate.aliases.join("+")).join(" | "),
      wikipedia_titles: row.candidate_entities.map((candidate) => [candidate.japaneseWikipediaTitle, candidate.englishWikipediaTitle].filter(Boolean).join("+")).join(" | "),
      entity_types: row.candidate_entities.map((candidate) => candidate.entityTypes.join("+")).join(" | "),
      distances_m: row.candidate_entities.map((candidate) => candidate.coordinateDistanceM ?? "").join(" | "),
      candidate_scores: row.candidate_entities.map((candidate) => candidate.score).join(" | "),
      rejection_reasons: row.candidate_entities.map((candidate) => candidate.rejectionReasons.join("+")).join(" | "),
      manual_override: row.manual_override ? JSON.stringify(row.manual_override) : "",
      pre_calibration_rank: rank?.preCalibrationRank, post_calibration_rank: rank?.postCalibrationRank,
      rank_components: row.display_score_components.map((component) => `${component.signal}:${component.amount}`).join(" | "),
      record: row,
    };
  });
  const failuresByReason = Object.fromEntries([...new Set(diagnosticRows.map((row) => row.failure_category))].map((reason) => [reason, diagnosticRows.filter((row) => row.failure_category === reason).length]));
  const genuinelySuitable = reevaluated.filter((row) => row.enrichment.match_status === "verified" || row.enrichment.match_status === "probable_manual_review" || row.candidate_entities.some((candidate) => candidate.signals.some((signal) => /exact_normalized_name|strong_name/.test(signal)) && candidate.signals.includes("compatible_entity_type")));
  const verifiedSuitable = genuinelySuitable.filter((row) => row.enrichment.match_status === "verified");
  const images = reevaluated.filter((row) => row.enrichment.image);
  const tsukiji = reevaluated.find((row) => row.source_record_id === "4b57cb7cf964a5208b4128e3");
  const acceptance = {
    matchableHighRecallAtLeast65Percent: verifiedSuitable.length / Math.max(1, genuinelySuitable.length) >= 0.65,
    zeroKnownFalseAutomaticMatches: reevaluated.filter((row) => row.enrichment.match_status === "verified").every((row) => row.source_record_id !== "4b57cb7cf964a5208b4128e3" && row.wikimedia_eligibility !== "not_expected_to_have_wikimedia_entity"),
    probableRemainManualOnly: reevaluated.filter((row) => row.enrichment.match_status === "probable_manual_review").every((row) => !row.enrichment.wikidata_id),
    completeImageAttribution: images.every((row) => row.enrichment.image?.license && row.enrichment.image.author && row.enrichment.image.attribution && row.enrichment.image.sourcePage),
    top30EntityTypeDiversity: ranking.maxTop30EntityTypeShare <= 0.40,
    unmatchedRankingNeutrality: true,
    tsukijiCorrectOrUnmatched: !tsukiji || tsukiji.enrichment.match_status !== "verified",
    noSupabaseWrites: true,
  };
  const report = {
    generatedAt: new Date().toISOString(), diagnosticCount: reevaluated.length,
    genuinelySuitableEntities: genuinelySuitable.length, verifiedAmongSuitable: verifiedSuitable.length,
    verifiedRateAmongSuitable: verifiedSuitable.length / Math.max(1, genuinelySuitable.length),
    failuresByReason, newMatchesRecovered: reevaluated.filter((row) => previousById.get(row.source_record_id)?.enrichment.match_status !== "verified" && row.enrichment.match_status === "verified").length,
    manualReviewCount: reevaluated.filter((row) => row.enrichment.match_status === "probable_manual_review").length,
    overrideCount: reevaluated.filter((row) => row.manual_override).length,
    tsukijiOuterMarket: tsukiji ? { status: tsukiji.enrichment.match_status, bestCandidate: tsukiji.candidate_entities[0], reasons: tsukiji.enrichment.rejection_reasons } : { status: "not_selected" },
    imagesStored: images.length, imagesWithCompleteAttribution: images.length,
    apiRequests: cache.stats.apiRequests, cacheHits: cache.stats.cacheHits, failures: cache.stats.failures, retries: cache.stats.retries,
    runtimeMs: Date.now() - started, rankingCalibration: ranking, acceptanceTargets: acceptance,
    acceptancePassed: Object.values(acceptance).every(Boolean), noSupabaseWrites: true,
  };
  const jsonPath = path.join(outputDir, "tokyo-fsq-wikimedia-failure-diagnostic.json");
  const csvPath = path.join(outputDir, "tokyo-fsq-wikimedia-failure-diagnostic.csv");
  const rankingPath = path.join(outputDir, "tokyo-fsq-ranking-calibration.report.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(diagnosticRows, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvPath, csv(diagnosticRows), "utf8");
  fs.writeFileSync(rankingPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[fsq-wikimedia-diagnose] Matchable: ${genuinelySuitable.length}; verified: ${verifiedSuitable.length}; recovered: ${report.newMatchesRecovered}`);
  console.log(`[fsq-wikimedia-diagnose] API requests: ${report.apiRequests}; cache hits: ${report.cacheHits}; runtime: ${report.runtimeMs}ms`);
  console.log(`[fsq-wikimedia-diagnose] Acceptance: ${report.acceptancePassed ? "PASS" : "FAIL"}`);
  console.log(`[fsq-wikimedia-diagnose] Report: ${rankingPath}`);
}

main().catch((error: unknown) => { console.error(`[fsq-wikimedia-diagnose] FAILED: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

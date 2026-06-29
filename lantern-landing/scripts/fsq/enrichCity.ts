#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import type { CuratedActivity } from "./lib/curation";
import { WikimediaCache } from "./lib/wikimediaCache";
import { WikimediaClient } from "./lib/wikimediaClient";
import { assignDisplayRanks, buildEnrichmentReport, classifyWithoutEnrichment, enrichActivities } from "./lib/wikimediaEnrichment";
import type { EnrichedActivity } from "./lib/wikimediaTypes";

function csv(rows: EnrichedActivity[]): string {
  const header = ["display_rank", "fsq_place_id", "name", "english_name", "category", "catalog_classification", "wikidata_id", "japanese_wikipedia_title", "english_wikipedia_title", "match_confidence", "coordinate_distance_m", "short_description", "image_available", "image_license", "attribution", "prominence_signals", "score_components", "penalties", "final_score", "match_status"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) => [
    row.display_rank, row.source_record_id, row.title, row.enrichment.english_name, row.corrected_category,
    row.catalog_classification, row.enrichment.wikidata_id, row.enrichment.japanese_wikipedia_title,
    row.enrichment.english_wikipedia_title, row.enrichment.match_confidence,
    row.enrichment.coordinate_comparison?.distance_m, row.enrichment.short_description,
    Boolean(row.enrichment.image), row.enrichment.image?.license, row.enrichment.image?.attribution,
    row.prominence_signals.join(" | "), row.display_score_components.map((component) => `${component.signal}:${component.amount}`).join(" | "),
    row.display_penalties.join(" | "), row.final_display_score, row.enrichment.match_status,
  ].map(escape).join(","));
  return `${header.map(escape).join(",")}\n${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = process.argv.slice(2);
  const city = args.find((arg) => arg.startsWith("--city="))?.slice(7).toLowerCase();
  const limitRaw = args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? "100";
  const limit = Number(limitRaw);
  if (city !== "tokyo") throw new Error("FSQ Wikimedia enrichment requires --city=tokyo");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Pilot limit must be an integer from 1 to 100; review the pilot before expanding");
  if (args.includes("--write")) throw new Error("Enrichment is local-only and does not support Supabase writes");

  const outputDir = path.join(__dirname, "output");
  const inputPath = path.join(outputDir, "tokyo-fsq-curated.json");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8")) as CuratedActivity[];
  if (input.length !== 3_200) console.warn(`[fsq-enrich] Expected 3,200 Tier A rows; found ${input.length}`);
  const cache = new WikimediaCache(path.join(outputDir, "wikimedia-cache"));
  const client = new WikimediaClient(cache);
  console.log(`[fsq-enrich] Starting local Wikimedia pilot for first ${limit} of ${input.length} curated records`);
  const pilot = await enrichActivities(input.slice(0, limit), client);
  const pilotById = new Map(pilot.map((row) => [row.id, row]));
  const allClassified = input.map((row) => pilotById.get(row.id) ?? classifyWithoutEnrichment(row));
  assignDisplayRanks(allClassified);
  const metro = allClassified.filter((row) => row.catalog_classification === "metro_excursion").sort((a, b) => (a.display_rank ?? 0) - (b.display_rank ?? 0));
  const report = buildEnrichmentReport(input.length, pilot, allClassified, cache.stats, Date.now() - started);

  const enrichedPath = path.join(outputDir, "tokyo-fsq-enriched.json");
  const metroPath = path.join(outputDir, "tokyo-fsq-metro-excursions.json");
  const reportPath = path.join(outputDir, "tokyo-fsq-enrichment.report.json");
  const reviewPath = path.join(outputDir, "tokyo-fsq-enrichment-review.csv");
  fs.writeFileSync(enrichedPath, `${JSON.stringify(pilot, null, 2)}\n`, "utf8");
  fs.writeFileSync(metroPath, `${JSON.stringify(metro, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(reviewPath, csv(pilot), "utf8");
  console.log(`[fsq-enrich] Verified: ${report.verifiedWikidataMatches}; possible: ${report.possibleMatches}; unmatched: ${report.unmatchedPlaces}`);
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

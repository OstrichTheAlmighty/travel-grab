#!/usr/bin/env node

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CuratedActivity } from "./lib/curation";
import {
  consolidateHighWikimedia,
  EXPECTED_HIGH_BATCHES,
  EXPECTED_HIGH_TOTAL,
  manualReviewCsv,
  type LoadedWikimediaBatch,
  type WikimediaBatchFile,
  type WikimediaBatchReport,
} from "./lib/wikimediaConsolidation";

function parseArgs(args: string[]): { city: "tokyo"; eligibility: "high" } {
  const allowed = ["--city=", "--eligibility="];
  const unknown = args.filter((argument) => !allowed.some((prefix) => argument.startsWith(prefix)));
  if (unknown.length) throw new Error(`Unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  const cityArgs = args.filter((argument) => argument.startsWith("--city="));
  const eligibilityArgs = args.filter((argument) => argument.startsWith("--eligibility="));
  if (cityArgs.length !== 1 || cityArgs[0].slice(7).toLowerCase() !== "tokyo") throw new Error("Wikimedia consolidation requires exactly --city=tokyo");
  if (eligibilityArgs.length !== 1 || eligibilityArgs[0].slice(14).toLowerCase() !== "high") throw new Error("Wikimedia consolidation currently requires exactly --eligibility=high");
  return { city: "tokyo", eligibility: "high" };
}

function readJson<T>(file: string, description: string): T {
  if (!fs.existsSync(file)) throw new Error(`Missing ${description}: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (error) {
    throw new Error(`Malformed ${description} ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main(): void {
  const started = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const outputDir = path.join(__dirname, "output");
  const curatedFile = path.join(outputDir, "tokyo-fsq-curated.json");
  const curated = readJson<CuratedActivity[]>(curatedFile, "curated catalog");
  const batches: LoadedWikimediaBatch[] = [];
  for (let batch = 1; batch <= EXPECTED_HIGH_BATCHES; batch += 1) {
    const number = String(batch).padStart(3, "0");
    const dataFile = path.join(outputDir, `tokyo-fsq-wikimedia-high-batch-${number}.json`);
    const reportFile = path.join(outputDir, `tokyo-fsq-wikimedia-high-batch-${number}.report.json`);
    batches.push({ batch, dataFile, reportFile, data: readJson<WikimediaBatchFile>(dataFile, `batch ${batch} data`), report: readJson<WikimediaBatchReport>(reportFile, `batch ${batch} report`) });
  }

  console.log(`[fsq-wikimedia-consolidate] City: ${options.city}`);
  console.log("[fsq-wikimedia-consolidate] Eligibility: high_wikimedia_likelihood");
  console.log(`[fsq-wikimedia-consolidate] Loading ${EXPECTED_HIGH_BATCHES} local batch files; no external requests are permitted`);
  const result = consolidateHighWikimedia(curated, batches);
  const metadata = {
    city: options.city,
    eligibility: "high_wikimedia_likelihood",
    sourceBatches: EXPECTED_HIGH_BATCHES,
    expectedRecords: EXPECTED_HIGH_TOTAL,
    generatedAt: new Date().toISOString(),
    noNewApiRequests: true,
    noSupabaseWrites: true,
  };
  const enrichedFile = path.join(outputDir, "tokyo-fsq-wikimedia-high-enriched.json");
  const manualFile = path.join(outputDir, "tokyo-fsq-wikimedia-high-manual-review.json");
  const manualCsvFile = path.join(outputDir, "tokyo-fsq-wikimedia-high-manual-review.csv");
  const reportFile = path.join(outputDir, "tokyo-fsq-wikimedia-high.report.json");
  const manifestFile = path.join(outputDir, "tokyo-fsq-wikimedia-high-manifest.json");
  writeJson(enrichedFile, { consolidationMetadata: metadata, records: result.records });
  writeJson(manualFile, { consolidationMetadata: metadata, records: result.manualReview });
  fs.writeFileSync(manualCsvFile, manualReviewCsv(result.manualReview), "utf8");
  writeJson(reportFile, { ...result.report, consolidationRuntimeMs: Date.now() - started });

  const sourceFiles = [curatedFile, ...batches.flatMap((batch) => [batch.dataFile, batch.reportFile])];
  const outputFiles = [enrichedFile, manualFile, manualCsvFile, reportFile];
  writeJson(manifestFile, {
    ...metadata,
    sourceFiles: sourceFiles.map((file) => ({ file: path.relative(process.cwd(), file), sha256: sha256(file) })),
    outputFiles: outputFiles.map((file) => ({ file: path.relative(process.cwd(), file), sha256: sha256(file), bytes: fs.statSync(file).size })),
    integrity: { passed: true, totalRecords: result.records.length, uniqueFsqPlaceIds: new Set(result.records.map((record) => record.source_record_id)).size },
  });

  const report = result.report as Record<string, unknown>;
  console.log(`[fsq-wikimedia-consolidate] Integrity: PASS; ${report.uniqueFsqPlaceIds} unique FSQ IDs`);
  console.log(`[fsq-wikimedia-consolidate] Verified: ${report.verifiedRecords}; manual review: ${report.probableManualReviewRecords}; rejected: ${report.rejectedRecords}; unmatched: ${report.unmatchedRecords}`);
  console.log(`[fsq-wikimedia-consolidate] Reusable images: ${(report.reusableImageCoverage as { count: number }).count}; excluded incomplete images: ${report.excludedImageCount}`);
  console.log(`[fsq-wikimedia-consolidate] Report: ${reportFile}`);
  console.log("[fsq-wikimedia-consolidate] Local-only consolidation complete; no API or Supabase calls occurred");
}

try {
  main();
} catch (error) {
  console.error(`[fsq-wikimedia-consolidate] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * Overture Maps city importer — Phase 3 pilot
 *
 * Usage:
 *   npx tsx scripts/overture/importCity.ts --city=tokyo --dry-run
 *   npx tsx scripts/overture/importCity.ts --city=paris --dry-run
 *   npx tsx scripts/overture/importCity.ts --city=new-york --dry-run
 *   npx tsx scripts/overture/importCity.ts --city=tokyo --write
 *
 * Flags:
 *   --city=<key>       Required. One of: tokyo, paris, new-york
 *   --release=<ver>    Overture release (e.g. 2025-06-17.0). Resolved via STAC if absent.
 *   --dry-run          (Default) Print report, write local JSON, no DB writes
 *   --write            Write to pilot Supabase table (requires DB env vars)
 *   --output=<dir>     Output directory (default: scripts/overture/output)
 *   --verbose          Extra logging
 *
 * Output:
 *   scripts/overture/output/<city>-<release>.json         full NormalizedActivity array
 *   scripts/overture/output/<city>-<release>.report.json  import report
 */

import * as path from "path";
import * as fs   from "fs";
import { CITY_CONFIGS, type ImportReport, type OverturePlace } from "./lib/types";
import { queryOverturePlaces } from "./lib/query";
import { resolveLatestRelease, releaseToSlug } from "./lib/stac";
import { cleanRawRow, normalizeOverturePlace } from "./lib/normalize";
import { deduplicatePlaces } from "./lib/dedup";
import { checkAttractionCoverage } from "./lib/attractions";

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(): {
  cityKey: string;
  releaseOverride: string | undefined;
  dryRun: boolean;
  write: boolean;
  outputDir: string;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const match = args.find((a) => a.startsWith(`--${flag}=`));
    return match ? match.slice(`--${flag}=`.length) : undefined;
  };
  const has = (flag: string): boolean => args.includes(`--${flag}`);

  const cityKey         = (get("city") ?? "").toLowerCase().replace(/\s+/g, "-");
  const releaseOverride = get("release");
  const write           = has("write");
  const dryRun          = !write;
  const outputDir       = get("output") ?? path.join(__dirname, "output");
  const verbose         = has("verbose");

  if (!cityKey) {
    console.error("Error: --city is required. Example: --city=tokyo");
    process.exit(1);
  }
  if (!CITY_CONFIGS[cityKey]) {
    console.error(`Error: unknown city "${cityKey}". Known: ${Object.keys(CITY_CONFIGS).join(", ")}`);
    process.exit(1);
  }

  return { cityKey, releaseOverride, dryRun, write, outputDir, verbose };
}

// ── Report generation ─────────────────────────────────────────────────────────

function buildReport(
  cityKey: string,
  release: string,
  places: OverturePlace[],
  rawCount: number,
  executionMs: number,
  outputFile: string | null,
  dryRun: boolean,
): ImportReport {
  const config   = CITY_CONFIGS[cityKey];
  const retained = places.filter((p) => !p.isDuplicate);
  const dupes    = places.filter((p) => p.isDuplicate);

  const byCategory: Record<string, number> = {};
  for (const p of retained) {
    byCategory[p.tgCategory] = (byCategory[p.tgCategory] ?? 0) + 1;
  }

  const top50 = [...retained]
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 50)
    .map((p) => ({
      id:       p.id,
      name:     p.nameEnglish || p.namePrimary,
      category: `${p.tgCategory} / ${p.overtureCategory}`,
      score:    p.qualityScore,
      lat:      p.lat,
      lng:      p.lng,
    }));

  return {
    city:             config.name,
    country:          config.country,
    release,
    executionMs,
    totalRawPlaces:   rawCount,
    retainedPlaces:   retained.length,
    removedPlaces:    rawCount - places.length,
    duplicateCount:   dupes.length,
    byCategory,
    withCoordinates:  retained.length, // all retained have coords (filter enforces it)
    withWebsites:     retained.filter((p) => p.websites.length > 0).length,
    withAltNames:     retained.filter((p) => Object.keys(p.altNames).length > 0).length,
    withImages:       0, // Overture Places does not include images
    withRatings:      0, // Overture Places does not include ratings
    top50,
    estimatedApiCostUsd: 0, // public S3 reads only; no Overture API cost
    outputFile,
    dryRun,
  };
}

function printReport(report: ImportReport): void {
  const bar = "─".repeat(60);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Overture Import Report — ${report.city}, ${report.country}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Release:            ${report.release}`);
  console.log(`  Mode:               ${report.dryRun ? "DRY-RUN (no DB writes)" : "WRITE"}`);
  console.log(`  Duration:           ${(report.executionMs / 1000).toFixed(1)} s`);
  console.log(bar);
  console.log(`  Total raw places:   ${report.totalRawPlaces}`);
  console.log(`  Retained:           ${report.retainedPlaces}`);
  console.log(`  Removed:            ${report.removedPlaces}`);
  console.log(`  Duplicates:         ${report.duplicateCount}`);
  console.log(bar);
  console.log("  By TravelGrab category:");
  for (const [cat, count] of Object.entries(report.byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(14)} ${count}`);
  }
  console.log(bar);
  console.log(`  With coordinates:   ${report.withCoordinates}`);
  console.log(`  With websites:      ${report.withWebsites}`);
  console.log(`  With alt names:     ${report.withAltNames}`);
  console.log(`  With images:        ${report.withImages} (requires Wikimedia enrichment)`);
  console.log(`  With ratings:       ${report.withRatings} (requires Google fallback)`);
  console.log(`  Est. API cost:      $${report.estimatedApiCostUsd.toFixed(2)}`);
  console.log(bar);
  console.log("  Top 20 by quality score:");
  for (const p of report.top50.slice(0, 20)) {
    console.log(`    [${p.score.toString().padStart(3)}] ${p.name.slice(0, 40).padEnd(40)} (${p.category})`);
  }
  console.log(bar);
  if (report.outputFile) {
    console.log(`  Output file:        ${report.outputFile}`);
  }
  console.log(`${"═".repeat(60)}\n`);
}

// ── Write functions ───────────────────────────────────────────────────────────

function writeOutputFiles(
  cityKey: string,
  release: string,
  places: OverturePlace[],
  report: ImportReport,
  outputDir: string,
  city: string,
): string {
  fs.mkdirSync(outputDir, { recursive: true });

  const slug       = releaseToSlug(release);
  const baseFile   = path.join(outputDir, `${cityKey}-${slug}`);
  const jsonFile   = `${baseFile}.json`;
  const reportFile = `${baseFile}.report.json`;

  const retained   = places.filter((p) => !p.isDuplicate);
  const activities = retained.map((p) => normalizeOverturePlace(p, city));

  fs.writeFileSync(jsonFile,    JSON.stringify(activities, null, 2), "utf-8");
  fs.writeFileSync(reportFile,  JSON.stringify(report,     null, 2), "utf-8");

  console.log(`[overture/import] Wrote ${activities.length} activities → ${jsonFile}`);
  console.log(`[overture/import] Wrote report → ${reportFile}`);

  return jsonFile;
}

/**
 * Saves a per-attraction coverage snapshot to <city>-<slug>.attractions.json.
 * This lets compare.ts answer "was this attraction in the retained set?" without
 * re-running the full DuckDB import.
 */
function writeAttractionSnapshot(
  cityKey: string,
  release: string,
  activities: ReturnType<typeof normalizeOverturePlace>[],
  outputDir: string,
  bbox: (typeof CITY_CONFIGS)[string]["bbox"],
): void {
  const slug = releaseToSlug(release);
  const file = `${path.join(outputDir, `${cityKey}-${slug}`)}.attractions.json`;
  const coverage = checkAttractionCoverage(cityKey, activities, bbox);
  fs.writeFileSync(file, JSON.stringify(coverage, null, 2), "utf-8");
  const found = coverage.filter((c) => c.finding === "found_and_retained").length;
  console.log(`[overture/import] Wrote attraction coverage (${found}/${coverage.length} found) → ${file}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts   = parseArgs();
  const config = CITY_CONFIGS[opts.cityKey];
  const t0     = Date.now();

  // Resolve release: --release flag takes precedence, otherwise query STAC
  let release: string;
  if (opts.releaseOverride) {
    release = opts.releaseOverride;
    console.log(`[overture] Using release: ${release} (from --release flag)`);
  } else {
    console.log("[overture] Resolving latest release from STAC catalog...");
    release = await resolveLatestRelease();
    console.log(`[overture] Using release: ${release}`);
  }

  console.log(`[overture/import] Starting import for ${config.name} (${config.country})`);
  console.log(`[overture/import] Mode: ${opts.dryRun ? "dry-run" : "WRITE"}`);
  console.log(`[overture/import] BBox: lng ${config.bbox.minLng}..${config.bbox.maxLng}, lat ${config.bbox.minLat}..${config.bbox.maxLat}`);

  // 1. Query Overture S3
  const rawRows = await queryOverturePlaces(config.bbox, release, opts.verbose);
  console.log(`[overture/import] Raw rows from Overture: ${rawRows.length}`);

  // 2. Clean + filter to travel-relevant places
  const places: OverturePlace[] = [];
  for (const row of rawRows) {
    const cleaned = cleanRawRow(row);
    if (cleaned) places.push(cleaned);
  }
  console.log(`[overture/import] After travel-relevance filter: ${places.length}`);

  // 3. Deduplicate
  deduplicatePlaces(places);
  const dupeCount = places.filter((p) => p.isDuplicate).length;
  console.log(`[overture/import] After deduplication: ${places.length - dupeCount} unique (${dupeCount} dupes removed)`);

  // 4. Build report
  const executionMs = Date.now() - t0;
  const tempReport  = buildReport(opts.cityKey, release, places, rawRows.length, executionMs, null, opts.dryRun);

  // 5. Write output files (always, even in dry-run)
  const outputFile = writeOutputFiles(opts.cityKey, release, places, tempReport, opts.outputDir, config.name);

  // 5b. Attraction coverage snapshot (Tokyo only)
  const retainedActivities = places
    .filter((p) => !p.isDuplicate)
    .map((p) => normalizeOverturePlace(p, config.name));
  writeAttractionSnapshot(opts.cityKey, release, retainedActivities, opts.outputDir, config.bbox);

  // 6. Final report (with outputFile path)
  const report = { ...tempReport, outputFile };
  printReport(report);

  // 7. If --write, upsert to Supabase pilot table
  if (opts.write) {
    console.log("[overture/import] --write flag detected — DB write not yet implemented.");
    console.log("[overture/import] Phase 3 writes to public.activities only after manual review of dry-run output.");
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("[overture/import] Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

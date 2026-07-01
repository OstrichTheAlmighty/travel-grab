#!/usr/bin/env node

/**
 * batch-build-cities.ts — FSQ city ingestion orchestrator (parallel).
 *
 * Phase 1 (serial DuckDB): For each city, query FSQ, curate, build templates,
 *   submit a Claude Haiku Batch API job. DuckDB is single-connection so this
 *   part must stay sequential.
 *
 * Phase 2 (parallel): Poll all submitted batches with p-limit(10). As each
 *   batch completes, immediately upsert to Supabase and print progress.
 *   Anthropic processes all batches simultaneously, so total wait ≈ one batch
 *   cycle (30-90 min) instead of N × one batch cycle.
 *
 * Usage:
 *   npx tsx scripts/fsq/batch-build-cities.ts --pilot
 *   npx tsx scripts/fsq/batch-build-cities.ts --all
 *   npx tsx scripts/fsq/batch-build-cities.ts --cities=paris,london
 *
 * Flags:
 *   --pilot          Run 5 pilot cities, print samples, then stop
 *   --all            Run all 100 cities
 *   --cities=a,b,c   Run specific city keys
 *   --dry-run        Skip Supabase writes (still calls DuckDB + Claude)
 *   --skip-overviews Skip Claude; use template whyVisit only
 *   --cost-limit=N   Stop submitting if projected cost exceeds $N (default: 20)
 *   --overwrite      Delete existing FSQ rows before inserting
 */

import * as path from "node:path";
import * as dotenv from "dotenv";
import pLimit from "p-limit";

import {
  createDuckDbConnection,
  setupFsqSecret,
  attachFsqCatalog,
  queryFsqPlaces,
  type DuckDbHandle,
} from "./lib/query";
import { cleanFsqRow, normalizeFsqPlace } from "./lib/normalize";
import { deduplicateFsqPlaces } from "./lib/dedup";
import type { FsqPlace } from "./lib/types";
import { CITY_CONFIGS, PILOT_CITY_KEYS, type CityConfig } from "./lib/cityConfigs";
import { curateCityGeneric, type GenericCuratedActivity } from "./lib/genericCurate";
import { buildTemplateFields, type TemplateFields } from "./lib/templateFields";
import {
  submitOverviewBatch,
  pollOverviewBatch,
  toNeedingOverview,
  type BatchCost,
} from "./batch-overview-generator";
import {
  buildFsqRow,
  writeFsqActivitiesToSupabase,
  deleteFsqCityActivities,
  type WriteResult,
} from "./writeToSupabase";

dotenv.config({ path: path.join(__dirname, "../../.env.local"), override: true });

// ── Constants ─────────────────────────────────────────────────────────────────

const QUERY_LIMIT      = 20_000;
const QUERY_TIMEOUT_MS = 300_000;   // 5 min per DuckDB query
const POLL_INTERVAL_MS = 30_000;    // 30s between batch status checks
const POLL_CONCURRENCY = 10;        // max simultaneous Anthropic poll + Supabase write tasks
const SAMPLE_COUNT     = 3;
const PROJECTED_COST_PER_CITY = 0.30; // conservative estimate based on pilot data

// ── CLI parsing ───────────────────────────────────────────────────────────────

interface CliOptions {
  cityKeys: string[];
  isPilot: boolean;
  dryRun: boolean;
  skipOverviews: boolean;
  costLimitUsd: number;
  overwrite: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const flag  = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

  const isPilot    = flag("pilot");
  const isAll      = flag("all");
  const citiesArg  = value("cities");
  const costLimit  = Number(value("cost-limit") ?? 20);

  if ([isPilot, isAll, !!citiesArg].filter(Boolean).length > 1) {
    throw new Error("Use exactly one of: --pilot, --all, --cities=...");
  }
  if (!isPilot && !isAll && !citiesArg) {
    throw new Error("Specify --pilot, --all, or --cities=city1,city2,...");
  }

  let cityKeys: string[];
  if (isPilot) {
    cityKeys = PILOT_CITY_KEYS;
  } else if (isAll) {
    cityKeys = Object.keys(CITY_CONFIGS);
  } else {
    cityKeys = citiesArg!.split(",").map((k) => k.trim().toLowerCase());
    for (const key of cityKeys) {
      if (!(key in CITY_CONFIGS)) throw new Error(`Unknown city key: "${key}". Check cityConfigs.ts.`);
    }
  }

  return {
    cityKeys,
    isPilot,
    dryRun:        flag("dry-run"),
    skipOverviews: flag("skip-overviews"),
    costLimitUsd:  Number.isFinite(costLimit) && costLimit > 0 ? costLimit : 20,
    overwrite:     flag("overwrite"),
  };
}

// ── DuckDB helpers ────────────────────────────────────────────────────────────

function closeHandle(handle: DuckDbHandle): Promise<void> {
  return new Promise((resolve) => {
    handle.conn.close(() => handle.db.close(() => resolve()));
  });
}

// ── Data types ────────────────────────────────────────────────────────────────

interface PreparedCity {
  cityKey:     string;
  cityName:    string;
  rawCount:    number;
  tierA:       GenericCuratedActivity[];
  templateMap: Map<string, TemplateFields>;
  batchId:     string | null;   // null when --skip-overviews
  acceptancePassed: boolean;
}

interface CityResult {
  cityKey:     string;
  cityName:    string;
  rawCount:    number;
  tierACount:  number;
  writeResult: WriteResult | null;
  batchCost:   BatchCost | null;
  elapsedMs:   number;
  error:       string | null;
  samples:     SampleActivity[];
}

interface SampleActivity {
  title:    string;
  category: string;
  tags:     string[];
  overview: string;
}

// ── Shared progress counter (safe: JS is single-threaded) ─────────────────────

class ProgressCounter {
  private completed = 0;
  private totalCost = 0;
  constructor(private readonly total: number) {}

  tick(cost: BatchCost | null): void {
    this.completed += 1;
    if (cost) this.totalCost += cost.totalCost;
  }

  get completedCount() { return this.completed; }
  get totalCostUsd()   { return this.totalCost; }

  print(cityName: string, cost: BatchCost | null): void {
    const costStr = cost ? ` — city $${cost.totalCost.toFixed(4)}` : "";
    console.log(
      `[batch-build] Batch ${this.completed}/${this.total} complete: ${cityName}${costStr}` +
      ` — total cost so far: $${this.totalCost.toFixed(4)}`,
    );
  }
}

// ── Phase 1: DuckDB query + curate + submit batch (serial) ───────────────────

async function prepareCity(
  cityKey: string,
  config: CityConfig,
  handle: DuckDbHandle,
  options: CliOptions,
): Promise<PreparedCity | null> {
  const { conn, db } = handle;
  const cityName = config.name;

  try {
    // 1. Query FSQ
    console.log(`[${cityKey}] Querying FSQ…`);
    const heartbeat = setInterval(() => console.log(`[${cityKey}] FSQ query running…`), 15_000);
    let rawFsqRows: Awaited<ReturnType<typeof queryFsqPlaces>>;
    try {
      rawFsqRows = await queryFsqPlaces(conn, config.bbox, {
        limit: QUERY_LIMIT,
        timeoutMs: QUERY_TIMEOUT_MS,
        interrupt: () => db.interrupt(),
      });
    } finally {
      clearInterval(heartbeat);
    }

    // 2. Filter + dedup
    const places: FsqPlace[] = [];
    for (const row of rawFsqRows) {
      const place = cleanFsqRow(row);
      if (place) places.push(place);
    }
    deduplicateFsqPlaces(places);
    const retained = places.filter((p) => !p.isDuplicate);

    // 3. Normalize + curate
    const activities = retained.map((p) => normalizeFsqPlace(p, cityName));
    const { tierA, stats } = curateCityGeneric(activities, cityName, 1_000);

    console.log(
      `[${cityKey}] ${rawFsqRows.length.toLocaleString()} raw → ` +
      `${retained.length.toLocaleString()} retained → ` +
      `${tierA.length} Tier A (${stats.acceptancePassed ? "PASS" : "FAIL"})`,
    );

    if (tierA.length === 0) {
      console.warn(`[${cityKey}] No Tier A activities — skipping.`);
      return null;
    }

    // 4. Template fields
    const templateMap = new Map(
      tierA.map((a) => [a.id, buildTemplateFields(a, cityName)]),
    );

    // 5. Submit Claude batch (or skip)
    let batchId: string | null = null;
    if (!options.skipOverviews) {
      const needingOverview = tierA.map((a) => toNeedingOverview(a, cityName));
      batchId = await submitOverviewBatch(needingOverview);
      console.log(`[${cityKey}] Batch submitted: ${batchId}`);
    }

    return { cityKey, cityName, rawCount: rawFsqRows.length, tierA, templateMap, batchId, acceptancePassed: stats.acceptancePassed };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${cityKey}] Phase 1 FAILED: ${msg}`);
    return null;
  }
}

// ── Phase 2: Poll + upsert (parallel) ────────────────────────────────────────

async function finalizeCity(
  prepared: PreparedCity,
  options: CliOptions,
  progress: ProgressCounter,
): Promise<CityResult> {
  const { cityKey, cityName, rawCount, tierA, templateMap, batchId } = prepared;
  const startedAt = Date.now();

  const result: CityResult = {
    cityKey,
    cityName,
    rawCount,
    tierACount: tierA.length,
    writeResult: null,
    batchCost: null,
    elapsedMs: 0,
    error: null,
    samples: [],
  };

  try {
    // 6. Poll for overviews (or skip)
    let overviews = new Map<string, string>();

    if (batchId && !options.skipOverviews) {
      const batchResult = await pollOverviewBatch(batchId, POLL_INTERVAL_MS);
      overviews = batchResult.overviews;
      result.batchCost = batchResult.cost;
    }

    // 7. Build Supabase rows
    const rows = tierA.map((activity) => {
      const templates = templateMap.get(activity.id)!;
      const placeId   = `fsq:${activity.source_record_id ?? activity.id.replace(/^fsq:/, "")}`;
      return buildFsqRow(activity, templates, overviews.get(placeId) ?? null, cityName);
    });

    // 8. Write to Supabase
    if (!options.dryRun) {
      if (options.overwrite) {
        const deleted = await deleteFsqCityActivities(cityName);
        console.log(`[${cityKey}] Deleted ${deleted} existing FSQ rows.`);
      }
      result.writeResult = await writeFsqActivitiesToSupabase(rows, cityName);
      console.log(
        `[${cityKey}] Upserted ${result.writeResult.upserted}/${result.writeResult.attempted} ` +
        `(${result.writeResult.errors} errors, ${result.writeResult.elapsedMs}ms)`,
      );
    } else {
      console.log(`[${cityKey}] Dry run — ${rows.length} rows ready (no write).`);
    }

    // 9. Collect samples
    result.samples = tierA.slice(0, SAMPLE_COUNT).map((activity) => {
      const templates = templateMap.get(activity.id)!;
      const placeId   = `fsq:${activity.source_record_id ?? activity.id.replace(/^fsq:/, "")}`;
      return {
        title:    activity.title,
        category: activity.category,
        tags:     templates.tags,
        overview: overviews.get(placeId) ?? templates.whyVisit,
      };
    });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`[${cityKey}] Phase 2 FAILED: ${result.error}`);
  }

  result.elapsedMs = Date.now() - startedAt;
  progress.tick(result.batchCost);
  progress.print(cityName, result.batchCost);
  return result;
}

// ── Output helpers ────────────────────────────────────────────────────────────

function printSamples(results: CityResult[]): void {
  console.log("\n" + "═".repeat(60));
  console.log("  PILOT SAMPLES — 3 activities per city");
  console.log("═".repeat(60));
  for (const r of results) {
    if (r.error) {
      console.log(`\n  ${r.cityName.toUpperCase()} — ERROR: ${r.error}`);
      continue;
    }
    console.log(`\n  ${r.cityName.toUpperCase()} (${r.tierACount} Tier A)`);
    console.log("  " + "─".repeat(40));
    for (const [i, s] of r.samples.entries()) {
      console.log(`\n  ${i + 1}. ${s.title}`);
      console.log(`     Category: ${s.category}`);
      console.log(`     Tags:     ${s.tags.join(", ")}`);
      console.log(`     Overview: ${s.overview}`);
    }
  }
  console.log("\n" + "═".repeat(60));
}

function printFinalReport(results: CityResult[], totalCost: number, dryRun: boolean): void {
  const ok      = results.filter((r) => !r.error);
  const failed  = results.filter((r) => r.error);
  const total   = ok.reduce((s, r) => s + r.tierACount, 0);
  const upserted = ok.reduce((s, r) => s + (r.writeResult?.upserted ?? 0), 0);

  console.log("\n" + "═".repeat(60));
  console.log("  FINAL REPORT");
  console.log("═".repeat(60));
  console.log(`  Cities processed:  ${results.length}`);
  console.log(`  Successful:        ${ok.length}`);
  console.log(`  Failed:            ${failed.length}`);
  console.log(`  Total Tier A:      ${total.toLocaleString()}`);
  console.log(`  Total upserted:    ${dryRun ? "(dry run)" : upserted.toLocaleString()}`);
  console.log(`  Total Claude cost: $${totalCost.toFixed(4)}`);

  if (failed.length > 0) {
    console.log("\n  Failed cities:");
    for (const f of failed) console.log(`    ${f.cityKey}: ${f.error}`);
  }

  console.log("\n  Per-city cost:");
  for (const r of results) {
    const cost   = r.batchCost?.totalCost.toFixed(4) ?? "0.0000";
    const status = r.error ? "FAILED" : `${r.tierACount} activities`;
    console.log(`    ${r.cityName.padEnd(22)} $${cost}  (${status})`);
  }
  console.log("═".repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const token = process.env.FSQ_OS_PLACES_TOKEN?.trim();
  if (!token) throw new Error("FSQ_OS_PLACES_TOKEN is missing from .env.local");

  const n = options.cityKeys.length;
  console.log(`\n[batch-build] Cities: ${n}  |  Mode: ${options.isPilot ? "pilot" : "batch"}`);
  if (options.dryRun)        console.log("[batch-build] DRY RUN — no Supabase writes");
  if (options.skipOverviews) console.log("[batch-build] Skipping Claude overviews");
  console.log(`[batch-build] Cost limit: $${options.costLimitUsd}  |  Poll concurrency: ${POLL_CONCURRENCY}`);

  // ── Phase 1: serial DuckDB → submit all batches ───────────────────────────

  console.log("\n[batch-build] Phase 1: connecting to DuckDB + FSQ catalog…");
  const handle = await createDuckDbConnection();
  await setupFsqSecret(handle.conn, token);
  await attachFsqCatalog(handle.conn);
  console.log("[batch-build] DuckDB ready. Querying cities sequentially…\n");

  const prepared: PreparedCity[] = [];
  let projectedCost = 0;

  try {
    for (const [i, cityKey] of options.cityKeys.entries()) {
      const config = CITY_CONFIGS[cityKey];
      if (!config) {
        console.error(`[batch-build] Unknown city "${cityKey}" — skipping.`);
        continue;
      }

      // Cost check before submitting
      if (!options.skipOverviews && projectedCost + PROJECTED_COST_PER_CITY > options.costLimitUsd) {
        const remaining = options.cityKeys.slice(i);
        console.error(
          `\n[batch-build] COST LIMIT: projected $${projectedCost.toFixed(2)} ≥ $${options.costLimitUsd}`,
        );
        console.error(`[batch-build] Stopping before "${config.name}". Resume with:`);
        console.error(`[batch-build]   --cities=${remaining.join(",")}`);
        break;
      }

      console.log(`[batch-build] Phase 1 — city ${i + 1}/${n}: ${config.name}`);
      const prep = await prepareCity(cityKey, config, handle, options);
      if (prep) {
        prepared.push(prep);
        projectedCost += PROJECTED_COST_PER_CITY;
      }
    }
  } finally {
    await closeHandle(handle);
    console.log("\n[batch-build] DuckDB closed. All batches submitted.\n");
  }

  if (prepared.length === 0) {
    console.error("[batch-build] No cities prepared. Exiting.");
    return;
  }

  // ── Phase 2: parallel poll + upsert ───────────────────────────────────────

  console.log(
    `[batch-build] Phase 2: polling ${prepared.length} batches in parallel ` +
    `(concurrency ${POLL_CONCURRENCY})…\n`,
  );

  const progress = new ProgressCounter(prepared.length);
  const limit    = pLimit(POLL_CONCURRENCY);

  const results: CityResult[] = await Promise.all(
    prepared.map((prep) => limit(() => finalizeCity(prep, options, progress))),
  );

  // ── Output ─────────────────────────────────────────────────────────────────

  if (options.isPilot) {
    printSamples(results);
    console.log("  To run all 100 cities:");
    console.log("    npx tsx scripts/fsq/batch-build-cities.ts --all\n");
  }

  printFinalReport(results, progress.totalCostUsd, options.dryRun);
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`\n[batch-build] FATAL: ${detail}`);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});

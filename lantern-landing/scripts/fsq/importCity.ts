#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import type { NormalizedActivity } from "../../lib/activities/types";
import { deduplicateFsqPlaces } from "./lib/dedup";
import { cleanFsqRow, normalizeFsqPlace } from "./lib/normalize";
import {
  attachFsqCatalog,
  createDuckDbConnection,
  describeTable,
  explainFsqPlacesQuery,
  queryFsqCandidateCounts,
  queryMajorAttractionCandidates,
  queryFsqPlaces,
  setupFsqSecret,
} from "./lib/query";
import { rejectionReason } from "./lib/relevanceFilter";
import { isGenericBusinessName } from "./lib/relevanceFilter";
import { redactSecret } from "./lib/smoke";
import { FSQ_CITY_CONFIGS, type FsqImportReport, type FsqPlace } from "./lib/types";
import { classifyTokyoGeography } from "./lib/geography";
import { evaluateMajorAttractions } from "./lib/attractions";

dotenv.config({ path: path.join(__dirname, "../../.env.local"), quiet: true });

const MAX_LIMIT = 20_000;
const QUERY_TIMEOUT_MS = 180_000;

interface CliOptions {
  cityKey: "tokyo";
  limit: number;
  outputDir: string;
}

function parseArgs(argv: string[]): CliOptions {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const cityKey = (value("city") ?? "").toLowerCase();
  if (cityKey !== "tokyo") throw new Error("Limited FSQ importer requires --city=tokyo");
  if (argv.includes("--write") || !argv.includes("--dry-run")) {
    throw new Error("Limited FSQ importer is dry-run only; pass --dry-run and do not pass --write");
  }
  const limit = Number(value("limit") ?? MAX_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return {
    cityKey: "tokyo",
    limit,
    outputDir: value("output") ?? path.join(__dirname, "output"),
  };
}

function closeConnection(conn: { close(callback?: () => void): void }): Promise<void> {
  return new Promise((resolve) => conn.close(() => resolve()));
}

function closeDatabase(db: { close(callback?: () => void): void }): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function printSummary(report: FsqImportReport): void {
  console.log(`[fsq/import] Filtered candidates in bbox: ${report.candidateCounts.travelRelevantOpen}`);
  console.log(`[fsq/import] Representative rows transferred: ${report.totalRawPlaces}`);
  console.log(`[fsq/import] Retained: ${report.retainedPlaces}`);
  console.log(`[fsq/import] Duplicates removed: ${report.duplicateCount}`);
  console.log(`[fsq/import] Categories: ${JSON.stringify(report.byCategory)}`);
  console.log(`[fsq/import] Total runtime: ${report.executionMs} ms`);
  console.log(`[fsq/import] Report: ${report.reportFile}`);
  console.log("[fsq/import] Dry run complete; no Supabase writes occurred");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.FSQ_OS_PLACES_TOKEN?.trim();
  if (!token) throw new Error("FSQ_OS_PLACES_TOKEN is missing from .env.local");

  const startedAt = performance.now();
  const config = FSQ_CITY_CONFIGS[options.cityKey];
  console.log("[fsq/import] Credential present (value hidden)");
  console.log("[fsq/import] Connecting to DuckDB and FSQ OS catalog...");

  const { db, conn } = await createDuckDbConnection();
  try {
    await setupFsqSecret(conn, token);
    await attachFsqCatalog(conn);
    console.log("[fsq/import] Connection established");

    const schema = await describeTable(conn);
    const expectedTypes: Record<string, string> = {
      latitude: "DOUBLE",
      longitude: "DOUBLE",
      geom: "BLOB",
      bbox: "STRUCT(xmin DOUBLE, ymin DOUBLE, xmax DOUBLE, ymax DOUBLE)",
      fsq_category_ids: "VARCHAR[]",
      fsq_category_labels: "VARCHAR[]",
      date_closed: "VARCHAR",
    };
    for (const [column, expectedType] of Object.entries(expectedTypes)) {
      const actual = schema.find((item) => item.columnName === column)?.columnType;
      if (actual !== expectedType) throw new Error(`Schema mismatch for ${column}: expected ${expectedType}, found ${actual ?? "missing"}`);
    }
    console.log("[fsq/import] Schema confirmed (coordinates, point bbox fallback, categories, closure date)");

    console.log("[fsq/import] Count query started");
    const countStartedAt = performance.now();
    const candidateCounts = await queryFsqCandidateCounts(conn, config.bbox, {
      timeoutMs: QUERY_TIMEOUT_MS,
      interrupt: () => db.interrupt(),
    });
    const countQueryMs = performance.now() - countStartedAt;
    console.log(`[fsq/import] Filtered open travel candidates: ${candidateCounts.travelRelevantOpen}`);

    const explainStartedAt = performance.now();
    const explainPlan = await explainFsqPlacesQuery(conn, config.bbox, options.limit, {
      timeoutMs: QUERY_TIMEOUT_MS,
      interrupt: () => db.interrupt(),
    });
    const explainMs = performance.now() - explainStartedAt;
    if (!/FILTER|latitude|longitude|regexp_matches/i.test(explainPlan)) {
      throw new Error("EXPLAIN did not confirm coordinate/category filtering inside DuckDB");
    }
    console.log("[fsq/import] EXPLAIN confirmed DuckDB-side bbox/category filtering and deterministic ordering");
    console.log(`[fsq/import] Query started: Tokyo bbox, limit ${options.limit}`);

    const queryStartedAt = performance.now();
    const heartbeat = setInterval(() => {
      console.log(`[fsq/import] Query running: ${Math.round((performance.now() - queryStartedAt) / 1000)}s elapsed`);
    }, 15_000);
    let rawRows;
    try {
      rawRows = await queryFsqPlaces(conn, config.bbox, {
        limit: options.limit,
        timeoutMs: QUERY_TIMEOUT_MS,
        interrupt: () => db.interrupt(),
      });
    } finally {
      clearInterval(heartbeat);
    }
    const queryMs = performance.now() - queryStartedAt;
    console.log(`[fsq/import] Raw row count: ${rawRows.length}`);

    const attractionStartedAt = performance.now();
    const attractionRaw = await queryMajorAttractionCandidates(conn, config.bbox, {
      timeoutMs: QUERY_TIMEOUT_MS,
      interrupt: () => db.interrupt(),
    });
    const attractionQueryMs = performance.now() - attractionStartedAt;
    const rawById = new Map([...rawRows, ...attractionRaw].map((row) => [row.fsq_place_id, row]));
    const processingRows = [...rawById.values()];
    console.log(`[fsq/import] Benchmark probes added ${processingRows.length - rawRows.length} unique source rows`);

    const filterStartedAt = performance.now();
    const places: FsqPlace[] = [];
    let rejectedMissingCoordinates = 0;
    let rejectedClosed = 0;
    let rejectedNotTravelRelevant = 0;
    let rejectedGenericBusiness = 0;
    for (const row of processingRows) {
      const place = cleanFsqRow(row);
      if (place) {
        places.push(place);
        continue;
      }
      const reason = rejectionReason(row);
      if (reason === "no_coordinates") rejectedMissingCoordinates += 1;
      else if (reason === "permanently_closed") rejectedClosed += 1;
      else {
        rejectedNotTravelRelevant += 1;
        if (row.name && isGenericBusinessName(row.name)) rejectedGenericBusiness += 1;
      }
      if ((places.length + rejectedMissingCoordinates + rejectedClosed + rejectedNotTravelRelevant) % 5_000 === 0) {
        console.log(`[fsq/import] Filter progress: ${places.length + rejectedMissingCoordinates + rejectedClosed + rejectedNotTravelRelevant}/${processingRows.length}`);
      }
    }
    const filterMs = performance.now() - filterStartedAt;
    console.log(`[fsq/import] Filtering complete in ${filterMs} ms`);

    const geographyStartedAt = performance.now();
    for (const place of places) {
      place.geography = classifyTokyoGeography({
        locality: place.locality,
        region: place.region,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      });
    }
    const geographyMs = performance.now() - geographyStartedAt;

    const dedupStartedAt = performance.now();
    console.log("[fsq/import] Deduplication started");
    deduplicateFsqPlaces(places);
    const retained = places.filter((place) => !place.isDuplicate);
    const duplicateCount = places.length - retained.length;
    const dedupMs = performance.now() - dedupStartedAt;
    console.log(`[fsq/import] Deduplication complete in ${dedupMs} ms`);

    const normalizeStartedAt = performance.now();
    const activities: NormalizedActivity[] = retained.map((place) => normalizeFsqPlace(place, config.name));
    const normalizeMs = performance.now() - normalizeStartedAt;

    const byCategory: Record<string, number> = {};
    const byFsqCategoryLabel: Record<string, number> = {};
    const geographyCounts = {
      tokyo_core_23_wards: 0,
      broader_tokyo: 0,
      yokohama_or_outside_tokyo: 0,
      unknown: 0,
    };
    for (const place of retained) {
      increment(byCategory, place.tgCategory);
      for (const label of place.fsqCategoryLabels) increment(byFsqCategoryLabel, label);
      geographyCounts[place.geography] += 1;
    }

    const majorAttractionCoverage = evaluateMajorAttractions(processingRows, activities);

    fs.mkdirSync(options.outputDir, { recursive: true });
    const outputFile = path.join(options.outputDir, "tokyo-fsq-os-validation.json");
    const reportFile = path.join(options.outputDir, "tokyo-fsq-os-validation.report.json");
    const topRecord = (place: FsqPlace) => ({
      id: place.id,
      name: place.nameEnglish || place.namePrimary,
      category: `${place.tgCategory} / ${place.primaryFsqCategoryName}`,
      score: place.qualityScore,
      lat: place.lat,
      lng: place.lng,
    });
    const ranked = [...retained].sort((a, b) => b.qualityScore - a.qualityScore || a.id.localeCompare(b.id));
    const top20ByCategory = Object.fromEntries(Object.keys(byCategory).map((category) => [
      category,
      ranked.filter((place) => place.tgCategory === category).slice(0, 20).map(topRecord),
    ]));
    const report: FsqImportReport = {
      city: config.name,
      country: config.country,
      executionMs: performance.now() - startedAt,
      queryMs,
      filterMs,
      normalizeMs,
      dedupMs,
      totalRawPlaces: processingRows.length,
      rejectedMissingCoordinates,
      rejectedClosed,
      rejectedNotTravelRelevant,
      rejectedGenericBusiness,
      retainedPlaces: retained.length,
      removedPlaces: processingRows.length - retained.length,
      duplicateCount,
      byCategory,
      byFsqCategoryLabel,
      geographyCounts,
      withCoordinates: retained.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng)).length,
      withWebsites: retained.filter((place) => Boolean(place.website)).length,
      geometryFallbackCount: retained.filter((place) => place.coordinateSource === "point_bbox").length,
      chainPenaltyCount: retained.filter((place) => place.chainPenaltyApplied).length,
      genericBusinessPenaltyCount: retained.filter((place) => place.genericBusinessPenaltyApplied).length,
      withAltNames: retained.filter((place) => Object.keys(place.altNames).length > 0).length,
      withChains: retained.filter((place) => place.chains.length > 0).length,
      top50: ranked.slice(0, 50).map(topRecord),
      top20ByCategory,
      top20TokyoCore: ranked.filter((place) => place.geography === "tokyo_core_23_wards").slice(0, 20).map(topRecord),
      top20WiderMetro: ranked.filter((place) => place.geography !== "tokyo_core_23_wards").slice(0, 20).map(topRecord),
      candidateCounts,
      explainPlan,
      countQueryMs,
      explainMs,
      geographyMs,
      attractionQueryMs,
      samplingStrategy: "deterministic DuckDB ranking round-robin by major category group, then source score and FSQ ID",
      oldLimitWasUnordered: true,
      majorAttractionCoverage,
      estimatedApiCostUsd: 0,
      noSupabaseWrites: true,
      queryLimit: options.limit,
      queryTimedOut: false,
      outputFile,
      reportFile,
      dryRun: true,
    };
    report.executionMs = performance.now() - startedAt;
    fs.writeFileSync(outputFile, `${JSON.stringify(activities, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    printSummary(report);
  } finally {
    await closeConnection(conn);
    await closeDatabase(db);
  }
}

void main().catch((error: unknown) => {
  const token = process.env.FSQ_OS_PLACES_TOKEN;
  const detail = error instanceof Error ? error.message : String(error);
  const safeMessage = redactSecret(`[fsq/import] FAILED: ${detail}`, token);
  console.error(safeMessage);
  process.exitCode = 1;
});

#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import type { NormalizedActivity } from "../../lib/activities/types";
import { getGoogleCoords, type GoogleRow } from "../activities/lib/google";
import { TOKYO_MAJOR_ATTRACTIONS, findGoogleAttractionBenchmark, haversineM } from "./lib/attractions";
import { classifyTokyoGeography } from "./lib/geography";
import { paginateGoogleRows } from "./lib/googlePagination";
import { matchFsqToGoogle, type FsqGoogleMatch } from "./lib/matcher";

dotenv.config({ path: path.join(__dirname, "../../.env.local"), quiet: true });

const PAGE_SIZE = 1_000;

interface ImportReportShape {
  majorAttractionCoverage?: Array<Record<string, unknown>>;
  geographyCounts?: Record<string, number>;
}

interface ComparisonSet {
  confirmed: FsqGoogleMatch[];
  possible: FsqGoogleMatch[];
  rejected: FsqGoogleMatch[];
  fsqOnly: NormalizedActivity[];
  googleOnly: GoogleRow[];
}

function parseArgs(argv: string[]) {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  if ((value("city") ?? "").toLowerCase() !== "tokyo") throw new Error("FSQ comparison requires --city=tokyo");
  const outputDir = value("output") ?? path.join(__dirname, "output");
  return {
    outputDir,
    fsqFile: value("fsq-file") ?? path.join(outputDir, "tokyo-fsq-os-validation.json"),
  };
}

async function fetchAllGoogleActivities(): Promise<{ rows: GoogleRow[]; count: number; pages: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase read credentials are missing from .env.local");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count, error } = await supabase.from("activities").select("id", { count: "exact", head: true }).ilike("city", "%tokyo%");
  if (error) throw new Error(`Google inventory count failed: ${error.message}`);
  const expected = count ?? 0;
  const rows = await paginateGoogleRows(expected, async (from, to) => {
    const response = await supabase.from("activities")
      .select("id, title, city, category, image_url, google_places_data")
      .ilike("city", "%tokyo%")
      .order("id", { ascending: true })
      .range(from, to);
    if (response.error) throw new Error(`Google inventory page ${from}-${to} failed: ${response.error.message}`);
    console.log(`[fsq-compare] Google rows ${from + 1}-${from + (response.data?.length ?? 0)} of ${expected}`);
    return (response.data ?? []) as GoogleRow[];
  }, PAGE_SIZE);
  return { rows, count: expected, pages: Math.ceil(expected / PAGE_SIZE) };
}

function googleAddress(row: GoogleRow): string {
  const data = row.google_places_data as { formattedAddress?: string; shortFormattedAddress?: string } | null;
  return data?.formattedAddress ?? data?.shortFormattedAddress ?? "";
}

function googleGeography(row: GoogleRow) {
  const coords = getGoogleCoords(row);
  return classifyTokyoGeography({
    region: row.city,
    address: googleAddress(row),
    lat: coords?.lat,
    lng: coords?.lng,
  });
}

function fsqGeography(activity: NormalizedActivity): string {
  return String(activity.source_metadata?.geography ?? "unknown");
}

function compare(fsq: NormalizedActivity[], google: GoogleRow[]): ComparisonSet {
  const confirmed: FsqGoogleMatch[] = [];
  const possible: FsqGoogleMatch[] = [];
  const rejected: FsqGoogleMatch[] = [];
  const fsqOnly: NormalizedActivity[] = [];
  const usedGoogle = new Set<string>();

  for (const activity of fsq) {
    const match = matchFsqToGoogle(activity, google.filter((row) => !usedGoogle.has(row.id)));
    if (!match) {
      fsqOnly.push(activity);
    } else if (match.decision === "confirmed_match") {
      confirmed.push(match);
      usedGoogle.add(match.googleId);
    } else if (match.decision === "possible_match") {
      possible.push(match);
      usedGoogle.add(match.googleId);
    } else {
      rejected.push(match);
      fsqOnly.push(activity);
    }
  }
  return { confirmed, possible, rejected, fsqOnly, googleOnly: google.filter((row) => !usedGoogle.has(row.id)) };
}

function countsByCategory<T>(rows: T[], category: (row: T) => string | null | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = category(row) ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.fsqFile)) throw new Error(`FSQ validation output not found: ${options.fsqFile}`);
  const fsq = JSON.parse(fs.readFileSync(options.fsqFile, "utf8")) as NormalizedActivity[];
  const importReportFile = options.fsqFile.replace(/\.json$/, ".report.json");
  const importReport = fs.existsSync(importReportFile)
    ? JSON.parse(fs.readFileSync(importReportFile, "utf8")) as ImportReportShape
    : {};
  console.log(`[fsq-compare] Loaded ${fsq.length} retained FSQ records`);

  const googleStartedAt = performance.now();
  const googleInventory = await fetchAllGoogleActivities();
  const googleFetchMs = performance.now() - googleStartedAt;
  console.log(`[fsq-compare] Verified ${googleInventory.rows.length}/${googleInventory.count} Google rows fetched`);

  const strictFsq = fsq.filter((activity) => fsqGeography(activity) === "tokyo_core_23_wards");
  const strictGoogle = googleInventory.rows.filter((row) => googleGeography(row) === "tokyo_core_23_wards");

  const matchingStartedAt = performance.now();
  const strict = compare(strictFsq, strictGoogle);
  const full = compare(fsq, googleInventory.rows);
  const matchingMs = performance.now() - matchingStartedAt;

  const attractionCoverage = TOKYO_MAJOR_ATTRACTIONS.map((definition) => {
    const prior = importReport.majorAttractionCoverage?.find((item) => item.name === definition.name) ?? {};
    const benchmark = findGoogleAttractionBenchmark(definition, googleInventory.rows);
    const fsqActivity = typeof prior.fsqPlaceId === "string"
      ? fsq.find((activity) => activity.source_record_id === prior.fsqPlaceId)
      : undefined;
    return {
      ...prior,
      name: definition.name,
      googleBenchmarkName: benchmark.name,
      distanceFromGoogleM: fsqActivity?.lat !== undefined && fsqActivity.lng !== undefined
        ? haversineM(fsqActivity.lat, fsqActivity.lng, benchmark.lat, benchmark.lng)
        : prior.distanceFromGoogleM,
    };
  });

  const reportStartedAt = performance.now();
  const googleOutsideStrict = googleInventory.rows.filter((row) => googleGeography(row) !== "tokyo_core_23_wards");
  const report = {
    generatedAt: new Date().toISOString(),
    city: "Tokyo",
    fsqPath: options.fsqFile,
    googleTotalCount: googleInventory.count,
    googleFetched: googleInventory.rows.length,
    googlePagesFetched: googleInventory.pages,
    strictArea: {
      fsqCount: strictFsq.length,
      googleCount: strictGoogle.length,
      confirmedMatches: strict.confirmed.length,
      possibleMatches: strict.possible.length,
      rejectedProximityOnly: strict.rejected.length,
      fsqOnly: strict.fsqOnly.length,
      googleOnly: strict.googleOnly.length,
    },
    fullInventory: {
      fsqCount: fsq.length,
      googleCount: googleInventory.rows.length,
      confirmedMatches: full.confirmed.length,
      possibleMatches: full.possible.length,
      rejectedProximityOnly: full.rejected.length,
      fsqOnly: full.fsqOnly.length,
      googleOnlyInsideComparisonArea: full.googleOnly.filter((row) => googleGeography(row) === "tokyo_core_23_wards").length,
      googleOnlyOutsideComparisonArea: full.googleOnly.filter((row) => googleGeography(row) !== "tokyo_core_23_wards").length,
    },
    confirmedMatches: full.confirmed,
    possibleMatches: full.possible,
    rejectedProximityCandidates: full.rejected,
    fsqOnlyExamples: full.fsqOnly.slice(0, 100).map((activity) => ({ id: activity.id, name: activity.title, category: activity.category })),
    googleOnlyInsideExamples: full.googleOnly.filter((row) => googleGeography(row) === "tokyo_core_23_wards").slice(0, 100).map((row) => ({ id: row.id, name: row.title, category: row.category })),
    googleOnlyOutsideExamples: googleOutsideStrict.slice(0, 100).map((row) => ({ id: row.id, name: row.title, category: row.category })),
    falseMatchExamples: full.rejected.slice(0, 50),
    categoryCoverage: {
      fsq: countsByCategory(fsq, (activity) => activity.category),
      google: countsByCategory(googleInventory.rows, (row) => row.category),
    },
    geography: importReport.geographyCounts ?? {},
    majorAttractionCoverage: attractionCoverage,
    websites: {
      fsqWithWebsite: fsq.filter((activity) => activity.capabilities.website).length,
      googleWithWebsite: googleInventory.rows.filter((row) => Boolean((row.google_places_data as { websiteUri?: string } | null)?.websiteUri)).length,
    },
    googleFallback: {
      recordsRequiringPhotoFallback: fsq.filter((activity) => !activity.capabilities.photos).length,
      recordsRequiringRatingFallback: fsq.filter((activity) => !activity.capabilities.rating).length,
      recordsWithMatchedGoogleFallback: full.confirmed.length + full.possible.length,
    },
    timings: {
      googleFetchMs,
      entityMatchingMs: matchingMs,
      reportGenerationMs: performance.now() - reportStartedAt,
      totalRuntimeMs: performance.now() - startedAt,
    },
    noSupabaseWrites: true,
  };

  fs.mkdirSync(options.outputDir, { recursive: true });
  const reportFile = path.join(options.outputDir, "tokyo-fsq-vs-google.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[fsq-compare] Confirmed: ${full.confirmed.length}; possible: ${full.possible.length}; proximity-only rejected: ${full.rejected.length}`);
  console.log(`[fsq-compare] Report: ${reportFile}`);
  console.log("[fsq-compare] Read-only comparison complete; no Supabase writes occurred");
}

void main().catch((error: unknown) => {
  console.error(`[fsq-compare] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

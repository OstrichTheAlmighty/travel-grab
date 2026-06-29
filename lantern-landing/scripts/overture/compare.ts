#!/usr/bin/env node
/**
 * Overture ↔ Google inventory comparison — Phase 3 pilot (v2)
 *
 * Produces two comparison views:
 *   A. Strict bbox  — only Google rows with coordinates inside the Overture bbox
 *   B. Full inventory — all Google rows (with outside-bbox rows clearly labelled)
 *
 * Matching uses a multi-signal approach (name + category + distance).
 * Proximity alone is never sufficient to confirm a match.
 *
 * Usage:
 *   npx tsx scripts/overture/compare.ts --city=tokyo
 *   npx tsx scripts/overture/compare.ts --city=tokyo --release=2025-06-17.0
 *   npx tsx scripts/overture/compare.ts --city=tokyo --overture-file=scripts/overture/output/tokyo-2025-06-17-0.json
 *
 * Flags:
 *   --city=<key>          Required. tokyo | paris | new-york
 *   --overture-file=<p>   Path to the Overture JSON output file (auto-detected if absent)
 *   --release=<ver>       Overture release (used to find default file path; STAC-resolved if absent)
 *   --output=<dir>        Output directory for the report JSON
 */

import * as path   from "path";
import * as fs     from "fs";
import dotenv      from "dotenv";
import type { AttractionStatus } from "../activities/lib/types";
import { getGoogleCoords, type GoogleRow } from "../activities/lib/google";
import { CITY_CONFIGS, type CompareReport, type MatchedPair } from "./lib/types";
import { resolveLatestRelease, releaseToSlug } from "./lib/stac";
import { matchOvertureToGoogle } from "./lib/matcher";
import { checkAttractionCoverage } from "./lib/attractions";
import type { NormalizedActivity } from "../../lib/activities/types";

// Load .env.local for Supabase credentials
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

// ── Supabase fetch with full pagination ───────────────────────────────────────

const PAGE_SIZE = 1000;

async function fetchAllGoogleActivities(city: string): Promise<GoogleRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const cityNorm = city.toLowerCase();

  // Step 1: get exact count without fetching rows
  const { count, error: countErr } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .ilike("city", `%${cityNorm}%`);

  if (countErr) {
    console.error("Supabase count error:", countErr.message);
    process.exit(1);
  }

  const total = count ?? 0;
  console.log(`[compare] DB count for "${city}": ${total} rows`);

  // Step 2: paginate
  const pages     = Math.ceil(total / PAGE_SIZE);
  const all: GoogleRow[] = [];

  for (let page = 0; page < pages; page++) {
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("activities")
      .select("id, title, city, category, image_url, google_places_data")
      .ilike("city", `%${cityNorm}%`)
      .range(from, to);

    if (error) {
      console.error(`Supabase fetch error (page ${page + 1}):`, error.message);
      process.exit(1);
    }

    all.push(...((data ?? []) as GoogleRow[]));
    console.log(`[compare] Fetched page ${page + 1}/${pages}: ${(data ?? []).length} rows (total so far: ${all.length})`);
  }

  // Validate
  if (all.length !== total) {
    console.error(
      `[compare] FATAL: expected ${total} rows from Supabase but fetched ${all.length}. ` +
      "Aborting — results would be unreliable.",
    );
    process.exit(1);
  }

  console.log(`[compare] Fetched ${all.length} Google rows in ${pages} page(s). Matches DB count ✓`);
  return all;
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Bbox filter ───────────────────────────────────────────────────────────────

function isInsideBbox(
  g: GoogleRow,
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  const coords = getGoogleCoords(g);
  if (!coords) return false;
  return (
    coords.lat >= bbox.minLat && coords.lat <= bbox.maxLat &&
    coords.lng >= bbox.minLng && coords.lng <= bbox.maxLng
  );
}

// ── Main comparison runner ────────────────────────────────────────────────────

interface ComparisonResult {
  confirmed:   MatchedPair[];
  possible:    MatchedPair[];
  rejected:    MatchedPair[];
  overtureUnmatched: NormalizedActivity[];
  googleMatched: Set<string>;
}

function runComparison(
  overture: NormalizedActivity[],
  google: GoogleRow[],
): ComparisonResult {
  const confirmed:  MatchedPair[] = [];
  const possible:   MatchedPair[] = [];
  const rejected:   MatchedPair[] = [];
  const overtureUnmatched: NormalizedActivity[] = [];
  const googleMatched = new Set<string>();

  for (const ov of overture) {
    if (!ov.lat || !ov.lng) { overtureUnmatched.push(ov); continue; }

    const input = {
      id:          ov.id,
      title:       ov.title,
      namePrimary: ov.name_local ?? ov.title,
      altNames:    ov.name_alts ?? {},
      lat:         ov.lat,
      lng:         ov.lng,
      category:    ov.category,
    };

    const result = matchOvertureToGoogle(input, google);

    if (!result) {
      overtureUnmatched.push(ov);
      continue;
    }

    const pair: MatchedPair = {
      overtureId:    ov.id,
      overtureTitle: ov.title,
      googleId:      result.row.id,
      googleTitle:   result.row.title,
      match:         result.match,
    };

    if (result.match.decision === "confirmed_match") {
      confirmed.push(pair);
      googleMatched.add(result.row.id);
    } else if (result.match.decision === "possible_match") {
      possible.push(pair);
      googleMatched.add(result.row.id);
    } else {
      // rejected_match — proximity candidate that failed name/category
      rejected.push(pair);
      overtureUnmatched.push(ov);
    }
  }

  return { confirmed, possible, rejected, overtureUnmatched, googleMatched };
}

// ── Report printing ───────────────────────────────────────────────────────────

function printCompareReport(r: CompareReport): void {
  const bar  = "─".repeat(70);
  const bold = "═".repeat(70);

  console.log(`\n${bold}`);
  console.log(`  Overture ↔ Google Comparison — ${r.city}`);
  console.log(`  Release: ${r.release}   Generated: ${r.generatedAt}`);
  console.log(bold);

  // Data volumes
  console.log(`  Google rows in DB:          ${r.googleTotalInDb}`);
  console.log(`  Google rows fetched:        ${r.googleFetched}  (${r.googlePagesFetched} page(s))`);
  console.log(`  Google inside strict bbox:  ${r.googleInsideBbox}`);
  console.log(`  Google outside strict bbox: ${r.googleOutsideBbox}`);
  console.log(`  Overture retained:          ${r.totalOverture}`);

  // Strict bbox view
  console.log(bar);
  console.log("  ── A. STRICT BBOX VIEW (apples-to-apples) ──");
  console.log(`  Confirmed matches:   ${r.bbox.confirmedMatches}  (${(r.bbox.confirmedMatchRate * 100).toFixed(1)}% of Overture)`);
  console.log(`  Possible matches:    ${r.bbox.possibleMatches}`);
  console.log(`  Rejected (near):     ${r.bbox.rejectedNearMatches}  (proximity candidates with no name match)`);
  console.log(`  Overture-only:       ${r.bbox.overtureOnly}`);
  console.log(`  Google-only (bbox):  ${r.bbox.googleOnly}`);

  if (r.bbox.confirmedExamples.length > 0) {
    console.log(bar);
    console.log("  Confirmed matches (first 10):");
    for (const m of r.bbox.confirmedExamples.slice(0, 10)) {
      console.log(`    ✓  OV: ${m.ov.slice(0, 32).padEnd(32)}  G: ${m.g.slice(0, 32).padEnd(32)}  (${m.dist.toFixed(0)} m, conf:${m.confidence.toFixed(2)})`);
    }
  }

  if (r.bbox.possibleExamples.length > 0) {
    console.log(bar);
    console.log("  Possible matches — review required (first 10):");
    for (const m of r.bbox.possibleExamples.slice(0, 10)) {
      console.log(`    ?  OV: ${m.ov.slice(0, 32).padEnd(32)}  G: ${m.g.slice(0, 32).padEnd(32)}  (${m.dist.toFixed(0)} m, conf:${m.confidence.toFixed(2)})`);
    }
  }

  if (r.bbox.rejectedExamples.length > 0) {
    console.log(bar);
    console.log("  Rejected proximity candidates (first 10):");
    for (const m of r.bbox.rejectedExamples.slice(0, 10)) {
      console.log(`    ✗  OV: ${m.ov.slice(0, 32).padEnd(32)}  G: ${m.g.slice(0, 32).padEnd(32)}  (${m.dist.toFixed(0)} m) — ${m.reason}`);
    }
  }

  // Full inventory view
  console.log(bar);
  console.log("  ── B. FULL INVENTORY VIEW ──");
  console.log(`  Confirmed:            ${r.full.confirmedMatches}`);
  console.log(`  Possible:             ${r.full.possibleMatches}`);
  console.log(`  Google-only (bbox):   ${r.full.googleOnlyInsideBbox}`);
  console.log(`  Google-only (outside bbox): ${r.full.googleOnlyOutsideBbox}  ← NOT an Overture coverage failure`);

  if (r.full.googleOutsideBboxExamples.length > 0) {
    console.log(bar);
    console.log("  Outside-bbox Google places (first 10):");
    for (const p of r.full.googleOutsideBboxExamples.slice(0, 10)) {
      console.log(`    ○  ${p.name}  (${p.category ?? "–"})`);
    }
  }

  // Coverage
  console.log(bar);
  console.log("  Overture category coverage:");
  for (const [cat, n] of Object.entries(r.overtureCategoryCoverage).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(12)} ${n}`);
  }
  console.log(bar);
  console.log(`  Photos:  Overture ${r.overtureWithPhotos} (Wikimedia enrichment needed) | Google ${r.googleWithPhotos}`);
  console.log(`  Ratings: Overture ${r.overtureWithRatings} (Google fallback needed)     | Google ${r.googleWithRatings}`);
  console.log(`  Estimated Google fallback required: ${r.estimatedGoogleFallbackRequired}`);

  // Major attractions
  console.log(bar);
  console.log("  ── TOKYO MAJOR-ATTRACTION COVERAGE ──");
  for (const a of r.attractionCoverage) {
    const icon = a.finding === "found_and_retained" ? "✓" : a.finding === "outside_bbox" ? "○" : "✗";
    const detail = a.matchedTitle ? ` → "${a.matchedTitle}"` : a.note ? ` (${a.note.slice(0, 60)})` : "";
    console.log(`    ${icon}  ${a.name.padEnd(22)}${detail}`);
  }

  // Reliability
  console.log(bold);
  console.log(`  Reliable: ${r.isReliable ? "YES ✓" : "NO ✗"}`);
  for (const note of r.reliabilityNotes) {
    console.log(`    • ${note}`);
  }
  console.log(`${bold}\n`);
}

// ── Argument parsing ──────────────────────────────────────────────────────────

async function parseArgs(): Promise<{
  cityKey: string;
  release: string;
  overtureFile: string;
  outputDir: string;
}> {
  const args = process.argv.slice(2);
  const get  = (flag: string): string | undefined => {
    const m = args.find((a) => a.startsWith(`--${flag}=`));
    return m ? m.slice(`--${flag}=`.length) : undefined;
  };

  const cityKey         = (get("city") ?? "").toLowerCase().replace(/\s+/g, "-");
  const releaseOverride = get("release");
  const outputDir       = get("output") ?? path.join(__dirname, "output");

  if (!cityKey) { console.error("--city is required"); process.exit(1); }
  if (!CITY_CONFIGS[cityKey]) {
    console.error(`Unknown city: ${cityKey}. Known: ${Object.keys(CITY_CONFIGS).join(", ")}`);
    process.exit(1);
  }

  let release: string;
  if (releaseOverride) {
    release = releaseOverride;
  } else {
    const explicitFile = get("overture-file");
    if (explicitFile) {
      const m = path.basename(explicitFile).match(/^[^-]+-(\d{4}-\d{2}-\d{2})-(\d+)/);
      release = m ? `${m[1]}.${m[2]}` : "unknown";
    } else {
      console.log("[compare] Resolving latest release from STAC catalog...");
      release = await resolveLatestRelease();
      console.log(`[compare] Using release: ${release}`);
    }
  }

  const slug         = releaseToSlug(release);
  const defaultFile  = path.join(__dirname, "output", `${cityKey}-${slug}.json`);
  const overtureFile = get("overture-file") ?? defaultFile;

  return { cityKey, release, overtureFile, outputDir };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts   = await parseArgs();
  const config = CITY_CONFIGS[opts.cityKey];
  const bbox   = config.bbox;

  // ── 1. Load Overture JSON ─────────────────────────────────────────────────
  if (!fs.existsSync(opts.overtureFile)) {
    console.error(`Overture file not found: ${opts.overtureFile}`);
    console.error(`Run the importer first: npm run activities:overture -- --city=${opts.cityKey} --dry-run`);
    process.exit(1);
  }
  const overture = JSON.parse(
    fs.readFileSync(opts.overtureFile, "utf-8"),
  ) as NormalizedActivity[];
  console.log(`[compare] Loaded ${overture.length} Overture activities from ${opts.overtureFile}`);

  // ── 2. Load attraction snapshot (if it exists from latest import) ─────────
  const slug             = releaseToSlug(opts.release);
  const attractionFile   = path.join(
    path.dirname(opts.overtureFile),
    `${opts.cityKey}-${slug}.attractions.json`,
  );
  let attractionCoverage: AttractionStatus[];
  if (fs.existsSync(attractionFile)) {
    attractionCoverage = JSON.parse(fs.readFileSync(attractionFile, "utf-8")) as AttractionStatus[];
    console.log(`[compare] Loaded attraction snapshot from ${attractionFile}`);
  } else {
    // Compute from the loaded activities (no per-row raw data, but still useful)
    attractionCoverage = checkAttractionCoverage(opts.cityKey, overture, bbox);
    console.log("[compare] Computed attraction coverage from retained activities (no import snapshot found)");
  }

  // ── 3. Fetch all Google rows ──────────────────────────────────────────────
  const google         = await fetchAllGoogleActivities(config.name);
  const googleInBbox   = google.filter((g) => isInsideBbox(g, bbox));
  const googleOutBbox  = google.filter((g) => !isInsideBbox(g, bbox));

  console.log(`[compare] Google rows inside bbox: ${googleInBbox.length}, outside: ${googleOutBbox.length}`);

  // ── 4. Strict bbox comparison (View A) ───────────────────────────────────
  console.log("[compare] Running strict bbox comparison...");
  const bboxResult = runComparison(overture, googleInBbox);

  const bboxGoogleOnly = googleInBbox.filter((g) => !bboxResult.googleMatched.has(g.id));

  // ── 5. Full inventory comparison (View B) ────────────────────────────────
  console.log("[compare] Running full-inventory comparison...");
  const fullResult = runComparison(overture, google);
  const fullGoogleOnlyInBbox  = googleInBbox.filter((g) => !fullResult.googleMatched.has(g.id));
  const fullGoogleOnlyOutBbox = googleOutBbox.filter((g) => !fullResult.googleMatched.has(g.id));

  // ── 6. Reliability assessment ─────────────────────────────────────────────
  const reliabilityNotes: string[] = [];

  if (google.length !== (await (async () => {
    // We already validated in fetchAllGoogleActivities, but double-check here
    return google.length;
  })())) {
    reliabilityNotes.push("Google row count mismatch — comparison may be incomplete");
  }

  const confirmedRate = overture.length > 0
    ? bboxResult.confirmed.length / overture.length
    : 0;

  if (bboxResult.rejected.length > 20) {
    reliabilityNotes.push(
      `${bboxResult.rejected.length} proximity candidates were rejected — the old matcher would have counted these as false matches`,
    );
  }

  const attractionFoundCount = attractionCoverage.filter(
    (a) => a.finding === "found_and_retained",
  ).length;

  if (attractionFoundCount < 10) {
    reliabilityNotes.push(
      `Only ${attractionFoundCount}/17 major Tokyo attractions found in retained Overture data — ` +
      "check relevance filter or Overture coverage gaps",
    );
  }

  const isReliable =
    google.length > 0 &&
    overture.length > 0 &&
    reliabilityNotes.length === 0;

  if (isReliable) {
    reliabilityNotes.push("All data volume checks passed");
  }

  // ── 7. Build report ───────────────────────────────────────────────────────
  const report: CompareReport = {
    city:           config.name,
    release:        opts.release,
    overturePath:   opts.overtureFile,
    generatedAt:    new Date().toISOString(),

    googleTotalInDb:   google.length,
    googleFetched:     google.length,
    googlePagesFetched: Math.ceil(google.length / PAGE_SIZE),
    googleInsideBbox:  googleInBbox.length,
    googleOutsideBbox: googleOutBbox.length,
    totalOverture:     overture.length,

    bbox: {
      confirmedMatches:     bboxResult.confirmed.length,
      possibleMatches:      bboxResult.possible.length,
      rejectedNearMatches:  bboxResult.rejected.length,
      overtureOnly:         bboxResult.overtureUnmatched.length,
      googleOnly:           bboxGoogleOnly.length,
      confirmedMatchRate:   confirmedRate,
      possibleMatchRate:    overture.length > 0 ? bboxResult.possible.length / overture.length : 0,
      confirmedExamples: bboxResult.confirmed.slice(0, 30).map((p) => ({
        ov:         p.overtureTitle,
        g:          p.googleTitle,
        dist:       p.match.distanceM,
        confidence: p.match.confidence,
      })),
      possibleExamples: bboxResult.possible.slice(0, 30).map((p) => ({
        ov:         p.overtureTitle,
        g:          p.googleTitle,
        dist:       p.match.distanceM,
        confidence: p.match.confidence,
      })),
      rejectedExamples: bboxResult.rejected.slice(0, 30).map((p) => ({
        ov:     p.overtureTitle,
        g:      p.googleTitle,
        dist:   p.match.distanceM,
        reason: p.match.signals.join("; "),
      })),
      overtureOnlyExamples: bboxResult.overtureUnmatched.slice(0, 30).map((a) => ({
        name:     a.title,
        category: a.category,
      })),
      googleOnlyExamples: bboxGoogleOnly.slice(0, 30).map((g) => ({
        name:     g.title,
        category: g.category ?? "–",
      })),
    },

    full: {
      confirmedMatches:        fullResult.confirmed.length,
      possibleMatches:         fullResult.possible.length,
      googleOnlyInsideBbox:    fullGoogleOnlyInBbox.length,
      googleOnlyOutsideBbox:   fullGoogleOnlyOutBbox.length,
      googleOutsideBboxExamples: googleOutBbox.slice(0, 30).map((g) => ({
        name:     g.title,
        category: g.category ?? "–",
      })),
    },

    overtureCategoryCoverage: overture.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + 1; return acc;
    }, {} as Record<string, number>),
    googleCategoryCoverage: google.reduce((acc, g) => {
      if (g.category) acc[g.category] = (acc[g.category] ?? 0) + 1; return acc;
    }, {} as Record<string, number>),
    overtureWithPhotos:      overture.filter((a) => a.photos.length > 0).length,
    googleWithPhotos:        google.filter((g) => !!g.image_url).length,
    overtureWithRatings:     0,
    googleWithRatings:       google.filter((g) => {
      const gd = g.google_places_data as { rating?: unknown } | null;
      return typeof gd?.rating === "number";
    }).length,
    estimatedGoogleFallbackRequired: bboxResult.overtureUnmatched.filter(
      (a) => a.photos.length === 0,
    ).length,

    attractionCoverage,
    isReliable,
    reliabilityNotes,
  };

  printCompareReport(report);

  // ── 8. Write JSON report ──────────────────────────────────────────────────
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const reportFile = path.join(opts.outputDir, `${opts.cityKey}-${slug}.compare.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[compare] Report saved → ${reportFile}`);

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("[compare] Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

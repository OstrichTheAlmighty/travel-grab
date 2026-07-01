import type { OvertureRawRow, OverturePlace, OvertureNameEntry, OvertureAddress, OvertureSource } from "./types";
import type { NormalizedActivity } from "../../../lib/activities/types";
import { resolveAndMapOvertureCategory } from "./categoryMap";
import { isTravelRelevant } from "./relevanceFilter";
import { calculateQualityScore } from "./qualityScore";
import { generateKeywords } from "./keywords";

// ── Raw value parsing helpers ─────────────────────────────────────────────────
//
// DuckDB returns complex Parquet types (arrays of structs) as:
//   - Actual JavaScript arrays/objects in duckdb v1+
//   - Stringified JSON in some older versions or edge cases
// We handle both defensively.

function parseJsonField<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try { return JSON.parse(value) as T[]; } catch { return []; }
  }
  return [];
}

function parseStringArray(value: unknown): string[] {
  const arr = parseJsonField<unknown>(value);
  return arr.filter((x): x is string => typeof x === "string");
}

/** Extract the best English name from the names.common array */
function extractEnglishName(common: OvertureNameEntry[]): string | null {
  const EN_LANGS = ["en", "en-US", "en-GB", "en-AU"];
  for (const lang of EN_LANGS) {
    const entry = common.find((e) => e?.language === lang);
    if (entry?.value) return entry.value;
  }
  // Loose match: any entry whose language starts with "en"
  const loose = common.find((e) => e?.language?.startsWith("en"));
  return loose?.value ?? null;
}

/** Build {language → value} map from the names.common array */
function buildAltNames(common: OvertureNameEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of common) {
    if (entry?.language && entry?.value) {
      out[entry.language] = entry.value;
    }
  }
  return out;
}

/**
 * Extracts source datasets and record IDs from the Overture sources array.
 * Returns unique dataset names and corresponding record IDs.
 */
function extractSourceAttribution(sourcesRaw: unknown): {
  datasets: string[];
  recordIds: string[];
} {
  const sources = parseJsonField<OvertureSource>(sourcesRaw);
  const datasets: string[] = [];
  const recordIds: string[] = [];

  for (const s of sources) {
    if (s?.dataset && !datasets.includes(s.dataset)) {
      datasets.push(s.dataset);
    }
    if (s?.record_id && !recordIds.includes(s.record_id)) {
      recordIds.push(s.record_id);
    }
  }

  return { datasets, recordIds };
}

/**
 * Builds a human-readable attribution string from dataset names.
 * Overture data comes from multiple contributors; the primary dataset
 * is credited plus a reference to Overture Maps Foundation.
 */
function buildAttribution(datasets: string[]): string {
  const DATASET_LABELS: Record<string, string> = {
    meta:          "Meta",
    openstreetmap: "OpenStreetMap contributors",
    yelp:          "Yelp",
    microsoft:     "Microsoft",
  };

  const labeled = datasets
    .map((d) => DATASET_LABELS[d] ?? d)
    .filter(Boolean);

  const base = labeled.length > 0
    ? labeled.join(", ")
    : "Overture Maps Foundation contributors";

  return labeled.length > 0
    ? `${base} via Overture Maps Foundation`
    : base;
}

/**
 * Returns the SPDX license or license name for a dataset.
 * Overture's compilation is CDLA-Permissive-2.0, but OSM-derived records
 * are ODbL and must carry the appropriate notice.
 */
function resolveLicense(datasets: string[]): string {
  if (datasets.includes("openstreetmap")) return "ODbL-1.0";
  // Meta and most other contributors in Overture are CDLA-Permissive-2.0
  return "CDLA-Permissive-2.0";
}

// ── Main normalization ────────────────────────────────────────────────────────

/**
 * Cleans a raw DuckDB OvertureRawRow into a typed OverturePlace.
 * Returns null if the row doesn't pass the travel-relevance filter.
 *
 * Category resolution priority:
 *   1. taxonomy_primary  (current schema 2025+, dot-notation)
 *   2. category_primary  (legacy schema, dot-notation)
 *   3. basic_category    (current schema simplified top-level)
 */
export function cleanRawRow(row: OvertureRawRow): OverturePlace | null {
  if (!isTravelRelevant(row)) return null;

  const resolved = resolveAndMapOvertureCategory(row);
  if (!resolved) return null;

  const { category: tgCategory, effectiveOvertureCategory } = resolved;

  const commonRaw         = parseJsonField<OvertureNameEntry>(row.names_common);
  const altNames          = buildAltNames(commonRaw);
  const extractedEnglish  = extractEnglishName(commonRaw);
  const englishName       = extractedEnglish ?? row.name_primary ?? "";
  const hasEnglishName    = !!extractedEnglish;

  const websites  = parseStringArray(row.websites);
  const addresses = parseJsonField<OvertureAddress>(row.addresses);

  const { datasets, recordIds } = extractSourceAttribution(row.sources);

  const qualityScore = calculateQualityScore(row, hasEnglishName, Object.keys(altNames).length);
  const searchKeywords = generateKeywords(
    englishName,
    row.name_primary ?? "",
    altNames,
    effectiveOvertureCategory,
    tgCategory,
    "", // city filled later by caller
    row.brand_name ?? undefined,
  );

  return {
    id:               row.id,
    namePrimary:      row.name_primary ?? englishName,
    nameEnglish:      englishName,
    altNames,
    overtureCategory: effectiveOvertureCategory,
    tgCategory,
    confidence:       row.confidence ?? 0,
    websites,
    addresses,
    brandName:        row.brand_name ?? undefined,
    lng:              row.lng!,
    lat:              row.lat!,
    qualityScore,
    searchKeywords,
    isDuplicate:      false,
    sourceDatasets:   datasets,
    sourceRecordIds:  recordIds,
  };
}

/**
 * Converts a cleaned OverturePlace into a provider-neutral NormalizedActivity.
 * This is the output format used across all providers (Phase 2 types).
 */
export function normalizeOverturePlace(
  place: OverturePlace,
  city: string,
): NormalizedActivity {
  // Regenerate keywords with the actual city name
  const searchKeywords = generateKeywords(
    place.nameEnglish,
    place.namePrimary,
    place.altNames,
    place.overtureCategory,
    place.tgCategory,
    city,
    place.brandName,
  );

  const attribution = buildAttribution(place.sourceDatasets);
  const license     = resolveLicense(place.sourceDatasets);

  return {
    id:                 place.id,
    provider_ids:       [{ source: "overture", id: place.id }],
    place_id:           undefined,
    google_places_data: undefined,
    title:              place.nameEnglish || place.namePrimary,
    description:        undefined,   // Phase 4: Wikivoyage enrichment
    city,
    category:           place.tgCategory,
    photos:             [],          // Phase 4: Wikimedia enrichment
    image_url:          undefined,
    rating:             undefined,   // Overture Places does not include ratings
    review_count:       undefined,
    website:            place.websites[0],
    map_link:           undefined,
    lat:                place.lat,
    lng:                place.lng,
    search_keywords:    searchKeywords,
    capabilities: {
      photos:            false,
      rating:            false,
      review_count:      false,
      written_reviews:   false,
      opening_hours:     false,
      phone:             false,
      website:           place.websites.length > 0,
      map_link:          false,
      booking:           false,
      live_availability: false,
      price:             false,
    },
    source:           "overture",
    built_at:         new Date().toISOString(),
    source_dataset:   place.sourceDatasets[0],
    source_record_id: place.sourceRecordIds[0],
    attribution,
    license,
    // Preserve local-language names for entity matching in the comparison pipeline.
    // name_local is set only when the Japanese primary differs from the English title.
    name_local:  place.namePrimary !== (place.nameEnglish || place.namePrimary)
                   ? place.namePrimary
                   : undefined,
    name_alts:   Object.keys(place.altNames).length > 0 ? place.altNames : undefined,
  };
}

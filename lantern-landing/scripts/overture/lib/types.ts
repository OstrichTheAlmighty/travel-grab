import type { Category } from "../../../app/activities/data/types";
import type { AttractionStatus, BoundingBox } from "../../activities/lib/types";

// ── City configuration ────────────────────────────────────────────────────────

export type { AttractionStatus, BoundingBox } from "../../activities/lib/types";

export interface CityConfig {
  name: string;
  country: string;
  bbox: BoundingBox;
}

export const CITY_CONFIGS: Record<string, CityConfig> = {
  tokyo: {
    name: "Tokyo",
    country: "JP",
    bbox: { minLng: 139.55, minLat: 35.50, maxLng: 139.95, maxLat: 35.80 },
  },
  paris: {
    name: "Paris",
    country: "FR",
    bbox: { minLng: 2.25, minLat: 48.75, maxLng: 2.45, maxLat: 48.95 },
  },
  "new-york": {
    name: "New York",
    country: "US",
    bbox: { minLng: -74.05, minLat: 40.60, maxLng: -73.70, maxLat: 40.85 },
  },
};

// ── Raw DuckDB row ────────────────────────────────────────────────────────────
//
// Overture Places schema has two generations. The importer detects which is
// present and projects NULL for missing fields so that OvertureRawRow always
// has the same shape regardless of schema version.
//
// Current schema (2025+):
//   basic_category      → simplified top-level category string
//   taxonomy.primary    → full dot-notation category (same format as legacy categories.primary)
//   taxonomy.alternate  → [] alternate taxonomy values
//   taxonomy.hierarchy  → [] full path from root to leaf
//   sources             → [{dataset, record_id, confidence, ...}]
//
// Legacy schema (pre-2025):
//   categories.primary  → dot-notation category (same format as taxonomy.primary)
//   categories.alternate → [] additional categories
//
// names, confidence, websites, addresses, brand are common to both schemas.

export interface OvertureNameEntry {
  value: string;
  language: string;
}

export interface OvertureAddress {
  freeform?: string | null;
  locality?: string | null;
  postcode?: string | null;
  region?: string | null;
  country?: string | null;
}

export interface OvertureSource {
  property?: string | null;
  dataset?: string | null;     // e.g. "meta", "openstreetmap", "yelp"
  record_id?: string | null;   // original ID in the source system
  confidence?: number | null;
}

export interface OvertureRawRow {
  id: string;
  name_primary: string | null;
  /** DuckDB may return as array or as stringified JSON */
  names_common: OvertureNameEntry[] | string | null;

  // ── Current schema (2025+) ─────────────────────────────────────────────────
  /** Top-level simplified category (e.g. "food_and_drink", "arts_and_entertainment") */
  basic_category: string | null;
  /** Full taxonomy path (e.g. "food_and_drink.ramen") — same dot-notation as legacy */
  taxonomy_primary: string | null;
  /** taxonomy.alternates (plural) — current schema 2025+ */
  taxonomy_alternates: string[] | string | null;
  taxonomy_hierarchy: string[] | string | null;

  // ── Legacy schema fallback ────────────────────────────────────────────────
  /** Legacy: categories.primary — NULL in current schema, populated in legacy schema */
  category_primary: string | null;
  categories_alternate: string[] | string | null;

  // ── Common fields ─────────────────────────────────────────────────────────
  confidence: number | null;
  websites: string[] | string | null;
  addresses: OvertureAddress[] | string | null;
  /**
   * Source attribution array.  Each element names the contributing dataset.
   * Present in both schemas but may be absent in some records.
   */
  sources: OvertureSource[] | string | null;
  brand_name: string | null;
  /** Centre longitude derived from (bbox.xmin + bbox.xmax) / 2 */
  lng: number | null;
  /** Centre latitude derived from (bbox.ymin + bbox.ymax) / 2 */
  lat: number | null;
}

// ── Detected Parquet schema version ──────────────────────────────────────────

export type OvertureSchemaVersion = "current" | "legacy";

// ── Normalized Overture place ─────────────────────────────────────────────────

export interface OverturePlace {
  id: string;
  namePrimary: string;
  nameEnglish: string;
  altNames: Record<string, string>;
  /** Effective Overture category string (from taxonomy.primary or categories.primary) */
  overtureCategory: string;
  tgCategory: Category;
  confidence: number;
  websites: string[];
  addresses: OvertureAddress[];
  brandName?: string;
  lng: number;
  lat: number;
  qualityScore: number;
  searchKeywords: string[];
  isDuplicate: boolean;
  duplicateOf?: string;

  // ── Source attribution ────────────────────────────────────────────────────
  /** Names of contributing datasets (e.g. ["meta", "openstreetmap"]) */
  sourceDatasets: string[];
  /** Original record IDs in contributing datasets */
  sourceRecordIds: string[];
}

// ── CLI options ───────────────────────────────────────────────────────────────

export interface ImportOptions {
  cityKey: string;
  release: string;
  dryRun: boolean;
  write: boolean;
  outputDir: string;
  verbose: boolean;
}

// ── Report types ──────────────────────────────────────────────────────────────

export interface ImportReport {
  city: string;
  country: string;
  release: string;
  executionMs: number;
  totalRawPlaces: number;
  retainedPlaces: number;
  removedPlaces: number;
  duplicateCount: number;
  byCategory: Record<string, number>;
  withCoordinates: number;
  withWebsites: number;
  withAltNames: number;
  withImages: number;
  withRatings: number;
  top50: Array<{ id: string; name: string; category: string; score: number; lat: number; lng: number }>;
  estimatedApiCostUsd: number;
  outputFile: string | null;
  dryRun: boolean;
}

// ── Entity-matching types ─────────────────────────────────────────────────────

export type MatchDecision = "confirmed_match" | "possible_match" | "rejected_match";

export interface PlaceMatch {
  decision: MatchDecision;
  /** 0-1 composite score */
  confidence: number;
  distanceM: number;
  /** Ordered list of signal tags explaining the decision */
  signals: string[];
  explanation: string;
  googleId: string;
  overtureName: string;
  googleName: string;
  overtureCategory: string;
  googleCategory: string | null;
}

export interface MatchedPair {
  overtureId:   string;
  overtureTitle: string;
  googleId:     string;
  googleTitle:  string;
  match:        PlaceMatch;
}

// ── Revised comparison report ─────────────────────────────────────────────────

export interface CompareReport {
  city: string;
  release: string;
  overturePath: string;
  generatedAt: string;

  // ── Data volumes ──────────────────────────────────────────────────────────
  googleTotalInDb: number;
  googleFetched: number;
  googlePagesFetched: number;
  googleInsideBbox: number;
  googleOutsideBbox: number;
  totalOverture: number;

  // ── Strict bbox view (apples-to-apples) ───────────────────────────────────
  bbox: {
    confirmedMatches: number;
    possibleMatches: number;
    rejectedNearMatches: number;
    overtureOnly: number;
    googleOnly: number;
    confirmedMatchRate: number;
    possibleMatchRate: number;
    confirmedExamples: Array<{ ov: string; g: string; dist: number; confidence: number }>;
    possibleExamples:  Array<{ ov: string; g: string; dist: number; confidence: number }>;
    rejectedExamples:  Array<{ ov: string; g: string; dist: number; reason: string }>;
    overtureOnlyExamples: Array<{ name: string; category: string }>;
    googleOnlyExamples:   Array<{ name: string; category: string }>;
  };

  // ── Full-inventory view ───────────────────────────────────────────────────
  full: {
    confirmedMatches: number;
    possibleMatches: number;
    googleOnlyInsideBbox: number;
    googleOnlyOutsideBbox: number;
    googleOutsideBboxExamples: Array<{ name: string; category: string }>;
  };

  // ── Coverage ──────────────────────────────────────────────────────────────
  overtureCategoryCoverage: Record<string, number>;
  googleCategoryCoverage: Record<string, number>;
  overtureWithPhotos: number;
  googleWithPhotos: number;
  overtureWithRatings: number;
  googleWithRatings: number;
  estimatedGoogleFallbackRequired: number;

  // ── Major-attraction coverage ─────────────────────────────────────────────
  attractionCoverage: AttractionStatus[];

  // ── Reliability indicator ─────────────────────────────────────────────────
  isReliable: boolean;
  reliabilityNotes: string[];
}

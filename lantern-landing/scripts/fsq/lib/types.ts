import type { Category } from "../../../app/activities/data/types";
import type { BoundingBox, AttractionStatus } from "../../activities/lib/types";

// ── Re-export shared types for convenience ────────────────────────────────────
export type { BoundingBox, AttractionStatus };
export type FsqTravelCategory = Category | "free";
export type TokyoGeography = "tokyo_core_23_wards" | "broader_tokyo" | "yokohama_or_outside_tokyo" | "unknown";

// ── FSQ sub-types ─────────────────────────────────────────────────────────────

export interface FsqCategory {
  id: string | number;
  name: string;
}

export interface FsqChain {
  id: string;
  name: string;
}

// ── Raw DuckDB row from places_os ─────────────────────────────────────────────

export interface FsqRawRow {
  fsq_place_id:      string | null;
  name:              string | null;
  latitude:          number | null;
  longitude:         number | null;
  address:           string | null;
  address_extended?: string | null;
  locality:          string | null;
  region:            string | null;
  postcode:          string | null;
  country:           string | null;
  tel?:              string | null;
  website:           string | null;
  fsq_category_ids?: string[] | null;
  fsq_category_labels?: string[] | null;
  placemaker_url?:   string | null;
  coordinate_source?: "latitude_longitude" | "point_bbox" | null;
  sample_category_group?: string;
  source_rank_score?: number;
  stratified_rank?: number | bigint;
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  /** Compatibility fields for the pre-schema fixtures. */
  categories?:       FsqCategory[] | string | null;
  chains?:           FsqChain[] | string | null;
  date_created:      string | null;
  date_refreshed:    string | null;
  date_closed:       string | null;
  /** Array of {name, language} objects — structure TBD from schema */
  name_variants?:    unknown;
}

// ── Cleaned intermediate ──────────────────────────────────────────────────────

export interface FsqPlace {
  id:                      string;
  namePrimary:             string;
  nameEnglish:             string;
  altNames:                Record<string, string>;
  lat:                     number;
  lng:                     number;
  tgCategory:              FsqTravelCategory;
  fsqCategories:           FsqCategory[];
  fsqCategoryIds:          string[];
  fsqCategoryLabels:       string[];
  detailedSubcategories:   string[];
  primaryFsqCategoryName:  string;
  address:                 string;
  locality:                string;
  region:                  string;
  country:                 string;
  website:                 string;
  placemakerUrl:           string;
  chains:                  FsqChain[];
  dateCreated:             string | null;
  dateRefreshed:           string | null;
  coordinateSource:        "latitude_longitude" | "point_bbox";
  geography:               TokyoGeography;
  qualityScore:            number;
  chainPenaltyApplied:     boolean;
  genericBusinessPenaltyApplied: boolean;
  isDuplicate:             boolean;
  duplicateOf?:            string;
}

// ── City config ───────────────────────────────────────────────────────────────

export interface CityConfig {
  name: string;
  country: string;
  bbox: BoundingBox;
}

export const FSQ_CITY_CONFIGS: Record<string, CityConfig> = {
  tokyo: {
    name: "Tokyo",
    country: "JP",
    bbox: { minLng: 139.55, minLat: 35.50, maxLng: 139.95, maxLat: 35.80 },
  },
};

// ── Report types ──────────────────────────────────────────────────────────────

export interface FsqImportReport {
  city:             string;
  country:          string;
  executionMs:      number;
  queryMs:          number;
  filterMs:         number;
  normalizeMs:      number;
  dedupMs:          number;
  totalRawPlaces:   number;
  rejectedMissingCoordinates: number;
  rejectedClosed: number;
  rejectedNotTravelRelevant: number;
  rejectedGenericBusiness: number;
  retainedPlaces:   number;
  removedPlaces:    number;
  duplicateCount:   number;
  byCategory:       Record<string, number>;
  byFsqCategoryLabel: Record<string, number>;
  withCoordinates:  number;
  withWebsites:     number;
  geometryFallbackCount: number;
  chainPenaltyCount: number;
  genericBusinessPenaltyCount: number;
  geographyCounts: Record<TokyoGeography, number>;
  withAltNames:     number;
  withChains:       number;
  top50:            Array<{
    id:       string;
    name:     string;
    category: string;
    score:    number;
    lat:      number;
    lng:      number;
  }>;
  top20ByCategory: Record<string, FsqImportReport["top50"]>;
  top20TokyoCore: FsqImportReport["top50"];
  top20WiderMetro: FsqImportReport["top50"];
  candidateCounts: {
    allInsideBbox: number;
    travelRelevantOpen: number;
    usableCoordinates: number;
    excludedClosed: number;
  };
  explainPlan: string;
  countQueryMs: number;
  explainMs: number;
  geographyMs: number;
  attractionQueryMs: number;
  samplingStrategy: string;
  oldLimitWasUnordered: true;
  majorAttractionCoverage: Array<{
    name: string;
    rawStatus: "present" | "absent" | "outside_selected_area";
    retained: boolean;
    filteredReason?: string;
    fsqPlaceId?: string;
    fsqName?: string;
    fsqCategory?: string;
    distanceFromGoogleM?: number;
    googleBenchmarkName?: string;
  }>;
  estimatedApiCostUsd: number;
  noSupabaseWrites: true;
  queryLimit: number;
  queryTimedOut: boolean;
  outputFile:       string | null;
  reportFile:       string;
  dryRun:           boolean;
}

export interface FsqCompareReport {
  city:         string;
  fsqPath:      string;
  generatedAt:  string;

  googleTotalInDb:    number;
  googleFetched:      number;
  googlePagesFetched: number;
  googleInsideBbox:   number;
  googleOutsideBbox:  number;
  totalFsq:           number;

  bbox: {
    confirmedMatches:     number;
    possibleMatches:      number;
    rejectedNearMatches:  number;
    fsqOnly:              number;
    googleOnly:           number;
    confirmedMatchRate:   number;
    possibleMatchRate:    number;
    confirmedExamples:    Array<{ fsq: string; g: string; dist: number; confidence: number }>;
    possibleExamples:     Array<{ fsq: string; g: string; dist: number; confidence: number }>;
    rejectedExamples:     Array<{ fsq: string; g: string; dist: number; reason: string }>;
    fsqOnlyExamples:      Array<{ name: string; category: string }>;
    googleOnlyExamples:   Array<{ name: string; category: string }>;
  };

  full: {
    confirmedMatches:       number;
    possibleMatches:        number;
    googleOnlyInsideBbox:   number;
    googleOnlyOutsideBbox:  number;
    googleOutsideBboxExamples: Array<{ name: string; category: string }>;
  };

  fsqCategoryCoverage:    Record<string, number>;
  googleCategoryCoverage: Record<string, number>;
  attractionCoverage:     AttractionStatus[];
  isReliable:             boolean;
  reliabilityNotes:       string[];
}

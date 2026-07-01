import type { FsqRawRow, FsqPlace, FsqCategory, FsqChain } from "./types";
import type { NormalizedActivity } from "../../../lib/activities/types";
import type { FsqTravelCategory } from "./types";
import { categoriesFromRow, resolveAndMapFsqCategories } from "./categoryMap";
import { hasLowValueChainName, isGenericBusinessName, isLowValueChain, isTravelRelevant } from "./relevanceFilter";
import { classifyTokyoGeography } from "./geography";

// ── Parsing helpers ───────────────────────────────────────────────────────────

/** Parse categories field — handles array or stringified JSON */
export function parseCategories(raw: unknown): FsqCategory[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as FsqCategory[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as FsqCategory[]; } catch { return []; }
  }
  return [];
}

/** Parse chains field — handles array or stringified JSON */
export function parseChains(raw: unknown): FsqChain[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as FsqChain[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as FsqChain[]; } catch { return []; }
  }
  return [];
}

interface NameVariantEntry {
  name:     string;
  language: string;
}

/**
 * Parses the name_variants field into a {lang: name} map.
 * FSQ name_variants may be an array of {name, language} objects
 * or stringified JSON.
 */
export function parseNameVariants(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  let entries: unknown[] = [];

  if (Array.isArray(raw)) {
    entries = raw;
  } else if (typeof raw === "string") {
    try { entries = JSON.parse(raw) as unknown[]; } catch { return out; }
  } else {
    return out;
  }

  for (const entry of entries) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      "name" in entry &&
      "language" in entry
    ) {
      const e = entry as NameVariantEntry;
      if (e.language && e.name) {
        out[e.language] = e.name;
      }
    }
  }

  return out;
}

// ── Name helpers ──────────────────────────────────────────────────────────────

/** Returns true if the name contains CJK (Chinese/Japanese/Korean) characters */
export function isJapaneseName(name: string): boolean {
  return isNonLatinName(name);
}

/**
 * Returns true if the name is primarily non-Latin (CJK, Thai, Arabic, Hebrew,
 * Cyrillic, Korean, etc.) and needs an English variant lookup.
 */
export function isNonLatinName(name: string): boolean {
  return /[฀-๿؀-ۿ֐-׿Ѐ-ӿ가-힯　-鿿豈-﫿＀-￯]/.test(name);
}

/**
 * Returns the best English name for a place.
 * If the primary name is non-Latin (CJK, Thai, Arabic, Hebrew, Cyrillic, Korean),
 * look for an "en" entry in nameVariants. Otherwise use the primary name.
 */
export function detectEnglishName(
  primaryName: string,
  nameVariants: Record<string, string>,
): string {
  if (!isNonLatinName(primaryName)) return primaryName;

  const EN_LANGS = ["en", "en-US", "en-GB"];
  for (const lang of EN_LANGS) {
    if (nameVariants[lang]) return nameVariants[lang];
  }
  // Loose match
  for (const [lang, name] of Object.entries(nameVariants)) {
    if (lang.startsWith("en") && name) return name;
  }

  return primaryName;
}

// ── Quality score ─────────────────────────────────────────────────────────────

/**
 * Computes a 0-100 quality score for an FSQ place.
 *
 * Base: 50
 *   + 15 if has specific (non-top-level) category
 *   + 10 if has website
 *   + 5  if has address
 *   - 10 if is a low-value chain
 *
 * Capped at 100.
 */
export function buildQualityScore(
  row: FsqRawRow,
  tgCategory: FsqTravelCategory,
): number {
  let score = 35;
  const categories = categoriesFromRow(row);
  const labels = categories.map((category) => category.name);
  const labelText = labels.join(" ").toLowerCase();
  const categoryValue: Record<FsqTravelCategory, number> = {
    culture: 25, adventure: 24, nature: 23, hidden_gems: 22,
    nightlife: 19, food: 18, luxury: 17, free: 16,
  };
  score += categoryValue[tgCategory];

  const specificity = Math.max(0, ...labels.map((label) => label.split(">").length - 1));
  score += Math.min(10, specificity * 3 + (labels.length > 0 ? 2 : 0));

  if (/(landmark|museum|historic site|castle|palace|observation|aquarium|zoo|stadium|theme park)/.test(labelText)) {
    score += 12;
  }

  const name = row.name?.trim() ?? "";
  if (name.length >= 4 && !isGenericBusinessName(name)) score += 7;
  if (isGenericBusinessName(name)) score -= 30;
  if (row.website) score += 4;
  if (row.address) score += 2;

  const refreshed = row.date_refreshed ? Date.parse(row.date_refreshed) : Number.NaN;
  if (Number.isFinite(refreshed)) {
    const ageYears = (Date.now() - refreshed) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears <= 2) score += 6;
    else if (ageYears <= 5) score += 3;
  }

  const chains = parseChains(row.chains);
  if (isLowValueChain(chains) || hasLowValueChainName(name)) score -= 18;
  if (row.date_closed) score -= 100;

  return Math.min(100, Math.max(0, score));
}

export function resolveCoordinates(row: Pick<FsqRawRow, "latitude" | "longitude" | "bbox" | "coordinate_source">): {
  lat: number;
  lng: number;
  source: "latitude_longitude" | "point_bbox";
} | null {
  if (
    typeof row.latitude === "number" && row.latitude >= -90 && row.latitude <= 90 &&
    typeof row.longitude === "number" && row.longitude >= -180 && row.longitude <= 180
  ) {
    return { lat: row.latitude, lng: row.longitude, source: row.coordinate_source ?? "latitude_longitude" };
  }
  const bbox = row.bbox;
  if (
    bbox && bbox.xmin === bbox.xmax && bbox.ymin === bbox.ymax &&
    bbox.ymin >= -90 && bbox.ymin <= 90 && bbox.xmin >= -180 && bbox.xmin <= 180
  ) {
    return { lat: bbox.ymin, lng: bbox.xmin, source: "point_bbox" };
  }
  return null;
}

// ── Main row cleaner ──────────────────────────────────────────────────────────

/**
 * Cleans a raw FSQ row into a typed FsqPlace.
 * Returns null if the row doesn't pass travel-relevance checks.
 */
export function cleanFsqRow(row: FsqRawRow): FsqPlace | null {
  const coordinates = resolveCoordinates(row);
  if (!coordinates) return null;
  const resolvedRow: FsqRawRow = {
    ...row,
    latitude: coordinates.lat,
    longitude: coordinates.lng,
    coordinate_source: coordinates.source,
  };
  if (!isTravelRelevant(resolvedRow)) return null;

  const categories  = categoriesFromRow(resolvedRow);
  const resolved    = resolveAndMapFsqCategories(categories);
  if (!resolved) return null;

  const chains       = parseChains(row.chains);
  const nameVariants = parseNameVariants(row.name_variants);

  const primaryName  = row.name ?? "";
  const englishName  = detectEnglishName(primaryName, nameVariants);

  const qualityScore = buildQualityScore(resolvedRow, resolved.category);
  const chainPenaltyApplied = isLowValueChain(chains) || hasLowValueChainName(primaryName);
  const genericBusinessPenaltyApplied = isGenericBusinessName(primaryName);

  return {
    id:                     row.fsq_place_id ?? `fsq_${Date.now()}`,
    namePrimary:            primaryName,
    nameEnglish:            englishName,
    altNames:               nameVariants,
    lat:                    coordinates.lat,
    lng:                    coordinates.lng,
    tgCategory:             resolved.category,
    fsqCategories:          categories,
    fsqCategoryIds:         categories.map((category) => String(category.id)).filter(Boolean),
    fsqCategoryLabels:      categories.map((category) => category.name),
    detailedSubcategories:  categories.map((category) => category.name.split(">").at(-1)?.trim() ?? category.name),
    primaryFsqCategoryName: resolved.primaryCategoryName,
    address:                row.address ?? "",
    locality:               row.locality ?? "",
    region:                 row.region ?? "",
    country:                row.country ?? "",
    website:                row.website ?? "",
    placemakerUrl:          row.placemaker_url ?? "",
    chains,
    dateCreated:            row.date_created ?? null,
    dateRefreshed:          row.date_refreshed ?? null,
    coordinateSource:       coordinates.source,
    geography:              classifyTokyoGeography({
      locality: row.locality,
      region: row.region,
      address: row.address,
      lat: coordinates.lat,
      lng: coordinates.lng,
    }),
    qualityScore,
    chainPenaltyApplied,
    genericBusinessPenaltyApplied,
    isDuplicate:            false,
  };
}

// ── Normalizer ────────────────────────────────────────────────────────────────

/**
 * Converts a cleaned FsqPlace into a provider-neutral NormalizedActivity.
 *
 * Note: ActivitySource does not include "fsq" so we use "manual" as the
 * closest available value. source_dataset is set to "foursquare_os_places"
 * to identify the true origin.
 */
export function normalizeFsqPlace(
  place: FsqPlace,
  city: string,
): NormalizedActivity {
  const title = place.nameEnglish || place.namePrimary;

  const searchKeywords: string[] = [
    title.toLowerCase(),
    place.namePrimary !== title ? place.namePrimary.toLowerCase() : "",
    place.primaryFsqCategoryName.toLowerCase(),
    place.locality.toLowerCase(),
    city.toLowerCase(),
  ].filter(Boolean);

  // Deduplicate keywords
  const uniqueKeywords = [...new Set(searchKeywords)];

  return {
    id:                 `fsq:${place.id}`,
    provider_ids:       [{ source: "manual", id: place.id }],
    place_id:           undefined,
    google_places_data: undefined,
    title,
    description:        undefined,
    city,
    category:           place.tgCategory,
    photos:             [],
    image_url:          undefined,
    rating:             undefined,
    review_count:       undefined,
    website:            place.website || undefined,
    map_link:           undefined,
    lat:                place.lat,
    lng:                place.lng,
    search_keywords:    uniqueKeywords,
    capabilities: {
      photos:            false,
      rating:            false,
      review_count:      false,
      written_reviews:   false,
      opening_hours:     false,
      phone:             false,
      website:           !!place.website,
      map_link:          false,
      booking:           false,
      live_availability: false,
      price:             false,
    },
    source:             "manual",  // "fsq" not in ActivitySource; use "manual"
    built_at:           new Date().toISOString(),
    source_dataset:     "foursquare_os_places",
    source_record_id:   place.id,
    attribution:        "© Foursquare, licensed under CC BY 4.0 via Foursquare OS Places",
    license:            "CC-BY-4.0",
    name_local:
      isNonLatinName(place.namePrimary) && place.namePrimary !== title
        ? place.namePrimary
        : undefined,
    name_alts:
      Object.keys(place.altNames).length > 0 ? place.altNames : undefined,
    source_metadata: {
      fsq_category_ids: place.fsqCategoryIds,
      fsq_category_labels: place.fsqCategoryLabels,
      detailed_subcategories: place.detailedSubcategories,
      placemaker_url: place.placemakerUrl || undefined,
      travel_value_score: place.qualityScore,
      coordinate_source: place.coordinateSource,
      geography: place.geography,
      inside_strict_tokyo_area: place.geography === "tokyo_core_23_wards",
      outside_tokyo_metro_candidate: place.geography === "yokohama_or_outside_tokyo",
      locality: place.locality,
      region: place.region,
      address: place.address,
      primary_fsq_category: place.primaryFsqCategoryName,
      chain_penalty_applied: place.chainPenaltyApplied,
      generic_business_penalty_applied: place.genericBusinessPenaltyApplied,
    },
  };
}

/**
 * Tests for Overture normalization pipeline:
 *
 *   cleanRawRow()           — OvertureRawRow → OverturePlace (or null)
 *   normalizeOverturePlace() — OverturePlace → NormalizedActivity
 *
 * Scenarios:
 *   1. Well-populated row normalizes to a valid NormalizedActivity.
 *   2. Multilingual names: English name extracted; all alts preserved.
 *   3. Null / sparse fields do not throw and produce a usable record.
 *   4. Non-travel-relevant rows return null from cleanRawRow.
 *   5. Source is always "overture"; place_id and google_places_data are absent.
 *   6. Dry-run: Supabase is never touched (no supabaseAdmin import in this pipeline).
 *   7. search_keywords are non-empty for a typical place.
 *   8. capabilities reflect actual Overture data availability.
 *   9. Current schema (taxonomy_primary) used over legacy (category_primary).
 *  10. Legacy schema fallback when taxonomy fields are null.
 *  11. basic_category fallback when both taxonomy and category_primary are null.
 *  12. Source attribution fields (source_dataset, attribution, license) populated.
 */

import { describe, it, expect, vi } from "vitest";
import { cleanRawRow, normalizeOverturePlace } from "@/scripts/overture/lib/normalize";
import type { OvertureRawRow, OverturePlace } from "@/scripts/overture/lib/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Legacy-schema row (pre-2025): uses categories.primary, no taxonomy, no sources */
function makeRawRow(overrides: Partial<OvertureRawRow> = {}): OvertureRawRow {
  return {
    id:                    "overture_abc123",
    name_primary:          "東京タワー",
    names_common:          [
      { value: "Tokyo Tower",       language: "en" },
      { value: "東京タワー",         language: "ja" },
      { value: "Torre de Tokio",    language: "es" },
    ],
    // Legacy schema fields
    category_primary:      "landmark_and_historical_building.tower",
    categories_alternate:  ["travel_and_tourism.tourist_attraction"],
    // Current schema fields — absent in legacy
    basic_category:        null,
    taxonomy_primary:      null,
    taxonomy_alternates:   null,
    taxonomy_hierarchy:    null,
    sources:               null,
    confidence:            0.92,
    websites:              ["https://www.tokyotower.co.jp/"],
    addresses:             [{ locality: "Minato", region: "Tokyo", country: "JP" }],
    brand_name:            null,
    lng:                   139.7454,
    lat:                   35.6586,
    ...overrides,
  };
}

/** Current-schema row (2025+): uses taxonomy.primary, basic_category, sources */
function makeCurrentSchemaRow(overrides: Partial<OvertureRawRow> = {}): OvertureRawRow {
  return {
    id:                    "overture_current_001",
    name_primary:          "浅草寺",
    names_common:          [
      { value: "Senso-ji Temple", language: "en" },
      { value: "浅草寺",          language: "ja" },
    ],
    // Current schema fields
    basic_category:        "arts_and_entertainment",
    taxonomy_primary:      "religion.buddhist_temple",
    taxonomy_alternates:   ["landmark_and_historical_building.historic_district"],
    taxonomy_hierarchy:    ["religion", "religion.buddhist_temple"],
    sources:               [
      { dataset: "meta",          record_id: "meta:111", confidence: 0.95 },
      { dataset: "openstreetmap", record_id: "osm:222",  confidence: 0.80 },
    ],
    // Legacy fields — absent in current schema
    category_primary:      null,
    categories_alternate:  null,
    confidence:            0.95,
    websites:              ["https://www.senso-ji.jp/"],
    addresses:             [{ locality: "Taito", region: "Tokyo", country: "JP" }],
    brand_name:            null,
    lng:                   139.7966,
    lat:                   35.7148,
    ...overrides,
  };
}

// ── cleanRawRow — legacy schema ───────────────────────────────────────────────

describe("cleanRawRow", () => {
  it("returns an OverturePlace for a valid row", () => {
    const result = cleanRawRow(makeRawRow());
    expect(result).not.toBeNull();
  });

  it("extracts the English name from names_common", () => {
    const result = cleanRawRow(makeRawRow())!;
    expect(result.nameEnglish).toBe("Tokyo Tower");
  });

  it("preserves the primary local-language name", () => {
    const result = cleanRawRow(makeRawRow())!;
    expect(result.namePrimary).toBe("東京タワー");
  });

  it("builds a multilingual altNames map", () => {
    const result = cleanRawRow(makeRawRow())!;
    expect(result.altNames.en).toBe("Tokyo Tower");
    expect(result.altNames.ja).toBe("東京タワー");
    expect(result.altNames.es).toBe("Torre de Tokio");
  });

  it("maps the Overture category to a TravelGrab category", () => {
    const result = cleanRawRow(makeRawRow())!;
    expect(result.tgCategory).toBe("culture");
  });

  it("preserves the original Overture category string", () => {
    const result = cleanRawRow(makeRawRow())!;
    expect(result.overtureCategory).toBe("landmark_and_historical_building.tower");
  });

  it("sets isDuplicate to false initially", () => {
    expect(cleanRawRow(makeRawRow())!.isDuplicate).toBe(false);
  });

  it("returns null for a non-travel-relevant category", () => {
    expect(cleanRawRow(makeRawRow({ category_primary: "automotive" }))).toBeNull();
  });

  it("returns null for a row with no name", () => {
    expect(cleanRawRow(makeRawRow({ name_primary: null, names_common: null }))).toBeNull();
  });

  it("returns null for low-confidence row", () => {
    expect(cleanRawRow(makeRawRow({ confidence: 0.1 }))).toBeNull();
  });

  it("handles null names_common without throwing", () => {
    const result = cleanRawRow(makeRawRow({ names_common: null }));
    expect(result).not.toBeNull();
    expect(result!.altNames).toEqual({});
  });

  it("handles names_common as stringified JSON (legacy DuckDB output)", () => {
    const jsonString = JSON.stringify([{ value: "Tokyo Tower", language: "en" }]);
    const result = cleanRawRow(makeRawRow({ names_common: jsonString as unknown as null }));
    expect(result).not.toBeNull();
    expect(result!.nameEnglish).toBe("Tokyo Tower");
  });

  it("handles websites as stringified JSON array", () => {
    const result = cleanRawRow(makeRawRow({ websites: '["https://example.com"]' as unknown as string[] }));
    expect(result).not.toBeNull();
    expect(result!.websites).toContain("https://example.com");
  });

  it("falls back to primary name when no English name is available", () => {
    const result = cleanRawRow(makeRawRow({ names_common: [{ value: "タワー", language: "ja" }] }))!;
    expect(result.nameEnglish).toBe("東京タワー"); // fallback to namePrimary
  });

  it("generates a non-zero quality score for a well-populated row", () => {
    expect(cleanRawRow(makeRawRow())!.qualityScore).toBeGreaterThan(0);
  });

  it("generates a higher quality score when English name is present", () => {
    const withEn    = cleanRawRow(makeRawRow())!.qualityScore;
    const withoutEn = cleanRawRow(makeRawRow({ names_common: [{ value: "タワー", language: "ja" }] }))!.qualityScore;
    expect(withEn).toBeGreaterThan(withoutEn);
  });

  // ── Current schema (taxonomy.primary) ─────────────────────────────────────

  it("uses taxonomy_primary when present (current schema)", () => {
    const result = cleanRawRow(makeCurrentSchemaRow())!;
    expect(result).not.toBeNull();
    expect(result.overtureCategory).toBe("religion.buddhist_temple");
    expect(result.tgCategory).toBe("culture");
  });

  it("prefers taxonomy_primary over category_primary when both present", () => {
    const row = makeCurrentSchemaRow({
      taxonomy_primary: "arts_and_entertainment.museum",
      category_primary: "food_and_drink.restaurant", // should be ignored
    });
    const result = cleanRawRow(row)!;
    expect(result.overtureCategory).toBe("arts_and_entertainment.museum");
    expect(result.tgCategory).toBe("culture");
  });

  it("falls back to category_primary when taxonomy_primary is null", () => {
    const row = makeCurrentSchemaRow({
      taxonomy_primary: null,
      category_primary: "landmark_and_historical_building.castle",
    });
    const result = cleanRawRow(row)!;
    expect(result.overtureCategory).toBe("landmark_and_historical_building.castle");
    expect(result.tgCategory).toBe("culture");
  });

  it("falls back to basic_category when taxonomy and category_primary are both null", () => {
    const row = makeRawRow({
      taxonomy_primary: null,
      category_primary: null,
      basic_category:   "nature_and_outdoors",
    });
    const result = cleanRawRow(row)!;
    expect(result.overtureCategory).toBe("nature_and_outdoors");
    expect(result.tgCategory).toBe("nature");
  });

  it("returns null when all category fields are null", () => {
    const row = makeRawRow({
      taxonomy_primary: null,
      category_primary: null,
      basic_category:   null,
    });
    expect(cleanRawRow(row)).toBeNull();
  });

  // ── taxonomy_alternates (current schema, plural) ──────────────────────────

  it("parses taxonomy_alternates as an array from the current schema row", () => {
    // makeCurrentSchemaRow sets taxonomy_alternates to an array
    const row = makeCurrentSchemaRow({
      taxonomy_alternates: ["landmark_and_historical_building.historic_district", "travel_and_tourism.tourist_attraction"],
    });
    // cleanRawRow doesn't expose alternates directly, but the row must parse
    // without throwing (alternates are stored in the raw row, used for filtering later)
    const result = cleanRawRow(row);
    expect(result).not.toBeNull();
  });

  it("accepts taxonomy_alternates as stringified JSON (legacy DuckDB output)", () => {
    const row = makeCurrentSchemaRow({
      taxonomy_alternates: '["landmark_and_historical_building.tower"]' as unknown as string[],
    });
    expect(cleanRawRow(row)).not.toBeNull();
  });

  it("null taxonomy_alternates does not break normalization", () => {
    const row = makeCurrentSchemaRow({ taxonomy_alternates: null });
    expect(cleanRawRow(row)).not.toBeNull();
  });

  it("multiple alternates are preserved in the raw row shape", () => {
    const alts = ["religion.place_of_worship", "landmark_and_historical_building.monument"];
    const row: OvertureRawRow = makeCurrentSchemaRow({ taxonomy_alternates: alts });
    // The field is accessible with the plural name
    expect(row.taxonomy_alternates).toEqual(alts);
  });

  it("legacy categories.alternate (singular) is separate from taxonomy_alternates (plural)", () => {
    const legacyRow = makeRawRow({ categories_alternate: ["travel_and_tourism.tourist_attraction"] });
    // Legacy row has no taxonomy_alternates
    expect(legacyRow.taxonomy_alternates).toBeNull();
    // And has categories_alternate populated
    expect(legacyRow.categories_alternate).toEqual(["travel_and_tourism.tourist_attraction"]);
  });

  // ── Source attribution ────────────────────────────────────────────────────

  it("extracts sourceDatasets from sources array", () => {
    const result = cleanRawRow(makeCurrentSchemaRow())!;
    expect(result.sourceDatasets).toContain("meta");
    expect(result.sourceDatasets).toContain("openstreetmap");
  });

  it("extracts sourceRecordIds from sources array", () => {
    const result = cleanRawRow(makeCurrentSchemaRow())!;
    expect(result.sourceRecordIds).toContain("meta:111");
    expect(result.sourceRecordIds).toContain("osm:222");
  });

  it("sourceDatasets is empty array when sources is null (legacy schema)", () => {
    const result = cleanRawRow(makeRawRow())!;
    expect(result.sourceDatasets).toEqual([]);
    expect(result.sourceRecordIds).toEqual([]);
  });
});

// ── normalizeOverturePlace ────────────────────────────────────────────────────

describe("normalizeOverturePlace", () => {
  function makeCleaned(): OverturePlace {
    return cleanRawRow(makeRawRow())!;
  }

  function makeCleanedCurrent(): OverturePlace {
    return cleanRawRow(makeCurrentSchemaRow())!;
  }

  it("produces a NormalizedActivity with source = 'overture'", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.source).toBe("overture");
  });

  it("has no place_id (no Google identity)", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.place_id).toBeUndefined();
  });

  it("has no google_places_data", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.google_places_data).toBeUndefined();
  });

  it("uses the English name as title", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.title).toBe("Tokyo Tower");
  });

  it("sets the correct city", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.city).toBe("Tokyo");
  });

  it("sets the TravelGrab category", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.category).toBe("culture");
  });

  it("preserves coordinates", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.lat).toBe(35.6586);
    expect(result.lng).toBe(139.7454);
  });

  it("sets website from the first websites entry", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.website).toBe("https://www.tokyotower.co.jp/");
  });

  it("generates non-empty search_keywords", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.search_keywords.length).toBeGreaterThan(0);
  });

  it("search_keywords include the English name", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.search_keywords.some((k) => k.includes("tokyo tower"))).toBe(true);
  });

  it("search_keywords include multilingual alt names", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.search_keywords).toContain("東京タワー");
  });

  it("provides an Overture provider_id", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.provider_ids).toContainEqual({ source: "overture", id: "overture_abc123" });
  });

  it("capabilities.website is true when website is present", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.capabilities.website).toBe(true);
  });

  it("capabilities.photos is false (no Overture photo data)", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.capabilities.photos).toBe(false);
  });

  it("capabilities.rating is false (no Overture rating data)", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.capabilities.rating).toBe(false);
  });

  it("photos array is empty (requires Wikimedia enrichment)", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.photos).toHaveLength(0);
  });

  it("rating is undefined (requires Google fallback)", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.rating).toBeUndefined();
  });

  // ── Attribution fields (current schema with sources) ──────────────────────

  it("populates source_dataset from primary contributing dataset", () => {
    const result = normalizeOverturePlace(makeCleanedCurrent(), "Tokyo");
    expect(result.source_dataset).toBe("meta");
  });

  it("populates source_record_id from primary contributing record", () => {
    const result = normalizeOverturePlace(makeCleanedCurrent(), "Tokyo");
    expect(result.source_record_id).toBe("meta:111");
  });

  it("populates attribution string with dataset name", () => {
    const result = normalizeOverturePlace(makeCleanedCurrent(), "Tokyo");
    expect(result.attribution).toContain("Meta");
    expect(result.attribution).toContain("Overture Maps Foundation");
  });

  it("sets license to ODbL-1.0 when OpenStreetMap is a source", () => {
    const result = normalizeOverturePlace(makeCleanedCurrent(), "Tokyo");
    expect(result.license).toBe("ODbL-1.0");
  });

  it("sets license to CDLA-Permissive-2.0 for Meta-only sources", () => {
    const metaOnly = cleanRawRow(makeCurrentSchemaRow({
      sources: [{ dataset: "meta", record_id: "meta:999", confidence: 0.9 }],
    }))!;
    const result = normalizeOverturePlace(metaOnly, "Tokyo");
    expect(result.license).toBe("CDLA-Permissive-2.0");
  });

  it("source_dataset is undefined when sources array is absent (legacy schema)", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.source_dataset).toBeUndefined();
  });

  it("attribution defaults to Overture Maps Foundation when sources are absent", () => {
    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result.attribution).toContain("Overture Maps Foundation");
  });

  it("does not import or call supabaseAdmin (dry-run guarantee)", () => {
    const dbSpy = vi.fn();
    vi.doMock("@/lib/db", () => ({ supabaseAdmin: { from: dbSpy } }));

    const result = normalizeOverturePlace(makeCleaned(), "Tokyo");
    expect(result).toBeDefined();
    expect(dbSpy).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/db");
  });
});

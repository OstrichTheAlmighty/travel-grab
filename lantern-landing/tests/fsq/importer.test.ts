import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { areDuplicates } from "@/scripts/fsq/lib/dedup";
import { mapFsqCategory } from "@/scripts/fsq/lib/categoryMap";
import { buildQualityScore, cleanFsqRow, resolveCoordinates } from "@/scripts/fsq/lib/normalize";
import { buildFsqFallbackQuery, buildFsqPlacesQuery } from "@/scripts/fsq/lib/query";
import { isTravelRelevant, rejectionReason } from "@/scripts/fsq/lib/relevanceFilter";
import type { FsqRawRow } from "@/scripts/fsq/lib/types";

const TOKYO_BBOX = { minLng: 139.55, minLat: 35.5, maxLng: 139.95, maxLat: 35.8 };

function row(overrides: Partial<FsqRawRow> = {}): FsqRawRow {
  return {
    fsq_place_id: "tokyo-1",
    name: "Tokyo National Museum",
    latitude: 35.7188,
    longitude: 139.7765,
    address: "13-9 Uenokoen",
    locality: "Taito",
    region: "Tokyo",
    postcode: "110-8712",
    country: "JP",
    website: "https://example.test",
    fsq_category_ids: ["4bf58dd8d48988d181941735"],
    fsq_category_labels: ["Arts and Entertainment > Museum > History Museum"],
    placemaker_url: null,
    coordinate_source: "latitude_longitude",
    date_created: "2020-01-01",
    date_refreshed: "2026-01-01",
    date_closed: null,
    ...overrides,
  };
}

describe("limited Tokyo SQL", () => {
  const sql = buildFsqPlacesQuery(TOKYO_BBOX, 5_000);

  it("pushes the exact Tokyo bbox and limit into DuckDB", () => {
    expect(sql).toContain("longitude BETWEEN 139.55 AND 139.95");
    expect(sql).toContain("latitude BETWEEN 35.5 AND 35.8");
    expect(sql).toContain("LIMIT 5000");
  });

  it("uses deterministic stratified ranking before LIMIT, not physical table order", () => {
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER\s*\(\s*PARTITION BY/i);
    expect(sql).toContain("ORDER BY stratified_rank ASC, sample_category_group ASC, source_rank_score DESC, fsq_place_id ASC");
    expect(sql.indexOf("ORDER BY stratified_rank")).toBeLessThan(sql.indexOf("LIMIT 5000"));
  });

  it("pushes closure, usable-coordinate, and broad category filtering", () => {
    expect(sql).toContain("WHERE date_closed IS NULL");
    expect(sql).toContain("regexp_matches(lower(array_to_string(fsq_category_labels, ' '))");
    expect(sql).toContain("landmark|museum|historic");
    expect(buildFsqFallbackQuery(TOKYO_BBOX, 100)).toContain("bbox.xmin = bbox.xmax");
  });

  it("refuses an unlimited or oversized diagnostic query", () => {
    expect(() => buildFsqPlacesQuery(TOKYO_BBOX, 20_001)).toThrow("between 1 and 20000");
  });
});

describe("coordinates and filtering", () => {
  it("rejects records with no usable coordinates", () => {
    const candidate = row({ latitude: null, longitude: null, bbox: null });
    expect(resolveCoordinates(candidate)).toBeNull();
    expect(cleanFsqRow(candidate)).toBeNull();
    expect(rejectionReason(candidate)).toBe("no_coordinates");
  });

  it("uses only an exact point bbox as geometry fallback", () => {
    const candidate = row({
      latitude: null,
      longitude: null,
      coordinate_source: null,
      bbox: { xmin: 139.7, xmax: 139.7, ymin: 35.6, ymax: 35.6 },
    });
    expect(resolveCoordinates(candidate)).toEqual({ lat: 35.6, lng: 139.7, source: "point_bbox" });
    expect(cleanFsqRow(candidate)?.coordinateSource).toBe("point_bbox");
    expect(resolveCoordinates({ ...candidate, bbox: { xmin: 139.7, xmax: 139.8, ymin: 35.6, ymax: 35.7 } })).toBeNull();
  });

  it("rejects closed places", () => {
    const candidate = row({ date_closed: "2024-01-01" });
    expect(isTravelRelevant(candidate)).toBe(false);
    expect(rejectionReason(candidate)).toBe("permanently_closed");
  });

  it("rejects generic businesses and retains travel categories", () => {
    expect(isTravelRelevant(row({ name: "Office Services" }))).toBe(false);
    expect(isTravelRelevant(row())).toBe(true);
  });
});

describe("category mapping and travel-value score", () => {
  it("maps hierarchical FSQ labels to TravelGrab categories", () => {
    expect(mapFsqCategory("Arts and Entertainment > Museum > History Museum")).toBe("culture");
    expect(mapFsqCategory("Dining and Drinking > Restaurant > Japanese Restaurant")).toBe("food");
    expect(mapFsqCategory("Arts and Entertainment > Public Art")).toBe("free");
  });

  it("applies low-value chain and generic-business penalties", () => {
    const independent = buildQualityScore(row({ name: "Kissa Sora" }), "food");
    const chain = buildQualityScore(row({ name: "Starbucks Shibuya" }), "food");
    const generic = buildQualityScore(row({ name: "Office Services" }), "food");
    expect(chain).toBeLessThan(independent);
    expect(generic).toBeLessThan(independent);
  });
});

describe("deduplication evidence", () => {
  it("requires name evidence and compatible categories, not distance alone", () => {
    const museum = cleanFsqRow(row())!;
    const unrelated = cleanFsqRow(row({ fsq_place_id: "tokyo-2", name: "Ueno Garden", latitude: 35.71881 }))!;
    expect(areDuplicates(museum, unrelated)).toBe(false);

    const sameMuseum = cleanFsqRow(row({ fsq_place_id: "tokyo-3", name: "Tokyo National Museum", latitude: 35.71881 }))!;
    expect(areDuplicates(museum, sameMuseum)).toBe(true);

    const incompatible = cleanFsqRow(row({
      fsq_place_id: "tokyo-4",
      name: "Tokyo National Museum",
      latitude: 35.71881,
      fsq_category_ids: ["restaurant"],
      fsq_category_labels: ["Dining and Drinking > Restaurant"],
    }))!;
    expect(areDuplicates(museum, incompatible)).toBe(false);
  });
});

describe("dry-run security", () => {
  const importer = fs.readFileSync(path.join(__dirname, "../../scripts/fsq/importCity.ts"), "utf8");

  it("contains no Supabase client or write operation", () => {
    expect(importer).not.toMatch(/@supabase|supabaseAdmin|\.from\([^)]*\)\.(insert|upsert|update|delete)/);
    expect(importer).toContain("noSupabaseWrites: true");
  });

  it("never logs the token value", () => {
    expect(importer).not.toMatch(/console\.(log|error|warn)\([^\n]*(token|FSQ_OS_PLACES_TOKEN)/i);
    expect(importer).toContain("redactSecret");
  });
});

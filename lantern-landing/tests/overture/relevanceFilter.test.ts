import { describe, it, expect } from "vitest";
import { isTravelRelevant, rejectionReason } from "@/scripts/overture/lib/relevanceFilter";
import type { OvertureRawRow } from "@/scripts/overture/lib/types";

function makeRow(overrides: Partial<OvertureRawRow> = {}): OvertureRawRow {
  return {
    id:                    "ov_123",
    name_primary:          "Test Place",
    names_common:          [{ value: "Test Place", language: "en" }],
    // Legacy schema fields
    category_primary:      "arts_and_entertainment.museum",
    categories_alternate:  null,
    // Current schema fields — absent unless overridden
    basic_category:        null,
    taxonomy_primary:      null,
    taxonomy_alternates:   null,
    taxonomy_hierarchy:    null,
    sources:               null,
    confidence:            0.85,
    websites:              ["https://example.com"],
    addresses:             null,
    brand_name:            null,
    lng:                   139.7,
    lat:                   35.7,
    ...overrides,
  };
}

describe("isTravelRelevant", () => {
  it("accepts a well-formed museum row (legacy schema)", () => {
    expect(isTravelRelevant(makeRow())).toBe(true);
  });

  it("accepts a restaurant", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "food_and_drink.restaurant" }))).toBe(true);
  });

  it("accepts a park", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "outdoors_and_recreation.park" }))).toBe(true);
  });

  it("accepts a shinto shrine", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "religion.shinto_shrine" }))).toBe(true);
  });

  it("accepts a buddhist temple via taxonomy_primary (current schema)", () => {
    expect(isTravelRelevant(makeRow({
      taxonomy_primary:  "religion.buddhist_temple",
      category_primary:  null,
    }))).toBe(true);
  });

  it("accepts nature_and_outdoors via basic_category (current schema fallback)", () => {
    expect(isTravelRelevant(makeRow({
      taxonomy_primary:  null,
      category_primary:  null,
      basic_category:    "nature_and_outdoors",
    }))).toBe(true);
  });

  it("rejects excluded category even if basic_category is travel-relevant", () => {
    expect(isTravelRelevant(makeRow({
      taxonomy_primary:  "automotive.car_dealer",
      category_primary:  null,
      basic_category:    "attraction",
    }))).toBe(false);
  });

  it("rejects a place with no name", () => {
    expect(isTravelRelevant(makeRow({ name_primary: null }))).toBe(false);
  });

  it("rejects a place with empty name", () => {
    expect(isTravelRelevant(makeRow({ name_primary: "   " }))).toBe(false);
  });

  it("rejects a place with no category in any schema field", () => {
    expect(isTravelRelevant(makeRow({
      category_primary: null,
      taxonomy_primary: null,
      basic_category:   null,
    }))).toBe(false);
  });

  it("rejects an automotive place", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "automotive" }))).toBe(false);
  });

  it("rejects a financial services place", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "financial_services.bank" }))).toBe(false);
  });

  it("rejects a place with low confidence", () => {
    expect(isTravelRelevant(makeRow({ confidence: 0.2 }))).toBe(false);
  });

  it("accepts a place right at the confidence threshold (0.4)", () => {
    expect(isTravelRelevant(makeRow({ confidence: 0.4 }))).toBe(true);
  });

  it("accepts a place with null confidence (unknown quality)", () => {
    // Null confidence means Overture didn't score it; accept rather than reject
    expect(isTravelRelevant(makeRow({ confidence: null }))).toBe(true);
  });

  it("rejects a place with null coordinates", () => {
    expect(isTravelRelevant(makeRow({ lat: null, lng: null }))).toBe(false);
  });

  it("rejects a place with out-of-range coordinates", () => {
    expect(isTravelRelevant(makeRow({ lat: 999, lng: 0 }))).toBe(false);
  });

  it("rejects professional_services", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "professional_services.law_firm" }))).toBe(false);
  });

  it("rejects retail.supermarket", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "retail.supermarket" }))).toBe(false);
  });

  it("accepts retail.shopping_mall (travel-relevant shopping)", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "retail.shopping_mall" }))).toBe(true);
  });

  it("accepts retail.market", () => {
    expect(isTravelRelevant(makeRow({ category_primary: "retail.market" }))).toBe(true);
  });
});

describe("placeholder and generic-name exclusions", () => {
  it("excludes COMINGSOON_shibuya (placeholder code with underscore)", () => {
    expect(isTravelRelevant(makeRow({ name_primary: "COMINGSOON_shibuya" }))).toBe(false);
  });

  it("excludes COMINGSOON (bare all-caps placeholder)", () => {
    expect(isTravelRelevant(makeRow({ name_primary: "COMINGSOON" }))).toBe(false);
  });

  it("excludes VACANT", () => {
    expect(isTravelRelevant(makeRow({ name_primary: "VACANT" }))).toBe(false);
  });

  it("excludes 'スタジオ' (generic Japanese exact match)", () => {
    expect(isTravelRelevant(makeRow({ name_primary: "スタジオ" }))).toBe(false);
  });

  it("excludes 'レンタルスタジオ' (rental studio exact match)", () => {
    expect(isTravelRelevant(makeRow({ name_primary: "レンタルスタジオ" }))).toBe(false);
  });

  it("excludes 'rehearsal room' (generic English exact match)", () => {
    expect(isTravelRelevant(makeRow({ name_primary: "rehearsal room" }))).toBe(false);
  });

  it("does NOT exclude 'Studio Ghibli' (has proper-noun context)", () => {
    // "Studio Ghibli" normalizes to "studio ghibli" — has two tokens, not in GENERIC_EXACT
    expect(isTravelRelevant(makeRow({
      name_primary:      "Studio Ghibli",
      category_primary:  "arts_and_entertainment.museum",
    }))).toBe(true);
  });

  it("does NOT exclude 'Roppongi Dance Lab.' (has proper-noun context)", () => {
    expect(isTravelRelevant(makeRow({
      name_primary:      "Roppongi Dance Lab.",
      category_primary:  "arts_and_entertainment.performing_arts",
    }))).toBe(true);
  });

  it("does NOT exclude 'ABC Music Studio' (has identifying prefix)", () => {
    expect(isTravelRelevant(makeRow({
      name_primary:      "ABC Music Studio",
      category_primary:  "arts_and_entertainment",
    }))).toBe(true);
  });

  it("returns 'placeholder_name' for COMINGSOON_shibuya via rejectionReason", () => {
    expect(rejectionReason(makeRow({ name_primary: "COMINGSOON_shibuya" }))).toBe("placeholder_name");
  });

  it("returns 'placeholder_name' for 'スタジオ' via rejectionReason", () => {
    expect(rejectionReason(makeRow({ name_primary: "スタジオ" }))).toBe("placeholder_name");
  });
});

describe("rejectionReason", () => {
  it("returns 'valid' for a passing row", () => {
    expect(rejectionReason(makeRow())).toBe("valid");
  });

  it("returns 'no_name' when name is absent", () => {
    expect(rejectionReason(makeRow({ name_primary: null }))).toBe("no_name");
  });

  it("returns 'no_category' when all category fields are absent", () => {
    expect(rejectionReason(makeRow({
      category_primary: null,
      taxonomy_primary: null,
      basic_category:   null,
    }))).toBe("no_category");
  });

  it("returns 'excluded_category' for automotive", () => {
    expect(rejectionReason(makeRow({ category_primary: "automotive" }))).toBe("excluded_category");
  });

  it("returns 'not_travel_relevant' for retail.supermarket", () => {
    expect(rejectionReason(makeRow({ category_primary: "retail.supermarket" }))).toBe("not_travel_relevant");
  });

  it("returns 'low_confidence' when confidence is below threshold", () => {
    expect(rejectionReason(makeRow({ confidence: 0.1 }))).toBe("low_confidence");
  });

  it("returns 'no_coordinates' when coordinates are null", () => {
    expect(rejectionReason(makeRow({ lat: null, lng: null }))).toBe("no_coordinates");
  });
});

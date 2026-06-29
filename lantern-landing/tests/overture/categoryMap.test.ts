import { describe, it, expect } from "vitest";
import { mapOvertureCategory, isTravelRelevantCategory } from "@/scripts/overture/lib/categoryMap";

describe("mapOvertureCategory", () => {
  // ── Exact matches ─────────────────────────────────────────────────────────

  it("maps museum to culture", () => {
    expect(mapOvertureCategory("arts_and_entertainment.museum")).toBe("culture");
  });

  it("maps shinto shrine to culture", () => {
    expect(mapOvertureCategory("religion.shinto_shrine")).toBe("culture");
  });

  it("maps restaurant to food", () => {
    expect(mapOvertureCategory("food_and_drink.restaurant")).toBe("food");
  });

  it("maps cafe to food", () => {
    expect(mapOvertureCategory("food_and_drink.cafe")).toBe("food");
  });

  it("maps bar to nightlife", () => {
    expect(mapOvertureCategory("food_and_drink.bar")).toBe("nightlife");
  });

  it("maps night_club to nightlife", () => {
    expect(mapOvertureCategory("arts_and_entertainment.night_club")).toBe("nightlife");
  });

  it("maps amusement_park to adventure", () => {
    expect(mapOvertureCategory("arts_and_entertainment.amusement_park")).toBe("adventure");
  });

  it("maps aquarium to adventure", () => {
    expect(mapOvertureCategory("arts_and_entertainment.aquarium")).toBe("adventure");
  });

  it("maps park to nature", () => {
    expect(mapOvertureCategory("outdoors_and_recreation.park")).toBe("nature");
  });

  it("maps beach to nature", () => {
    expect(mapOvertureCategory("natural_features.beach")).toBe("nature");
  });

  it("maps botanical garden to nature", () => {
    expect(mapOvertureCategory("outdoors_and_recreation.botanical_garden")).toBe("nature");
  });

  it("maps fine dining to luxury", () => {
    expect(mapOvertureCategory("food_and_drink.fine_dining")).toBe("luxury");
  });

  it("maps spa to luxury", () => {
    expect(mapOvertureCategory("beauty_and_spa.spa")).toBe("luxury");
  });

  it("maps onsen to nature", () => {
    expect(mapOvertureCategory("beauty_and_spa.onsen")).toBe("nature");
  });

  // ── Parent prefix fallback ────────────────────────────────────────────────

  it("falls back to parent prefix for unknown subcategory", () => {
    // "religion.unknown_subtype" → parent "religion" → culture
    expect(mapOvertureCategory("religion.shinto_torii_gate")).toBe("culture");
  });

  it("falls back to landmark_and_historical_building parent for unrecognized subtype", () => {
    expect(mapOvertureCategory("landmark_and_historical_building.fortification")).toBe("culture");
  });

  it("returns null for arts_and_entertainment parent when no subcategory match would help", () => {
    // arts_and_entertainment itself maps to "culture" via exact match
    expect(mapOvertureCategory("arts_and_entertainment")).toBe("culture");
  });

  // ── Non-travel-relevant categories ───────────────────────────────────────

  it("returns null for automotive", () => {
    expect(mapOvertureCategory("automotive")).toBeNull();
  });

  it("returns null for financial_services", () => {
    expect(mapOvertureCategory("financial_services")).toBeNull();
  });

  it("returns null for professional_services", () => {
    expect(mapOvertureCategory("professional_services")).toBeNull();
  });

  it("returns null for health_and_medicine", () => {
    expect(mapOvertureCategory("health_and_medicine")).toBeNull();
  });

  it("returns null for retail.supermarket", () => {
    expect(mapOvertureCategory("retail.supermarket")).toBeNull();
  });

  it("returns null for retail.souvenir_shop", () => {
    expect(mapOvertureCategory("retail.souvenir_shop")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(mapOvertureCategory(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(mapOvertureCategory("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(mapOvertureCategory(undefined)).toBeNull();
  });
});

describe("isTravelRelevantCategory", () => {
  it("returns true for museum", () => {
    expect(isTravelRelevantCategory("arts_and_entertainment.museum")).toBe(true);
  });

  it("returns true for restaurant", () => {
    expect(isTravelRelevantCategory("food_and_drink.restaurant")).toBe(true);
  });

  it("returns false for automotive", () => {
    expect(isTravelRelevantCategory("automotive")).toBe(false);
  });

  it("returns false for retail.supermarket", () => {
    expect(isTravelRelevantCategory("retail.supermarket")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTravelRelevantCategory(null)).toBe(false);
  });
});

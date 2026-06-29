import { describe, it, expect } from "vitest";
import { generateKeywords } from "@/scripts/overture/lib/keywords";

describe("generateKeywords", () => {
  it("includes the English name words", () => {
    const kws = generateKeywords("Tokyo Tower", "東京タワー", {}, "landmark_and_historical_building.tower", "culture", "Tokyo");
    expect(kws).toContain("tokyo");
    expect(kws).toContain("tower");
  });

  it("includes the full lowercased English name", () => {
    const kws = generateKeywords("Tokyo Tower", "東京タワー", {}, "landmark_and_historical_building.tower", "culture", "Tokyo");
    expect(kws).toContain("tokyo tower");
  });

  it("includes category-level seed keywords", () => {
    const kws = generateKeywords("Test Museum", "Test Museum", {}, "arts_and_entertainment.museum", "culture", "Tokyo");
    expect(kws).toContain("sightseeing");
    expect(kws).toContain("attraction");
  });

  it("includes subcategory-specific keywords for museum", () => {
    const kws = generateKeywords("National Museum", "National Museum", {}, "arts_and_entertainment.museum", "culture", "Tokyo");
    expect(kws).toContain("museum");
  });

  it("includes city+subcategory combination", () => {
    const kws = generateKeywords("Test Museum", "Test Museum", {}, "arts_and_entertainment.museum", "culture", "Tokyo");
    expect(kws).toContain("tokyo museum");
  });

  it("includes the local-language name when different from English", () => {
    const kws = generateKeywords("Tokyo Tower", "東京タワー", {}, "landmark_and_historical_building.tower", "culture", "Tokyo");
    expect(kws).toContain("東京タワー");
  });

  it("does not duplicate local name when it equals the English name", () => {
    const kws = generateKeywords("Tokyo Tower", "Tokyo Tower", {}, "landmark_and_historical_building.tower", "culture", "Tokyo");
    const count = kws.filter((k) => k === "tokyo tower").length;
    expect(count).toBe(1);
  });

  it("includes alternate language names for multilingual search", () => {
    const altNames = { ja: "東京タワー", fr: "Tour de Tokyo", ko: "도쿄타워" };
    const kws = generateKeywords("Tokyo Tower", "東京タワー", altNames, "landmark_and_historical_building.tower", "culture", "Tokyo");
    expect(kws).toContain("東京タワー");
    expect(kws).toContain("tour de tokyo");
    expect(kws).toContain("도쿄타워");
  });

  it("includes brand name when it differs from English name", () => {
    const kws = generateKeywords(
      "Shinjuku Branch", "Shinjuku Branch",
      {}, "food_and_drink.restaurant", "food", "Tokyo",
      "Ichiran Ramen",
    );
    expect(kws).toContain("ichiran ramen");
  });

  it("does not include brand name when it equals the English name", () => {
    const kws = generateKeywords(
      "Ichiran Ramen", "Ichiran Ramen",
      {}, "food_and_drink.ramen", "food", "Tokyo",
      "Ichiran Ramen",
    );
    // brand duplicates the name — still OK if present once, just not twice
    const brandCount = kws.filter((k) => k === "ichiran ramen").length;
    expect(brandCount).toBeLessThanOrEqual(1);
  });

  it("includes ramen keyword for ramen subcategory", () => {
    const kws = generateKeywords("Fuunji", "風雲児", {}, "food_and_drink.ramen", "food", "Tokyo");
    expect(kws).toContain("ramen");
    expect(kws).toContain("noodles");
  });

  it("includes onsen keyword for hot_spring subcategory", () => {
    const kws = generateKeywords("Hakone Hot Spring", "箱根温泉", {}, "beauty_and_spa.hot_spring", "nature", "Hakone");
    expect(kws).toContain("onsen");
    expect(kws).toContain("hot spring");
  });

  it("returns at most 30 keywords", () => {
    const altNames = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`lang${i}`, `Name in language ${i}`])
    );
    const kws = generateKeywords("Very Long Name Museum", "Very Long Name Museum", altNames, "arts_and_entertainment.museum", "culture", "Tokyo");
    expect(kws.length).toBeLessThanOrEqual(30);
  });

  it("does not include very short words (< 2 chars)", () => {
    const kws = generateKeywords("A Museum", "A Museum", {}, "arts_and_entertainment.museum", "culture", "Tokyo");
    expect(kws).not.toContain("a");
  });

  it("handles empty alt names without throwing", () => {
    expect(() =>
      generateKeywords("Test Place", "Test Place", {}, "arts_and_entertainment.museum", "culture", "Tokyo")
    ).not.toThrow();
  });

  it("handles undefined brand name without throwing", () => {
    expect(() =>
      generateKeywords("Test Place", "Test Place", {}, "arts_and_entertainment.museum", "culture", "Tokyo", undefined)
    ).not.toThrow();
  });
});

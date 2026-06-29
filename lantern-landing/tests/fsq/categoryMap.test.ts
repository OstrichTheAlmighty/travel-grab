import { describe, it, expect } from "vitest";
import {
  mapFsqCategory,
  resolveAndMapFsqCategories,
  isTravelRelevantFsqCategory,
} from "@/scripts/fsq/lib/categoryMap";
import type { FsqCategory } from "@/scripts/fsq/lib/types";

// ── mapFsqCategory ────────────────────────────────────────────────────────────

describe("mapFsqCategory — exact name lookup", () => {
  it("Japanese Restaurant → food", () => {
    expect(mapFsqCategory("Japanese Restaurant")).toBe("food");
  });

  it("Ramen Restaurant → food", () => {
    expect(mapFsqCategory("Ramen Restaurant")).toBe("food");
  });

  it("Shinto Shrine → culture", () => {
    expect(mapFsqCategory("Shinto Shrine")).toBe("culture");
  });

  it("Buddhist Temple → culture", () => {
    expect(mapFsqCategory("Buddhist Temple")).toBe("culture");
  });

  it("Temple → culture", () => {
    expect(mapFsqCategory("Temple")).toBe("culture");
  });

  it("Museum → culture", () => {
    expect(mapFsqCategory("Museum")).toBe("culture");
  });

  it("Art Gallery → culture", () => {
    expect(mapFsqCategory("Art Gallery")).toBe("culture");
  });

  it("Historic Site → culture", () => {
    expect(mapFsqCategory("Historic Site")).toBe("culture");
  });

  it("Park → nature", () => {
    expect(mapFsqCategory("Park")).toBe("nature");
  });

  it("Garden → nature", () => {
    expect(mapFsqCategory("Garden")).toBe("nature");
  });

  it("Botanical Garden → nature", () => {
    expect(mapFsqCategory("Botanical Garden")).toBe("nature");
  });

  it("Hot Spring → nature", () => {
    expect(mapFsqCategory("Hot Spring")).toBe("nature");
  });

  it("Onsen → nature", () => {
    expect(mapFsqCategory("Onsen")).toBe("nature");
  });

  it("Scenic Lookout → nature", () => {
    expect(mapFsqCategory("Scenic Lookout")).toBe("nature");
  });

  it("Nightclub → nightlife", () => {
    expect(mapFsqCategory("Nightclub")).toBe("nightlife");
  });

  it("Sake Bar → nightlife", () => {
    expect(mapFsqCategory("Sake Bar")).toBe("nightlife");
  });

  it("Karaoke Bar → nightlife", () => {
    expect(mapFsqCategory("Karaoke Bar")).toBe("nightlife");
  });

  it("Live Music Venue → nightlife", () => {
    expect(mapFsqCategory("Live Music Venue")).toBe("nightlife");
  });

  it("Observation Deck → adventure", () => {
    expect(mapFsqCategory("Observation Deck")).toBe("adventure");
  });

  it("Amusement Park → adventure", () => {
    expect(mapFsqCategory("Amusement Park")).toBe("adventure");
  });

  it("Theme Park → adventure", () => {
    expect(mapFsqCategory("Theme Park")).toBe("adventure");
  });

  it("Aquarium → adventure", () => {
    expect(mapFsqCategory("Aquarium")).toBe("adventure");
  });

  it("Spa → luxury", () => {
    expect(mapFsqCategory("Spa")).toBe("luxury");
  });

  it("Sumo Arena → culture", () => {
    expect(mapFsqCategory("Sumo Arena")).toBe("culture");
  });

  it("Department Store → culture", () => {
    expect(mapFsqCategory("Department Store")).toBe("culture");
  });

  it("Shopping Mall → culture", () => {
    expect(mapFsqCategory("Shopping Mall")).toBe("culture");
  });
});

describe("mapFsqCategory — not travel-relevant", () => {
  it("Hospital → null", () => {
    expect(mapFsqCategory("Hospital")).toBeNull();
  });

  it("Office → null", () => {
    expect(mapFsqCategory("Office")).toBeNull();
  });

  it("Hotel → null (accommodation, not an activity)", () => {
    expect(mapFsqCategory("Hotel")).toBeNull();
  });

  it("Bank → null", () => {
    expect(mapFsqCategory("Bank")).toBeNull();
  });

  it("Convenience Store → null", () => {
    expect(mapFsqCategory("Convenience Store")).toBeNull();
  });

  it("null input → null", () => {
    expect(mapFsqCategory(null)).toBeNull();
  });

  it("unknown category name → null", () => {
    expect(mapFsqCategory("Intergalactic Portal")).toBeNull();
  });
});

describe("mapFsqCategory — keyword fallback", () => {
  it("'Tokyo Shrine' (unknown exact, contains 'shrine') → culture", () => {
    expect(mapFsqCategory("Tokyo Shrine")).toBe("culture");
  });

  it("'Craft Beer Bar' (contains 'bar') → nightlife", () => {
    expect(mapFsqCategory("Craft Beer Bar")).toBe("nightlife");
  });

  it("'City Park Area' (contains 'park') → nature", () => {
    expect(mapFsqCategory("City Park Area")).toBe("nature");
  });

  it("'Ramen Noodle Shop' (contains 'ramen') → food", () => {
    expect(mapFsqCategory("Ramen Noodle Shop")).toBe("food");
  });

  it("'Business Hotel' (contains 'hotel') → null", () => {
    expect(mapFsqCategory("Business Hotel")).toBeNull();
  });
});

// ── resolveAndMapFsqCategories ────────────────────────────────────────────────

describe("resolveAndMapFsqCategories", () => {
  it("single travel-relevant category → {category, primaryCategoryName}", () => {
    const cats: FsqCategory[] = [{ id: 13003, name: "Japanese Restaurant" }];
    const result = resolveAndMapFsqCategories(cats);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("food");
    expect(result!.primaryCategoryName).toBe("Japanese Restaurant");
  });

  it("first category is irrelevant but second is relevant → picks second", () => {
    const cats: FsqCategory[] = [
      { id: 12002, name: "Hotel" },
      { id: 10058, name: "Museum" },
    ];
    const result = resolveAndMapFsqCategories(cats);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("culture");
    expect(result!.primaryCategoryName).toBe("Museum");
  });

  it("empty array → null", () => {
    expect(resolveAndMapFsqCategories([])).toBeNull();
  });

  it("all categories non-travel-relevant → null", () => {
    const cats: FsqCategory[] = [
      { id: 99001, name: "Warehouse" },
      { id: 99002, name: "Corporate Office" },
    ];
    expect(resolveAndMapFsqCategories(cats)).toBeNull();
  });
});

// ── isTravelRelevantFsqCategory ───────────────────────────────────────────────

describe("isTravelRelevantFsqCategory", () => {
  it("Museum → true", () => {
    expect(isTravelRelevantFsqCategory("Museum")).toBe(true);
  });

  it("Hospital → false", () => {
    expect(isTravelRelevantFsqCategory("Hospital")).toBe(false);
  });

  it("null → false", () => {
    expect(isTravelRelevantFsqCategory(null)).toBe(false);
  });
});

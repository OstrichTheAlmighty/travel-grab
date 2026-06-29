import { describe, it, expect } from "vitest";
import { areDuplicates, normalizeName, deduplicatePlaces } from "@/scripts/overture/lib/dedup";
import type { OverturePlace } from "@/scripts/overture/lib/types";

function makePlace(overrides: Partial<OverturePlace> = {}): OverturePlace {
  return {
    id:               "ov_001",
    namePrimary:      "Tokyo Tower",
    nameEnglish:      "Tokyo Tower",
    altNames:         { ja: "東京タワー" },
    overtureCategory: "landmark_and_historical_building.tower",
    tgCategory:       "culture",
    confidence:       0.9,
    websites:         ["https://www.tokyotower.co.jp/"],
    addresses:        [],
    brandName:        undefined,
    lng:              139.7454,
    lat:              35.6586,
    qualityScore:     80,
    searchKeywords:   ["tokyo tower", "landmark"],
    isDuplicate:      false,
    sourceDatasets:   [],
    sourceRecordIds:  [],
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Tokyo Tower  ")).toBe("tokyo tower");
  });

  it("strips diacritics", () => {
    expect(normalizeName("Café de Flore")).toBe("cafe de flore");
  });

  it("strips punctuation", () => {
    expect(normalizeName("Musée d'Orsay")).toBe("musee d orsay");
  });

  it("collapses whitespace", () => {
    expect(normalizeName("Tokyo  Tower")).toBe("tokyo tower");
  });
});

describe("areDuplicates", () => {
  it("matches two places with the same name within 80 m", () => {
    const a = makePlace({ lat: 35.6586, lng: 139.7454, nameEnglish: "Tokyo Tower" });
    // ~20 m to the north
    const b = makePlace({ id: "ov_002", lat: 35.6588, lng: 139.7454, nameEnglish: "Tokyo Tower" });
    expect(areDuplicates(a, b)).toBe(true);
  });

  it("does not match same-named places more than 80 m apart", () => {
    const a = makePlace({ lat: 35.6586, lng: 139.7454, nameEnglish: "Starbucks" });
    // ~500 m away — two different Starbucks branches
    const b = makePlace({ id: "ov_002", lat: 35.6630, lng: 139.7454, nameEnglish: "Starbucks" });
    expect(areDuplicates(a, b)).toBe(false);
  });

  it("matches trigram-similar names within radius", () => {
    const a = makePlace({ lat: 35.6586, lng: 139.7454, nameEnglish: "Tokyo Tower" });
    const b = makePlace({ id: "ov_002", lat: 35.6587, lng: 139.7455, nameEnglish: "Tokyo Tower Observation Deck" });
    // Same location, very similar name → should be a duplicate
    expect(areDuplicates(a, b)).toBe(true);
  });

  it("does not match completely different names even if co-located", () => {
    const a = makePlace({ lat: 35.6586, lng: 139.7454, nameEnglish: "Tokyo Tower" });
    const b = makePlace({ id: "ov_002", lat: 35.6587, lng: 139.7455, nameEnglish: "Zojo-ji Temple" });
    expect(areDuplicates(a, b)).toBe(false);
  });

  it("matches identical names at exactly the same coordinates", () => {
    const a = makePlace({ lat: 35.6586, lng: 139.7454, nameEnglish: "Temple X" });
    const b = makePlace({ id: "ov_002", lat: 35.6586, lng: 139.7454, nameEnglish: "Temple X" });
    expect(areDuplicates(a, b)).toBe(true);
  });
});

describe("deduplicatePlaces", () => {
  it("marks the lower-quality copy as duplicate", () => {
    const high = makePlace({ id: "ov_001", qualityScore: 85, lat: 35.6586, lng: 139.7454, nameEnglish: "Tokyo Tower" });
    const low  = makePlace({ id: "ov_002", qualityScore: 50, lat: 35.6587, lng: 139.7455, nameEnglish: "Tokyo Tower" });

    deduplicatePlaces([high, low]);

    expect(high.isDuplicate).toBe(false);
    expect(low.isDuplicate).toBe(true);
    expect(low.duplicateOf).toBe("ov_001");
  });

  it("keeps the higher-quality record when both have same name and proximity", () => {
    const a = makePlace({ id: "ov_a", qualityScore: 70, lat: 35.6586, lng: 139.7454, nameEnglish: "Tokyo Tower" });
    const b = makePlace({ id: "ov_b", qualityScore: 90, lat: 35.6587, lng: 139.7455, nameEnglish: "Tokyo Tower" });

    deduplicatePlaces([a, b]);

    // Higher score (b) should be canonical
    const canonical = [a, b].find((p) => !p.isDuplicate)!;
    expect(canonical.qualityScore).toBe(90);
  });

  it("preserves distinct places at different locations", () => {
    const a = makePlace({ id: "ov_a", lat: 35.6586, lng: 139.7454, nameEnglish: "Tokyo Tower" });
    const b = makePlace({ id: "ov_b", lat: 48.8584, lng:   2.2945, nameEnglish: "Eiffel Tower" });

    deduplicatePlaces([a, b]);

    expect(a.isDuplicate).toBe(false);
    expect(b.isDuplicate).toBe(false);
  });

  it("handles a list with no duplicates", () => {
    const places = [
      makePlace({ id: "ov_1", lat: 35.6586, lng: 139.7454, nameEnglish: "Place A" }),
      makePlace({ id: "ov_2", lat: 35.6700, lng: 139.7600, nameEnglish: "Place B" }),
      makePlace({ id: "ov_3", lat: 35.6500, lng: 139.7300, nameEnglish: "Place C" }),
    ];

    deduplicatePlaces(places);

    expect(places.filter((p) => p.isDuplicate)).toHaveLength(0);
  });

  it("handles an empty array without throwing", () => {
    expect(() => deduplicatePlaces([])).not.toThrow();
    expect(deduplicatePlaces([])).toHaveLength(0);
  });
});

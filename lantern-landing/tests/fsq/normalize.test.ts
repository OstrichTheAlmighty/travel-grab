import { describe, it, expect } from "vitest";
import {
  parseCategories,
  parseChains,
  parseNameVariants,
  isJapaneseName,
  detectEnglishName,
  cleanFsqRow,
  normalizeFsqPlace,
} from "@/scripts/fsq/lib/normalize";
import type { FsqRawRow } from "@/scripts/fsq/lib/types";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeRow(overrides: Partial<FsqRawRow> = {}): FsqRawRow {
  return {
    fsq_place_id:     "fsq_tokyo_001",
    name:             "Tokyo Tower",
    latitude:         35.6586,
    longitude:        139.7454,
    address:          "4-2-8 Shibakoen",
    address_extended: null,
    locality:         "Minato City",
    region:           "Tokyo",
    postcode:         "105-0011",
    country:          "JP",
    tel:              null,
    website:          "https://www.tokyotower.co.jp",
    categories:       [{ id: 10047, name: "Observation Deck" }],
    chains:           null,
    date_created:     "2024-01-01",
    date_refreshed:   "2024-06-01",
    date_closed:      null,
    name_variants:    [{ name: "東京タワー", language: "ja" }, { name: "Tokyo Tower", language: "en" }],
    ...overrides,
  };
}

// ── parseCategories ───────────────────────────────────────────────────────────

describe("parseCategories", () => {
  it("handles an array of category objects", () => {
    const result = parseCategories([{ id: 13003, name: "Japanese Restaurant" }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Japanese Restaurant");
  });

  it("handles a JSON string", () => {
    const result = parseCategories('[{"id":10058,"name":"Museum"}]');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Museum");
  });

  it("handles null → empty array", () => {
    expect(parseCategories(null)).toHaveLength(0);
  });

  it("handles empty string → empty array", () => {
    expect(parseCategories("")).toHaveLength(0);
  });

  it("handles invalid JSON string → empty array", () => {
    expect(parseCategories("not-json")).toHaveLength(0);
  });
});

// ── parseChains ───────────────────────────────────────────────────────────────

describe("parseChains", () => {
  it("handles chain array", () => {
    const result = parseChains([{ id: "starbucks", name: "Starbucks" }]);
    expect(result[0].name).toBe("Starbucks");
  });

  it("handles null → empty array", () => {
    expect(parseChains(null)).toHaveLength(0);
  });
});

// ── parseNameVariants ─────────────────────────────────────────────────────────

describe("parseNameVariants", () => {
  it("extracts {language: name} map from array", () => {
    const raw = [
      { name: "東京タワー", language: "ja" },
      { name: "Tokyo Tower", language: "en" },
    ];
    const result = parseNameVariants(raw);
    expect(result["ja"]).toBe("東京タワー");
    expect(result["en"]).toBe("Tokyo Tower");
  });

  it("handles stringified JSON", () => {
    const raw = JSON.stringify([{ name: "Tōkyō Tawā", language: "ja-Latn" }]);
    const result = parseNameVariants(raw);
    expect(result["ja-Latn"]).toBe("Tōkyō Tawā");
  });

  it("returns empty object for null", () => {
    expect(parseNameVariants(null)).toEqual({});
  });

  it("returns empty object for invalid JSON string", () => {
    expect(parseNameVariants("bad")).toEqual({});
  });

  it("skips entries missing name or language", () => {
    const raw = [
      { name: "Tokyo Tower", language: "en" },
      { name: null, language: "fr" },        // missing name
      { name: "東京タワー" },                  // missing language
    ];
    const result = parseNameVariants(raw);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["en"]).toBe("Tokyo Tower");
  });
});

// ── isJapaneseName ────────────────────────────────────────────────────────────

describe("isJapaneseName", () => {
  it("returns true for Kanji name", () => {
    expect(isJapaneseName("東京タワー")).toBe(true);
  });

  it("returns true for Hiragana name", () => {
    expect(isJapaneseName("ひかり")).toBe(true);
  });

  it("returns true for Katakana name", () => {
    expect(isJapaneseName("スカイツリー")).toBe(true);
  });

  it("returns false for plain Latin name", () => {
    expect(isJapaneseName("Tokyo Tower")).toBe(false);
  });

  it("returns false for romanized Japanese (Hepburn)", () => {
    expect(isJapaneseName("Tōkyō Tawā")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isJapaneseName("")).toBe(false);
  });
});

// ── detectEnglishName ─────────────────────────────────────────────────────────

describe("detectEnglishName", () => {
  it("returns English alt name when primary is Japanese", () => {
    expect(detectEnglishName("東京タワー", { en: "Tokyo Tower" })).toBe("Tokyo Tower");
  });

  it("returns the primary name when it is already Latin", () => {
    expect(detectEnglishName("Tokyo Tower", {})).toBe("Tokyo Tower");
  });

  it("falls back to primary name when no English variant exists", () => {
    expect(detectEnglishName("東京タワー", { "ja-Latn": "Tōkyō Tawā" })).toBe("東京タワー");
  });

  it("prefers 'en' over 'en-US' and 'en-GB' in order", () => {
    expect(detectEnglishName("東京タワー", {
      "en-GB": "Tokyo Tower (GB)",
      "en": "Tokyo Tower",
    })).toBe("Tokyo Tower");
  });

  it("accepts en-US when 'en' is absent", () => {
    expect(detectEnglishName("東京タワー", { "en-US": "Tokyo Tower US" })).toBe("Tokyo Tower US");
  });
});

// ── cleanFsqRow ───────────────────────────────────────────────────────────────

describe("cleanFsqRow", () => {
  it("returns FsqPlace for a valid museum row", () => {
    const row = makeRow({ categories: [{ id: 10058, name: "Museum" }] });
    const result = cleanFsqRow(row);
    expect(result).not.toBeNull();
    expect(result!.tgCategory).toBe("culture");
  });

  it("returns FsqPlace for a restaurant row", () => {
    const row = makeRow({ categories: [{ id: 13050, name: "Japanese Restaurant" }] });
    const result = cleanFsqRow(row);
    expect(result).not.toBeNull();
    expect(result!.tgCategory).toBe("food");
  });

  it("returns null for a permanently closed place", () => {
    const row = makeRow({ date_closed: "2023-06-01" });
    expect(cleanFsqRow(row)).toBeNull();
  });

  it("returns null when all categories are excluded", () => {
    const row = makeRow({ categories: [{ id: 0, name: "Hospital" }] });
    expect(cleanFsqRow(row)).toBeNull();
  });

  it("returns null for missing name", () => {
    const row = makeRow({ name: null });
    expect(cleanFsqRow(row)).toBeNull();
  });

  it("extracts Japanese primary name correctly", () => {
    const row = makeRow({
      name:          "東京タワー",
      name_variants: [{ name: "Tokyo Tower", language: "en" }],
      categories:    [{ id: 10047, name: "Observation Deck" }],
    });
    const result = cleanFsqRow(row);
    expect(result).not.toBeNull();
    expect(result!.namePrimary).toBe("東京タワー");
    expect(result!.nameEnglish).toBe("Tokyo Tower");
  });
});

// ── normalizeFsqPlace ─────────────────────────────────────────────────────────

describe("normalizeFsqPlace", () => {
  it("maps to NormalizedActivity with correct fields", () => {
    const row   = makeRow({ categories: [{ id: 10047, name: "Observation Deck" }] });
    const place = cleanFsqRow(row)!;
    const act   = normalizeFsqPlace(place, "Tokyo");

    expect(act.id).toBe("fsq:fsq_tokyo_001");
    expect(act.title).toBe("Tokyo Tower");
    expect(act.city).toBe("Tokyo");
    expect(act.category).toBe("adventure");
    expect(act.source).toBe("manual");
    expect(act.source_dataset).toBe("foursquare_os_places");
    expect(act.source_record_id).toBe("fsq_tokyo_001");
    expect(act.attribution).toContain("Foursquare");
    expect(act.license).toBe("CC-BY-4.0");
  });

  it("sets name_local for Japanese primary name", () => {
    const row = makeRow({
      name:          "東京タワー",
      name_variants: [{ name: "Tokyo Tower", language: "en" }],
      categories:    [{ id: 10047, name: "Observation Deck" }],
    });
    const place = cleanFsqRow(row)!;
    const act   = normalizeFsqPlace(place, "Tokyo");

    expect(act.title).toBe("Tokyo Tower");
    expect(act.name_local).toBe("東京タワー");
  });

  it("populates name_alts from name_variants", () => {
    const row = makeRow({
      name_variants: [
        { name: "東京タワー", language: "ja" },
        { name: "Tokyo Tower", language: "en" },
        { name: "Tōkyō Tawā", language: "ja-Latn" },
      ],
      categories: [{ id: 10047, name: "Observation Deck" }],
    });
    const place = cleanFsqRow(row)!;
    const act   = normalizeFsqPlace(place, "Tokyo");

    expect(act.name_alts?.["ja"]).toBe("東京タワー");
    expect(act.name_alts?.["ja-Latn"]).toBe("Tōkyō Tawā");
  });

  it("includes website in capabilities when website is present", () => {
    const row   = makeRow({ categories: [{ id: 10058, name: "Museum" }] });
    const place = cleanFsqRow(row)!;
    const act   = normalizeFsqPlace(place, "Tokyo");

    expect(act.capabilities.website).toBe(true);
    expect(act.website).toBe("https://www.tokyotower.co.jp");
  });

  it("photos array is empty (FSQ OS Places has no images)", () => {
    const row   = makeRow({ categories: [{ id: 10058, name: "Museum" }] });
    const place = cleanFsqRow(row)!;
    const act   = normalizeFsqPlace(place, "Tokyo");

    expect(act.photos).toHaveLength(0);
  });
});

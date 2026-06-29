import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CuratedActivity } from "@/scripts/fsq/lib/curation";
import { catalogClassification, correctedCategory } from "@/scripts/fsq/lib/fsqCorrections";
import { WikimediaCache } from "@/scripts/fsq/lib/wikimediaCache";
import { WikimediaClient } from "@/scripts/fsq/lib/wikimediaClient";
import { imageFromMetadata, scoreForDisplay, shouldApplyEnrichment } from "@/scripts/fsq/lib/wikimediaEnrichment";
import { classifyWikimediaEligibility } from "@/scripts/fsq/lib/wikimediaEligibility";
import { chooseWikidataMatch, coordinateRadiusPolicy, evaluateWikidataEntity, typeCompatibility } from "@/scripts/fsq/lib/wikimediaMatcher";
import { generateQueryVariants, removeMacrons } from "@/scripts/fsq/lib/wikimediaQueries";
import type { WikidataEntity, WikimediaEnrichment } from "@/scripts/fsq/lib/wikimediaTypes";

function activity(overrides: Partial<CuratedActivity> = {}): CuratedActivity {
  return {
    id: "fsq:test", provider_ids: [{ source: "manual", id: "test" }], title: "東京タワー (Tokyo Tower)", city: "Tokyo", category: "culture",
    photos: [], lat: 35.65858, lng: 139.74544, website: "https://example.test", search_keywords: [],
    capabilities: { photos: false, rating: false, review_count: false, written_reviews: false, opening_hours: false, phone: false, website: true, map_link: false, booking: false, live_availability: false, price: false },
    source: "manual", source_record_id: "test", source_metadata: { geography: "tokyo_core_23_wards", locality: "Minato", fsq_category_labels: ["Landmarks and Outdoors > Monument", "Landmarks and Outdoors > Scenic Lookout"] },
    curation: { tier: "A", rank: 1, score: 150, selection_reasons: [], penalties: [], hidden_gem_candidate: false, score_components: [] },
    ...overrides,
  };
}

function entity(overrides: Partial<WikidataEntity> = {}): WikidataEntity {
  return {
    id: "Q1771", labels: { ja: { language: "ja", value: "東京タワー" }, en: { language: "en", value: "Tokyo Tower" } },
    aliases: { en: [{ language: "en", value: "Tokyo Tower" }] }, descriptions: { en: { language: "en", value: "communications and observation tower in Tokyo" } },
    claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 35.65858, longitude: 139.74544 } } } }], P31: [{ mainsnak: { datavalue: { value: { id: "Q570116" } } } }] }, sitelinks: { enwiki: { site: "enwiki", title: "Tokyo Tower" }, jawiki: { site: "jawiki", title: "東京タワー" } },
    ...overrides,
  };
}

const typeEntities = new Map([["Q570116", entity({ id: "Q570116", labels: { en: { language: "en", value: "tourist attraction" } }, claims: {}, sitelinks: {} })]]);

describe("Wikidata entity matching", () => {
  it("matches bilingual names with compatible coordinates and type", () => {
    const result = chooseWikidataMatch(activity(), [entity()], typeEntities);
    expect(result.status).toBe("verified");
    expect(result.best?.signals).toContain("exact_normalized_name");
    expect(result.best?.signals).toContain("coordinates_strong_within_policy");
  });

  it("rejects a loose substring business near a landmark", () => {
    const candidate = entity({ labels: { en: { language: "en", value: "Tokyo Tower Portrait Studio" } }, aliases: {}, descriptions: { en: { language: "en", value: "portrait studio business inside Tokyo Tower" } }, sitelinks: {} });
    expect(chooseWikidataMatch(activity(), [candidate], typeEntities).status).toBe("rejected");
  });

  it("rejects a business containing a district name", () => {
    const source = activity({ title: "原宿 (Harajuku)", source_metadata: { geography: "tokyo_core_23_wards", locality: "Shibuya", fsq_category_labels: ["Landmarks and Outdoors > States and Municipalities > Neighborhood"] } });
    const candidate = entity({ labels: { en: { language: "en", value: "Harajuku Photo Studio" } }, aliases: {}, descriptions: { en: { language: "en", value: "photography business in Harajuku" } } });
    const evaluated = evaluateWikidataEntity(source, candidate, typeEntities);
    expect(evaluated.rejectionReasons).toContain("business_entity_type_incompatible");
    expect(chooseWikidataMatch(source, [candidate], typeEntities).status).toBe("rejected");
  });

  it("rejects Meiji Jingu Stadium for Meiji Jingū shrine", () => {
    const source = activity({ title: "明治神宮 (Meiji Jingu Shrine)", source_metadata: { geography: "tokyo_core_23_wards", locality: "Shibuya", fsq_category_labels: ["Community and Government > Spiritual Center > Shrine"] } });
    const stadium = entity({ labels: { en: { language: "en", value: "Meiji Jingu Stadium" } }, aliases: {}, descriptions: { en: { language: "en", value: "baseball stadium in Tokyo" } } });
    expect(chooseWikidataMatch(source, [stadium], typeEntities).status).toBe("rejected");
  });

  it("rejects proximity-only candidates", () => {
    const nearby = entity({ labels: { en: { language: "en", value: "Unrelated Office" } }, aliases: {}, descriptions: { en: { language: "en", value: "company office" } }, sitelinks: {} });
    expect(chooseWikidataMatch(activity(), [nearby], typeEntities).status).toBe("rejected");
  });

  it("rejects creative works and generic concepts sharing a place name", () => {
    const district = activity({ title: "高円寺純情商店街", source_metadata: { geography: "tokyo_core_23_wards", fsq_category_labels: ["Landmarks and Outdoors > States and Municipalities > Neighborhood"] } });
    const novel = entity({ labels: { ja: { language: "ja", value: "高円寺純情商店街" } }, aliases: {}, descriptions: { en: { language: "en", value: "1986 novel" } }, sitelinks: {} });
    expect(chooseWikidataMatch(district, [novel], typeEntities).status).toBe("rejected");
  });

  it("rejects a market merchant as the market entity", () => {
    const source = activity({ title: "築地場外市場", source_metadata: { geography: "tokyo_core_23_wards", fsq_category_labels: ["Retail > Market > Fish Market"] } });
    expect(typeCompatibility(source, "fish merchant shop at Tsukiji market").compatible).toBe(false);
    expect(typeCompatibility(source, "public fish market in Tokyo").compatible).toBe(true);
  });

  it("uses wider radii for districts and metro excursions", () => {
    const building = coordinateRadiusPolicy(activity());
    const district = coordinateRadiusPolicy(activity({ source_metadata: { geography: "tokyo_core_23_wards", fsq_category_labels: ["Landmarks and Outdoors > Neighborhood"] } }));
    const metro = coordinateRadiusPolicy(activity({ source_metadata: { geography: "yokohama_or_outside_tokyo", fsq_category_labels: ["Arts and Entertainment > Amusement Park"] } }));
    expect(building.radiusM).toBe(400);
    expect(district.radiusM).toBeGreaterThan(building.radiusM);
    expect(metro.radiusM).toBeGreaterThan(district.radiusM);
  });

  it("keeps probable matches manual-only", () => {
    const source = activity({ title: "Example Museum", source_metadata: { geography: "tokyo_core_23_wards", fsq_category_labels: ["Arts and Entertainment > Museum"] } });
    const candidate = entity({ labels: { en: { language: "en", value: "Example Museum" } }, aliases: {}, descriptions: { en: { language: "en", value: "museum in Tokyo" } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q570116" } } } }] }, sitelinks: {} });
    const match = chooseWikidataMatch(source, [candidate], new Map([["Q570116", entity({ id: "Q570116", labels: { en: { language: "en", value: "museum" } }, claims: {}, sitelinks: {} })]]));
    expect(match.status).toBe("probable_manual_review");
    expect(shouldApplyEnrichment(match.status)).toBe(false);
  });

  it("does not auto-apply an abstract match for a not-expected generic place", () => {
    const source = activity({ title: "Picnic Area", website: undefined, source_metadata: { geography: "tokyo_core_23_wards", fsq_category_labels: ["Arts and Entertainment > Amusement Park > Attraction"] } });
    const concept = entity({ labels: { en: { language: "en", value: "Picnic Area" } }, descriptions: { en: { language: "en", value: "type of area for outdoor dining" } }, aliases: {}, claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q570116" } } } }] }, sitelinks: { enwiki: { site: "enwiki", title: "Picnic area" } } });
    expect(chooseWikidataMatch(source, [concept], typeEntities).status).not.toBe("verified");
  });
});

describe("eligibility and query generation", () => {
  it("classifies notable museums as high likelihood", () => {
    const source = activity({ title: "Tokyo History Museum", website: "https://museum.example", source_metadata: { geography: "tokyo_core_23_wards", fsq_category_labels: ["Arts and Entertainment > Museum > History Museum"] } });
    expect(classifyWikimediaEligibility(source).eligibility).toBe("high_wikimedia_likelihood");
  });

  it("classifies generic subordinate exhibits as not expected", () => {
    const source = activity({ title: "お化け屋敷", website: undefined, source_metadata: { geography: "tokyo_core_23_wards", fsq_category_labels: ["Arts and Entertainment > Amusement Park > Attraction"] } });
    expect(classifyWikimediaEligibility(source).eligibility).toBe("not_expected_to_have_wikimedia_entity");
  });

  it("generates Japanese, English, parentheses, macron, and locality variants", () => {
    const source = activity({ title: "浅草寺 (Sensō-ji Temple)", source_metadata: { geography: "tokyo_core_23_wards", locality: "Taito", fsq_category_labels: ["Community > Buddhist Temple"] } });
    const variants = generateQueryVariants(source);
    expect(variants.some((variant) => variant.query === "浅草寺")).toBe(true);
    expect(variants.some((variant) => variant.query === "Sensō-ji Temple")).toBe(true);
    expect(variants.some((variant) => /Senso-ji Temple/i.test(variant.query))).toBe(true);
    expect(variants.some((variant) => /東京|Taito|Tokyo/.test(variant.query) && variant.kind === "locality")).toBe(true);
    expect(removeMacrons("Sensō-ji")).toBe("Senso-ji");
  });
});

describe("prominence and corrections", () => {
  const rich: WikimediaEnrichment = { wikidata_id: "Q1", english_wikipedia_title: "A", japanese_wikipedia_title: "A", alternate_names: [], short_description: "x", entity_types: ["museum", "landmark"], wikidata_official_website: "https://example.test", commons_category: "A", match_status: "verified", match_confidence: 1, match_signals: [], rejection_reasons: [], language_sitelinks: 500 };

  it("caps objective prominence even when many signals exist", () => {
    const result = scoreForDisplay(activity(), rich, "tokyo_core");
    expect(result.components.find((part) => part.signal === "capped_objective_prominence")?.amount).toBeLessThanOrEqual(42);
  });

  it("keeps benchmark membership neutral", () => {
    const benchmark = activity({ curation: { ...activity().curation, selection_reasons: ["major_attraction"] } });
    const ordinary = activity({ curation: { ...activity().curation, selection_reasons: [] } });
    expect(scoreForDisplay(benchmark, rich, "tokyo_core").score).toBe(scoreForDisplay(ordinary, rich, "tokyo_core").score);
  });

  it("does not excessively penalize unmatched records", () => {
    const unmatched: WikimediaEnrichment = { alternate_names: [], entity_types: [], match_status: "unmatched", match_confidence: 0, match_signals: [], rejection_reasons: [], language_sitelinks: 0 };
    const difference = scoreForDisplay(activity(), rich, "tokyo_core").score - scoreForDisplay(activity(), unmatched, "tokyo_core").score;
    expect(difference).toBeLessThanOrEqual(22);
  });

  it("corrects the theater and separates metro excursions", () => {
    expect(correctedCategory(activity({ source_record_id: "6235cc4adcbe6c01a0bdc7f8", category: "food" }))).toBe("adventure");
    expect(catalogClassification(activity({ source_record_id: "4b59ebdaf964a52002a128e3", source_metadata: { geography: "yokohama_or_outside_tokyo" } }))).toBe("metro_excursion");
    expect(catalogClassification(activity({ source_metadata: { geography: "tokyo_core_23_wards" } }))).toBe("tokyo_core");
  });
});

describe("Commons image safety", () => {
  it("preserves license and complete attribution", () => {
    const image = imageFromMetadata("Tokyo.jpg", { url: "https://upload.wikimedia.org/a.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Tokyo.jpg", LicenseShortName: "CC BY-SA 4.0", LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", Artist: "Example Author" });
    expect(image).toMatchObject({ license: "CC BY-SA 4.0", author: "Example Author", attribution: "Example Author — CC BY-SA 4.0" });
  });

  it("does not store an image without attribution", () => {
    expect(imageFromMetadata("Tokyo.jpg", { url: "https://upload.wikimedia.org/a.jpg", LicenseShortName: "CC BY-SA 4.0" })).toBeUndefined();
  });
});

describe("persistent cache", () => {
  const directories: string[] = [];
  afterEach(() => { vi.unstubAllGlobals(); for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

  it("reuses successful requests", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wikimedia-cache-")); directories.push(directory);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ search: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new WikimediaCache(directory);
    const client = new WikimediaClient(cache, 0);
    await client.search("Tokyo", "en");
    await client.search("Tokyo", "en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.stats.cacheHits).toBe(1);
  });

  it("caches failed requests after retries", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wikimedia-cache-failed-")); directories.push(directory);
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new WikimediaCache(directory);
    const client = new WikimediaClient(cache, 0);
    await expect(client.search("Missing", "en")).rejects.toThrow(/after retries/);
    await expect(client.search("Missing", "en")).rejects.toThrow(/Cached Wikimedia request failure/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cache.stats.cacheHits).toBe(1);
  });

  it.each(["ja", "en"] as const)("resolves %s Wikipedia pages to Wikidata IDs", async (language) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `wikimedia-${language}-wiki-`)); directories.push(directory);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: { pages: [{ title: "Tokyo Tower", pageprops: { wikibase_item: "Q1771" }, coordinates: [{ lat: 35.65, lon: 139.74 }], terms: { description: ["tower"] } }] } }), { status: 200 })));
    const pages = await new WikimediaClient(new WikimediaCache(directory), 0).searchWikipedia("Tokyo Tower", language);
    expect(pages[0]).toMatchObject({ wikidataId: "Q1771", route: language === "ja" ? "jawiki_search" : "enwiki_search" });
  });

  it("generates bounded nearby Wikidata candidates", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wikimedia-nearby-")); directories.push(directory);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: { geosearch: [{ title: "Q1771" }, { title: "NotAnItem" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ids = await new WikimediaClient(new WikimediaCache(directory), 0).nearbyWikidata(35.65, 139.74, 400);
    expect(ids).toEqual(["Q1771"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("gsradius=400");
  });
});

describe("enrichment safety", () => {
  const files = ["scripts/fsq/enrichCity.ts", "scripts/fsq/lib/wikimediaClient.ts", "scripts/fsq/lib/wikimediaEnrichment.ts"];
  const source = files.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");

  it("contains no Supabase or paid-provider calls", () => expect(source).not.toMatch(/from\s+["']@supabase|createClient\s*\(|https?:\/\/[^\s"']*(?:googleapis|viator)|\.insert\(|\.upsert\(/i));
  it("does not access or log the FSQ token", () => expect(source).not.toContain("FSQ_OS_PLACES_TOKEN"));
});

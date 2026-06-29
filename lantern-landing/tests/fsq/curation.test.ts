import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { NormalizedActivity } from "@/lib/activities/types";
import { computeAdaptiveQuotas, curateTokyoCatalog } from "@/scripts/fsq/lib/curation";
import { cleanFsqRow } from "@/scripts/fsq/lib/normalize";
import { isTravelerDestination, isTravelRelevant } from "@/scripts/fsq/lib/relevanceFilter";
import type { FsqRawRow } from "@/scripts/fsq/lib/types";

function destinationRow(name: string, label: string): FsqRawRow {
  return {
    fsq_place_id: name,
    name,
    latitude: 35.67,
    longitude: 139.70,
    address: "Tokyo",
    locality: "Shibuya",
    region: "Tokyo",
    postcode: null,
    country: "JP",
    website: null,
    fsq_category_ids: ["destination"],
    fsq_category_labels: [label],
    placemaker_url: null,
    coordinate_source: "latitude_longitude",
    date_created: null,
    date_refreshed: null,
    date_closed: null,
  };
}

function activity(id: string, category: string, geography = "tokyo_core_23_wards", overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    id: `fsq:${id}`,
    provider_ids: [{ source: "manual", id }],
    title: `Distinctive ${category} ${id}`,
    city: "Tokyo",
    category,
    photos: [],
    lat: 35.67,
    lng: 139.70,
    website: `https://example-${id}.test`,
    search_keywords: [],
    capabilities: {
      photos: false, rating: false, review_count: false, written_reviews: false,
      opening_hours: false, phone: false, website: true, map_link: false,
      booking: false, live_availability: false, price: false,
    },
    source: "manual",
    source_record_id: id,
    source_metadata: {
      geography,
      locality: "Shibuya",
      fsq_category_labels: [`Travel > ${category} > Specific Destination`],
    },
    ...overrides,
  };
}

describe("traveler destination retention", () => {
  const cases = [
    ["渋谷駅前スクランブル交差点 (Shibuya Crossing)", "Travel and Transportation > Road > Intersection"],
    ["秋葉原 (Akihabara)", "Landmarks and Outdoors > States and Municipalities > Neighborhood"],
    ["原宿 (Harajuku)", "Landmarks and Outdoors > States and Municipalities > Neighborhood"],
    ["お台場 (Odaiba)", "Landmarks and Outdoors > States and Municipalities > Neighborhood"],
  ] as const;

  for (const [name, label] of cases) {
    it(`retains ${name}`, () => {
      const row = destinationRow(name, label);
      expect(isTravelerDestination(row)).toBe(true);
      expect(isTravelRelevant(row)).toBe(true);
      expect(cleanFsqRow(row)).not.toBeNull();
    });
  }

  it("rejects an ordinary business merely containing Harajuku", () => {
    const row = destinationRow("Harajuku Portrait Studio", "Business and Professional Services > Photography Studio");
    expect(isTravelerDestination(row)).toBe(false);
    expect(isTravelRelevant(row)).toBe(false);
  });

  it("rejects a business-like name even if mislabeled as a neighborhood", () => {
    const row = destinationRow("Akihabara Rental Room", "Landmarks and Outdoors > Neighborhood");
    expect(isTravelerDestination(row)).toBe(false);
    expect(isTravelRelevant(row)).toBe(false);
  });
});

describe("adaptive curation", () => {
  it("builds quotas without allowing a category above 45%", () => {
    const quotas = computeAdaptiveQuotas({ food: 10_000, culture: 800, nature: 500, adventure: 400, nightlife: 400, luxury: 300, free: 100 }, 3_200);
    expect(quotas.food).toBeLessThanOrEqual(1_440);
    expect(Object.values(quotas).reduce((sum, value) => sum + value, 0)).toBe(3_200);
  });

  it("enforces geographic caps and assigns every row to Tier A or Tier B", () => {
    const rows = [
      ...Array.from({ length: 80 }, (_, index) => activity(`core-${index}`, ["culture", "nature", "adventure"][index % 3])),
      ...Array.from({ length: 80 }, (_, index) => activity(`outside-${index}`, "food", "yokohama_or_outside_tokyo")),
    ];
    const result = curateTokyoCatalog(rows, {}, 50);
    expect(result.tierA).toHaveLength(50);
    expect(result.tierA.filter((row) => row.source_metadata?.geography === "yokohama_or_outside_tokyo").length).toBeLessThanOrEqual(5);
    expect(result.tierA.length + result.tierB.length).toBe(rows.length);
  });

  it("limits probable chain branches in Tier A", () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, index) => activity(`chain-${index}`, "food", "tokyo_core_23_wards", {
        title: "Routine Coffee",
        website: "https://routine.example/locations",
      })),
      ...Array.from({ length: 20 }, (_, index) => activity(`independent-${index}`, "food")),
    ];
    const result = curateTokyoCatalog(rows, {}, 20);
    expect(result.tierA.filter((row) => row.curation.probable_chain_id).length).toBeLessThanOrEqual(3);
    expect(result.tierB.filter((row) => row.curation.probable_chain_id).length).toBeGreaterThan(0);
  });

  it("forces all 17 benchmark IDs into Tier A with selection reasons", () => {
    const majors = Array.from({ length: 17 }, (_, index) => ({ name: `Major ${index}`, retained: true, fsqPlaceId: `major-${index}`, fsqName: `Major ${index}` }));
    const rows = [
      ...majors.map((major, index) => activity(major.fsqPlaceId, index % 2 ? "culture" : "nature")),
      ...Array.from({ length: 80 }, (_, index) => activity(`other-${index}`, "food")),
    ];
    const result = curateTokyoCatalog(rows, { majorAttractionCoverage: majors }, 40);
    for (const major of majors) {
      const selected = result.tierA.find((row) => row.source_record_id === major.fsqPlaceId);
      expect(selected?.curation.selection_reasons).toContain("major_attraction");
    }
  });
});

describe("curation safety", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../scripts/fsq/curateCity.ts"), "utf8");

  it("contains no Supabase writes or client", () => {
    expect(source).not.toMatch(/@supabase|createClient|\.insert\(|\.upsert\(|\.update\(|\.delete\(/i);
  });

  it("does not read or log the FSQ token", () => {
    expect(source).not.toContain("FSQ_OS_PLACES_TOKEN");
    expect(source).not.toMatch(/console\.(log|error).*token/i);
  });
});

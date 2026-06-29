import { describe, expect, it } from "vitest";
import type { NormalizedActivity } from "@/lib/activities/types";
import { curateTokyoCatalog, curationCsv, type CuratedActivity } from "@/scripts/fsq/lib/curation";
import { auditTierIntegrity, buildCurationAudit, validateReviewCsv } from "@/scripts/fsq/lib/curationAudit";

function activity(id: string, title = `Place ${id}`, category = "culture"): NormalizedActivity {
  return {
    id: `fsq:${id}`,
    provider_ids: [{ source: "manual", id }],
    title,
    city: "Tokyo",
    category,
    photos: [],
    lat: 35.67,
    lng: 139.70,
    website: "https://example.test",
    search_keywords: [],
    capabilities: {
      photos: false, rating: false, review_count: false, written_reviews: false,
      opening_hours: false, phone: false, website: true, map_link: false,
      booking: false, live_availability: false, price: false,
    },
    source: "manual",
    source_record_id: id,
    source_metadata: {
      geography: "tokyo_core_23_wards",
      locality: "Tokyo",
      fsq_category_labels: ["Arts and Entertainment > Museum > History Museum"],
      travel_value_score: 80,
    },
  };
}

function curated(rows: NormalizedActivity[], benchmarkIds: string[] = []): CuratedActivity[] {
  const majorAttractionCoverage = benchmarkIds.map((id) => ({
    name: `Benchmark ${id}`,
    retained: true,
    fsqPlaceId: id,
    fsqName: rows.find((row) => row.source_record_id === id)?.title,
  }));
  return curateTokyoCatalog(rows, { majorAttractionCoverage }, 20).tierA;
}

describe("curation integrity", () => {
  it("requires Tier A and Tier B to be disjoint and reconciles unique IDs", () => {
    const source = [activity("a"), activity("b"), activity("c")];
    const [a, b, c] = curated(source);
    const integrity = auditTierIntegrity([a, b], [c], source);
    expect(integrity.overlapCount).toBe(0);
    expect(integrity.combinedUniqueIds).toBe(3);
    expect(integrity.sourceUniqueIds).toBe(3);
  });

  it("detects duplicate IDs and cross-tier overlap", () => {
    const source = [activity("a"), activity("b")];
    const [a, b] = curated(source);
    const integrity = auditTierIntegrity([a, a], [a, b], source);
    expect(integrity.duplicateIdsWithinTierA).toBe(1);
    expect(integrity.overlapCount).toBe(1);
    expect(integrity.combinedUniqueIds).toBe(2);
  });

  it("detects records not present in the genuine source set", () => {
    const source = [activity("source")];
    const [sourceRow] = curated(source);
    const [synthetic] = curated([activity("synthetic")]);
    const integrity = auditTierIntegrity([sourceRow, synthetic], [], source);
    expect(integrity.recordsMissingFromSource).toBe(1);
    expect(integrity.syntheticRecords).toEqual(["synthetic"]);
  });
});

describe("benchmark ranking independence", () => {
  it("does not add a benchmark-specific production score bonus", () => {
    const rows = [activity("benchmark", "Identical Museum"), activity("ordinary", "Identical Museum")];
    const result = curateTokyoCatalog(rows, {
      majorAttractionCoverage: [{ name: "Benchmark", retained: true, fsqPlaceId: "benchmark", fsqName: "Identical Museum" }],
    }, 20);
    const benchmark = result.tierA.find((row) => row.source_record_id === "benchmark")!;
    const ordinary = result.tierA.find((row) => row.source_record_id === "ordinary")!;
    expect(benchmark.curation.score).toBe(ordinary.curation.score);
    expect(benchmark.curation.score_components.some((part) => /benchmark/i.test(part.signal))).toBe(false);
    expect((result.report.majorAttractions as Array<Record<string, unknown>>)[0].productionBenchmarkBonusAmount).toBe(0);
  });
});

describe("review CSV validation", () => {
  it("requires actual data and reconciles Tier A and Tier B row counts", () => {
    const source = [activity("a"), activity("b")];
    const [a, b] = curated(source);
    a.curation.tier = "A";
    a.curation.rank = 1;
    b.curation.tier = "B";
    b.curation.rank = undefined;
    const validation = validateReviewCsv(curationCsv([a, b]));
    expect(validation.totalDataRows).toBe(2);
    expect(validation.tierARows).toBe(1);
    expect(validation.tierBRows).toBe(1);
    expect(validation.malformedRows).toBe(0);
  });

  it("detects invalid geography and malformed rows", () => {
    const header = "rank,fsq_place_id,name,category,fsq_category_labels,geography,locality,latitude,longitude,score,website,selection_reasons,penalties,tier";
    const invalid = `${header}\n1,id,Name,culture,Museum,mars,Tokyo,35.6,139.7,90,,reason,,A\nbroken,row\n`;
    const validation = validateReviewCsv(invalid);
    expect(validation.invalidGeographies).toBe(1);
    expect(validation.malformedRows).toBe(1);
  });

  it("flags a header-only CSV as having no data rows", () => {
    const csv = "rank,fsq_place_id,name,category,fsq_category_labels,geography,locality,latitude,longitude,score,website,selection_reasons,penalties,tier\n";
    expect(validateReviewCsv(csv).totalDataRows).toBe(0);
  });
});

describe("full audit gates", () => {
  it("requires all benchmark records to come from verified source rows", () => {
    const source = Array.from({ length: 17 }, (_, index) => activity(index.toString(16).padStart(24, "0"), `Major ${index}`));
    const coverage = source.map((row, index) => ({
      name: `Major ${index}`,
      retained: true,
      fsqPlaceId: row.source_record_id,
      fsqName: row.title,
      distanceFromGoogleM: 10,
    }));
    const result = curateTokyoCatalog(source, { majorAttractionCoverage: coverage }, 17);
    const report = result.report as Record<string, any>;
    report.majorAttractions = (report.majorAttractions as Array<Record<string, unknown>>).map((row) => ({ ...row, distanceFromGoogleM: 10 }));
    const csv = curationCsv([...result.tierA, ...result.tierB]);
    const audit = buildCurationAudit(result.tierA, result.tierB, source, report, {}, csv);
    expect(audit.auditGates.allBenchmarksGenuine).toBe(true);
    expect(audit.auditGates.noSyntheticRecords).toBe(true);
    expect(audit.auditGates.benchmarkDoesNotAffectProductionScore).toBe(true);
  });
});

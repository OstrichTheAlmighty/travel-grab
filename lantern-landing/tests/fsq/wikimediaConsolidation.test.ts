import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { CuratedActivity } from "@/scripts/fsq/lib/curation";
import type { EligibilityBatchMetadata } from "@/scripts/fsq/lib/wikimediaBatch";
import {
  consolidateHighWikimedia,
  EXPECTED_HIGH_TOTAL,
  imageMetadataErrors,
  verifyBatchIntegrity,
  type LoadedWikimediaBatch,
} from "@/scripts/fsq/lib/wikimediaConsolidation";
import type { EnrichedActivity, WikimediaMatchStatus } from "@/scripts/fsq/lib/wikimediaTypes";

function curated(index: number): CuratedActivity {
  return {
    id: `fsq:place-${String(index).padStart(4, "0")}`,
    source_record_id: `place-${String(index).padStart(4, "0")}`,
    provider_ids: [{ source: "manual", id: `place-${index}` }],
    title: `Tokyo Monument ${index}`,
    city: "Tokyo",
    category: "culture",
    photos: [],
    search_keywords: [],
    lat: 35.6 + index / 1_000_000,
    lng: 139.7,
    website: "https://example.test",
    source_metadata: { fsq_category_labels: ["Landmarks and Outdoors > Monument"] },
    curation: { tier: "A", rank: index + 1, score: 120, selection_reasons: [], penalties: [], hidden_gem_candidate: false, score_components: [] },
  } as unknown as CuratedActivity;
}

function enriched(source: CuratedActivity, index: number, status: WikimediaMatchStatus, completeImage = true): EnrichedActivity {
  const wikidataId = `Q${index + 1}`;
  const verified = status === "verified";
  const compatibilitySignal = verified ? "no_incompatible_entity_type" : "compatible_entity_type";
  return {
    ...source,
    catalog_classification: "tokyo_core",
    wikimedia_eligibility: "high_wikimedia_likelihood",
    wikimedia_eligibility_reasons: ["named_notable_entity_type"],
    selection_stratum: `eligibility_high_batch_${String(Math.floor(index / 250) + 1).padStart(3, "0")}`,
    query_attempts: [],
    candidate_entities: verified || status === "probable_manual_review" ? [{ wikidataId, routes: ["wikidata_en"], label: source.title, aliases: [], coordinates: { lat: source.lat!, lng: source.lng! }, score: verified ? 100 : 75, entityTypes: ["monument"], coordinateDistanceM: 0, coordinateRadiusM: 400, coordinatePolicy: "building_or_individual_attraction_400m", signals: ["exact_normalized_name", compatibilitySignal, "coordinates_strong_within_policy"], rejectionReasons: [], decision: verified ? "accepted" : "manual_review" }] : [],
    original_category: source.category,
    corrected_category: source.category,
    inclusion_reasons: [],
    enrichment: {
      ...(verified ? { wikidata_id: wikidataId, english_name: source.title, entity_types: ["monument"], short_description: "A monument", image: { file: "Example.jpg", url: "https://upload.wikimedia.org/example.jpg", license: "CC BY-SA 4.0", author: "Author", attribution: completeImage ? "Author — CC BY-SA 4.0" : "", sourcePage: "https://commons.wikimedia.org/wiki/File:Example.jpg" } } : { entity_types: [] }),
      alternate_names: [], match_status: status, match_confidence: verified ? 1 : 0.7,
      match_signals: verified || status === "probable_manual_review" ? ["exact_normalized_name", compatibilitySignal, "coordinates_strong_within_policy"] : [],
      rejection_reasons: status === "rejected" ? ["weak_name_evidence"] : [], language_sitelinks: verified ? 2 : 0,
      coordinate_radius_m: 400, coordinate_policy: "building_or_individual_attraction_400m",
    },
    prominence_signals: [], display_score_components: [], display_penalties: [], final_display_score: source.curation.score,
  } as EnrichedActivity;
}

function metadata(batch: number, size: number): EligibilityBatchMetadata {
  const start = (batch - 1) * 250;
  return { city: "tokyo", executionMode: "eligibility_batch", eligibility: "high_wikimedia_likelihood", totalCuratedRecords: 3200, totalEligibleRecords: 1474, duplicateFsqIdsRemoved: 0, batch, batchSize: 250, startIndex: start, endIndexInclusive: start + size - 1, selectedRecordCount: size, persistentCacheEnabled: true };
}

function fixtures(incompleteImage = false): { curatedRows: CuratedActivity[]; batches: LoadedWikimediaBatch[] } {
  const curatedRows = Array.from({ length: EXPECTED_HIGH_TOTAL }, (_, index) => curated(index));
  const statuses: WikimediaMatchStatus[] = ["verified", "probable_manual_review", "rejected", "unmatched"];
  const records = curatedRows.map((source, index) => enriched(source, index, statuses[index] ?? "rejected", !(incompleteImage && index === 0)));
  const batches = Array.from({ length: 6 }, (_, offset) => {
    const batch = offset + 1;
    const start = offset * 250;
    const selected = records.slice(start, start + 250);
    const count = (status: WikimediaMatchStatus) => selected.filter((record) => record.enrichment.match_status === status).length;
    const batchMetadata = metadata(batch, selected.length);
    return { batch, dataFile: `batch-${batch}.json`, reportFile: `batch-${batch}.report.json`, data: { batchMetadata, records: selected }, report: { batchMetadata, verifiedWikidataMatches: count("verified"), probableManualReviewMatches: count("probable_manual_review"), rejectedRecords: count("rejected"), unmatchedPlaces: count("unmatched"), apiRequestsMade: 0, cacheHits: 0, runtimeMs: 1 } };
  });
  return { curatedRows, batches };
}

describe("six-batch Wikimedia consolidation", () => {
  it("requires all six batches with sizes 250,250,250,250,250,224 and 1,474 unique IDs", () => {
    const fixture = fixtures();
    const integrity = verifyBatchIntegrity(fixture.curatedRows, fixture.batches);
    expect(fixture.batches.map((batch) => batch.data.records.length)).toEqual([250, 250, 250, 250, 250, 224]);
    expect(integrity.ordered).toHaveLength(1474);
    expect(new Set(integrity.ordered.map(({ record }) => record.source_record_id)).size).toBe(1474);
    expect(integrity.missingIds).toEqual([]);
    expect(integrity.duplicateCount).toBe(0);
  });

  it("applies only validated verified enrichment and isolates manual review", () => {
    const fixture = fixtures();
    const result = consolidateHighWikimedia(fixture.curatedRows, fixture.batches);
    expect(result.records[0]).toMatchObject({ wikimedia_match_status: "verified", wikimedia_applied: true });
    expect(result.records[0].wikimedia?.wikidata_id).toBe("Q1");
    expect(result.records[1]).toMatchObject({ wikimedia_match_status: "probable_manual_review", wikimedia_applied: false });
    expect(result.records[1].wikimedia).toBeUndefined();
    expect(result.manualReview).toHaveLength(1);
  });

  it("preserves rejected and unmatched source records without Wikimedia fields", () => {
    const fixture = fixtures();
    const result = consolidateHighWikimedia(fixture.curatedRows, fixture.batches);
    for (const index of [2, 3]) {
      expect(result.records[index].title).toBe(fixture.curatedRows[index].title);
      expect(result.records[index].wikimedia_applied).toBe(false);
      expect(result.records[index].wikimedia).toBeUndefined();
    }
  });

  it("rejects missing, malformed, overlapping, and incorrectly described batches", () => {
    const missing = fixtures();
    expect(() => verifyBatchIntegrity(missing.curatedRows, missing.batches.slice(0, 5))).toThrow(/missing batch 6/);
    const malformed = fixtures();
    malformed.batches[0].data.records.pop();
    expect(() => verifyBatchIntegrity(malformed.curatedRows, malformed.batches)).toThrow(/contains 249 records/);
    const metadataError = fixtures();
    metadataError.batches[1].data.batchMetadata.startIndex = 0;
    expect(() => verifyBatchIntegrity(metadataError.curatedRows, metadataError.batches)).toThrow(/startIndex must be 250/);
    const overlap = fixtures();
    overlap.batches[1].data.records[0] = overlap.batches[0].data.records[0];
    expect(() => verifyBatchIntegrity(overlap.curatedRows, overlap.batches)).toThrow(/duplicate FSQ IDs|index 250/);
  });

  it("retains complete image attribution and excludes incomplete images", () => {
    expect(imageMetadataErrors({ file: "A.jpg", url: "https://upload.wikimedia.org/a.jpg", license: "CC0", author: "A", attribution: "A — CC0", sourcePage: "https://commons.wikimedia.org/wiki/File:A.jpg" })).toEqual([]);
    const fixture = fixtures(true);
    const result = consolidateHighWikimedia(fixture.curatedRows, fixture.batches);
    expect(result.records[0].wikimedia?.image).toBeUndefined();
    expect(result.imageExclusions).toEqual([expect.objectContaining({ fsqPlaceId: "place-0000", reasons: ["missing_attribution_text"] })]);
  });

  it("contains no network client, API request, Supabase write, or automatic override code", () => {
    const files = ["scripts/fsq/consolidateWikimedia.ts", "scripts/fsq/lib/wikimediaConsolidation.ts"];
    const source = files.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");
    expect(source).not.toMatch(/WikimediaClient|\bfetch\s*\(|https?:\/\/.*(?:wikidata|wikipedia)|createClient\s*\(|\.insert\s*\(|\.upsert\s*\(/i);
    expect(source).not.toMatch(/REVIEWED_ENTITY_OVERRIDES\.(?:push|splice)|manual_override\s*=/i);
  });
});

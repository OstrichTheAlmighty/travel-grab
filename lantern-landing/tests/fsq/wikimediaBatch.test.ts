import { describe, expect, it } from "vitest";
import type { CuratedActivity } from "@/scripts/fsq/lib/curation";
import { batchOutputPaths, parseEnrichmentArgs, selectEligibilityBatch } from "@/scripts/fsq/lib/wikimediaBatch";

function highActivity(index: number, rank = index + 1, fsqId = `fsq-${String(index).padStart(4, "0")}`): CuratedActivity {
  return {
    id: `record-${index}`,
    source_record_id: fsqId,
    title: `Tokyo Landmark ${index}`,
    category: "culture",
    website: "https://example.test",
    source_metadata: { fsq_category_labels: ["Landmarks and Outdoors > Monument"] },
    curation: { tier: "A", rank, score: 120, selection_reasons: [], penalties: [], hidden_gem_candidate: false, score_components: [] },
  } as unknown as CuratedActivity;
}

describe("Wikimedia enrichment CLI", () => {
  it("parses high eligibility, batch size, and one-based batch number", () => {
    expect(parseEnrichmentArgs(["--city=tokyo", "--eligibility=high", "--batch-size=250", "--batch=1"])).toMatchObject({
      mode: "eligibility_batch",
      eligibility: "high_wikimedia_likelihood",
      eligibilitySlug: "high",
      batchSize: 250,
      batch: 1,
      limit: 250,
    });
  });

  it("keeps ranked and stratified pilot modes distinct", () => {
    expect(parseEnrichmentArgs(["--city=tokyo", "--limit=100"]).mode).toBe("ranked_pilot");
    expect(parseEnrichmentArgs(["--city=tokyo", "--limit=300", "--stratified"])).toMatchObject({ mode: "stratified_pilot", limit: 300 });
  });

  it("does not let the old default limit override batch size", () => {
    expect(parseEnrichmentArgs(["--city=tokyo", "--eligibility=high", "--batch-size=250", "--batch=2"]).limit).toBe(250);
  });

  it("rejects unknown and conflicting arguments", () => {
    expect(() => parseEnrichmentArgs(["--city=tokyo", "--batch-size=250", "--batch=1"])).toThrow(/requires --eligibility/);
    expect(() => parseEnrichmentArgs(["--city=tokyo", "--eligibility=high", "--batch-size=250", "--batch=1", "--limit=100"])).toThrow(/cannot be combined/);
    expect(() => parseEnrichmentArgs(["--city=tokyo", "--eligibility=high", "--batch-size=250", "--batch=1", "--surprise"])).toThrow(/Unknown argument: --surprise/);
  });
});

describe("deterministic eligibility batching", () => {
  const records = Array.from({ length: 520 }, (_, index) => highActivity(index));

  it("uses one-based, non-overlapping batch boundaries", () => {
    expect(selectEligibilityBatch(records, "high_wikimedia_likelihood", 250, 1)).toMatchObject({ startIndex: 0, endIndexExclusive: 250 });
    expect(selectEligibilityBatch(records, "high_wikimedia_likelihood", 250, 2)).toMatchObject({ startIndex: 250, endIndexExclusive: 500 });
    const final = selectEligibilityBatch(records, "high_wikimedia_likelihood", 250, 3);
    expect(final).toMatchObject({ startIndex: 500, endIndexExclusive: 520 });
    expect(final.selected).toHaveLength(20);
  });

  it("sorts independently of input order and rejects duplicate FSQ IDs", () => {
    const duplicate = highActivity(999, 999, "fsq-0002");
    const forward = selectEligibilityBatch([...records.slice(0, 10), duplicate], "high_wikimedia_likelihood", 10, 1);
    const reverse = selectEligibilityBatch([duplicate, ...records.slice(0, 10).reverse()], "high_wikimedia_likelihood", 10, 1);
    expect(forward.selected.map((row) => row.source_record_id)).toEqual(reverse.selected.map((row) => row.source_record_id));
    expect(forward.duplicateFsqIdsRemoved).toBe(1);
    expect(new Set(forward.selected.map((row) => row.source_record_id)).size).toBe(forward.selected.length);
  });

  it("rejects a batch beyond the available eligible records", () => {
    expect(() => selectEligibilityBatch(records.slice(0, 10), "high_wikimedia_likelihood", 10, 2)).toThrow(/beyond 10 eligible records/);
  });

  it("creates batch-specific zero-padded output names", () => {
    expect(batchOutputPaths("/output", "tokyo", "high", 1)).toEqual({
      enriched: "/output/tokyo-fsq-wikimedia-high-batch-001.json",
      report: "/output/tokyo-fsq-wikimedia-high-batch-001.report.json",
      review: "/output/tokyo-fsq-wikimedia-high-batch-001-review.csv",
    });
  });
});

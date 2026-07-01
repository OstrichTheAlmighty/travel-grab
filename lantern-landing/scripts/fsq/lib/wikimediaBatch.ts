import type { CuratedActivity } from "./curation";
import { classifyWikimediaEligibility } from "./wikimediaEligibility";
import type { WikimediaEligibility } from "./wikimediaTypes";

export type EnrichmentExecutionMode = "ranked_pilot" | "stratified_pilot" | "eligibility_batch";

export interface EnrichmentCliOptions {
  city: "tokyo";
  mode: EnrichmentExecutionMode;
  limit: number;
  stratified: boolean;
  eligibility?: WikimediaEligibility;
  eligibilitySlug?: "high" | "medium" | "low" | "not-expected";
  batchSize?: number;
  batch?: number;
}

export interface EligibilityBatchSelection {
  eligible: CuratedActivity[];
  selected: CuratedActivity[];
  duplicateFsqIdsRemoved: number;
  startIndex: number;
  endIndexExclusive: number;
}

export interface BatchOutputPaths {
  enriched: string;
  report: string;
  review: string;
}

export interface EligibilityBatchMetadata {
  city: string;
  executionMode: "eligibility_batch";
  eligibility: WikimediaEligibility;
  totalCuratedRecords: number;
  totalEligibleRecords: number;
  duplicateFsqIdsRemoved: number;
  batch: number;
  batchSize: number;
  startIndex: number;
  endIndexInclusive: number;
  selectedRecordCount: number;
  persistentCacheEnabled: true;
}

const ELIGIBILITY_ALIASES: Record<string, { value: WikimediaEligibility; slug: EnrichmentCliOptions["eligibilitySlug"] }> = {
  high: { value: "high_wikimedia_likelihood", slug: "high" },
  high_wikimedia_likelihood: { value: "high_wikimedia_likelihood", slug: "high" },
  medium: { value: "medium_wikimedia_likelihood", slug: "medium" },
  medium_wikimedia_likelihood: { value: "medium_wikimedia_likelihood", slug: "medium" },
  low: { value: "low_wikimedia_likelihood", slug: "low" },
  low_wikimedia_likelihood: { value: "low_wikimedia_likelihood", slug: "low" },
  "not-expected": { value: "not_expected_to_have_wikimedia_entity", slug: "not-expected" },
  not_expected_to_have_wikimedia_entity: { value: "not_expected_to_have_wikimedia_entity", slug: "not-expected" },
};

function singleValue(args: string[], prefix: string): string | undefined {
  const matches = args.filter((argument) => argument.startsWith(prefix));
  if (matches.length > 1) throw new Error(`Argument ${prefix.slice(0, -1)} may only be provided once`);
  return matches[0]?.slice(prefix.length);
}

function positiveInteger(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function parseEnrichmentArgs(args: string[]): EnrichmentCliOptions {
  const recognized = ["--city=", "--limit=", "--eligibility=", "--batch-size=", "--batch="];
  const unknown = args.filter((argument) => argument !== "--stratified" && argument !== "--write" && !recognized.some((prefix) => argument.startsWith(prefix)));
  if (unknown.length) throw new Error(`Unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  if (args.includes("--write")) throw new Error("Enrichment is local-only and does not support Supabase writes");
  if (args.filter((argument) => argument === "--stratified").length > 1) throw new Error("Argument --stratified may only be provided once");

  const city = singleValue(args, "--city=")?.toLowerCase();
  if (city !== "tokyo") throw new Error("FSQ Wikimedia enrichment requires --city=tokyo");

  const limitRaw = singleValue(args, "--limit=");
  const eligibilityRaw = singleValue(args, "--eligibility=")?.toLowerCase();
  const batchSize = positiveInteger(singleValue(args, "--batch-size="), "--batch-size");
  const batch = positiveInteger(singleValue(args, "--batch="), "--batch");
  const stratified = args.includes("--stratified");
  const hasBatchArgument = eligibilityRaw !== undefined || batchSize !== undefined || batch !== undefined;

  if (hasBatchArgument) {
    if (!eligibilityRaw || batchSize === undefined || batch === undefined) {
      throw new Error("Eligibility batch mode requires --eligibility, --batch-size, and --batch together");
    }
    if (limitRaw !== undefined || stratified) throw new Error("Eligibility batch mode cannot be combined with --limit or --stratified");
    const eligibility = ELIGIBILITY_ALIASES[eligibilityRaw];
    if (!eligibility) throw new Error(`Unknown Wikimedia eligibility: ${eligibilityRaw}`);
    return { city: "tokyo", mode: "eligibility_batch", limit: batchSize, stratified: false, eligibility: eligibility.value, eligibilitySlug: eligibility.slug, batchSize, batch };
  }

  const limit = positiveInteger(limitRaw ?? "100", "--limit")!;
  const maximum = stratified ? 300 : 100;
  if (limit > maximum) throw new Error(stratified ? "Stratified pilot limit must be from 1 to 300" : "Pilot limit must be from 1 to 100; use --stratified for the reviewed 300-record pilot");
  return { city: "tokyo", mode: stratified ? "stratified_pilot" : "ranked_pilot", limit, stratified };
}

export function selectEligibilityBatch(
  activities: CuratedActivity[],
  eligibility: WikimediaEligibility,
  batchSize: number,
  batch: number,
): EligibilityBatchSelection {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Batch size must be a positive integer");
  if (!Number.isInteger(batch) || batch < 1) throw new Error("Batch number must be a positive one-based integer");

  const compare = (left: CuratedActivity, right: CuratedActivity) =>
    (left.curation.rank ?? Number.MAX_SAFE_INTEGER) - (right.curation.rank ?? Number.MAX_SAFE_INTEGER) ||
    (left.source_record_id ?? "").localeCompare(right.source_record_id ?? "") ||
    left.id.localeCompare(right.id);
  const eligibleRows = activities
    .filter((activity) => classifyWikimediaEligibility(activity).eligibility === eligibility)
    .sort(compare);
  const uniqueByFsqId = new Map<string, CuratedActivity>();
  let duplicateFsqIdsRemoved = 0;
  for (const activity of eligibleRows) {
    const fsqId = activity.source_record_id?.trim();
    if (!fsqId) throw new Error(`Eligible curated record ${activity.id} has no FSQ place ID`);
    if (uniqueByFsqId.has(fsqId)) {
      duplicateFsqIdsRemoved += 1;
      continue;
    }
    uniqueByFsqId.set(fsqId, activity);
  }

  const eligible = [...uniqueByFsqId.values()].sort(compare);
  const startIndex = (batch - 1) * batchSize;
  if (startIndex >= eligible.length) {
    throw new Error(`Batch ${batch} starts at index ${startIndex}, beyond ${eligible.length} eligible records`);
  }
  const endIndexExclusive = Math.min(startIndex + batchSize, eligible.length);
  return { eligible, selected: eligible.slice(startIndex, endIndexExclusive), duplicateFsqIdsRemoved, startIndex, endIndexExclusive };
}

export function batchOutputPaths(outputDir: string, city: string, eligibilitySlug: string, batch: number): BatchOutputPaths {
  const prefix = `${city}-fsq-wikimedia-${eligibilitySlug}-batch-${String(batch).padStart(3, "0")}`;
  return {
    enriched: `${outputDir}/${prefix}.json`,
    report: `${outputDir}/${prefix}.report.json`,
    review: `${outputDir}/${prefix}-review.csv`,
  };
}

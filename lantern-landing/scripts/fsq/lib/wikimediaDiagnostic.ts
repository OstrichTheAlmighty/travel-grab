import type { EnrichedActivity } from "./wikimediaTypes";

export type FailureCategory = "query_generation_failure" | "alias_failure" | "redirect_failure" | "disambiguation_failure" | "title_resolution_failure" | "type_mapping_failure" | "coordinate_policy_failure" | "genuine_no_entity" | "ambiguous_manual_review";

function isFailure(row: EnrichedActivity): boolean { return row.enrichment.match_status === "rejected" || row.enrichment.match_status === "unmatched"; }

export function selectFailureDiagnosticSet(rows: EnrichedActivity[], limit = 100): EnrichedActivity[] {
  const selected: EnrichedActivity[] = [];
  const ids = new Set<string>();
  const add = (candidates: EnrichedActivity[], count: number) => {
    for (const row of candidates) {
      if (selected.length >= limit || count <= 0 || ids.has(row.id)) continue;
      selected.push(row); ids.add(row.id); count -= 1;
    }
  };
  const priority = (a: EnrichedActivity, b: EnrichedActivity) => {
    const aEvidence = Number(a.candidate_entities.some((candidate) => candidate.signals.some((signal) => /exact|strong_name|wikipedia_page/.test(signal))));
    const bEvidence = Number(b.candidate_entities.some((candidate) => candidate.signals.some((signal) => /exact|strong_name|wikipedia_page/.test(signal))));
    return bEvidence - aEvidence || b.curation.score - a.curation.score || a.id.localeCompare(b.id);
  };
  add(rows.filter((row) => row.wikimedia_eligibility === "high_wikimedia_likelihood" && isFailure(row)).sort(priority), 60);
  add(rows.filter((row) => row.wikimedia_eligibility === "medium_wikimedia_likelihood" && isFailure(row)).sort(priority), 20);
  add(rows.filter((row) => row.enrichment.match_status === "probable_manual_review"), limit);
  add(rows.filter((row) => row.source_record_id === "4b57cb7cf964a5208b4128e3"), 1);
  add(rows.filter((row) => isFailure(row) && row.candidate_entities.some((candidate) => candidate.japaneseWikipediaTitle || candidate.englishWikipediaTitle)).sort(priority), limit);
  add(rows.filter(isFailure).sort(priority), limit);
  return selected.slice(0, limit);
}

export function classifyFailure(row: EnrichedActivity): FailureCategory {
  if (row.enrichment.match_status === "probable_manual_review") return "ambiguous_manual_review";
  const best = row.candidate_entities[0];
  if (!best) return row.wikimedia_eligibility === "not_expected_to_have_wikimedia_entity" ? "genuine_no_entity" : "query_generation_failure";
  if (row.query_attempts.some((attempt) => (attempt.redirectResolved?.length ?? 0) > 0) && best.rejectionReasons.length) return "redirect_failure";
  if (best.rejectionReasons.some((reason) => reason.includes("type_incompatible") || reason.includes("entity_incompatible"))) return "type_mapping_failure";
  if (best.rejectionReasons.includes("coordinates_too_far")) return "coordinate_policy_failure";
  if (best.rejectionReasons.some((reason) => reason.includes("substring") || reason.includes("weak_name"))) return "alias_failure";
  if ((best.japaneseWikipediaTitle || best.englishWikipediaTitle) && row.enrichment.match_status !== "verified") return "title_resolution_failure";
  if (row.candidate_entities.filter((candidate) => candidate.score >= best.score - 5).length > 1) return "disambiguation_failure";
  return row.wikimedia_eligibility === "not_expected_to_have_wikimedia_entity" ? "genuine_no_entity" : "query_generation_failure";
}

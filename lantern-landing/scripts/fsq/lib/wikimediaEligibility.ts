import type { CuratedActivity } from "./curation";
import { catalogClassification } from "./fsqCorrections";
import type { WikimediaEligibility } from "./wikimediaTypes";

export interface EligibilityResult {
  eligibility: WikimediaEligibility;
  reasons: string[];
}

function labelText(activity: CuratedActivity): string {
  const labels = activity.source_metadata?.fsq_category_labels;
  return Array.isArray(labels) ? labels.join(" ").toLowerCase() : "";
}

export function classifyWikimediaEligibility(activity: CuratedActivity): EligibilityResult {
  const labels = labelText(activity);
  const name = activity.title.toLowerCase();
  const reasons: string[] = [];
  const genericName = /^(park|garden|plaza|museum|cafe|bar|restaurant|広場|公園|展示場|お化け屋敷|メリーゴーランド|ローラーコースター)$/i.test(name.trim());
  const subordinate = /zoo exhibit|amusement park > attraction|playground/.test(labels);
  const ordinaryCommercial = /dining and drinking|cafe|restaurant|bar|nightclub|retail > (?!market)/.test(labels);
  const chain = Boolean(activity.curation.probable_chain_id);
  const majorType = /monument|palace|scenic lookout|historic and protected|museum|garden|shrine|buddhist temple|amusement park(?:$|\s)|stadium|arena|market|neighborhood/.test(labels);
  const independentMajorType = majorType && !subordinate;

  if (subordinate || genericName) reasons.push(subordinate ? "minor_or_subordinate_entity" : "generic_name");
  if (ordinaryCommercial || chain) reasons.push(ordinaryCommercial ? "ordinary_commercial_category" : "probable_chain_branch");
  if (subordinate && (genericName || !activity.website)) return { eligibility: "not_expected_to_have_wikimedia_entity", reasons };
  if ((ordinaryCommercial || chain) && !independentMajorType && !/market|historic|landmark/.test(labels)) return { eligibility: "not_expected_to_have_wikimedia_entity", reasons };

  const namedPlace = !genericName && activity.title.trim().length >= 4;
  if (independentMajorType && namedPlace && (!/museum/.test(labels) || activity.website || activity.curation.score >= 105)) {
    reasons.push("named_notable_entity_type");
    return { eligibility: "high_wikimedia_likelihood", reasons };
  }
  if (/shopping (?:mall|plaza)|neighborhood|park|historic|museum|gallery|theater|aquarium|zoo|amusement/.test(labels) && namedPlace) {
    reasons.push("regional_or_distinctive_public_destination");
    return { eligibility: "medium_wikimedia_likelihood", reasons };
  }
  if (catalogClassification(activity) === "metro_excursion" && namedPlace && !subordinate) {
    reasons.push("named_metro_excursion");
    return { eligibility: "medium_wikimedia_likelihood", reasons };
  }
  reasons.push("limited_public_notability_evidence");
  return { eligibility: "low_wikimedia_likelihood", reasons };
}

export function isDistrictActivity(activity: CuratedActivity): boolean {
  return /neighborhood|shopping plaza|shopping mall|intersection|road/.test(labelText(activity));
}

export function selectStratifiedPilot(activities: CuratedActivity[], requiredIds: Set<string>, limit = 300): Array<{ activity: CuratedActivity; stratum: string }> {
  const remaining = new Map(activities.map((activity) => [activity.id, activity]));
  const selected: Array<{ activity: CuratedActivity; stratum: string }> = [];
  const take = (stratum: string, count: number, predicate: (activity: CuratedActivity) => boolean) => {
    const candidates = [...remaining.values()].filter(predicate).sort((a, b) => {
      const requiredDifference = Number(requiredIds.has(b.source_record_id ?? "")) - Number(requiredIds.has(a.source_record_id ?? ""));
      return requiredDifference || b.curation.score - a.curation.score || a.id.localeCompare(b.id);
    });
    for (const activity of candidates.slice(0, count)) { selected.push({ activity, stratum }); remaining.delete(activity.id); }
  };
  const high = (activity: CuratedActivity) => classifyWikimediaEligibility(activity).eligibility === "high_wikimedia_likelihood";
  const highStart = selected.length;
  take("high_likelihood", requiredIds.size, (activity) => high(activity) && requiredIds.has(activity.source_record_id ?? ""));
  const highTake = (count: number, pattern: RegExp) => take("high_likelihood", Math.min(count, 100 - (selected.length - highStart)), (activity) => high(activity) && pattern.test(labelText(activity)));
  highTake(25, /museum|gallery/);
  highTake(15, /park|garden/);
  highTake(15, /shrine|temple|spiritual/);
  highTake(15, /monument|palace|scenic lookout|historic/);
  highTake(10, /neighborhood|market|intersection/);
  highTake(10, /amusement park|stadium|arena|aquarium|zoo/);
  take("high_likelihood", 100 - (selected.length - highStart), high);
  take("medium_likelihood", 75, (activity) => classifyWikimediaEligibility(activity).eligibility === "medium_wikimedia_likelihood");
  take("culture", 50, (activity) => activity.category === "culture");
  take("nature", 25, (activity) => activity.category === "nature");
  take("adventure_family", 20, (activity) => activity.category === "adventure" || /family|zoo|amusement/.test(labelText(activity)));
  take("district_neighborhood", 10, isDistrictActivity);
  take("metro_excursion", 10, (activity) => catalogClassification(activity) === "metro_excursion");
  take("low_likelihood_control", 10, (activity) => ["low_wikimedia_likelihood", "not_expected_to_have_wikimedia_entity"].includes(classifyWikimediaEligibility(activity).eligibility));
  if (selected.length < limit) take("adaptive_fill", limit - selected.length, () => true);
  return selected.slice(0, limit);
}

import type { CuratedActivity } from "./curation";
import type { CatalogClassification } from "./wikimediaTypes";

const CATEGORY_OVERRIDES: Record<string, string> = {
  "6235cc4adcbe6c01a0bdc7f8": "adventure", // IKEBUKURO THEATER〔CG STAR LIVE〕
  "4b80a4c6f964a520218330e3": "culture",   // 都電おもいで広場
  "4bde825dffdec92874e3e8a1": "free",      // 九品仏広場
  "50790c96e4b0bf54e138f834": "adventure", // ふれあい動物広場
  "50aea3d9e4b034c5d70d4a8a": "culture",   // 野外展示場
};

const RESERVE_OVERRIDES = new Set([
  "4bde825dffdec92874e3e8a1", // local plaza/playground
  "50aea3d9e4b034c5d70d4a8a", // generic subordinate exhibition-area name
]);

const METRO_EXCURSION_IDS = new Set([
  "4b59ebdaf964a52002a128e3", // Tokyo Disneyland
  "4c2bf7fe8abca593441c0120", // Tokyo DisneySea
]);

const REVIEW_NOTES: Record<string, string> = {
  "6235cc4adcbe6c01a0bdc7f8": "verified_vr_entertainment_attraction_not_food",
  "4b80a4c6f964a520218330e3": "verified_small_transport_museum_retained_as_culture",
  "4bde825dffdec92874e3e8a1": "municipal_plaza_playground_moved_to_reserve",
  "50790c96e4b0bf54e138f834": "family_zoo_exhibit_reclassified_as_adventure",
  "50aea3d9e4b034c5d70d4a8a": "generic_subordinate_sculpture_exhibit_moved_to_reserve",
  "4b0587a4f964a520f89d22e3": "verified_art_museum_retained_as_culture",
};

export function correctedCategory(activity: CuratedActivity): string {
  return CATEGORY_OVERRIDES[activity.source_record_id ?? ""] ?? activity.category;
}

export function catalogClassification(activity: CuratedActivity): CatalogClassification {
  const id = activity.source_record_id ?? "";
  if (RESERVE_OVERRIDES.has(id)) return "reserve";
  if (METRO_EXCURSION_IDS.has(id)) return "metro_excursion";
  const geography = activity.source_metadata?.geography;
  if (geography === "tokyo_core_23_wards") return "tokyo_core";
  if (geography === "broader_tokyo") return "broader_tokyo";
  if (geography === "yokohama_or_outside_tokyo") return "metro_excursion";
  return "reserve";
}

export function correctionReasons(activity: CuratedActivity): string[] {
  const id = activity.source_record_id ?? "";
  const reasons: string[] = [];
  if (CATEGORY_OVERRIDES[id] && CATEGORY_OVERRIDES[id] !== activity.category) reasons.push(`category_corrected:${activity.category}->${CATEGORY_OVERRIDES[id]}`);
  if (RESERVE_OVERRIDES.has(id)) reasons.push("manual_qa_minor_or_ambiguous_facility");
  if (METRO_EXCURSION_IDS.has(id)) reasons.push("legitimate_metropolitan_excursion");
  if (REVIEW_NOTES[id]) reasons.push(REVIEW_NOTES[id]);
  return reasons;
}

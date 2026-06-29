import type { CuratedActivity } from "./curation";
import { normalizeName, trigramSimilarity } from "./dedup";
import { haversineM } from "./attractions";
import type { WikidataEntity } from "./wikimediaTypes";

export interface EvaluatedEntity {
  entity: WikidataEntity;
  score: number;
  confidence: number;
  signals: string[];
  rejectionReasons: string[];
  distanceM?: number;
  typeLabels: string[];
}

const BUSINESS_WORDS = /\b(company|business|shop|store|studio|cafe|restaurant|hotel|office|school|station|stadium|arena)\b|会社|店舗|スタジオ|カフェ|レストラン|ホテル|学校|駅|競技場/i;
const DISTRICT_WORDS = /district|neighbou?rhood|quarter|area|shopping street|street|town|地域|地区|街|商店街/i;
const LANDMARK_WORDS = /landmark|tower|monument|observation|tourist attraction|building|structure|タワー|塔|展望|建築/i;
const SHRINE_WORDS = /shrine|shinto|jinja|神社|神宮/i;
const PARK_WORDS = /park|garden|公園|庭園/i;
const NON_PLACE_ENTITY_WORDS = /novel|literary work|book|film|television|song|album|fictional|taxon|species|type of |class of |form of |magazine|musical group|video game|amusement ride consisting|小説|文学作品|映画|楽曲|雑誌|音楽グループ|ゲーム|架空/i;
const CLOSED_ENTITY_WORDS = /destroyed building|demolished|former .{0,30}(?:market|building|venue)|closed in |解体|廃止/i;

function claimValues(entity: WikidataEntity, property: string): unknown[] {
  return (entity.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value).filter((value) => value !== undefined);
}

export function entityCoordinates(entity: WikidataEntity): { lat: number; lng: number } | undefined {
  const value = claimValues(entity, "P625")[0] as { latitude?: number; longitude?: number } | undefined;
  return typeof value?.latitude === "number" && typeof value.longitude === "number" ? { lat: value.latitude, lng: value.longitude } : undefined;
}

export function entityTypeIds(entity: WikidataEntity): string[] {
  return claimValues(entity, "P31").map((value) => (value as { id?: string })?.id).filter((value): value is string => Boolean(value));
}

export function entityStringClaim(entity: WikidataEntity, property: string): string | undefined {
  const value = claimValues(entity, property)[0];
  return typeof value === "string" ? value : undefined;
}

export function activityNames(activity: CuratedActivity): string[] {
  const values = [activity.title, activity.name_local, ...Object.values(activity.name_alts ?? {})];
  const parenthetical = [...activity.title.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  return [...new Set([...values, ...parenthetical].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function entityNames(entity: WikidataEntity): string[] {
  return [...new Set([
    ...Object.values(entity.labels ?? {}).map((value) => value.value),
    ...Object.values(entity.aliases ?? {}).flat().map((value) => value.value),
    ...Object.values(entity.sitelinks ?? {}).map((value) => value.title),
  ].filter(Boolean))];
}

function categoryText(activity: CuratedActivity): string {
  const labels = activity.source_metadata?.fsq_category_labels;
  return `${activity.category} ${Array.isArray(labels) ? labels.join(" ") : ""}`.toLowerCase();
}

function typeCompatibility(activity: CuratedActivity, candidateText: string): { compatible: boolean; explicit: boolean; reason?: string } {
  const source = categoryText(activity);
  const candidate = candidateText.toLowerCase();
  const district = /neighborhood|shopping plaza|shopping mall|road|intersection/.test(source);
  const shrine = /shrine|temple|spiritual/.test(source);
  const park = /landmarks and outdoors > (?:park|garden)/.test(source);
  const museum = /museum|gallery/.test(source);
  const amusement = /amusement|attraction|zoo|aquarium/.test(source);
  const landmark = /monument|scenic lookout|historic|palace/.test(source);

  if (NON_PLACE_ENTITY_WORDS.test(candidate)) return { compatible: false, explicit: true, reason: "non_place_entity_type_incompatible" };
  if (CLOSED_ENTITY_WORDS.test(candidate)) return { compatible: false, explicit: true, reason: "closed_or_destroyed_entity_incompatible" };
  if ((district || shrine || park || museum || landmark) && BUSINESS_WORDS.test(candidate)) return { compatible: false, explicit: true, reason: "business_entity_type_incompatible" };
  if (district) return DISTRICT_WORDS.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "district_entity_type_incompatible" };
  if (shrine) return SHRINE_WORDS.test(candidate) && !/stadium|arena|競技場/i.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "shrine_entity_type_incompatible" };
  if (park) return PARK_WORDS.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "park_entity_type_incompatible" };
  if (museum) return /museum|gallery|美術館|博物館|記念館/i.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "museum_entity_type_incompatible" };
  if (amusement) return /amusement|theme park|attraction|ride|zoo|aquarium|entertainment|遊園|動物園|水族館/i.test(candidate) ? { compatible: true, explicit: true } : { compatible: !BUSINESS_WORDS.test(candidate), explicit: false, reason: "attraction_entity_type_incompatible" };
  if (landmark) return LANDMARK_WORDS.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "landmark_entity_type_incompatible" };
  if (BUSINESS_WORDS.test(candidate) && !/food|nightlife|luxury/.test(activity.category)) return { compatible: false, explicit: true, reason: "business_entity_type_incompatible" };
  return { compatible: true, explicit: false };
}

export function evaluateWikidataEntity(activity: CuratedActivity, entity: WikidataEntity, typeEntities: Map<string, WikidataEntity> = new Map()): EvaluatedEntity {
  const sourceNames = activityNames(activity);
  const candidateNames = entityNames(entity);
  const normalizedSources = sourceNames.map(normalizeName).filter(Boolean);
  const normalizedCandidates = candidateNames.map(normalizeName).filter(Boolean);
  const exact = normalizedSources.some((name) => normalizedCandidates.includes(name));
  const bestSimilarity = Math.max(0, ...normalizedSources.flatMap((left) => normalizedCandidates.map((right) => trigramSimilarity(left, right))));
  const substringOnly = !exact && normalizedSources.some((left) => normalizedCandidates.some((right) => left.length >= 3 && (right.includes(left) || left.includes(right))));
  const signals: string[] = [];
  const rejectionReasons: string[] = [];
  let score = 0;
  if (exact) { score += 52; signals.push("exact_normalized_name"); }
  else if (bestSimilarity >= 0.72) { score += 38; signals.push("strong_name_similarity"); }
  else if (bestSimilarity >= 0.62 && !substringOnly) { score += 25; signals.push("moderate_name_similarity"); }
  else rejectionReasons.push(substringOnly ? "substring_only_name_evidence" : "weak_name_evidence");

  const typeLabels = entityTypeIds(entity).flatMap((id) => {
    const type = typeEntities.get(id);
    return [type?.labels?.en?.value, type?.labels?.ja?.value, type?.descriptions?.en?.value].filter((value): value is string => Boolean(value));
  });
  const descriptor = [entity.labels?.en?.value, entity.labels?.ja?.value, entity.descriptions?.en?.value, entity.descriptions?.ja?.value, ...typeLabels].filter(Boolean).join(" ");
  const compatibility = typeCompatibility(activity, descriptor);
  if (compatibility.compatible) { score += compatibility.explicit ? 18 : 7; signals.push(compatibility.explicit ? "compatible_entity_type" : "no_incompatible_entity_type"); }
  else rejectionReasons.push(compatibility.reason ?? "entity_type_incompatible");

  const coords = entityCoordinates(entity);
  let distanceM: number | undefined;
  if (coords && typeof activity.lat === "number" && typeof activity.lng === "number") {
    distanceM = haversineM(activity.lat, activity.lng, coords.lat, coords.lng);
    if (distanceM <= 150) { score += 20; signals.push("coordinates_within_150m"); }
    else if (distanceM <= 600) { score += 14; signals.push("coordinates_within_600m"); }
    else if (distanceM <= 1_500) { score += 6; signals.push("coordinates_within_1500m"); }
    else rejectionReasons.push("coordinates_too_far");
  } else signals.push("wikidata_coordinates_unavailable");

  const locality = String(activity.source_metadata?.locality ?? "");
  if (locality && descriptor.toLowerCase().includes(locality.toLowerCase())) { score += 5; signals.push("locality_evidence"); }
  const fatal = rejectionReasons.some((reason) => /substring_only|weak_name|incompatible|coordinates_too_far/.test(reason));
  if (fatal) score = Math.min(score, 54);
  return { entity, score, confidence: Math.min(1, score / 95), signals, rejectionReasons, distanceM, typeLabels };
}

export function chooseWikidataMatch(activity: CuratedActivity, entities: WikidataEntity[], typeEntities: Map<string, WikidataEntity> = new Map()): { status: "verified" | "possible" | "unmatched"; best?: EvaluatedEntity; rejected: EvaluatedEntity[] } {
  const evaluated = entities.map((entity) => evaluateWikidataEntity(activity, entity, typeEntities)).sort((a, b) => b.score - a.score);
  const best = evaluated[0];
  if (!best) return { status: "unmatched", rejected: [] };
  const hasStrongName = best.signals.includes("exact_normalized_name") || best.signals.includes("strong_name_similarity");
  const fatal = best.rejectionReasons.some((reason) => /substring_only|weak_name|incompatible|coordinates_too_far/.test(reason));
  if (best.score >= 72 && hasStrongName && !fatal) return { status: "verified", best, rejected: evaluated.slice(1) };
  if (best.score >= 55 && hasStrongName && !fatal) return { status: "possible", best, rejected: evaluated.slice(1) };
  return { status: "unmatched", best, rejected: evaluated };
}

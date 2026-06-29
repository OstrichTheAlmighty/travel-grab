import type { CuratedActivity } from "./curation";
import { normalizeName, trigramSimilarity } from "./dedup";
import { haversineM } from "./attractions";
import { catalogClassification } from "./fsqCorrections";
import { classifyWikimediaEligibility } from "./wikimediaEligibility";
import type { CandidateRoute, WikidataEntity, WikimediaMatchStatus } from "./wikimediaTypes";

export interface EvaluatedEntity {
  entity: WikidataEntity;
  score: number;
  confidence: number;
  signals: string[];
  rejectionReasons: string[];
  distanceM?: number;
  typeLabels: string[];
  routes: CandidateRoute[];
  coordinateRadiusM: number;
  coordinatePolicy: string;
}

const BUSINESS_WORDS = /\b(company|business|shop|store|studio|cafe|restaurant|hotel|office|school|station|stadium|arena)\b|会社|店舗|スタジオ|カフェ|レストラン|ホテル|学校|駅|競技場/i;
const DISTRICT_WORDS = /district|neighbou?rhood|quarter|area|shopping street|street|town|crossing|intersection|地域|地区|街|商店街|交差点/i;
const LANDMARK_WORDS = /landmark|tower|monument|observation|tourist attraction|building|structure|palace|imperial residence|タワー|塔|展望|建築|宮殿|皇居/i;
const SHRINE_WORDS = /shrine|shinto|jinja|temple|buddhist|神社|神宮|寺|仏教/i;
const PARK_WORDS = /park|garden|公園|庭園/i;
const NON_PLACE_ENTITY_WORDS = /novel|literary work|book|television (?:series|program)|song|album|fictional|taxon|species|type of |class of |form of |magazine|musical group|video game|amusement ride consisting|小説|文学作品|映画|楽曲|雑誌|音楽グループ|ゲーム|架空/i;
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

export function typeCompatibility(activity: CuratedActivity, candidateText: string): { compatible: boolean; explicit: boolean; reason?: string } {
  const source = categoryText(activity);
  const candidate = candidateText.toLowerCase();
  const district = /neighborhood|shopping plaza|shopping mall|road|intersection/.test(source);
  const shrine = /shrine|temple|spiritual/.test(source);
  const park = /landmarks and outdoors > (?:park|garden)/.test(source);
  const museum = /museum|gallery/.test(source);
  const amusement = /amusement|attraction|zoo|aquarium/.test(source);
  const landmark = /monument|scenic lookout|historic|palace/.test(source);
  const market = /market/.test(source);

  if (NON_PLACE_ENTITY_WORDS.test(candidate)) return { compatible: false, explicit: true, reason: "non_place_entity_type_incompatible" };
  if (CLOSED_ENTITY_WORDS.test(candidate)) return { compatible: false, explicit: true, reason: "closed_or_destroyed_entity_incompatible" };
  if ((district || shrine || park || museum || landmark) && BUSINESS_WORDS.test(candidate)) return { compatible: false, explicit: true, reason: "business_entity_type_incompatible" };
  if (market) return /market|市場|マーケット/i.test(candidate) && !/merchant|vendor|shop|store|restaurant|商店|店舗/i.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "market_entity_type_incompatible" };
  if (district) return DISTRICT_WORDS.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "district_entity_type_incompatible" };
  if (shrine) return SHRINE_WORDS.test(candidate) && !/stadium|arena|競技場/i.test(candidate) ? { compatible: true, explicit: true } : { compatible: false, explicit: true, reason: "shrine_entity_type_incompatible" };
  if (museum && /museum|gallery|美術館|博物館|記念館/i.test(candidate)) return { compatible: true, explicit: true };
  if (park && PARK_WORDS.test(candidate)) return { compatible: true, explicit: true };
  if (landmark && LANDMARK_WORDS.test(candidate)) return { compatible: true, explicit: true };
  if (amusement && /amusement|theme park|attraction|ride|zoo|aquarium|entertainment|exhibition|遊園|動物園|水族館|展覧会/i.test(candidate)) return { compatible: true, explicit: true };
  if (museum || park || landmark || amusement) return { compatible: false, explicit: true, reason: museum ? "museum_entity_type_incompatible" : park ? "park_entity_type_incompatible" : landmark ? "landmark_entity_type_incompatible" : "attraction_entity_type_incompatible" };
  if (BUSINESS_WORDS.test(candidate) && !/food|nightlife|luxury/.test(activity.category)) return { compatible: false, explicit: true, reason: "business_entity_type_incompatible" };
  return { compatible: true, explicit: false };
}

export function coordinateRadiusPolicy(activity: CuratedActivity): { radiusM: number; policy: string } {
  const source = categoryText(activity);
  if (catalogClassification(activity) === "metro_excursion") return { radiusM: 2_500, policy: "metro_excursion_2500m" };
  if (/neighborhood|shopping plaza|shopping mall|intersection|road/.test(source)) return { radiusM: 2_000, policy: "district_or_neighborhood_2000m" };
  if (/park|garden|amusement park|zoo|aquarium/.test(source)) return { radiusM: 1_200, policy: "park_or_large_complex_1200m" };
  if (/historic|market|palace/.test(source)) return { radiusM: 800, policy: "historic_or_market_800m" };
  return { radiusM: 400, policy: "building_or_individual_attraction_400m" };
}

export function evaluateWikidataEntity(activity: CuratedActivity, entity: WikidataEntity, typeEntities: Map<string, WikidataEntity> = new Map(), routes: CandidateRoute[] = []): EvaluatedEntity {
  const sourceNames = activityNames(activity);
  const candidateNames = entityNames(entity);
  const normalizedSources = sourceNames.map(normalizeName).filter(Boolean);
  const normalizedCandidates = candidateNames.map(normalizeName).filter(Boolean);
  const exact = normalizedSources.some((name) => normalizedCandidates.includes(name));
  const bestSimilarity = Math.max(0, ...normalizedSources.flatMap((left) => normalizedCandidates.map((right) => trigramSimilarity(left, right))));
  const substringOnly = !exact && normalizedSources.some((left) => normalizedCandidates.some((right) => left.length >= 3 && (right.includes(left) || left.includes(right))));
  const qualifiedSuffix = !exact && normalizedSources.some((left) => normalizedCandidates.some((right) => {
    if (!right.startsWith(`${left} `)) return false;
    const extras = right.slice(left.length).trim().split(/\s+/);
    return extras.length <= 4 && extras.every((token) => ["tokyo", "japan", "dmm", "com", "museum", "temple", "park", "garden"].includes(token));
  }));
  const signals: string[] = [];
  const rejectionReasons: string[] = [];
  let score = 0;
  if (exact) { score += 52; signals.push("exact_normalized_name"); }
  else if (qualifiedSuffix) { score += 46; signals.push("strong_name_qualified_suffix"); }
  else if (bestSimilarity >= 0.72) { score += 38; signals.push("strong_name_similarity"); }
  else if (bestSimilarity >= 0.62 && !substringOnly) { score += 25; signals.push("moderate_name_similarity"); }
  else rejectionReasons.push(substringOnly ? "substring_only_name_evidence" : "weak_name_evidence");

  const typeLabels = entityTypeIds(entity).flatMap((id) => {
    const type = typeEntities.get(id);
    return [type?.labels?.en?.value, type?.labels?.ja?.value].filter((value): value is string => Boolean(value));
  });
  const descriptor = [entity.labels?.en?.value, entity.labels?.ja?.value, entity.descriptions?.en?.value, entity.descriptions?.ja?.value, ...typeLabels].filter(Boolean).join(" ");
  const compatibility = typeCompatibility(activity, descriptor);
  if (compatibility.compatible) { score += compatibility.explicit ? 18 : 7; signals.push(compatibility.explicit ? "compatible_entity_type" : "no_incompatible_entity_type"); }
  else rejectionReasons.push(compatibility.reason ?? "entity_type_incompatible");

  const coords = entityCoordinates(entity);
  const radius = coordinateRadiusPolicy(activity);
  let distanceM: number | undefined;
  if (coords && typeof activity.lat === "number" && typeof activity.lng === "number") {
    distanceM = haversineM(activity.lat, activity.lng, coords.lat, coords.lng);
    if (distanceM <= Math.min(150, radius.radiusM / 3)) { score += 20; signals.push("coordinates_strong_within_policy"); }
    else if (distanceM <= radius.radiusM) { score += 12; signals.push("coordinates_within_type_radius"); }
    else rejectionReasons.push("coordinates_too_far");
  } else signals.push("wikidata_coordinates_unavailable");

  if (routes.includes("jawiki_search") || routes.includes("enwiki_search")) { score += 8; signals.push("wikipedia_page_resolution"); }
  if (entity.sitelinks?.jawiki || entity.sitelinks?.enwiki) { score += 6; signals.push("entity_has_wikipedia_sitelink"); }
  if (routes.includes("nearby_wikidata")) signals.push("nearby_candidate_generation_only");

  const locality = String(activity.source_metadata?.locality ?? "");
  if (locality && descriptor.toLowerCase().includes(locality.toLowerCase())) { score += 5; signals.push("locality_evidence"); }
  const fatal = rejectionReasons.some((reason) => /substring_only|weak_name|incompatible|coordinates_too_far/.test(reason));
  if (fatal) score = Math.min(score, 54);
  return { entity, score, confidence: Math.min(1, score / 98), signals, rejectionReasons, distanceM, typeLabels, routes, coordinateRadiusM: radius.radiusM, coordinatePolicy: radius.policy };
}

export function chooseWikidataMatch(activity: CuratedActivity, entities: WikidataEntity[], typeEntities: Map<string, WikidataEntity> = new Map(), candidateRoutes: Map<string, CandidateRoute[]> = new Map()): { status: WikimediaMatchStatus; best?: EvaluatedEntity; rejected: EvaluatedEntity[]; evaluated: EvaluatedEntity[] } {
  const evaluated = entities.map((entity) => evaluateWikidataEntity(activity, entity, typeEntities, candidateRoutes.get(entity.id) ?? [])).sort((a, b) => b.score - a.score);
  const best = evaluated[0];
  if (!best) return { status: "unmatched", rejected: [], evaluated: [] };
  const hasStrongName = best.signals.includes("exact_normalized_name") || best.signals.includes("strong_name_similarity") || best.signals.includes("strong_name_qualified_suffix");
  const fatal = best.rejectionReasons.some((reason) => /substring_only|weak_name|incompatible|coordinates_too_far/.test(reason));
  const coordinateEvidence = best.signals.includes("coordinates_strong_within_policy") || best.signals.includes("coordinates_within_type_radius");
  const resolvedWikipedia = best.signals.includes("wikipedia_page_resolution") || best.signals.includes("entity_has_wikipedia_sitelink");
  const explicitType = best.signals.includes("compatible_entity_type");
  const eligibleForAutomaticMatch = classifyWikimediaEligibility(activity).eligibility !== "not_expected_to_have_wikimedia_entity" || coordinateEvidence;
  if (best.score >= 76 && hasStrongName && !fatal && eligibleForAutomaticMatch && (coordinateEvidence || (resolvedWikipedia && explicitType))) return { status: "verified", best, rejected: evaluated.slice(1), evaluated };
  if (best.score >= 58 && hasStrongName && !fatal) return { status: "probable_manual_review", best, rejected: evaluated.slice(1), evaluated };
  if (fatal) return { status: "rejected", best, rejected: evaluated, evaluated };
  return { status: "unmatched", best, rejected: evaluated, evaluated };
}

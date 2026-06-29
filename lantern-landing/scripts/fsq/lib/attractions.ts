import type { NormalizedActivity } from "../../../lib/activities/types";
import { getGoogleCoords, type GoogleRow } from "../../activities/lib/google";
import { haversineM } from "../../activities/lib/geo";
import { normalizeName, trigramSimilarity } from "./dedup";
import { categoriesFromRow } from "./categoryMap";
import { rejectionReason } from "./relevanceFilter";
import type { FsqRawRow } from "./types";

export interface MajorAttractionDefinition {
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  compatibleCategory: RegExp;
}

export interface MajorAttractionResult {
  name: string;
  rawStatus: "present" | "absent" | "outside_selected_area";
  retained: boolean;
  filteredReason?: string;
  fsqPlaceId?: string;
  fsqName?: string;
  fsqCategory?: string;
  distanceFromGoogleM?: number;
  googleBenchmarkName?: string;
}

export const TOKYO_MAJOR_ATTRACTIONS: MajorAttractionDefinition[] = [
  ["Sensō-ji", ["浅草寺", "senso ji", "sensoji", "senso-ji temple"], 35.7147, 139.7967, /temple|historic|landmark/i],
  ["Meiji Jingū", ["明治神宮", "meiji jingu", "meiji shrine"], 35.6764, 139.6993, /shrine|historic|landmark/i],
  ["Tokyo Skytree", ["東京スカイツリー", "tokyo skytree", "tokyo sky tree"], 35.7101, 139.8107, /observation|landmark|tower|attraction/i],
  ["Tokyo Tower", ["東京タワー", "tokyo tower"], 35.6586, 139.7454, /observation|landmark|tower|attraction/i],
  ["Shibuya Crossing", ["渋谷スクランブル交差点", "渋谷駅前スクランブル交差点", "shibuya crossing", "shibuya scramble", "shibuya scramble crossing"], 35.6595, 139.7004, /intersection|landmark|plaza|attraction/i],
  ["Imperial Palace", ["皇居", "tokyo imperial palace", "imperial palace"], 35.6852, 139.7528, /palace|historic|landmark|garden/i],
  ["Ueno Park", ["上野恩賜公園", "上野公園", "ueno park"], 35.7141, 139.7741, /park|garden/i],
  ["Tokyo National Museum", ["東京国立博物館", "tokyo national museum"], 35.7188, 139.7762, /museum/i],
  ["teamLab Planets", ["チームラボプラネッツ", "teamlab planets", "team lab planets"], 35.6441, 139.7916, /museum|art|attraction/i],
  ["Tsukiji Outer Market", ["築地場外市場", "tsukiji outer market"], 35.6654, 139.7706, /market/i],
  ["Shinjuku Gyoen", ["新宿御苑", "shinjuku gyoen national garden", "shinjuku gyoen"], 35.6851, 139.7102, /garden|park/i],
  ["Akihabara", ["秋葉原", "akihabara electric town", "akihabara"], 35.6984, 139.7731, /neighborhood|landmark|plaza|shopping|retail/i],
  ["Harajuku", ["原宿", "harajuku", "takeshita street"], 35.6702, 139.7027, /neighborhood|landmark|street|shopping|retail/i],
  ["Odaiba", ["お台場", "odaiba", "daiba"], 35.6269, 139.7750, /neighborhood|landmark|plaza|attraction/i],
  ["Ghibli Museum", ["三鷹の森ジブリ美術館", "ghibli museum"], 35.6963, 139.5702, /museum/i],
  ["Tokyo Disneyland", ["東京ディズニーランド", "tokyo disneyland"], 35.6329, 139.8804, /theme park|amusement/i],
  ["Tokyo DisneySea", ["東京ディズニーシー", "tokyo disneysea", "tokyo disney sea"], 35.6267, 139.8856, /theme park|amusement/i],
].map(([name, aliases, lat, lng, compatibleCategory]) => ({ name, aliases, lat, lng, compatibleCategory })) as MajorAttractionDefinition[];

export { haversineM } from "../../activities/lib/geo";

function strongNameEvidence(candidate: string, aliases: string[]): boolean {
  const normalized = normalizeName(candidate);
  const normalizedAliases = aliases.map(normalizeName);
  if (normalizedAliases.includes(normalized)) return true;
  const aliasPhrasesPresent = normalizedAliases.filter((alias) =>
    [...alias].length >= 2 && (` ${normalized} `).includes(` ${alias} `),
  );
  if (aliasPhrasesPresent.length >= 2) return true;
  return normalizedAliases.some((target) => {
    const candidateTokens = new Set(normalized.split(/\s+/).filter(Boolean));
    const targetTokens = new Set(target.split(/\s+/).filter(Boolean));
    const overlap = [...targetTokens].filter((token) => candidateTokens.has(token)).length;
    const coverage = targetTokens.size ? overlap / targetTokens.size : 0;
    const extras = [...candidateTokens].filter((token) => !targetTokens.has(token));
    const allowedExtras = new Set(["temple", "shrine", "museum", "park", "garden", "market", "palace", "tower", "national"]);
    return coverage === 1 && targetTokens.size >= 2 && extras.every((token) => allowedExtras.has(token)) && trigramSimilarity(normalized, target) >= 0.58;
  });
}

export function matchesMajorAttraction(
  definition: MajorAttractionDefinition,
  candidate: { name: string; lat: number; lng: number; categoryText: string },
  benchmark = { lat: definition.lat, lng: definition.lng },
): boolean {
  const distance = haversineM(candidate.lat, candidate.lng, benchmark.lat, benchmark.lng);
  return distance <= 600 && definition.compatibleCategory.test(candidate.categoryText) && strongNameEvidence(candidate.name, definition.aliases);
}

export function findGoogleAttractionBenchmark(definition: MajorAttractionDefinition, google: GoogleRow[]): { name: string; lat: number; lng: number } {
  const exact = google.filter((row) => {
    const coords = getGoogleCoords(row);
    return Boolean(coords && strongNameEvidence(row.title, definition.aliases) && haversineM(coords!.lat, coords!.lng, definition.lat, definition.lng) <= 1_000);
  }).sort((a, b) => {
    const ac = getGoogleCoords(a)!;
    const bc = getGoogleCoords(b)!;
    return haversineM(ac.lat, ac.lng, definition.lat, definition.lng) - haversineM(bc.lat, bc.lng, definition.lat, definition.lng);
  })[0];
  const coords = exact ? getGoogleCoords(exact) : null;
  return { name: exact?.title ?? definition.name, lat: coords?.lat ?? definition.lat, lng: coords?.lng ?? definition.lng };
}

export function evaluateMajorAttractions(
  raw: FsqRawRow[],
  retained: NormalizedActivity[],
  google: GoogleRow[] = [],
): MajorAttractionResult[] {
  return TOKYO_MAJOR_ATTRACTIONS.map((definition) => {
    const benchmark = findGoogleAttractionBenchmark(definition, google);
    const candidates = raw.filter((row) => typeof row.latitude === "number" && typeof row.longitude === "number").map((row) => ({
      row,
      name: row.name ?? "",
      lat: row.latitude!,
      lng: row.longitude!,
      categoryText: categoriesFromRow(row).map((category) => category.name).join(" "),
    }));
    const match = candidates.filter((candidate) => matchesMajorAttraction(definition, candidate, benchmark))
      .sort((a, b) => haversineM(a.lat, a.lng, benchmark.lat, benchmark.lng) - haversineM(b.lat, b.lng, benchmark.lat, benchmark.lng))[0];
    if (!match) return { name: definition.name, rawStatus: "absent", retained: false, googleBenchmarkName: benchmark.name };
    const retainedMatch = retained.find((activity) => activity.source_record_id === match.row.fsq_place_id);
    return {
      name: definition.name,
      rawStatus: "present",
      retained: Boolean(retainedMatch),
      filteredReason: retainedMatch ? undefined : rejectionReason(match.row),
      fsqPlaceId: match.row.fsq_place_id ?? undefined,
      fsqName: match.row.name ?? undefined,
      fsqCategory: match.categoryText,
      distanceFromGoogleM: haversineM(match.lat, match.lng, benchmark.lat, benchmark.lng),
      googleBenchmarkName: benchmark.name,
    };
  });
}

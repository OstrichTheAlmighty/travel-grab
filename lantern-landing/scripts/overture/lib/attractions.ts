/**
 * Tokyo major-attraction coverage checker.
 *
 * Checks whether well-known Tokyo landmarks appear in a filtered Overture
 * activity list. Does NOT query raw Overture rows (unavailable to compare.ts);
 * if an attraction is absent from the retained output it is reported as
 * "not_in_overture" — the user can investigate the raw data separately.
 *
 * Do not hardcode these attractions into the main inventory.
 */

import type { NormalizedActivity } from "../../../lib/activities/types";
import { normalizeName } from "../../activities/lib/names";
import type { AttractionStatus, BoundingBox } from "../../activities/lib/types";

// ── Attraction list ───────────────────────────────────────────────────────────

interface AttractionDef {
  /** Canonical English name used in the report */
  name: string;
  /** All name variants to search for (Japanese, English, romanizations) */
  aliases: string[];
  /** Approximate coordinates for "outside bbox" detection */
  approxLat?: number;
  approxLng?: number;
}

// Coordinates are approximate; used only to decide "outside bbox" for edge cases.
const TOKYO_ATTRACTIONS: AttractionDef[] = [
  {
    name: "Senso-ji",
    aliases: ["浅草寺", "sensoji", "senso-ji", "senso ji", "asakusa temple", "asakusa kannon"],
    approxLat: 35.7147, approxLng: 139.7967,
  },
  {
    name: "Meiji Shrine",
    aliases: ["明治神宮", "meiji jingu", "meiji jingū", "meiji shrine", "meiji-jingu"],
    approxLat: 35.6764, approxLng: 139.6993,
  },
  {
    name: "Tokyo Skytree",
    aliases: ["東京スカイツリー", "tokyo skytree", "skytree", "sky tree"],
    approxLat: 35.7101, approxLng: 139.8107,
  },
  {
    name: "Tokyo Tower",
    aliases: ["東京タワー", "tokyo tower"],
    approxLat: 35.6586, approxLng: 139.7454,
  },
  {
    name: "Shibuya Crossing",
    aliases: ["渋谷スクランブル交差点", "shibuya crossing", "shibuya scramble", "shibuya scramble crossing"],
    approxLat: 35.6595, approxLng: 139.7004,
  },
  {
    name: "Imperial Palace",
    aliases: ["皇居", "imperial palace", "kokyo", "tokyo imperial palace"],
    approxLat: 35.6852, approxLng: 139.7528,
  },
  {
    name: "Ueno Park",
    aliases: ["上野公園", "ueno park", "ueno koen", "ueno onshi koen"],
    approxLat: 35.7141, approxLng: 139.7741,
  },
  {
    name: "Tokyo National Museum",
    aliases: ["東京国立博物館", "tokyo national museum", "tnm", "tokyo kokuritsu hakubutsukan"],
    approxLat: 35.7188, approxLng: 139.7762,
  },
  {
    name: "teamLab Planets",
    aliases: ["チームラボプラネッツ", "teamlab planets", "team lab planets", "teamlab"],
    approxLat: 35.6441, approxLng: 139.7916,
  },
  {
    name: "Tsukiji Outer Market",
    aliases: ["築地場外市場", "tsukiji outer market", "tsukiji market", "tsukiji jogai ichiba"],
    approxLat: 35.6654, approxLng: 139.7706,
  },
  {
    name: "Shinjuku Gyoen",
    aliases: ["新宿御苑", "shinjuku gyoen", "shinjuku gyoen national garden", "shinjuku national garden"],
    approxLat: 35.6851, approxLng: 139.7102,
  },
  {
    name: "Akihabara",
    aliases: ["秋葉原", "akihabara", "electric town", "akiba"],
    approxLat: 35.6984, approxLng: 139.7731,
  },
  {
    name: "Harajuku",
    aliases: ["原宿", "harajuku", "takeshita street", "takeshita dori"],
    approxLat: 35.6702, approxLng: 139.7027,
  },
  {
    name: "Odaiba",
    aliases: ["お台場", "odaiba", "daiba"],
    approxLat: 35.6269, approxLng: 139.7750,
  },
  {
    name: "Ghibli Museum",
    aliases: ["三鷹の森ジブリ美術館", "ghibli museum", "mitaka ghibli museum", "studio ghibli museum"],
    approxLat: 35.6963, approxLng: 139.5702,
  },
  {
    name: "Tokyo Disneyland",
    aliases: ["東京ディズニーランド", "tokyo disneyland", "disneyland japan"],
    approxLat: 35.6329, approxLng: 139.8804,
  },
  {
    name: "Tokyo DisneySea",
    aliases: ["東京ディズニーシー", "tokyo disneysea", "tokyo disney sea", "disneysea"],
    approxLat: 35.6267, approxLng: 139.8856,
  },
];

// ── Name search helpers ───────────────────────────────────────────────────────

function buildAliasSet(defs: string[]): Set<string> {
  return new Set(defs.map((a) => normalizeName(a)));
}

function activityMatchesAliases(act: NormalizedActivity, aliasSet: Set<string>): boolean {
  // Check display title
  const normTitle = normalizeName(act.title);
  if (aliasSet.has(normTitle)) return true;
  for (const alias of aliasSet) {
    if (normTitle.includes(alias) || alias.includes(normTitle)) return true;
  }

  // Check local name
  if (act.name_local) {
    const normLocal = normalizeName(act.name_local);
    if (aliasSet.has(normLocal)) return true;
    for (const alias of aliasSet) {
      if (normLocal.includes(alias) || alias.includes(normLocal)) return true;
    }
  }

  // Check all alt names
  if (act.name_alts) {
    for (const v of Object.values(act.name_alts)) {
      const normAlt = normalizeName(v);
      if (aliasSet.has(normAlt)) return true;
      for (const alias of aliasSet) {
        if (normAlt.includes(alias) || alias.includes(normAlt)) return true;
      }
    }
  }

  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Checks Tokyo major-attraction coverage in a list of retained Overture activities.
 *
 * @param cityKey   Only "tokyo" is supported; returns [] for other cities.
 * @param activities Filtered / deduped Overture activities from importCity.ts output.
 * @param bbox      The bounding box used for the Overture query (for outside-bbox detection).
 */
export function checkAttractionCoverage(
  cityKey: string,
  activities: NormalizedActivity[],
  bbox: BoundingBox,
): AttractionStatus[] {
  if (cityKey !== "tokyo") return [];

  const results: AttractionStatus[] = [];

  for (const def of TOKYO_ATTRACTIONS) {
    const aliasSet = buildAliasSet(def.aliases);

    // Search retained activities
    const found = activities.find((a) => activityMatchesAliases(a, aliasSet));

    if (found) {
      results.push({
        name: def.name,
        finding: "found_and_retained",
        matchedTitle: found.title,
        matchedId:    found.id,
        lat: found.lat,
        lng: found.lng,
      });
      continue;
    }

    // Check whether the approximate location is outside the bbox
    // (handles edge cases like attractions just outside the query area)
    const outsideBbox =
      def.approxLat !== undefined && def.approxLng !== undefined &&
      (def.approxLat < bbox.minLat || def.approxLat > bbox.maxLat ||
       def.approxLng < bbox.minLng || def.approxLng > bbox.maxLng);

    if (outsideBbox) {
      results.push({
        name: def.name,
        finding: "outside_bbox",
        lat: def.approxLat,
        lng: def.approxLng,
        note: `Approximate coordinates (${def.approxLat}, ${def.approxLng}) are outside the query bbox.`,
      });
    } else {
      results.push({
        name: def.name,
        finding: "not_in_overture",
        lat: def.approxLat,
        lng: def.approxLng,
        note:
          "Not found in retained Overture places. " +
          "Possible causes: filtered by relevance filter, absent from Overture dataset, " +
          "or name variant not matching any alias.",
      });
    }
  }

  return results;
}

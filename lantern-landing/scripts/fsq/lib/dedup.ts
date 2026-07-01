import type { FsqPlace } from "./types";
import { haversineM } from "../../activities/lib/geo";
import { normalizeName, trigramSimilarity } from "../../activities/lib/names";

export { normalizeName, trigramSimilarity } from "../../activities/lib/names";

/** Two places within this many metres are considered spatially co-located */
const DEDUP_RADIUS_M = 80;

/** Normalised name similarity threshold (Jaccard on trigrams) */
const NAME_SIMILARITY_THRESHOLD = 0.55;

/**
 * Returns true if two FsqPlace entries are likely the same real-world location.
 *
 * Criteria (both must hold):
 *   1. Within DEDUP_RADIUS_M metres of each other
 *   2. Normalised names satisfy at least one of:
 *        a. identical
 *        b. one is a prefix of the other
 *        c. trigram similarity >= threshold
 */
export function areDuplicates(a: FsqPlace, b: FsqPlace): boolean {
  const distM = haversineM(a.lat, a.lng, b.lat, b.lng);
  if (distM > DEDUP_RADIUS_M) return false;

  const sharedCategoryId = a.fsqCategoryIds.some((id) => b.fsqCategoryIds.includes(id));
  const categoriesCompatible = a.tgCategory === b.tgCategory || sharedCategoryId;
  if (!categoriesCompatible) return false;

  const na = normalizeName(a.nameEnglish || a.namePrimary);
  const nb = normalizeName(b.nameEnglish || b.namePrimary);

  if (!na || !nb) return false;
  if (na === nb) return true;

  if (na.startsWith(nb) || nb.startsWith(na)) return true;

  return trigramSimilarity(na, nb) >= NAME_SIMILARITY_THRESHOLD;
}

/**
 * Deduplicates a list of FsqPlace entries.
 *
 * Algorithm:
 *   - For each place (sorted high-quality-first), check if it overlaps
 *     any already-accepted "canonical" place using areDuplicates().
 *   - If it does, mark as duplicate of the canonical.
 *   - If it doesn't, add to canonical set.
 *
 * Mutates the input array's `isDuplicate` / `duplicateOf` fields and returns
 * the same array.
 */
export function deduplicateFsqPlaces(places: FsqPlace[]): FsqPlace[] {
  places.sort((a, b) => b.qualityScore - a.qualityScore);

  const grid = new Map<string, FsqPlace[]>();
  const cellSize = 0.001;
  const cell = (lat: number, lng: number) => [Math.floor(lat / cellSize), Math.floor(lng / cellSize)] as const;

  for (const place of places) {
    const [latCell, lngCell] = cell(place.lat, place.lng);
    const nearby: FsqPlace[] = [];
    for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
      for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
        nearby.push(...(grid.get(`${latCell + latOffset}:${lngCell + lngOffset}`) ?? []));
      }
    }
    const match = nearby.find((candidate) => areDuplicates(candidate, place));
    if (match) {
      place.isDuplicate = true;
      place.duplicateOf = match.id;
    } else {
      const key = `${latCell}:${lngCell}`;
      const bucket = grid.get(key) ?? [];
      bucket.push(place);
      grid.set(key, bucket);
    }
  }

  return places;
}

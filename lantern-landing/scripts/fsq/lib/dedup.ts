import type { FsqPlace } from "./types";

/** Two places within this many metres are considered spatially co-located */
const DEDUP_RADIUS_M = 80;

/** Normalised name similarity threshold (Jaccard on trigrams) */
const NAME_SIMILARITY_THRESHOLD = 0.55;

/** Haversine distance in metres between two lat/lng points */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Normalise a place name for comparison: lower-case, strip punctuation/accents */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // strip combining diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build the set of character trigrams for a string */
function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

/** Jaccard similarity of two trigram sets (0-1) */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

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

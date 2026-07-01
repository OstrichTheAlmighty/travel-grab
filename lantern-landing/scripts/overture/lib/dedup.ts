import type { OverturePlace } from "./types";
import { haversineM } from "../../activities/lib/geo";
import { normalizeName, trigramSimilarity } from "../../activities/lib/names";

export { normalizeName } from "../../activities/lib/names";

/** Two places within this many metres are considered spatially co-located */
const DEDUP_RADIUS_M = 80;

/** Normalised name similarity threshold (Jaccard on trigrams) */
const NAME_SIMILARITY_THRESHOLD = 0.55;

/**
 * Returns true if two places are likely the same real-world location.
 *
 * Criteria (both must hold):
 *   1. Within DEDUP_RADIUS_M metres of each other
 *   2. Normalised names satisfy at least one of:
 *        a. identical
 *        b. one is a prefix of the other (e.g. "Tokyo Tower" ⊂ "Tokyo Tower Observation Deck")
 *        c. trigram similarity >= threshold
 */
export function areDuplicates(a: OverturePlace, b: OverturePlace): boolean {
  const distM = haversineM(a.lat, a.lng, b.lat, b.lng);
  if (distM > DEDUP_RADIUS_M) return false;

  const na = normalizeName(a.nameEnglish || a.namePrimary);
  const nb = normalizeName(b.nameEnglish || b.namePrimary);

  if (na === nb) return true;

  // Prefix match handles "Tokyo Tower" ↔ "Tokyo Tower Observation Deck"
  if (na.startsWith(nb) || nb.startsWith(na)) return true;

  return trigramSimilarity(na, nb) >= NAME_SIMILARITY_THRESHOLD;
}

/**
 * Deduplicates a list of OverturePlace entries.
 *
 * Algorithm:
 *   - For each place (sorted high-quality-first), check if it overlaps
 *     any already-accepted "canonical" place using areDuplicates().
 *   - If it does, mark as duplicate of the canonical.
 *   - If it doesn't, add to canonical set.
 *
 * Mutates the input array's `isDuplicate` / `duplicateOf` fields and returns
 * the same array (to avoid a copy of potentially large datasets).
 */
export function deduplicatePlaces(places: OverturePlace[]): OverturePlace[] {
  // High quality first so the best record becomes the canonical
  places.sort((a, b) => b.qualityScore - a.qualityScore);

  const canonicals: OverturePlace[] = [];

  for (const place of places) {
    const match = canonicals.find((c) => areDuplicates(c, place));
    if (match) {
      place.isDuplicate = true;
      place.duplicateOf = match.id;
    } else {
      canonicals.push(place);
    }
  }

  return places;
}

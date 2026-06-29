/**
 * Multi-signal place matcher for Overture ↔ Google inventory comparison.
 *
 * Signals used:
 *   1. Exact normalized-name match within 500 m        → confirmed_match
 *   2. Prefix name match within 500 m                  → confirmed_match (if strong enough)
 *   3. High token-Jaccard (≥ 0.65) + catOK + ≤ 150 m → confirmed_match
 *   4. Medium token-Jaccard (≥ 0.40) + ≤ 300 m        → possible_match
 *   5. Proximity only, no name evidence                → rejected_match
 *   6. Category conflict                               → heavy penalty (× 0.3)
 *
 * Non-matches:
 *   - Generic / placeholder names are never used as evidence
 *   - Proximity alone is never enough to confirm a match
 */

import { haversineM } from "../../activities/lib/geo";
import { getGoogleCoords, type GoogleRow } from "../../activities/lib/google";
import {
  areCategoriesCompatible,
  isPlaceholderName,
  isWeakName,
  tokenJaccard,
} from "../../activities/lib/matching";
import { normalizeName } from "../../activities/lib/names";
import type { MatchDecision, PlaceMatch } from "./types";

export { getGoogleCoords } from "../../activities/lib/google";
export type { GoogleRow } from "../../activities/lib/types";
export {
  areCategoriesCompatible,
  isPlaceholderName,
  isWeakName,
  tokenJaccard,
} from "../../activities/lib/matching";

// ── Input shape ───────────────────────────────────────────────────────────────

export interface OvertureMatchInput {
  id: string;
  /** English display title */
  title: string;
  /** Local-language primary name (e.g. Japanese) */
  namePrimary: string;
  /** All language variants keyed by BCP-47 code */
  altNames: Record<string, string>;
  lat: number;
  lng: number;
  category: string;
}

// ── Core matcher ──────────────────────────────────────────────────────────────

/**
 * Finds the best matching Google row for a given Overture place.
 *
 * Returns:
 *   - confirmed_match  when name evidence is strong enough
 *   - possible_match   when evidence is suggestive but not definitive
 *   - rejected_match   when a proximity candidate exists but name/category signals reject it
 *   - null             when no Google place is within maxRadiusM
 */
export function matchOvertureToGoogle(
  ov: OvertureMatchInput,
  candidates: GoogleRow[],
  maxRadiusM = 500,
): { row: GoogleRow; match: PlaceMatch } | null {
  // Build the set of normalized name forms for this Overture place
  const ovNames: string[] = [];
  const addName = (n: string | null | undefined) => {
    if (!n) return;
    const norm = normalizeName(n);
    if (!isWeakName(norm)) ovNames.push(norm);
  };
  addName(ov.title);
  if (ov.namePrimary !== ov.title) addName(ov.namePrimary);
  for (const v of Object.values(ov.altNames)) addName(v);

  // If the raw title is a placeholder, we can still match via other name forms
  const ovTitleIsPlaceholder = isPlaceholderName(ov.title);

  let bestResult: { row: GoogleRow; match: PlaceMatch } | null = null;
  let bestScore = -1;

  for (const g of candidates) {
    const coords = getGoogleCoords(g);
    if (!coords) continue;

    const dist = haversineM(ov.lat, ov.lng, coords.lat, coords.lng);
    if (dist > maxRadiusM) continue;

    const gNorm = normalizeName(g.title);
    const gIsPlaceholder = isPlaceholderName(g.title);

    const signals: string[] = [];

    // ── Name scoring ──────────────────────────────────────────────────────────
    let nameScore = 0;
    let exactMatch = false;

    if (ovNames.length === 0 || ovTitleIsPlaceholder) {
      // No usable Overture names at all → proximity-only candidate
      signals.push("weak_overture_name");
    } else if (gIsPlaceholder || isWeakName(gNorm)) {
      // Google name is generic/placeholder
      signals.push("weak_google_name");
    } else {
      for (const ovN of ovNames) {
        if (ovN === gNorm) {
          exactMatch = true;
          nameScore = 1.0;
          signals.push(`exact:"${ovN.slice(0, 28)}"`);
          break;
        }

        // Prefix match: "Tokyo Tower" ↔ "Tokyo Tower Observation Deck"
        if (ovN.length > 4 && gNorm.length > 4) {
          if (ovN.startsWith(gNorm) || gNorm.startsWith(ovN)) {
            const shorter = Math.min(ovN.length, gNorm.length);
            const longer  = Math.max(ovN.length, gNorm.length);
            const score   = 0.85 * (shorter / longer);
            if (score > nameScore) {
              nameScore = score;
              signals.push(`prefix:${(shorter / longer).toFixed(2)}`);
            }
          }
        }

        // Token Jaccard
        const tok = tokenJaccard(ovN, gNorm);
        if (tok > 0 && tok * 0.9 > nameScore) {
          nameScore = tok * 0.9;
          signals.push(`token_jaccard:${tok.toFixed(2)}`);
        }
      }
    }

    // ── Category ──────────────────────────────────────────────────────────────
    const catOk = areCategoriesCompatible(ov.category, g.category);
    if (!catOk) {
      signals.push(`cat_conflict:${ov.category}≠${g.category}`);
      nameScore *= 0.3;
    } else if (g.category && ov.category === g.category) {
      signals.push(`cat_match:${ov.category}`);
      nameScore = Math.min(1, nameScore * 1.08);
    }

    // ── Distance modifier ─────────────────────────────────────────────────────
    let distMod: number;
    if (dist < 50)       { distMod = 1.00; signals.push(`dist:${dist.toFixed(0)}m`); }
    else if (dist < 150) { distMod = 0.95; signals.push(`dist:${dist.toFixed(0)}m`); }
    else if (dist < 300) { distMod = 0.85; signals.push(`dist:${dist.toFixed(0)}m`); }
    else                 { distMod = 0.70; signals.push(`dist:${dist.toFixed(0)}m`); }

    const finalScore = nameScore * distMod;

    // ── Decision ──────────────────────────────────────────────────────────────
    let decision: MatchDecision;

    if (nameScore === 0) {
      // Proximity candidate with no name signal
      if (dist < 80 && bestScore < 0) {
        // Record as rejected so the report can show "these were close but not matched"
        bestScore = 0;
        bestResult = {
          row: g,
          match: {
            decision: "rejected_match",
            confidence: 0,
            distanceM: dist,
            signals: [...signals, "proximity_only"],
            explanation: "Proximity-only candidate. No name evidence. Rejected.",
            googleId: g.id,
            overtureName: ov.title,
            googleName: g.title,
            overtureCategory: ov.category,
            googleCategory: g.category,
          },
        };
      }
      continue;
    }

    if (finalScore < 0.15) continue;

    if ((exactMatch || nameScore >= 0.85) && dist <= 500 && catOk) {
      decision = "confirmed_match";
    } else if (nameScore >= 0.65 && dist <= 150) {
      decision = catOk ? "confirmed_match" : "possible_match";
    } else if (finalScore >= 0.50 && dist <= 300 && catOk) {
      decision = "possible_match";
    } else if (finalScore >= 0.35) {
      decision = "possible_match";
    } else {
      decision = "rejected_match";
    }

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestResult = {
        row: g,
        match: {
          decision,
          confidence: finalScore,
          distanceM: dist,
          signals,
          explanation: signals.join("; "),
          googleId: g.id,
          overtureName: ov.title,
          googleName: g.title,
          overtureCategory: ov.category,
          googleCategory: g.category,
        },
      };
    }
  }

  return bestResult;
}

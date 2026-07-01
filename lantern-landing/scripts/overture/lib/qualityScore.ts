import type { OvertureRawRow } from "./types";

/**
 * 0-100 quality score for an Overture place.
 *
 * Scoring:
 *   Confidence ×30          → up to 30 (main Overture signal)
 *   Has English name        → 15
 *   Has coordinates         → 15
 *   Has website             → 12
 *   Has brand / chain name  → 3
 *   Has alternate names     → 5
 *   Has multiple websites   → 5  (extra authority signal)
 *   Has phone / address     → 5  (completeness bonus, approximate)
 *   Has full address        → 10
 */
export function calculateQualityScore(
  row: OvertureRawRow,
  hasEnglishName: boolean,
  altNameCount: number,
): number {
  let score = 0;

  // Overture confidence (0-1) → 0-30 points
  if (typeof row.confidence === "number") {
    score += Math.round(row.confidence * 30);
  }

  // Coordinates present
  if (typeof row.lat === "number" && typeof row.lng === "number") {
    score += 15;
  }

  // English name
  if (hasEnglishName) score += 15;

  // Website
  const websites = parseStringArray(row.websites);
  if (websites.length > 0)  score += 12;
  if (websites.length > 1)  score += 5;

  // Alternate names (multilingual richness)
  if (altNameCount > 0) score += 5;

  // Brand name → additional authority signal
  if (row.brand_name) score += 3;

  // Address completeness
  const addresses = parseStringArray(row.addresses);
  if (addresses.length > 0) score += 10;

  return Math.min(100, Math.max(0, score));
}

/** Parse DuckDB value that may come back as array or as stringified JSON */
function parseStringArray(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value) as unknown[]; } catch { return []; }
  }
  return [];
}

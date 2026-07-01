import { isTravelRelevantCategory, mapBasicCategory } from "./categoryMap";
import type { OvertureRawRow } from "./types";

/** Minimum confidence to include a place (0-1) */
const MIN_CONFIDENCE = 0.4;

/** Top-level category prefixes that are never travel-relevant regardless of subcategory */
const EXCLUDED_TOP_LEVEL = new Set([
  "accommodation",
  "automotive",
  "financial_services",
  "government",
  "health_and_medicine",
  "mass_media",
  "pets",
  "professional_services",
  "real_estate",
  "transportation",
  "utilities",
]);

// ── Name-based exclusion ──────────────────────────────────────────────────────
//
// Excludes names that are clearly placeholders or so generic that including
// them pollutes the travel inventory. Applied conservatively — if the name
// has ANY proper-noun context around the generic word, it passes through.
//
// Excluded:
//   - Placeholder codes: COMINGSOON, COMINGSOON_shibuya, VACANT
//   - Names that are ONLY a generic type word (exact match): "Studio", "スタジオ"
//   - Obvious rental/rehearsal-only labels: "レンタルスタジオ", "Rehearsal Room"
//
// NOT excluded:
//   - "Studio Ghibli" (has proper-noun prefix)
//   - "Roppongi Dance Lab." (has proper-noun context)
//   - "ABC Music Studio" (has identifying prefix)

/** Placeholder pattern: all-caps ASCII codes with no spaces (COMINGSOON, VACANT) */
const PLACEHOLDER_RE = /^[A-Z][A-Z0-9_-]{3,}$/;

/** Generic names that are ONLY a type word — exact normalized match triggers exclusion */
const GENERIC_EXACT = new Set([
  // Japanese
  "スタジオ",
  "レンタルスタジオ",
  "レンタルスペース",
  "貸しスペース",
  "リハーサルスタジオ",
  "練習スタジオ",
  "音楽スタジオ",
  // English
  "studio",
  "rental studio",
  "rehearsal room",
  "rehearsal studio",
  "rental room",
  "rental space",
  "practice room",
]);

/** Patterns that flag a name as a placeholder when the ENTIRE name matches */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^COMINGSOON/i,
  /^(COMING|OPEN|CLOSED)\s*SOON/i,
  /^TO\s+BE\s+(DETERMINED|ANNOUNCED)$/i,
  /^VACANT$/i,
  /^FOR\s+RENT$/i,
  /^空\s*室$/,       // empty room (Japanese)
  /^工\s*事\s*中$/,  // under construction (Japanese)
];

export function isExcludedByName(name: string): boolean {
  if (!name) return false;

  // Check placeholder patterns against raw name
  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(name)) return true;
  }

  // All-caps ASCII code with no spaces (COMINGSOON_shibuya stripped to COMINGSOON)
  const noSpace = name.replace(/[\s_-]/g, "");
  if (PLACEHOLDER_RE.test(noSpace) && noSpace.length >= 6) return true;

  // Exact generic name check (case-insensitive for ASCII, exact for CJK)
  const lower = name.toLowerCase().trim();
  if (GENERIC_EXACT.has(lower) || GENERIC_EXACT.has(name.trim())) return true;

  return false;
}

// ── Category helpers ──────────────────────────────────────────────────────────

/**
 * Returns the effective category string from a row, using priority order:
 *   1. taxonomy_primary   (current schema 2025+)
 *   2. category_primary   (legacy schema)
 *   3. basic_category     (current schema simplified)
 */
function effectiveCategory(row: OvertureRawRow): string | null {
  return row.taxonomy_primary ?? row.category_primary ?? row.basic_category ?? null;
}

// ── Main filter ───────────────────────────────────────────────────────────────

/**
 * Returns true if this raw Overture row should be kept for the travel inventory.
 *
 * Rejects:
 *   - missing or empty primary name
 *   - placeholder / generic-only names (COMINGSOON, "スタジオ", etc.)
 *   - no category across all schema variants
 *   - top-level categories that are never useful for travellers
 *   - category not mapping to any travel-relevant TG category
 *   - confidence below threshold (null passes through — unknown is not bad)
 *   - missing or out-of-range coordinates
 */
export function isTravelRelevant(row: OvertureRawRow): boolean {
  // Must have a usable name
  if (!row.name_primary || row.name_primary.trim().length === 0) return false;

  // Exclude placeholder and generic-only names
  if (isExcludedByName(row.name_primary)) return false;

  const cat = effectiveCategory(row);
  if (!cat) return false;

  // Fast reject on excluded top-level prefixes
  const topLevel = cat.includes(".") ? cat.slice(0, cat.indexOf(".")) : cat;
  if (EXCLUDED_TOP_LEVEL.has(topLevel)) return false;

  // Category relevance — dot-notation (taxonomy/legacy) or basic_category
  const isDotNotation = cat.includes(".");
  const isRelevant = isDotNotation
    ? isTravelRelevantCategory(cat)
    : (isTravelRelevantCategory(cat) || mapBasicCategory(cat) !== null);
  if (!isRelevant) return false;

  // Confidence gate
  if (typeof row.confidence === "number" && row.confidence < MIN_CONFIDENCE) return false;

  // Must have coordinates in valid range
  if (row.lat === null || row.lng === null) return false;
  if (typeof row.lat !== "number" || typeof row.lng !== "number") return false;
  if (row.lat < -90 || row.lat > 90 || row.lng < -180 || row.lng > 180) return false;

  return true;
}

/** Human-readable rejection reason for reporting */
export function rejectionReason(row: OvertureRawRow): string {
  if (!row.name_primary || row.name_primary.trim().length === 0) return "no_name";
  if (isExcludedByName(row.name_primary)) return "placeholder_name";
  const cat = effectiveCategory(row);
  if (!cat) return "no_category";
  const topLevel = cat.includes(".") ? cat.slice(0, cat.indexOf(".")) : cat;
  if (EXCLUDED_TOP_LEVEL.has(topLevel)) return "excluded_category";
  const isDotNotation = cat.includes(".");
  const isRelevant = isDotNotation
    ? isTravelRelevantCategory(cat)
    : (isTravelRelevantCategory(cat) || mapBasicCategory(cat) !== null);
  if (!isRelevant) return "not_travel_relevant";
  if (typeof row.confidence === "number" && row.confidence < MIN_CONFIDENCE) return "low_confidence";
  if (row.lat === null || row.lng === null) return "no_coordinates";
  return "valid";
}

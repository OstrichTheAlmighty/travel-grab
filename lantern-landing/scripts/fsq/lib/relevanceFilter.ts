import type { FsqRawRow } from "./types";
import { categoriesFromRow, mapFsqCategory } from "./categoryMap";

const DESTINATION_CATEGORY_RE = /neighborhood|district|historic district|entertainment district|shopping district|famous street|pedestrian street|intersection|pedestrian plaza|plaza|waterfront/i;
const KNOWN_DESTINATION_NAMES = new Set([
  "shibuya crossing", "shibuya scramble crossing", "渋谷駅前スクランブル交差点", "渋谷スクランブル交差点",
  "akihabara", "秋葉原", "harajuku", "原宿", "odaiba", "お台場",
]);

function normalizedDestinationName(name: string): string {
  return name.toLowerCase().normalize("NFKC").replace(/[（(][^()（）]+[）)]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function isTravelerDestination(row: FsqRawRow): boolean {
  if (!row.name) return false;
  const categories = categoriesFromRow(row);
  if (!categories.some((category) => DESTINATION_CATEGORY_RE.test(category.name))) return false;
  const normalized = normalizedDestinationName(row.name);
  if (KNOWN_DESTINATION_NAMES.has(normalized)) return true;
  return /\b(crossing|district|historic district|shopping district|entertainment district|waterfront|pedestrian street|plaza)\b/i.test(normalized)
    || /(交差点|地区|商店街|横丁|通り|広場|ウォーターフロント)$/.test(normalized);
}

// ── Excluded category names ───────────────────────────────────────────────────
//
// Categories that are NEVER travel-relevant regardless of the place name.

const EXCLUDED_CATEGORY_NAMES = new Set([
  "Office",
  "Corporate Office",
  "Government Office",
  "Warehouse",
  "Wholesale Store",
  "Private Residence",
  "Residential Building",
  "Apartment Complex",
  "Rehearsal Studio",
  "Rental Space",
  "Music Studio",
  "Hospital",
  "Clinic",
  "Pharmacy",
  "Bank",
  "ATM",
  "Gas Station",
  "Elementary School",
  "Middle School",
  "High School",
  "University",
  "Post Office",
  "Police Station",
  "Fire Station",
  "Urgent Care",
  "Dentist",
  "Dry Cleaner",
  "Laundry Service",
]);

// ── Placeholder name detection ────────────────────────────────────────────────

/** All-caps ASCII code pattern with no spaces, like COMINGSOON or VACANT */
const PLACEHOLDER_RE = /^[A-Z][A-Z0-9_-]{3,}$/;

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^COMINGSOON/i,
  /^(COMING|OPEN|CLOSED)\s*SOON/i,
  /^TO\s+BE\s+(DETERMINED|ANNOUNCED)$/i,
  /^VACANT$/i,
  /^FOR\s+RENT$/i,
  /^空\s*室$/,      // empty room (Japanese)
  /^工\s*事\s*中$/, // under construction (Japanese)
];

/** Generic-only names that provide no identity signal */
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

export function isGenericBusinessName(name: string): boolean {
  if (!name) return false;

  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(name)) return true;
  }

  const noSpace = name.replace(/[\s_-]/g, "");
  if (PLACEHOLDER_RE.test(noSpace) && noSpace.length >= 6) return true;

  const lower = name.toLowerCase().trim();
  if (GENERIC_EXACT.has(lower) || GENERIC_EXACT.has(name.trim())) return true;

  return /^(office|warehouse|service|services|company|corporation|rental room|meeting room|branch)(\s|$)/i.test(lower);
}

// ── Chain penalty ─────────────────────────────────────────────────────────────

interface ChainLike {
  name?: string;
}

/**
 * Returns true if ALL chains on a place are well-known low-value convenience
 * or fast-food brands that add little travel value.
 *
 * Used as a quality signal, not a hard filter.
 */
const LOW_VALUE_CHAIN_NAMES = new Set([
  // Convenience stores
  "7-Eleven", "FamilyMart", "Lawson", "MiniStop", "Daily Yamazaki",
  // Fast food (global)
  "McDonald's", "KFC", "Burger King", "Subway", "Wendy's",
  "Domino's Pizza", "Pizza Hut",
  // Coffee chains (borderline, but very common)
  "Starbucks", "Tully's Coffee",
  // Drugstores
  "Matsumoto Kiyoshi", "Welcia",
  // Others
  "AEON", "Seiyu", "Don Quijote",
]);

export function isLowValueChain(chains: ChainLike[]): boolean {
  if (chains.length === 0) return false;
  return chains.every((c) => c.name && LOW_VALUE_CHAIN_NAMES.has(c.name));
}

export function hasLowValueChainName(name: string): boolean {
  const normalized = name.toLowerCase();
  return [...LOW_VALUE_CHAIN_NAMES].some((chain) => normalized.includes(chain.toLowerCase()));
}

// ── Main filter ───────────────────────────────────────────────────────────────

/**
 * Returns true if the FSQ raw row should be kept for the travel inventory.
 *
 * Rejects:
 *   - missing or empty name
 *   - placeholder / generic-only names
 *   - no coordinates
 *   - date_closed is set (place has permanently closed)
 *   - all categories are explicitly excluded or non-travel-relevant
 */
export function isTravelRelevant(row: FsqRawRow): boolean {
  if (!row.name || row.name.trim().length === 0) return false;
  if (isGenericBusinessName(row.name)) return false;

  // Must have coordinates
  if (row.latitude === null || row.longitude === null) return false;
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return false;
  if (row.latitude < -90 || row.latitude > 90) return false;
  if (row.longitude < -180 || row.longitude > 180) return false;

  // Skip permanently closed places
  if (row.date_closed) return false;

  // Category check
  const categories = categoriesFromRow(row);
  if (categories.length === 0) return false;

  // Check if any category is excluded
  const hasExcluded = categories.some((c) =>
    EXCLUDED_CATEGORY_NAMES.has(c.name.split(">").at(-1)?.trim() ?? c.name),
  );
  if (hasExcluded) return false;

  // Check if at least one category maps to a travel-relevant TG category
  const hasTravelRelevant = categories.some((c) => mapFsqCategory(c.name) !== null)
    && (!categories.some((category) => DESTINATION_CATEGORY_RE.test(category.name)) || isTravelerDestination(row));
  if (!hasTravelRelevant) return false;

  return true;
}

/**
 * Human-readable rejection reason for reporting and tests.
 * Returns "valid" if the row passes all checks.
 */
export function rejectionReason(row: FsqRawRow): string {
  if (!row.name || row.name.trim().length === 0) return "no_name";
  if (isGenericBusinessName(row.name)) return "placeholder_name";
  if (row.latitude === null || row.longitude === null) return "no_coordinates";
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return "no_coordinates";
  if (row.date_closed) return "permanently_closed";

  const categories = categoriesFromRow(row);
  if (categories.length === 0) return "no_category";

  const hasExcluded = categories.some((c) =>
    EXCLUDED_CATEGORY_NAMES.has(c.name.split(">").at(-1)?.trim() ?? c.name),
  );
  if (hasExcluded) return "excluded_category";

  const hasTravelRelevant = categories.some((c) => mapFsqCategory(c.name) !== null)
    && (!categories.some((category) => DESTINATION_CATEGORY_RE.test(category.name)) || isTravelerDestination(row));
  if (!hasTravelRelevant) return "not_travel_relevant";

  return "valid";
}

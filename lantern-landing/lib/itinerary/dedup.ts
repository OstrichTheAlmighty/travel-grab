import type { PlannerActivity } from "./types";

// Location tokens to strip from titles when detecting duplicates
const LOCATION_TOKENS = new Set([
  "shinjuku", "shibuya", "ginza", "harajuku", "ueno", "akihabara",
  "ikebukuro", "asakusa", "roppongi", "omotesando", "omote-sando",
  "odaiba", "marunouchi", "yurakucho", "nihonbashi",
  "osaka", "kyoto", "tokyo", "hiroshima", "nara", "yokohama", "sapporo",
  "fukuoka", "nagoya", "okinawa", "namba", "umeda",
  "paris", "london", "amsterdam", "barcelona", "madrid", "rome",
  "station", "east", "west", "north", "south", "central",
  "branch", "location", "outlet", "original", "main", "store", "shop",
  "no", "no.", "1st", "2nd", "3rd",
]);

// Known chain keywords — enforce max-1-per-chain unless user explicitly saved multiple
const CHAIN_PATTERNS = [
  "mcdonald", "mcdonalds", "starbucks", "lawson", "family mart",
  "7-eleven", "seven-eleven", "ministop", "circle k",
  "sukiya", "yoshinoya", "matsuya", "gyudon",
  "ichiran", "ippudo", "fuunji", "rokurinsha",
  "uniqlo", "muji", "zara", "h&m",
  "tsutaya", "book off",
  "haagen-dazs", "baskin robbins", "31 ice",
];

export function normalizeForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, " ")   // strip Japanese/English parentheticals
    .replace(/[぀-ヿ一-鿿]+/g, " ")  // strip CJK (keep romaji)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length > 1 && !LOCATION_TOKENS.has(tok))
    .join(" ")
    .trim();
}

export function detectChainKey(title: string): string | null {
  const lc = title.toLowerCase();
  for (const chain of CHAIN_PATTERNS) {
    if (lc.includes(chain)) return chain;
  }
  return null;
}

/**
 * Remove duplicates and chain repeats from the activity list.
 * Priority-1 activities are never removed.
 * Returns the deduplicated list (order preserved).
 */
export function deduplicateActivities(activities: PlannerActivity[]): PlannerActivity[] {
  const seenNorm = new Map<string, string>();   // normalized → original title
  const seenChain = new Map<string, number>();  // chain key → count scheduled

  const result: PlannerActivity[] = [];

  for (const act of activities) {
    // Priority-1 always keeps (user explicitly saved as must-do)
    if (act.userPriority === 1) {
      result.push(act);
      const norm = normalizeForDedup(act.title);
      seenNorm.set(norm, act.title);
      const chain = detectChainKey(act.title);
      if (chain) seenChain.set(chain, (seenChain.get(chain) ?? 0) + 1);
      continue;
    }

    const norm = normalizeForDedup(act.title);

    // Near-duplicate title
    if (seenNorm.has(norm)) continue;

    // Chain cap
    const chain = detectChainKey(act.title);
    if (chain && (seenChain.get(chain) ?? 0) >= 1) continue;

    seenNorm.set(norm, act.title);
    if (chain) seenChain.set(chain, (seenChain.get(chain) ?? 0) + 1);
    result.push(act);
  }

  return result;
}

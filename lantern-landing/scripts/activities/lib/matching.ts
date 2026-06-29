const GENERIC_NAME_SET = new Set([
  "studio", "room", "office", "rental", "space", "lab", "lounge",
  "salon", "club", "school", "class", "center", "centre", "hall",
  "shop", "store", "spot", "place", "area", "zone",
]);

const PLACEHOLDER_RE = /^[A-Z][A-Z0-9_-]{3,}$/;

export function isWeakName(normalizedName: string): boolean {
  const name = normalizedName.trim();
  return name.length < 3 || GENERIC_NAME_SET.has(name);
}

export function isPlaceholderName(rawTitle: string): boolean {
  return PLACEHOLDER_RE.test(rawTitle.replace(/\s+/g, ""));
}

const COMPATIBLE_PAIRS = new Set([
  "food:nightlife", "nightlife:food",
  "food:culture", "culture:food",
  "food:luxury", "luxury:food",
  "food:hidden_gems", "hidden_gems:food",
  "culture:adventure", "adventure:culture",
  "culture:nature", "nature:culture",
  "culture:luxury", "luxury:culture",
  "culture:hidden_gems", "hidden_gems:culture",
  "nightlife:adventure", "adventure:nightlife",
  "nightlife:hidden_gems", "hidden_gems:nightlife",
  "nature:adventure", "adventure:nature",
  "nature:hidden_gems", "hidden_gems:nature",
  "luxury:hidden_gems", "hidden_gems:luxury",
  "luxury:adventure", "adventure:luxury",
]);

export function areCategoriesCompatible(a: string, b: string | null): boolean {
  return !b || a === b || COMPATIBLE_PAIRS.has(`${a}:${b}`);
}

export function tokenJaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  const left = new Set(a.split(/\s+/).filter((word) => word.length > 1));
  const right = new Set(b.split(/\s+/).filter((word) => word.length > 1));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

import type { Category } from "../../../app/activities/data/types";

// ── Category → seed keywords ──────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  culture:     ["things to do", "sightseeing", "attraction"],
  food:        ["food", "eat", "dining", "restaurant"],
  nightlife:   ["nightlife", "bar", "drinks", "night out"],
  adventure:   ["activity", "adventure", "fun"],
  nature:      ["nature", "outdoors", "park"],
  luxury:      ["luxury", "upscale", "premium"],
  hidden_gems: ["hidden gem", "local"],
};

// ── Overture subcategory → extra descriptive keywords ────────────────────────

const SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  // Culture
  "museum":                             ["museum"],
  "art_gallery":                        ["art gallery", "gallery"],
  "theater":                            ["theater", "theatre", "performing arts"],
  "performing_arts_venue":              ["performing arts", "show", "theater"],
  "shinto_shrine":                      ["shrine", "shinto"],
  "buddhist_temple":                    ["temple", "buddhist"],
  "church":                             ["church", "cathedral"],
  "mosque":                             ["mosque"],
  "palace":                             ["palace"],
  "castle":                             ["castle"],
  "monument":                           ["monument"],
  "memorial":                           ["memorial"],
  "historical_landmark":                ["historic site", "historical"],
  "ruins":                              ["ruins", "historic"],
  "observation_deck":                   ["observation deck", "views", "viewpoint"],
  "tourist_attraction":                 ["landmark", "attraction"],
  "tower":                              ["tower"],
  // Food
  "restaurant":                         ["restaurant"],
  "cafe":                               ["cafe", "coffee"],
  "coffee_shop":                        ["coffee shop", "cafe"],
  "bakery":                             ["bakery", "bread", "pastry"],
  "ramen":                              ["ramen", "noodles"],
  "sushi":                              ["sushi"],
  "izakaya":                            ["izakaya", "japanese pub"],
  "yakitori":                           ["yakitori", "grilled chicken"],
  "yakiniku":                           ["yakiniku", "barbecue", "bbq"],
  "fine_dining":                        ["fine dining", "michelin", "upscale"],
  "food_hall":                          ["food hall", "market"],
  "night_market":                       ["night market", "street food"],
  "ice_cream":                          ["ice cream", "dessert"],
  "dessert_shop":                       ["dessert", "sweets"],
  "tea_house":                          ["tea", "tea house"],
  "farmers_market":                     ["farmers market", "local market"],
  "market":                             ["market"],
  // Nightlife
  "bar":                                ["bar"],
  "sake_bar":                           ["sake", "bar"],
  "cocktail_bar":                       ["cocktail", "bar"],
  "beer_garden":                        ["beer garden"],
  "night_club":                         ["nightclub", "club"],
  "karaoke":                            ["karaoke"],
  "pub":                                ["pub"],
  "live_music_venue":                   ["live music", "music venue"],
  "music_venue":                        ["music venue", "live music"],
  // Adventure
  "amusement_park":                     ["amusement park", "theme park", "rides"],
  "theme_park":                         ["theme park", "amusement park"],
  "aquarium":                           ["aquarium", "fish", "marine life"],
  "zoo":                                ["zoo", "animals", "wildlife"],
  "escape_room":                        ["escape room"],
  "bowling_alley":                      ["bowling"],
  "skating_rink":                       ["skating", "ice skating"],
  "go_kart_track":                      ["go kart", "racing"],
  "water_park":                         ["water park", "slides"],
  "arcade":                             ["arcade", "games"],
  // Nature
  "park":                               ["park"],
  "botanical_garden":                   ["botanical garden", "garden"],
  "garden":                             ["garden"],
  "beach":                              ["beach"],
  "national_park":                      ["national park"],
  "nature_reserve":                     ["nature reserve", "wildlife"],
  "viewpoint":                          ["viewpoint", "views", "panorama"],
  "waterfall":                          ["waterfall"],
  "lake":                               ["lake"],
  "mountain":                           ["mountain", "hiking"],
  "hiking_trail":                       ["hiking", "trail", "trekking"],
  // Luxury
  "spa":                                ["spa", "wellness"],
  "hot_spring":                         ["hot spring", "onsen", "thermal bath"],
  "onsen":                              ["onsen", "hot spring", "thermal bath"],
  // Shopping
  "shopping_mall":                      ["shopping", "mall"],
  "department_store":                   ["department store", "shopping"],
  "craft_market":                       ["market", "shopping", "crafts"],
  "flea_market":                        ["flea market", "market", "shopping"],
};

/**
 * Generates search keywords for an Overture place.
 *
 * Output covers:
 *   - English name words (tokenized)
 *   - Category-level keywords (what kind of place it is)
 *   - Subcategory-specific descriptive terms
 *   - "{city} {category}" combinations
 *   - Local name if it differs from the English name
 *   - Brand name if present and different
 *   - Alternate names in any language
 */
export function generateKeywords(
  englishName: string,
  namePrimary: string,
  altNames: Record<string, string>,
  overtureCategory: string,
  tgCategory: Category,
  city: string,
  brandName?: string,
): string[] {
  const out = new Set<string>();

  // Name tokens (lowercase words from the English name)
  const nameWords = tokenize(englishName);
  for (const w of nameWords) out.add(w);

  // Full English name
  out.add(englishName.toLowerCase());

  // Category seed keywords
  for (const kw of CATEGORY_KEYWORDS[tgCategory] ?? []) out.add(kw);

  // Subcategory-specific keywords
  const subcat = overtureCategory.includes(".")
    ? overtureCategory.slice(overtureCategory.lastIndexOf(".") + 1)
    : overtureCategory;
  for (const kw of SUBCATEGORY_KEYWORDS[subcat] ?? []) out.add(kw);

  // "{city} {subcategoryKeyword}" combinations
  for (const kw of SUBCATEGORY_KEYWORDS[subcat] ?? []) {
    out.add(`${city.toLowerCase()} ${kw}`);
  }

  // Local name if it adds new words not in the English name
  if (namePrimary && namePrimary !== englishName) {
    out.add(namePrimary.toLowerCase());
  }

  // Alternate names (all languages — helps multilingual search)
  for (const v of Object.values(altNames)) {
    if (v) out.add(v.toLowerCase());
  }

  // Brand name
  if (brandName && brandName !== englishName) {
    out.add(brandName.toLowerCase());
  }

  return [...out]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 30);
}

/** Split a name into lower-case word tokens, filtering short stop words */
function tokenize(name: string): string[] {
  const STOP = new Set(["a", "an", "the", "of", "in", "at", "and", "&", "de", "le", "la", "les", "du"]);
  return name
    .toLowerCase()
    .split(/[\s,\-–—]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

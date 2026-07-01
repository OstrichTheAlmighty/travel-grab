import type { FsqCategory, FsqRawRow, FsqTravelCategory } from "./types";

// ── Exact name lookup map ─────────────────────────────────────────────────────
//
// FSQ category names are English strings like "Japanese Restaurant", "Museum", etc.
// null means the category exists but is not travel-relevant (accommodation, etc.)

const FSQ_CATEGORY_NAME_MAP: Record<string, FsqTravelCategory | null> = {
  // ── Culture ────────────────────────────────────────────────────────────────
  "Shrine":                       "culture",
  "Shinto Shrine":                "culture",
  "Buddhist Temple":              "culture",
  "Temple":                       "culture",
  "Hindu Temple":                 "culture",
  "Museum":                       "culture",
  "Art Museum":                   "culture",
  "Art Gallery":                  "culture",
  "History Museum":               "culture",
  "Natural History Museum":       "culture",
  "Science Museum":               "culture",
  "Children's Museum":            "culture",
  "Historic Site":                "culture",
  "Historical Landmark":          "culture",
  "Monument":                     "culture",
  "Castle":                       "culture",
  "Palace":                       "culture",
  "UNESCO World Heritage Site":   "culture",
  "Performing Arts Venue":        "culture",
  "Theater":                      "culture",
  "Concert Hall":                 "culture",
  "Opera House":                  "culture",
  "Comedy Club":                  "culture",
  "Sumo Arena":                   "culture",
  "Department Store":             "culture",
  "Shopping Mall":                "culture",
  "Electronics Store":            "culture",
  "Anime Shop":                   "culture",
  "Manga Store":                  "culture",
  "Souvenir Shop":                "culture",
  "Arcade":                       "culture",
  "Cultural Center":              "culture",
  "Neighborhood":                 "culture",
  "District":                     "culture",
  "Historic District":            "culture",
  "Entertainment District":       "culture",
  "Shopping District":            "culture",
  "Street":                       "culture",
  "Famous Street":                "culture",
  "Pedestrian Street":            "culture",
  "Intersection":                 "free",
  "Pedestrian Plaza":             "free",
  "Plaza":                        "free",
  "Waterfront":                   "nature",
  "Waterfront District":          "nature",
  "Library":                      "culture",
  "Lighthouse":                   "culture",
  "Planetarium":                  "culture",
  "Public Art":                   "free",
  "Zoo":                          "adventure",

  // ── Adventure ──────────────────────────────────────────────────────────────
  "Amusement Park":               "adventure",
  "Theme Park":                   "adventure",
  "Aquarium":                     "adventure",
  "Observation Deck":             "adventure",
  "Boat Tour":                    "adventure",
  "Escape Room":                  "adventure",
  "Go Kart Track":                "adventure",
  "Ski Resort":                   "adventure",
  "Climbing Gym":                 "adventure",
  "Shooting Range":               "adventure",
  "Sports Arena":                 "adventure",
  "Stadium":                      "adventure",
  "Baseball Stadium":             "adventure",
  "Soccer Stadium":               "adventure",
  "Bowling Alley":                "adventure",
  "Mini Golf":                    "adventure",
  "Laser Tag":                    "adventure",
  "Indoor Skydiving":             "adventure",
  "Bike Rental":                  "adventure",

  // ── Nature ─────────────────────────────────────────────────────────────────
  "Park":                         "nature",
  "Garden":                       "nature",
  "Botanical Garden":             "nature",
  "National Garden":              "nature",
  "National Park":                "nature",
  "Scenic Lookout":               "nature",
  "Viewpoint":                    "nature",
  "Beach":                        "nature",
  "Lake":                         "nature",
  "River":                        "nature",
  "Waterfall":                    "nature",
  "Forest":                       "nature",
  "Mountain":                     "nature",
  "Hot Spring":                   "nature",
  "Onsen":                        "nature",
  "Nature Preserve":              "nature",
  "Wildlife Area":                "nature",

  // ── Food ───────────────────────────────────────────────────────────────────
  "Japanese Restaurant":          "food",
  "Ramen Restaurant":             "food",
  "Sushi Restaurant":             "food",
  "Tempura Restaurant":           "food",
  "Tonkatsu Restaurant":          "food",
  "Yakitori Restaurant":          "food",
  "Teppanyaki Restaurant":        "food",
  "Shabu Shabu Restaurant":       "food",
  "Sukiyaki Restaurant":          "food",
  "Okonomiyaki Restaurant":       "food",
  "Takoyaki Restaurant":          "food",
  "Udon Restaurant":              "food",
  "Soba Restaurant":              "food",
  "Yakiniku Restaurant":          "food",
  "Sashimi Restaurant":           "food",
  "Omakase Restaurant":           "food",
  "Kaiseki Restaurant":           "food",
  "Restaurant":                   "food",
  "Café":                         "food",
  "Coffee Shop":                  "food",
  "Bakery":                       "food",
  "Patisserie":                   "food",
  "Dessert Shop":                 "food",
  "Ice Cream Parlor":             "food",
  "Bubble Tea Shop":              "food",
  "Food Market":                  "food",
  "Market":                       "food",
  "Food Truck":                   "food",
  "Street Food":                  "food",
  "Izakaya":                      "food",
  "Conveyor Belt Sushi":          "food",
  "Dim Sum Restaurant":           "food",
  "Korean Restaurant":            "food",
  "Chinese Restaurant":           "food",
  "Italian Restaurant":           "food",
  "French Restaurant":            "food",
  "Indian Restaurant":            "food",
  "American Restaurant":          "food",
  "Vegetarian / Vegan Restaurant": "food",

  // ── Nightlife ──────────────────────────────────────────────────────────────
  "Bar":                          "nightlife",
  "Cocktail Bar":                 "nightlife",
  "Sake Bar":                     "nightlife",
  "Wine Bar":                     "nightlife",
  "Beer Bar":                     "nightlife",
  "Sports Bar":                   "nightlife",
  "Rooftop Bar":                  "nightlife",
  "Jazz Club":                    "nightlife",
  "Nightclub":                    "nightlife",
  "Karaoke Bar":                  "nightlife",
  "Live Music Venue":             "nightlife",
  "Music Venue":                  "nightlife",
  "Pub":                          "nightlife",
  "Lounge":                       "nightlife",
  "Club":                         "nightlife",

  // ── Luxury ─────────────────────────────────────────────────────────────────
  "Spa":                          "luxury",
  "Day Spa":                      "luxury",
  "Luxury Hotel":                 null,   // accommodation — not travel activity

  // ── Null (not travel-relevant activity) ───────────────────────────────────
  "Hotel":                        null,
  "Hostel":                       null,
  "Motel":                        null,
  "Inn":                          null,
  "Bed & Breakfast":              null,
  "Office":                       null,
  "Corporate Office":             null,
  "Government Office":            null,
  "Warehouse":                    null,
  "Wholesale Store":              null,
  "Private Residence":            null,
  "Residential Building":         null,
  "Apartment Complex":            null,
  "Hospital":                     null,
  "Clinic":                       null,
  "Pharmacy":                     null,
  "Bank":                         null,
  "ATM":                          null,
  "Gas Station":                  null,
  "Elementary School":            null,
  "Middle School":                null,
  "High School":                  null,
  "Rehearsal Studio":             null,
  "Rental Space":                 null,
  "Music Studio":                 null,
  "Dry Cleaner":                  null,
  "Laundry Service":              null,
  "Post Office":                  null,
  "Police Station":               null,
  "Fire Station":                 null,
  "Urgent Care":                  null,
  "Dentist":                      null,
  "Supermarket":                  null,
  "Grocery Store":                null,
  "Convenience Store":            null,
};

// ── Keyword fallback ──────────────────────────────────────────────────────────

interface KeywordRule {
  keywords:  string[];
  category:  FsqTravelCategory | null;
}

const KEYWORD_RULES: KeywordRule[] = [
  { keywords: ["shrine", "jinja"],                        category: "culture" },
  { keywords: ["temple"],                                 category: "culture" },
  { keywords: ["museum", "gallery"],                      category: "culture" },
  { keywords: ["castle", "palace"],                       category: "culture" },
  { keywords: ["theater", "theatre", "concert", "opera"], category: "culture" },
  { keywords: ["neighborhood", "district", "famous street", "pedestrian street"], category: "culture" },
  { keywords: ["intersection", "pedestrian plaza", "public plaza"], category: "free" },
  { keywords: ["waterfront"],                              category: "nature" },
  { keywords: ["park", "garden"],                         category: "nature" },
  { keywords: ["beach", "lake", "waterfall", "forest"],   category: "nature" },
  { keywords: ["hot spring", "onsen"],                    category: "nature" },
  { keywords: ["viewpoint", "lookout"],                   category: "nature" },
  { keywords: ["restaurant", "ramen", "sushi", "soba", "udon", "yakitori", "izakaya", "tempura", "okonomiyaki", "takoyaki"], category: "food" },
  { keywords: ["café", "cafe", "coffee", "bakery", "patisserie"], category: "food" },
  { keywords: ["market", "food hall"],                    category: "food" },
  { keywords: ["bar", "nightclub", "karaoke"],            category: "nightlife" },
  { keywords: ["live music", "jazz club"],                category: "nightlife" },
  { keywords: ["amusement", "theme park", "aquarium", "observation deck"], category: "adventure" },
  { keywords: ["public art", "public plaza"],               category: "free" },
  { keywords: ["hotel", "hostel"],                        category: null },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Maps an FSQ category name string to a TravelGrab category.
 * Returns null if not travel-relevant (accommodation, services, etc.).
 * Returns undefined if the category name is truly unknown (no mapping at all).
 */
export function mapFsqCategory(categoryName: string | null): FsqTravelCategory | null {
  if (!categoryName) return null;

  const detailedName = categoryName.trim();
  const leafName = detailedName.split(">").at(-1)?.trim() ?? detailedName;

  // 1. Exact lookup
  if (Object.prototype.hasOwnProperty.call(FSQ_CATEGORY_NAME_MAP, leafName)) {
    return FSQ_CATEGORY_NAME_MAP[leafName] ?? null;
  }

  // 2. Keyword fallback (case-insensitive substring)
  const lower = detailedName.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.category;
    }
  }

  return null;
}

/**
 * Picks the primary (first) category from an FSQ categories array that maps
 * to a valid TG category, and returns both the mapped TG category and the
 * original FSQ category name.
 *
 * Returns null if no category maps to a travel-relevant TG category.
 */
export function resolveAndMapFsqCategories(
  categories: FsqCategory[],
): { category: FsqTravelCategory; primaryCategoryName: string } | null {
  if (categories.length === 0) return null;

  for (const cat of categories) {
    const mapped = mapFsqCategory(cat.name);
    if (mapped !== null) {
      return { category: mapped, primaryCategoryName: cat.name };
    }
  }

  return null;
}

/** Zip the real OS table's parallel category arrays, retaining full labels. */
export function categoriesFromRow(row: FsqRawRow): FsqCategory[] {
  if (row.fsq_category_labels?.length) {
    return row.fsq_category_labels.map((name, index) => ({
      id: row.fsq_category_ids?.[index] ?? "",
      name,
    }));
  }
  if (Array.isArray(row.categories)) return row.categories;
  if (typeof row.categories === "string") {
    try { return JSON.parse(row.categories) as FsqCategory[]; } catch { return []; }
  }
  return [];
}

/**
 * Returns true if an FSQ category name is travel-relevant
 * (i.e. would produce a non-null mapFsqCategory result).
 */
export function isTravelRelevantFsqCategory(categoryName: string | null): boolean {
  return mapFsqCategory(categoryName) !== null;
}

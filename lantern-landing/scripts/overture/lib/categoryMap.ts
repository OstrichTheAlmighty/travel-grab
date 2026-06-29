import type { Category } from "../../../app/activities/data/types";

// ── Overture → TravelGrab category map ───────────────────────────────────────
//
// Keys are Overture category strings (dot-notation).
// Value is the TravelGrab Category, or null to mark as not travel-relevant.
//
// When a full path isn't found, the mapper falls back to the parent prefix
// (e.g. "religion.unknown_subtype" → lookup "religion").

const CATEGORY_MAP: Record<string, Category | null> = {
  // ── Landmarks & culture ───────────────────────────────────────────────────
  "landmark_and_historical_building":                    "culture",
  "landmark_and_historical_building.archaeological_site": "culture",
  "landmark_and_historical_building.castle":             "culture",
  "landmark_and_historical_building.fort":               "culture",
  "landmark_and_historical_building.historic_district":  "culture",
  "landmark_and_historical_building.historical_landmark": "culture",
  "landmark_and_historical_building.lighthouse":         "culture",
  "landmark_and_historical_building.memorial":           "culture",
  "landmark_and_historical_building.monument":           "culture",
  "landmark_and_historical_building.palace":             "culture",
  "landmark_and_historical_building.ruins":              "culture",
  "landmark_and_historical_building.statue":             "culture",
  "landmark_and_historical_building.tower":              "culture",
  "landmark_and_historical_building.windmill":           "culture",

  // ── Arts & entertainment ──────────────────────────────────────────────────
  "arts_and_entertainment":                              "culture",
  "arts_and_entertainment.amusement_park":               "adventure",
  "arts_and_entertainment.aquarium":                     "adventure",
  "arts_and_entertainment.arcade":                       "adventure",
  "arts_and_entertainment.art_gallery":                  "culture",
  "arts_and_entertainment.bowling_alley":                "adventure",
  "arts_and_entertainment.casino":                       "nightlife",
  "arts_and_entertainment.cinema":                       "culture",
  "arts_and_entertainment.comedy_club":                  "nightlife",
  "arts_and_entertainment.escape_room":                  "adventure",
  "arts_and_entertainment.go_kart_track":                "adventure",
  "arts_and_entertainment.karaoke":                      "nightlife",
  "arts_and_entertainment.laser_tag":                    "adventure",
  "arts_and_entertainment.live_music_venue":             "nightlife",
  "arts_and_entertainment.miniature_golf":               "adventure",
  "arts_and_entertainment.museum":                       "culture",
  "arts_and_entertainment.music_venue":                  "nightlife",
  "arts_and_entertainment.night_club":                   "nightlife",
  "arts_and_entertainment.observation_deck":             "adventure",
  "arts_and_entertainment.opera":                        "culture",
  "arts_and_entertainment.performing_arts_venue":        "culture",
  "arts_and_entertainment.planetarium":                  "culture",
  "arts_and_entertainment.skating_rink":                 "adventure",
  "arts_and_entertainment.theater":                      "culture",
  "arts_and_entertainment.theme_park":                   "adventure",
  "arts_and_entertainment.zoo":                          "adventure",

  // ── Religion ─────────────────────────────────────────────────────────────
  "religion":                                            "culture",
  "religion.buddhist_temple":                            "culture",
  "religion.cathedral":                                  "culture",
  "religion.church":                                     "culture",
  "religion.confucian_temple":                           "culture",
  "religion.hindu_temple":                               "culture",
  "religion.mosque":                                     "culture",
  "religion.place_of_worship":                           "culture",
  "religion.shinto_shrine":                              "culture",
  "religion.shrine":                                     "culture",
  "religion.sikh_temple":                                "culture",
  "religion.synagogue":                                  "culture",
  "religion.taoist_temple":                              "culture",

  // ── Food & drink ─────────────────────────────────────────────────────────
  "food_and_drink":                                      "food",
  "food_and_drink.bakery":                               "food",
  "food_and_drink.bar":                                  "nightlife",
  "food_and_drink.beer_bar":                             "nightlife",
  "food_and_drink.beer_garden":                          "nightlife",
  "food_and_drink.bottle_shop":                          null,
  "food_and_drink.brewery":                              "nightlife",
  "food_and_drink.bubble_tea_shop":                      "food",
  "food_and_drink.buffet":                               "food",
  "food_and_drink.cafe":                                 "food",
  "food_and_drink.cocktail_bar":                         "nightlife",
  "food_and_drink.coffee_shop":                          "food",
  "food_and_drink.confectionery":                        "food",
  "food_and_drink.dessert_shop":                         "food",
  "food_and_drink.distillery":                           "nightlife",
  "food_and_drink.fast_food":                            "food",
  "food_and_drink.fine_dining":                          "luxury",
  "food_and_drink.food_court":                           "food",
  "food_and_drink.food_hall":                            "food",
  "food_and_drink.food_truck":                           "food",
  "food_and_drink.ice_cream":                            "food",
  "food_and_drink.izakaya":                              "food",
  "food_and_drink.juice_bar":                            "food",
  "food_and_drink.night_market":                         "food",
  "food_and_drink.pub":                                  "nightlife",
  "food_and_drink.ramen":                                "food",
  "food_and_drink.restaurant":                           "food",
  "food_and_drink.sake_bar":                             "nightlife",
  "food_and_drink.sushi":                                "food",
  "food_and_drink.tea_house":                            "food",
  "food_and_drink.wine_bar":                             "nightlife",
  "food_and_drink.winery":                               "nightlife",
  "food_and_drink.yakiniku":                             "food",
  "food_and_drink.yakitori":                             "food",

  // ── Outdoors & recreation ─────────────────────────────────────────────────
  "outdoors_and_recreation":                             "nature",
  "outdoors_and_recreation.beach":                       "nature",
  "outdoors_and_recreation.botanical_garden":            "nature",
  "outdoors_and_recreation.campground":                  "nature",
  "outdoors_and_recreation.cycling":                     "adventure",
  "outdoors_and_recreation.dog_park":                    null,
  "outdoors_and_recreation.fishing":                     "adventure",
  "outdoors_and_recreation.garden":                      "nature",
  "outdoors_and_recreation.golf_course":                 "adventure",
  "outdoors_and_recreation.hiking_trail":                "nature",
  "outdoors_and_recreation.horseback_riding":            "adventure",
  "outdoors_and_recreation.marina":                      "nature",
  "outdoors_and_recreation.national_park":               "nature",
  "outdoors_and_recreation.nature_reserve":              "nature",
  "outdoors_and_recreation.park":                        "nature",
  "outdoors_and_recreation.picnic_area":                 "nature",
  "outdoors_and_recreation.playground":                  null,
  "outdoors_and_recreation.rock_climbing":               "adventure",
  "outdoors_and_recreation.scenic_area":                 "nature",
  "outdoors_and_recreation.ski_resort":                  "adventure",
  "outdoors_and_recreation.snowboard":                   "adventure",
  "outdoors_and_recreation.surfing":                     "adventure",
  "outdoors_and_recreation.viewpoint":                   "nature",
  "outdoors_and_recreation.water_park":                  "adventure",
  "outdoors_and_recreation.wildlife_sanctuary":          "nature",

  // ── Natural features ─────────────────────────────────────────────────────
  "natural_features":                                    "nature",
  "natural_features.beach":                              "nature",
  "natural_features.cave":                               "nature",
  "natural_features.cliff":                              "nature",
  "natural_features.forest":                             "nature",
  "natural_features.geyser":                             "nature",
  "natural_features.glacier":                            "nature",
  "natural_features.hot_spring":                         "nature",
  "natural_features.island":                             "nature",
  "natural_features.lake":                               "nature",
  "natural_features.mountain":                           "nature",
  "natural_features.nature_reserve":                     "nature",
  "natural_features.river":                              "nature",
  "natural_features.volcano":                            "nature",
  "natural_features.waterfall":                          "nature",

  // ── Beauty & spa ─────────────────────────────────────────────────────────
  "beauty_and_spa":                                      null,
  "beauty_and_spa.hot_spring":                           "nature",
  "beauty_and_spa.onsen":                                "nature",
  "beauty_and_spa.sauna":                                "nature",
  "beauty_and_spa.spa":                                  "luxury",

  // ── Retail (travel-relevant only) ────────────────────────────────────────
  "retail":                                              null,
  "retail.antique":                                      "culture",
  "retail.craft_market":                                 "culture",
  "retail.department_store":                             "culture",
  "retail.farmers_market":                               "food",
  "retail.flea_market":                                  "culture",
  "retail.market":                                       "food",
  "retail.outlet_mall":                                  null,
  "retail.shopping_mall":                                "culture",
  "retail.souvenir_shop":                                null,
  "retail.supermarket":                                  null,

  // ── Sports ───────────────────────────────────────────────────────────────
  "sports":                                              null,
  "sports.baseball_stadium":                             "adventure",
  "sports.basketball_court":                             null,
  "sports.football_stadium":                             "adventure",
  "sports.ice_skating_rink":                             "adventure",
  "sports.soccer_stadium":                               "adventure",
  "sports.sports_center":                                "adventure",
  "sports.stadium":                                      "adventure",
  "sports.sumo_arena":                                   "culture",
  "sports.swimming_pool":                                null,
  "sports.tennis_court":                                 null,

  // ── Travel & tourism ─────────────────────────────────────────────────────
  "travel_and_tourism":                                  "culture",
  "travel_and_tourism.tourist_attraction":               "culture",
  "travel_and_tourism.tour_operator":                    "culture",
  "travel_and_tourism.viewpoint":                        "nature",

  // ── Civic / education (selected) ─────────────────────────────────────────
  "civic.library":                                       "culture",
  "civic":                                               null,
  "education":                                           null,

  // ── Explicitly excluded top-level categories ──────────────────────────────
  "accommodation":                                       null,
  "automotive":                                          null,
  "financial_services":                                  null,
  "government":                                          null,
  "health_and_medicine":                                 null,
  "mass_media":                                          null,
  "pets":                                                null,
  "professional_services":                               null,
  "real_estate":                                         null,
  "transportation":                                      null,
};

// ── basic_category map (current Overture schema, 2025+) ───────────────────────
//
// basic_category is a top-level simplified field that may use different strings
// from the taxonomy hierarchy. The mapper tries taxonomy.primary first; this
// map is only consulted as a final fallback when both taxonomy.primary and
// categories.primary are absent.
//
// Known basic_category values (may expand with Overture schema changes):

const BASIC_CATEGORY_MAP: Record<string, Category | null> = {
  "arts_and_entertainment":     "culture",
  "attraction":                 "culture",
  "eat_and_drink":              "food",        // alternate spelling in some releases
  "food_and_drink":             "food",
  "landmark":                   "culture",
  "landmark_and_historical_building": "culture",
  "natural_features":           "nature",
  "nature_and_outdoors":        "nature",
  "nightlife":                  "nightlife",
  "outdoors_and_recreation":    "nature",
  "religion":                   "culture",
  "religion_and_spirituality":  "culture",
  "retail":                     null,
  "shop_and_service":           null,
  "sport_and_recreation":       "adventure",
  "sports":                     null,          // too generic without subcategory
  "accommodation":              null,
  "automotive":                 null,
  "financial_services":         null,
  "government":                 null,
  "health_and_medicine":        null,
  "professional_services":      null,
  "real_estate":                null,
  "transportation":             null,
  "travel_and_transport":       null,
  "beauty_and_spa":             null,          // too generic; spa/onsen handled via subcategory
};

/**
 * Maps an Overture category string (taxonomy.primary / categories.primary dot-notation)
 * to a TravelGrab Category. Falls back to parent prefix if exact key not found.
 * Returns null for non-travel-relevant places.
 */
export function mapOvertureCategory(overtureCategory: string | null | undefined): Category | null {
  if (!overtureCategory) return null;

  // Exact match
  if (overtureCategory in CATEGORY_MAP) {
    return CATEGORY_MAP[overtureCategory] ?? null;
  }

  // Parent prefix fallback: "food_and_drink.ramen" → try "food_and_drink"
  const dot = overtureCategory.lastIndexOf(".");
  if (dot > 0) {
    const parent = overtureCategory.slice(0, dot);
    if (parent in CATEGORY_MAP) {
      return CATEGORY_MAP[parent] ?? null;
    }
  }

  return null;
}

/**
 * Maps an Overture basic_category string (current schema 2025+) to a TravelGrab Category.
 * basic_category uses simplified top-level strings that differ from taxonomy dot-notation.
 * Returns null for non-travel-relevant top-level categories.
 */
export function mapBasicCategory(basicCategory: string | null | undefined): Category | null {
  if (!basicCategory) return null;
  return BASIC_CATEGORY_MAP[basicCategory] ?? null;
}

/**
 * Resolves the effective TravelGrab category from an OvertureRawRow, using this priority:
 *   1. taxonomy_primary  (current schema 2025+, dot-notation)
 *   2. category_primary  (legacy schema, dot-notation)
 *   3. basic_category    (current schema simplified top-level, different strings)
 *
 * Returns null if no category maps to a travel-relevant TG category.
 */
export function resolveAndMapOvertureCategory(row: {
  taxonomy_primary: string | null;
  category_primary: string | null;
  basic_category: string | null;
}): { category: Category; effectiveOvertureCategory: string } | null {
  const candidates: Array<{ key: string | null; mapper: (k: string) => Category | null }> = [
    { key: row.taxonomy_primary, mapper: mapOvertureCategory },
    { key: row.category_primary, mapper: mapOvertureCategory },
    { key: row.basic_category,   mapper: mapBasicCategory },
  ];

  for (const { key, mapper } of candidates) {
    if (!key) continue;
    const category = mapper(key);
    if (category !== null) return { category, effectiveOvertureCategory: key };
  }

  return null;
}

/** Returns true if the Overture taxonomy/category maps to a travel-relevant TG category. */
export function isTravelRelevantCategory(overtureCategory: string | null | undefined): boolean {
  return mapOvertureCategory(overtureCategory) !== null;
}

export { CATEGORY_MAP, BASIC_CATEGORY_MAP };

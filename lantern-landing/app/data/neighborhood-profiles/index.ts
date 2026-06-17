import type { NeighborhoodProfile } from "./types";

import { TOKYO_PROFILES }     from "./tokyo";
import { BARCELONA_PROFILES } from "./barcelona";
import { LONDON_PROFILES }    from "./london";
import { NYC_PROFILES }       from "./nyc";
import { BANGKOK_PROFILES }   from "./bangkok";
import { SINGAPORE_PROFILES } from "./singapore";
import { SEOUL_PROFILES }     from "./seoul";

// Registry keyed by lowercase city name (must match detectCityGuide logic in HotelSearch.tsx).
// Add new cities here — no other file changes required.
const CITY_PROFILES: Record<string, Record<string, NeighborhoodProfile>> = {
  "tokyo":     TOKYO_PROFILES,
  "barcelona": BARCELONA_PROFILES,
  "london":    LONDON_PROFILES,
  "new york":  NYC_PROFILES,
  "bangkok":   BANGKOK_PROFILES,
  "singapore": SINGAPORE_PROFILES,
  "seoul":     SEOUL_PROFILES,
  // Future: "paris", "rome", "chicago", "amsterdam", "dubai"
};

/**
 * Look up a neighborhood profile by city name and neighborhood ID.
 * City name is matched loosely (e.g. "New York City" matches key "new york").
 * nbhdId must match a NeighborhoodCard.id from CITY_GUIDES in HotelSearch.tsx.
 */
export function resolveProfile(cityName: string, nbhdId: string): NeighborhoodProfile | null {
  const lower   = cityName.toLowerCase();
  const cityKey = Object.keys(CITY_PROFILES).find((k) => lower.includes(k)) ?? "";
  return CITY_PROFILES[cityKey]?.[nbhdId] ?? null;
}

/**
 * Returns all profiles for a city, or an empty object if city is not yet in the registry.
 */
export function getCityProfiles(cityName: string): Record<string, NeighborhoodProfile> {
  const lower   = cityName.toLowerCase();
  const cityKey = Object.keys(CITY_PROFILES).find((k) => lower.includes(k)) ?? "";
  return CITY_PROFILES[cityKey] ?? {};
}

export type { NeighborhoodProfile, NeighborhoodScores, CompareCategory, PriceTier } from "./types";
export { COMPARE_CATEGORIES, PRICE_TIER_LABELS } from "./types";

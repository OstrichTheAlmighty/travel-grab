// Shared inventory store — imported by search/route.ts and inventory/status/route.ts.
// Module-level state persists for the lifetime of the Node.js server process.

import type { Activity, Category, Badge } from "../../activities/data/types";
import {
  readGeoCache, writeGeoCache,
  readCityCache, writeQueryCache, makeCacheKey,
  type CachedEntry,
} from "./_inventoryCache";
import { supabaseAdmin } from "@/lib/db";

// ── Google Places API types ───────────────────────────────────────────────────

export interface GooglePlace {
  id: string;
  displayName: { text: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  priceLevel?: string;
  businessStatus?: string;
  location?: { latitude: number; longitude: number };
  editorialSummary?: { text: string; languageCode?: string };
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  websiteUri?: string;
  googleMapsUri?: string;
}

interface PlacesResponse {
  places?: GooglePlace[];
  error?: { message: string; code: number; status: string };
}

export interface Viewport {
  northeast: { lat: number; lng: number };
  southwest: { lat: number; lng: number };
}

export interface GeoResult {
  lat: number;
  lng: number;
  viewport: Viewport;
  city: string;
  country: string;
}

// ── Search group config ───────────────────────────────────────────────────────

interface SearchGroup {
  type?: string;    // nearbySearch — no pagination
  query?: string;   // textSearch; {city} substituted at runtime
  category: Category;
  limit: number;
  tags?: string[];
  pages?: number;   // textSearch pages, default 1, max 3
}

// First 12 entries form the SEED batch — run in parallel, must complete before the
// initial server response is sent. Keep this batch diverse (all 6 categories) so
// buildFeatured() has landmark data on first load, not just restaurants.
export const SEARCH_GROUPS: SearchGroup[] = [
  // ─── SEED batch (groups 0-11): diverse, all categories ───────────────────
  { type: "tourist_attraction",                category: "culture",   limit: 20 },
  { type: "museum",                            category: "culture",   limit: 20 },
  { query: "museum {city}",                    category: "culture",   limit: 40, pages: 2, tags: ["Museum"] },
  { query: "temple {city}",                    category: "culture",   limit: 40, pages: 2, tags: ["Temple"] },
  { query: "shrine {city}",                    category: "culture",   limit: 40, pages: 2, tags: ["Shrine"] },
  { type: "art_gallery",                       category: "culture",   limit: 20 },
  { query: "observation deck {city}",          category: "adventure", limit: 40, pages: 2, tags: ["Views", "Observation Deck"] },
  { type: "amusement_park",                    category: "adventure", limit: 10,            tags: ["Theme Park", "Family Friendly"] },
  { type: "park",                              category: "nature",    limit: 20 },
  { query: "restaurant {city}",               category: "food",      limit: 60, pages: 3 },
  { query: "bar {city}",                       category: "nightlife", limit: 60, pages: 3 },
  { query: "luxury restaurant {city}",         category: "luxury",    limit: 40, pages: 2, tags: ["Fine Dining", "Luxury"] },

  // ─── Food (27 groups) ────────────────────────────────────────────────────
  { query: "sushi restaurant {city}",          category: "food",      limit: 60, pages: 3, tags: ["Sushi"] },
  { query: "ramen restaurant {city}",          category: "food",      limit: 60, pages: 3, tags: ["Ramen"] },
  { query: "tonkotsu ramen {city}",            category: "food",      limit: 40, pages: 2, tags: ["Ramen", "Tonkotsu"] },
  { query: "izakaya {city}",                   category: "food",      limit: 60, pages: 3, tags: ["Izakaya"] },
  { query: "omakase restaurant {city}",        category: "food",      limit: 40, pages: 2, tags: ["Omakase", "Fine Dining"] },
  { query: "yakitori restaurant {city}",       category: "food",      limit: 40, pages: 2, tags: ["Yakitori"] },
  { query: "tempura restaurant {city}",        category: "food",      limit: 40, pages: 2, tags: ["Tempura"] },
  { query: "soba restaurant {city}",           category: "food",      limit: 40, pages: 2, tags: ["Soba"] },
  { query: "udon restaurant {city}",           category: "food",      limit: 40, pages: 2, tags: ["Udon"] },
  { query: "yakiniku restaurant {city}",       category: "food",      limit: 40, pages: 2, tags: ["Yakiniku"] },
  { query: "tonkatsu restaurant {city}",       category: "food",      limit: 40, pages: 2, tags: ["Tonkatsu"] },
  { query: "shabu shabu restaurant {city}",    category: "food",      limit: 40, pages: 2, tags: ["Shabu Shabu"] },
  { query: "gyoza restaurant {city}",          category: "food",      limit: 40, pages: 2, tags: ["Gyoza"] },
  { query: "seafood restaurant {city}",        category: "food",      limit: 40, pages: 2, tags: ["Seafood"] },
  { query: "street food {city}",               category: "food",      limit: 40, pages: 2, tags: ["Street Food"] },
  { query: "food market {city}",               category: "food",      limit: 40, pages: 2, tags: ["Market", "Street Food"] },
  { query: "coffee shop {city}",               category: "food",      limit: 60, pages: 3, tags: ["Coffee", "Café"] },
  { type: "cafe",                              category: "food",      limit: 20,            tags: ["Coffee", "Café"] },
  { query: "dessert cafe {city}",              category: "food",      limit: 40, pages: 2, tags: ["Dessert"] },
  { query: "bakery {city}",                    category: "food",      limit: 40, pages: 2, tags: ["Bakery", "Breakfast"] },
  { query: "breakfast restaurant {city}",      category: "food",      limit: 40, pages: 2, tags: ["Breakfast"] },
  { query: "curry restaurant {city}",          category: "food",      limit: 40, pages: 2, tags: ["Curry"] },
  { query: "pizza restaurant {city}",          category: "food",      limit: 40, pages: 2, tags: ["Pizza"] },
  { query: "burger restaurant {city}",         category: "food",      limit: 40, pages: 2, tags: ["Burgers"] },
  { query: "vegetarian restaurant {city}",     category: "food",      limit: 40, pages: 2, tags: ["Vegetarian"] },
  { query: "vegan restaurant {city}",          category: "food",      limit: 40, pages: 2, tags: ["Vegan", "Vegetarian"] },
  { query: "fine dining restaurant {city}",    category: "food",      limit: 40, pages: 2, tags: ["Fine Dining"] },

  // ─── Nightlife (10 groups) ────────────────────────────────────────────────
  { type: "bar",                               category: "nightlife", limit: 20 },
  { type: "night_club",                        category: "nightlife", limit: 20 },
  { query: "rooftop bar {city}",               category: "nightlife", limit: 40, pages: 2, tags: ["Rooftop Bar", "Views"] },
  { query: "cocktail bar {city}",              category: "nightlife", limit: 40, pages: 2, tags: ["Cocktail Bar"] },
  { query: "jazz club {city}",                 category: "nightlife", limit: 40, pages: 2, tags: ["Jazz", "Live Music"] },
  { query: "live music venue {city}",          category: "nightlife", limit: 40, pages: 2, tags: ["Live Music"] },
  { query: "karaoke {city}",                   category: "nightlife", limit: 40, pages: 2, tags: ["Karaoke"] },
  { query: "sake bar {city}",                  category: "nightlife", limit: 40, pages: 2, tags: ["Sake Bar"] },
  { query: "wine bar {city}",                  category: "nightlife", limit: 40, pages: 2, tags: ["Wine Bar"] },
  { query: "speakeasy bar {city}",             category: "nightlife", limit: 20, pages: 1, tags: ["Speakeasy", "Cocktail Bar"] },

  // ─── Culture (7 groups) ──────────────────────────────────────────────────
  { query: "art gallery {city}",               category: "culture",   limit: 40, pages: 2, tags: ["Art Gallery"] },
  { query: "historical landmark {city}",       category: "culture",   limit: 40, pages: 2, tags: ["Historical Site"] },
  { query: "traditional market {city}",        category: "culture",   limit: 40, pages: 2, tags: ["Market", "Shopping"] },
  { type: "shopping_mall",                     category: "culture",   limit: 20,            tags: ["Shopping"] },
  { query: "anime shop {city}",                category: "culture",   limit: 40, pages: 2, tags: ["Anime", "Shopping"] },
  { query: "garden {city}",                    category: "culture",   limit: 40, pages: 2, tags: ["Garden"] },
  { query: "shopping street {city}",           category: "culture",   limit: 40, pages: 2, tags: ["Shopping"] },

  // ─── Luxury (3 groups) ───────────────────────────────────────────────────
  { query: "Michelin star restaurant {city}",  category: "luxury",    limit: 40, pages: 2, tags: ["Michelin", "Fine Dining"] },
  { query: "luxury spa {city}",                category: "luxury",    limit: 40, pages: 2, tags: ["Spa", "Luxury"] },
  { query: "hotel rooftop bar {city}",         category: "luxury",    limit: 40, pages: 2, tags: ["Rooftop Bar", "Luxury", "Views"] },

  // ─── Adventure (5 groups) ────────────────────────────────────────────────
  { type: "zoo",                               category: "adventure", limit:  5,            tags: ["Zoo", "Family Friendly"] },
  { type: "aquarium",                          category: "adventure", limit:  5,            tags: ["Aquarium", "Family Friendly"] },
  { query: "escape room {city}",               category: "adventure", limit: 20, pages: 1, tags: ["Escape Room"] },
  { query: "activity {city}",                  category: "adventure", limit: 40, pages: 2 },
  { query: "tour {city}",                      category: "adventure", limit: 40, pages: 2, tags: ["Guided Tour"] },

  // ─── Nature (4 groups) ───────────────────────────────────────────────────
  { query: "park {city}",                      category: "nature",    limit: 40, pages: 2 },
  { query: "botanical garden {city}",          category: "nature",    limit: 40, pages: 2, tags: ["Garden", "Botanical Garden"] },
  { query: "nature walk {city}",               category: "nature",    limit: 20, pages: 1, tags: ["Nature", "Walking"] },
  { query: "beach {city}",                     category: "nature",    limit: 40, pages: 2, tags: ["Beach"] },
];

// ── Category display maps ─────────────────────────────────────────────────────

export const CATEGORY_GRADIENTS: Record<Category, string> = {
  food:        "radial-gradient(ellipse at 30% 25%, rgba(194,65,12,0.95) 0%, rgba(120,53,15,0.85) 45%, rgba(12,8,4,1) 100%)",
  nightlife:   "radial-gradient(ellipse at 70% 20%, rgba(79,70,229,0.85) 0%, rgba(30,27,75,0.9) 50%, rgba(5,5,18,1) 100%)",
  culture:     "radial-gradient(ellipse at 35% 30%, rgba(109,40,217,0.9) 0%, rgba(76,29,149,0.85) 45%, rgba(8,4,18,1) 100%)",
  adventure:   "radial-gradient(ellipse at 25% 45%, rgba(13,148,136,0.9) 0%, rgba(6,78,59,0.85) 45%, rgba(3,10,8,1) 100%)",
  nature:      "radial-gradient(ellipse at 50% 20%, rgba(21,128,61,0.9) 0%, rgba(20,83,45,0.85) 45%, rgba(3,10,5,1) 100%)",
  luxury:      "radial-gradient(ellipse at 60% 30%, rgba(161,107,20,0.9) 0%, rgba(120,53,15,0.8) 45%, rgba(10,7,3,1) 100%)",
  hidden_gems: "radial-gradient(ellipse at 35% 40%, rgba(147,51,234,0.9) 0%, rgba(88,28,135,0.85) 45%, rgba(8,3,15,1) 100%)",
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  food: "🍜", nightlife: "🌃", culture: "🎭",
  adventure: "⚡", nature: "🌿", luxury: "✨", hidden_gems: "💎",
};

const TYPE_EMOJI: Record<string, string> = {
  museum: "🏛️", art_gallery: "🎨", park: "🌸", night_club: "💃",
  bar: "🍸", restaurant: "🍽️", zoo: "🦁", aquarium: "🐠",
  amusement_park: "🎢", shopping_mall: "🛍️", tourist_attraction: "📸",
  food: "🍜", cafe: "☕", temple: "⛩️", church: "⛪",
};

const TYPE_TAGS: Record<string, string> = {
  // Landmarks & culture
  museum: "Museum", art_gallery: "Art Gallery", park: "Park",
  tourist_attraction: "Sightseeing", shopping_mall: "Shopping",
  aquarium: "Aquarium", amusement_park: "Theme Park", church: "Historic Site",
  hindu_temple: "Temple", buddhist_temple: "Temple",
  shinto_shrine: "Shrine", place_of_worship: "Cultural Site",
  natural_feature: "Nature", historical_landmark: "Historical Site",
  // Nightlife
  night_club: "Nightclub", bar: "Bar", karaoke: "Karaoke",
  // Food — generic
  restaurant: "Restaurant", food: "Food", cafe: "Café",
  // Food — Japanese subtypes (Google Places New API types)
  japanese_restaurant: "Japanese", ramen_restaurant: "Ramen",
  sushi_restaurant: "Sushi", tempura_restaurant: "Tempura",
  yakitori_restaurant: "Yakitori", tonkatsu_restaurant: "Tonkatsu",
  soba_noodle_shop: "Soba", udon_restaurant: "Udon",
  shabu_shabu_restaurant: "Shabu Shabu", yakiniku_restaurant: "Yakiniku",
  izakaya: "Izakaya", gyoza_restaurant: "Gyoza",
  // Food — other cuisine subtypes
  seafood_restaurant: "Seafood", italian_restaurant: "Italian",
  french_restaurant: "French", chinese_restaurant: "Chinese",
  korean_restaurant: "Korean", thai_restaurant: "Thai",
  indian_restaurant: "Indian", american_restaurant: "American",
  mediterranean_restaurant: "Mediterranean", steak_house: "Steak",
  vegetarian_restaurant: "Vegetarian", vegan_restaurant: "Vegan",
  fast_food_restaurant: "Fast Food", pizza_restaurant: "Pizza",
  hamburger_restaurant: "Burgers", breakfast_restaurant: "Breakfast",
  // Food — cafes & desserts
  coffee_shop: "Coffee", bakery: "Bakery", ice_cream_shop: "Dessert",
  dessert_shop: "Dessert", confectionery: "Sweets",
  // Other
  spa: "Spa", zoo: "Zoo",
  movie_theater: "Cinema", bowling_alley: "Bowling", casino: "Casino",
  stadium: "Stadium",
};

export const SKIP_TYPES = new Set([
  "establishment", "point_of_interest", "premise", "political",
  "locality", "country", "route", "street_address", "postal_code",
  "administrative_area_level_1", "administrative_area_level_2",
  "sublocality", "sublocality_level_1", "neighborhood", "geocode",
  "colloquial_area", "continent",
]);

// ── Inventory store ───────────────────────────────────────────────────────────

export interface InventoryEntry {
  place: GooglePlace;
  category: Category;
  tags: string[];
  querySources: string[];  // which search queries found this place (e.g. ["ramen restaurant", "restaurant"])
  whyVisit?: string;       // cached AI text — avoids regenerating on every request
}

export interface CityInventory {
  city: string;
  country: string;
  lat: number;
  lng: number;
  viewport: Viewport;
  entries: Map<string, InventoryEntry>;
  status: "building" | "ready";
  buildStartedAt: number;
  builtAt?: number;
  queriesCompleted: number;
  queriesTotal: number;
  cacheSource?: "db" | "api";
  apiCallsMade?: number;
}

// Singletons — persist for the lifetime of the server process
export const inventoryStore = new Map<string, CityInventory>();
// Maps lowercased raw destination string → cityKey so geocoding is skipped on repeat requests
export const destinationToKey = new Map<string, string>();

// ── Utility functions ─────────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractNeighborhood(place: GooglePlace, fallback: string): string {
  const addr = place.shortFormattedAddress ?? place.formattedAddress;
  if (!addr) return fallback;
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[1];
  if (parts.length >= 2) return parts[1];
  return parts[0] || fallback;
}

function pickEmoji(types: string[]): string {
  for (const t of types) { if (TYPE_EMOJI[t]) return TYPE_EMOJI[t]; }
  return "📍";
}

function buildTags(types: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of types) {
    if (SKIP_TYPES.has(t)) continue;
    const label = TYPE_TAGS[t];
    if (label && !seen.has(label)) { seen.add(label); tags.push(label); }
  }
  return tags.slice(0, 4);
}

function estimateDuration(types: string[]): string {
  if (types.includes("museum"))             return "2–3 hours";
  if (types.includes("art_gallery"))        return "1–2 hours";
  if (types.includes("amusement_park"))     return "3–5 hours";
  if (types.includes("zoo"))                return "2–4 hours";
  if (types.includes("aquarium"))           return "1.5–2 hours";
  if (types.includes("park"))               return "1–2 hours";
  if (types.includes("night_club"))         return "3–4 hours";
  if (types.includes("bar"))                return "1.5–3 hours";
  if (types.includes("restaurant"))         return "1–1.5 hours";
  if (types.includes("shopping_mall"))      return "2–3 hours";
  if (types.includes("tourist_attraction")) return "1–2 hours";
  return "1–2 hours";
}

function estimatePrice(priceLevel: string | undefined): { price: string; isFree: boolean } {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":           return { price: "Free",   isFree: true  };
    case "PRICE_LEVEL_INEXPENSIVE":    return { price: "$",      isFree: false };
    case "PRICE_LEVEL_MODERATE":       return { price: "$$",     isFree: false };
    case "PRICE_LEVEL_EXPENSIVE":      return { price: "$$$",    isFree: false };
    case "PRICE_LEVEL_VERY_EXPENSIVE": return { price: "$$$$",   isFree: false };
    default:                           return { price: "Varies", isFree: false };
  }
}

function generateBadges(place: GooglePlace): Badge[] {
  const types  = place.types ?? [];
  const rating = place.rating ?? 0;
  const count  = place.userRatingCount ?? 0;
  const badges: Badge[] = [];
  if (place.priceLevel === "PRICE_LEVEL_FREE")            badges.push("free");
  if (place.priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE")  badges.push("worth_the_splurge");
  if (rating >= 4.5 && count >= 1000)                     badges.push("popular");
  if (rating >= 4.7 && count > 0 && count < 300)          badges.push("hidden_gem");
  if (types.some((t) => ["park", "zoo", "aquarium", "amusement_park"].includes(t))) {
    badges.push("family_friendly");
  }
  return [...new Set(badges)].slice(0, 3) as Badge[];
}

function buildDescription(place: GooglePlace, neighborhood: string): string {
  if (place.editorialSummary?.text) return place.editorialSummary.text;
  const tags = buildTags(place.types ?? []).slice(0, 2).join(" & ");
  if (tags && neighborhood) return `${tags} in ${neighborhood}.`;
  if (tags) return `${tags}.`;
  if (neighborhood) return `Located in ${neighborhood}.`;
  return "";
}

function buildWhyVisitS1(name: string, types: string[], category: Category, city: string): string {
  if (types.includes("museum"))
    return `Explore ${name}'s collections spanning art, history, or science across multiple exhibition floors.`;
  if (types.includes("art_gallery"))
    return `Browse original works at ${name}, from paintings and sculpture to contemporary installation.`;
  if (types.includes("aquarium"))
    return `Watch sharks, rays, and tropical fish drift through ${name}'s immersive tanks and walk-through tunnels.`;
  if (types.includes("zoo"))
    return `See wildlife from dozens of species across ${name}'s enclosures, aviaries, and habitat zones.`;
  if (types.includes("amusement_park"))
    return `Take on roller coasters, family rides, and live shows across ${name}'s grounds.`;
  if (types.includes("park") && (types.includes("natural_feature") || /forest|wood/i.test(name)))
    return `Hike or wander through ${name}'s woodland trails and open natural landscape.`;
  if (types.includes("park"))
    return `Walk, cycle, or picnic across ${name}'s open green spaces and gardens in ${city}.`;
  if (types.includes("night_club"))
    return `Dance to live DJ sets and late-night music at ${name} in ${city}.`;
  if (types.includes("bar"))
    return `Pull up a stool at ${name} for cocktails, local beers, or wine in a proper bar setting.`;
  if (types.includes("restaurant"))
    return `Sit down at ${name} for a full meal in a relaxed dining environment.`;
  if (types.includes("cafe"))
    return `Stop at ${name} for coffee, pastries, or a light lunch in a laid-back setting.`;
  if (types.includes("shopping_mall"))
    return `Browse a wide range of shops, food halls, and restaurants across ${name}'s floors.`;
  if (types.includes("spa"))
    return `Book a treatment at ${name} for a proper break from sightseeing and city noise.`;
  if (types.includes("church") || types.includes("hindu_temple") || types.includes("place_of_worship"))
    return `Step inside ${name} for striking architecture, history, and a quieter moment in ${city}.`;
  if (types.includes("tourist_attraction"))
    return `Take in ${name}'s architecture, views, and street-level atmosphere at your own pace.`;
  const fallback: Record<Category, string> = {
    food:        `Grab a meal or snack at ${name}, a local favourite in ${city}.`,
    nightlife:   `Experience ${city}'s night scene at ${name} with drinks and a lively crowd.`,
    culture:     `Spend time at ${name} and explore what makes it a distinct part of ${city}.`,
    adventure:   `Get hands-on at ${name} for an active, memorable experience in ${city}.`,
    nature:      `Escape to ${name} for open space, greenery, and a break from the city.`,
    luxury:      `Treat yourself to a premium experience at ${name} in ${city}.`,
    hidden_gems: `Discover ${name}, a quieter spot that rewards those who seek it out in ${city}.`,
  };
  return fallback[category];
}

function buildWhyVisitS2(types: string[], category: Category, isFree: boolean): string {
  if (types.includes("museum"))
    return isFree ? "Free to enter; allow at least two hours." : "Allow at least two hours to cover the main galleries.";
  if (types.includes("art_gallery"))  return "Best on a weekday morning when it's quieter.";
  if (types.includes("aquarium"))     return "Great for families and anyone curious about marine life.";
  if (types.includes("zoo"))          return "Plan for half a day; best on weekdays to avoid school groups.";
  if (types.includes("amusement_park")) return "Better with a group — most rides are more fun together.";
  if (types.includes("park"))         return "Perfect for an unhurried afternoon away from the tourist trail.";
  if (types.includes("night_club"))   return "Expect a queue on weekends; arrive early or book a table ahead.";
  if (types.includes("bar"))          return "Walk-in friendly most evenings; livelier after 9 pm.";
  if (types.includes("restaurant"))   return "Book a table in advance for weekend dinner service.";
  if (types.includes("cafe"))         return "Good for a quick stop without a reservation.";
  if (types.includes("shopping_mall")) return "Best on a weekday to avoid weekend crowds.";
  if (types.includes("spa"))          return "Book ahead — popular treatment slots fill up quickly.";
  if (types.includes("church") || types.includes("hindu_temple") || types.includes("place_of_worship"))
    return "Respectful dress required; usually free to visit.";
  if (types.includes("tourist_attraction"))
    return isFree ? "Free to visit — worth combining with nearby sights." : "Best visited in the morning to beat afternoon crowds.";
  const fallback: Record<Category, string> = {
    food:        isFree ? "Good value and easy to drop in without a reservation." : "Worth booking ahead for busy evenings.",
    nightlife:   "Best experienced on a Thursday, Friday, or Saturday night.",
    culture:     isFree ? "Free to visit — pair it with nearby sights for a full day out." : "Allow a couple of hours to do it justice.",
    adventure:   "Good for active travellers and families alike.",
    nature:      "Pack a bag and plan for at least an hour.",
    luxury:      "Worth splashing out on — book in advance.",
    hidden_gems: "Less well-known but consistently well-regarded by locals.",
  };
  return fallback[category];
}

function buildWhyVisit(place: GooglePlace, category: Category, city: string): string {
  const types  = place.types ?? [];
  const name   = place.displayName?.text ?? "";
  const isFree = place.priceLevel === "PRICE_LEVEL_FREE";
  const s1     = buildWhyVisitS1(name, types, category, city);
  const s2     = buildWhyVisitS2(types, category, isFree);
  return s2 ? `${s1} ${s2}` : s1;
}

export function mapToActivity(
  place: GooglePlace,
  category: Category,
  city: string,
  extraTags: string[] = [],
): Activity {
  const types       = place.types ?? [];
  const { price: basePrice, isFree: isFreeByPrice } = estimatePrice(place.priceLevel);
  const neighborhood = extractNeighborhood(place, city);
  const badges      = generateBadges(place);

  let finalCategory: Category =
    badges.includes("hidden_gem") && !["food", "nightlife", "luxury"].includes(category)
      ? "hidden_gems"
      : category;

  // Dynamically upgrade very expensive food places to luxury.
  // Omakase, Michelin, etc. found via generic food queries still end up in the right bucket.
  if (finalCategory === "food" && place.priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE") {
    finalCategory = "luxury";
  }

  // Infer free admission for place types that are almost always free when Google
  // doesn't report a price level (paid attractions almost always have priceLevel set).
  const freeByType = new Set(["park", "natural_feature", "beach", "hiking_area", "shrine"]);
  const isFreeByType = !place.priceLevel && types.some((t) => freeByType.has(t));
  if (isFreeByType && !badges.includes("free")) badges.push("free");

  const isFree = isFreeByPrice || isFreeByType;
  const price  = isFree ? "Free" : basePrice;

  return {
    id:           place.id,
    title:        place.displayName?.text ?? "(unnamed)",
    neighborhood,
    duration:     estimateDuration(types),
    price,
    isFree,
    rating:       place.rating ?? 0,
    reviewCount:  place.userRatingCount ?? 0,
    description:  buildDescription(place, neighborhood),
    whyVisit:     buildWhyVisit(place, finalCategory, city),
    category:     finalCategory,
    tags:         [...new Set([...buildTags(types), ...extraTags])].slice(0, 8),
    badges,
    emoji:        pickEmoji(types) || CATEGORY_EMOJI[finalCategory],
    gradient:     CATEGORY_GRADIENTS[finalCategory],
    photoRef:     place.photos?.[0]?.name,
    placeId:      place.id,
    lat:          place.location?.latitude,
    lng:          place.location?.longitude,
    websiteUri:   place.websiteUri,
    googleMapsUri: place.googleMapsUri,
    openNow:      place.regularOpeningHours?.openNow,
  };
}

// ── Google Places API calls ───────────────────────────────────────────────────

const PLACES_FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.shortFormattedAddress", "places.rating", "places.userRatingCount",
  "places.types", "places.photos", "places.priceLevel", "places.businessStatus",
  "places.location", "places.editorialSummary", "places.regularOpeningHours",
  "places.websiteUri", "places.googleMapsUri",
].join(",");

export async function geocodeDestination(destination: string, apiKey: string): Promise<GeoResult | null> {
  console.log(`[inventory/geocode] dest="${destination}"`);
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.error(`[inventory/geocode] HTTP ${res.status}`); return null; }

    const data = await res.json() as {
      status: string;
      error_message?: string;
      results?: Array<{
        geometry?: {
          location?: { lat?: number; lng?: number };
          viewport?: {
            northeast?: { lat?: number; lng?: number };
            southwest?: { lat?: number; lng?: number };
          };
        };
        address_components?: Array<{ long_name?: string; types?: string[] }>;
      }>;
    };

    if (data.status !== "OK" || !data.results?.[0]) {
      console.error(`[inventory/geocode] status="${data.status}" err="${data.error_message ?? "none"}"`);
      return null;
    }

    const result = data.results[0];
    const loc    = result.geometry?.location;
    const vp     = result.geometry?.viewport;

    if (
      typeof loc?.lat !== "number" || typeof loc?.lng !== "number" ||
      typeof vp?.northeast?.lat !== "number" || typeof vp?.northeast?.lng !== "number" ||
      typeof vp?.southwest?.lat !== "number" || typeof vp?.southwest?.lng !== "number"
    ) {
      console.error(`[inventory/geocode] bad geometry`);
      return null;
    }

    let city = "", country = "";
    for (const c of result.address_components ?? []) {
      if (c.types?.includes("locality"))  city    = c.long_name ?? "";
      if (c.types?.includes("administrative_area_level_1") && !city) city = c.long_name ?? "";
      if (c.types?.includes("country"))   country = c.long_name ?? "";
    }
    if (!city)    city    = destination.split(",")[0].trim();
    if (!country) country = destination.split(",").pop()?.trim() ?? "";

    console.log(`[inventory/geocode] OK → "${city}", "${country}" lat=${loc.lat.toFixed(4)} lng=${loc.lng.toFixed(4)}`);
    return {
      lat: loc.lat, lng: loc.lng,
      viewport: {
        northeast: { lat: vp.northeast.lat, lng: vp.northeast.lng },
        southwest: { lat: vp.southwest.lat, lng: vp.southwest.lng },
      },
      city, country,
    };
  } catch (err) {
    console.error(`[inventory/geocode] exception:`, String(err));
    return null;
  }
}

async function nearbySearch(
  lat: number, lng: number, radius: number,
  type: string, limit: number, apiKey: string,
): Promise<GooglePlace[]> {
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: [type],
        maxResultCount: Math.min(limit, 20),
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn(`[inventory/nearby] HTTP ${res.status} type=${type}`); return []; }
    const data = await res.json() as PlacesResponse;
    console.log(`[inventory/nearby] type=${type} got=${data.places?.length ?? 0}`);
    return data.places ?? [];
  } catch { return []; }
}

async function textSearch(
  query: string, lat: number, lng: number,
  limit: number, apiKey: string, maxPages = 1,
): Promise<GooglePlace[]> {
  const all: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages && all.length < limit; page++) {
    try {
      const body: Record<string, unknown> = {
        textQuery: query, maxResultCount: 20,
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } },
      };
      if (pageToken) body.pageToken = pageToken;

      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[inventory/text] p${page + 1} HTTP ${res.status} query="${query}"`);
        break;
      }

      const data = await res.json() as PlacesResponse & { nextPageToken?: string };
      const places = data.places ?? [];
      all.push(...places);
      console.log(`[inventory/text] p${page + 1} query="${query}" got=${places.length} total=${all.length}`);

      if (!data.nextPageToken || places.length === 0) break;
      pageToken = data.nextPageToken;
      if (page < maxPages - 1) await new Promise<void>((r) => setTimeout(r, 150));
    } catch { break; }
  }

  return all.slice(0, limit);
}

// ── Build helpers ─────────────────────────────────────────────────────────────

function insideBounds(place: GooglePlace, viewport: Viewport): boolean {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (lat === undefined || lng === undefined) return true;
  const padLat = Math.abs(viewport.northeast.lat - viewport.southwest.lat) * 0.35;
  const padLng = Math.abs(viewport.northeast.lng - viewport.southwest.lng) * 0.35;
  return (
    lat >= viewport.southwest.lat - padLat && lat <= viewport.northeast.lat + padLat &&
    lng >= viewport.southwest.lng - padLng && lng <= viewport.northeast.lng + padLng
  );
}

function shouldInclude(place: GooglePlace, viewport: Viewport): boolean {
  if (place.businessStatus === "CLOSED_PERMANENTLY") return false;
  if (place.rating !== undefined && place.rating < 2.5) return false;
  if (place.rating === undefined && (place.userRatingCount ?? 0) === 0) return false;
  if (!insideBounds(place, viewport)) return false;
  return true;
}

// Higher number = more specific / takes priority over catch-all "culture"
const CATEGORY_SPECIFICITY: Record<Category, number> = {
  food:        10,
  nightlife:    9,
  luxury:       8,
  adventure:    7,
  nature:       6,
  culture:      5,
  hidden_gems:  0,  // never set directly; derived by mapToActivity from badge
};

// Derive a human-readable keyword from a SearchGroup for querySources tracking.
// "ramen restaurant {city}" → "ramen restaurant"
// type "tourist_attraction" → "tourist attraction"
function deriveSource(g: { type?: string; query?: string }): string {
  if (g.type)  return g.type.replace(/_/g, " ");
  if (g.query) return g.query.replace(/\s*\{city\}/g, "").trim().toLowerCase();
  return "unknown";
}

function upsertEntry(
  inv: CityInventory,
  place: GooglePlace,
  category: Category,
  tags: string[],
  source: string,
): void {
  if (inv.entries.has(place.id)) {
    const entry = inv.entries.get(place.id)!;
    // Merge tags
    for (const tag of tags) {
      if (!entry.tags.includes(tag)) entry.tags.push(tag);
    }
    // Track every query that found this place
    if (!entry.querySources.includes(source)) entry.querySources.push(source);
    // Allow a more-specific category to override.
    // Prevents tourist_attraction (fast nearbySearch → "culture") from permanently
    // claiming restaurants/bars/parks before the specific food/nightlife/nature queries finish.
    if ((CATEGORY_SPECIFICITY[category] ?? 0) > (CATEGORY_SPECIFICITY[entry.category] ?? 0)) {
      entry.category = category;
    }
  } else {
    inv.entries.set(place.id, { place, category, tags: [...tags], querySources: [source] });
  }
}

// ── Inventory build ───────────────────────────────────────────────────────────

// Runs all SEARCH_GROUPS in batches. Updates inv.entries in place.
// Fire-and-forget safe: sets status='ready' when done.
export async function buildInventoryBatched(
  inv: CityInventory,
  apiKey: string,
  skipKeys: ReadonlySet<string> = new Set(),
): Promise<void> {
  const BATCH = 12;
  const cityKey = inv.city.toLowerCase();
  let apiCallsMade = 0;
  const diagKm = haversineKm(
    inv.viewport.southwest.lat, inv.viewport.southwest.lng,
    inv.viewport.northeast.lat, inv.viewport.northeast.lng,
  );
  const radiusM = Math.round(Math.min(Math.max(diagKm * 500, 8000), 50000));

  for (let i = 0; i < SEARCH_GROUPS.length; i += BATCH) {
    const batch = SEARCH_GROUPS.slice(i, i + BATCH);

    await Promise.all(batch.map(async (g) => {
      const source = deriveSource(g);
      const cacheKey = makeCacheKey(cityKey, g);

      // Skip queries that were already loaded from DB cache
      if (skipKeys.has(cacheKey)) {
        inv.queriesCompleted++;
        return;
      }

      try {
        let places: GooglePlace[];
        if (g.type) {
          places = await nearbySearch(inv.lat, inv.lng, radiusM, g.type, g.limit, apiKey);
        } else if (g.query) {
          const query = g.query.replace("{city}", inv.city);
          places = await textSearch(query, inv.lat, inv.lng, g.limit, apiKey, g.pages ?? 1);
        } else {
          places = [];
        }
        apiCallsMade++;
        // Capture valid places for DB cache write
        const validPlaces: GooglePlace[] = [];
        for (const place of places) {
          if (shouldInclude(place, inv.viewport)) {
            upsertEntry(inv, place, g.category, g.tags ?? [], source);
            validPlaces.push(place);
          }
        }
        // Write this query's results to DB (fire-and-forget, doesn't block response)
        const entriesToCache: CachedEntry[] = validPlaces.map((p) => ({
          place: p, category: g.category, tags: g.tags ?? [], querySources: [source],
        }));
        writeQueryCache(cityKey, cacheKey, entriesToCache).catch(() => {});
      } catch (err) {
        console.warn(`[inventory/build] query="${source}" error:`, err);
      } finally {
        inv.queriesCompleted++;
      }
    }));

    const elapsed = Date.now() - inv.buildStartedAt;
    const batchNum = Math.floor(i / BATCH) + 1;
    const batchTotal = Math.ceil(SEARCH_GROUPS.length / BATCH);
    console.log(
      `[inventory/build] ${inv.city}: batch ${batchNum}/${batchTotal} — ` +
      `${inv.entries.size} places, ${elapsed}ms elapsed`,
    );

    if (i + BATCH < SEARCH_GROUPS.length) {
      await new Promise<void>((r) => setTimeout(r, 300));
    }
  }

  inv.status = "ready";
  inv.builtAt = Date.now();
  inv.apiCallsMade = apiCallsMade;
  const elapsed = inv.builtAt - inv.buildStartedAt;
  console.log(`[inventory/build] ${inv.city}: COMPLETE — ${inv.entries.size} unique places in ${elapsed}ms (${apiCallsMade} API calls)`);

  // Persist to Supabase so future searches for this city cost nothing
  await writeInventoryToSupabase(inv).catch((err) => {
    console.error(`[inventory/cache-write] error for "${inv.city}":`, err);
  });
}

// ── Permanent Supabase cache write ────────────────────────────────────────────

async function writeInventoryToSupabase(inv: CityInventory): Promise<void> {
  if (!supabaseAdmin) {
    console.warn("[inventory/cache-write] supabaseAdmin not available — skipping");
    return;
  }

  const rows: Array<{
    place_id: string;
    title: string;
    city: string;
    category: string;
    description: string | null;
    image_url: string | null;
    google_places_data: Record<string, unknown>;
  }> = [];

  for (const entry of inv.entries.values()) {
    try {
      const { place } = entry;
      const types = place.types ?? [];

      const { price: basePrice, isFree: isFreeByPrice } = estimatePrice(place.priceLevel);
      const freeByTypeSet = new Set(["park", "natural_feature", "beach", "hiking_area", "shrine"]);
      const isFreeByType = !place.priceLevel && types.some((t) => freeByTypeSet.has(t));
      const isFree = isFreeByPrice || isFreeByType;
      const price = isFree ? "Free" : basePrice;

      const neighborhood = extractNeighborhood(place, inv.city);
      const badges = generateBadges(place);
      if (isFreeByType && !badges.includes("free")) badges.push("free");

      let category: Category = entry.category;
      if (badges.includes("hidden_gem") && !["food", "nightlife", "luxury"].includes(category)) {
        category = "hidden_gems";
      }
      if (category === "food" && place.priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE") {
        category = "luxury";
      }

      const tags = [...new Set([...buildTags(types), ...entry.tags])].slice(0, 8);
      const emoji = pickEmoji(types) || CATEGORY_EMOJI[category];
      const description = buildDescription(place, neighborhood);
      const whyVisit = entry.whyVisit || buildWhyVisit(place, category, inv.city);

      rows.push({
        place_id:    place.id,
        title:       place.displayName?.text ?? "(unnamed)",
        city:        inv.city,
        category,
        description: description || null,
        image_url:   place.photos?.[0]?.name ?? null,
        google_places_data: {
          rating:                place.rating,
          userRatingCount:       place.userRatingCount,
          formattedAddress:      place.formattedAddress,
          shortFormattedAddress: place.shortFormattedAddress,
          regularOpeningHours:   place.regularOpeningHours,
          websiteUri:            place.websiteUri,
          googleMapsUri:         place.googleMapsUri,
          location:              place.location,
          types:                 place.types,
          priceLevel:            place.priceLevel,
          neighborhood,
          duration:              estimateDuration(types),
          price,
          isFree,
          whyVisit,
          tags,
          badges,
          emoji,
          querySources: entry.querySources,
        },
      });
    } catch (err) {
      console.warn(`[inventory/cache-write] skipped ${entry.place.id}: ${String(err)}`);
    }
  }

  if (rows.length === 0) return;

  const UPSERT_BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabaseAdmin.from("activities").upsert(batch, { onConflict: "place_id" });
    if (error) {
      console.error(`[inventory/cache-write] batch ${Math.floor(i / UPSERT_BATCH) + 1} error:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  console.log(`[inventory/cache-write] ${inv.city}: wrote ${upserted}/${rows.length} places to Supabase permanently`);
}

// ── DB cache reconstruction ───────────────────────────────────────────────────

function mergeDbCacheIntoInventory(dbCache: Map<string, CachedEntry[]>, inv: CityInventory): void {
  const specificity: Record<string, number> = {
    food: 10, nightlife: 9, luxury: 8, adventure: 7, nature: 6, culture: 5, hidden_gems: 0,
  };
  for (const entries of dbCache.values()) {
    for (const e of entries) {
      if (inv.entries.has(e.place.id)) {
        const ex = inv.entries.get(e.place.id)!;
        for (const tag of e.tags) if (!ex.tags.includes(tag)) ex.tags.push(tag);
        for (const qs  of e.querySources) if (!ex.querySources.includes(qs)) ex.querySources.push(qs);
        if ((specificity[e.category] ?? 0) > (specificity[ex.category] ?? 0)) ex.category = e.category;
      } else {
        inv.entries.set(e.place.id, {
          place: e.place, category: e.category, tags: [...e.tags], querySources: [...e.querySources],
        });
      }
    }
  }
}

function reconstructFromDbCache(
  dbCache: Map<string, CachedEntry[]>,
  geo: GeoResult,
): CityInventory {
  const inv: CityInventory = {
    city: geo.city, country: geo.country,
    lat:  geo.lat,  lng:  geo.lng, viewport: geo.viewport,
    entries:          new Map(),
    status:           dbCache.size >= SEARCH_GROUPS.length ? "ready" : "building",
    buildStartedAt:   Date.now(),
    builtAt:          dbCache.size >= SEARCH_GROUPS.length ? Date.now() : undefined,
    queriesCompleted: dbCache.size,
    queriesTotal:     SEARCH_GROUPS.length,
    cacheSource:      "db",
    apiCallsMade:     0,
  };
  mergeDbCacheIntoInventory(dbCache, inv);
  return inv;
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Gets or creates an inventory for `destination`.
// First call: geocodes, starts background build, waits up to `waitMs` for the first batch.
// Subsequent calls: returns the in-memory inventory immediately (partial or complete).
export async function getOrCreateInventory(
  destination: string,
  apiKey: string,
  waitMs = 7000,
): Promise<CityInventory | null> {
  const rawKey = destination.toLowerCase().trim();

  // Fast path — we already know the cityKey for this destination string
  const knownKey = destinationToKey.get(rawKey);
  if (knownKey) {
    const inv = inventoryStore.get(knownKey);
    if (inv && inv.queriesCompleted >= 12) return inv;
    // Inventory exists but seed batch not yet done — fall through to wait
    if (inv) {
      const deadline = Date.now() + waitMs;
      while (inv.queriesCompleted < Math.min(12, inv.queriesTotal) && Date.now() < deadline) {
        await new Promise<void>((r) => setTimeout(r, 300));
      }
      return inv;
    }
  }

  // Geocode: check DB cache first, fall back to Places API
  let geo = await readGeoCache(rawKey);
  if (!geo) {
    geo = await geocodeDestination(destination, apiKey);
    if (!geo) return null;
    writeGeoCache(rawKey, geo).catch(() => {});
  }

  const cityKey = geo.city.toLowerCase();
  destinationToKey.set(rawKey, cityKey);

  // Another request might have created it while we were geocoding
  const existing = inventoryStore.get(cityKey);
  if (existing) {
    if (existing.queriesCompleted >= 12) return existing;
    const deadline = Date.now() + waitMs;
    while (existing.queriesCompleted < Math.min(12, existing.queriesTotal) && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 300));
    }
    return existing;
  }

  // Check DB cache — restores full inventory without any Places API calls
  const dbCache = await readCityCache(cityKey);
  if (dbCache) {
    if (dbCache.size >= SEARCH_GROUPS.length) {
      // Full cache hit — all queries covered, return immediately
      const inv = reconstructFromDbCache(dbCache, geo);
      inventoryStore.set(cityKey, inv);
      console.log(`[inventory/getOrCreate] ${geo.city}: full DB cache (${dbCache.size} queries, ${inv.entries.size} places)`);
      return inv;
    } else if (dbCache.size >= 12) {
      // Partial cache — enough for seed batch; preload and run missing queries in background
      console.log(`[inventory/getOrCreate] ${geo.city}: partial DB cache (${dbCache.size}/${SEARCH_GROUPS.length})`);
      const inv = reconstructFromDbCache(dbCache, geo);
      inventoryStore.set(cityKey, inv);
      // Run missing queries in the background using skipKeys to avoid re-fetching cached ones
      const skipKeys = new Set(dbCache.keys());
      buildInventoryBatched(inv, apiKey, skipKeys).catch((err) => {
        console.error(`[inventory/build] error for "${inv.city}":`, err);
        inv.status = "ready";
      });
      return inv;
    }
  }

  // Create inventory and start background build
  const inv: CityInventory = {
    city: geo.city, country: geo.country,
    lat: geo.lat, lng: geo.lng, viewport: geo.viewport,
    entries: new Map(),
    status: "building",
    buildStartedAt: Date.now(),
    queriesCompleted: 0,
    queriesTotal: SEARCH_GROUPS.length,
    cacheSource: "api",
    apiCallsMade: 0,
  };
  inventoryStore.set(cityKey, inv);

  buildInventoryBatched(inv, apiKey, new Set()).catch((err) => {
    console.error(`[inventory/build] fatal error for "${inv.city}":`, err);
    inv.status = "ready";  // unblock clients even on error
  });

  // Wait for the seed batch (first 12 queries) to complete before returning.
  // This ensures the initial response has diverse culture/adventure/nature results.
  const deadline = Date.now() + waitMs;
  while (inv.queriesCompleted < Math.min(12, inv.queriesTotal) && Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 300));
  }

  return inv;
}

// ── Convert to activities ─────────────────────────────────────────────────────

export function convertInventoryToActivities(inv: CityInventory): Activity[] {
  const activities: Activity[] = [];
  const total = inv.entries.size;
  let skipped = 0;

  for (const entry of inv.entries.values()) {
    try {
      const activity = mapToActivity(entry.place, entry.category, inv.city, entry.tags);
      if (entry.whyVisit) activity.whyVisit = entry.whyVisit;
      activity.querySources = entry.querySources;
      activities.push(activity);
    } catch (err) {
      skipped++;
      console.warn(
        `[inventory/convert] skipped ${entry.place.id} ` +
        `(${entry.place.displayName?.text ?? "no name"}): ${String(err)}`,
      );
    }
  }

  if (skipped > 0) {
    console.warn(`[inventory/convert] ${inv.city}: skipped ${skipped}/${total} entries due to errors`);
  }

  // Sort: photos-first, then by rating × log(reviews)
  activities.sort((a, b) => {
    const aPhoto = a.photoRef ? 1 : 0;
    const bPhoto = b.photoRef ? 1 : 0;
    if (aPhoto !== bPhoto) return bPhoto - aPhoto;
    return b.rating * Math.log1p(b.reviewCount) - a.rating * Math.log1p(a.reviewCount);
  });

  console.log(
    `[inventory/convert] ${inv.city}: ${activities.length}/${total} entries converted` +
    (skipped > 0 ? `, ${skipped} skipped` : ""),
  );

  return activities;
}

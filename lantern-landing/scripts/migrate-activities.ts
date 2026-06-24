/**
 * One-time migration: export places from PostgreSQL places_query_cache
 * and upsert into the Supabase activities table.
 *
 * Run from the lantern-landing directory:
 *   npx tsx scripts/migrate-activities.ts
 *
 * Required env vars (reads from .env.local automatically):
 *   DATABASE_URL               — existing Postgres connection string
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase service-role key (Settings → API)
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env.local before anything else reads process.env
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "food" | "nightlife" | "culture" | "adventure" | "nature" | "luxury" | "hidden_gems";
type Badge    = "hidden_gem" | "worth_the_splurge" | "family_friendly" | "popular" | "free";

interface GooglePlace {
  id: string;
  displayName:            { text: string; languageCode?: string };
  formattedAddress?:      string;
  shortFormattedAddress?: string;
  rating?:                number;
  userRatingCount?:       number;
  types?:                 string[];
  photos?:                Array<{ name: string; widthPx?: number; heightPx?: number }>;
  priceLevel?:            string;
  businessStatus?:        string;
  location?:              { latitude: number; longitude: number };
  editorialSummary?:      { text: string; languageCode?: string };
  regularOpeningHours?:   { openNow?: boolean; weekdayDescriptions?: string[] };
  websiteUri?:            string;
  googleMapsUri?:         string;
}

// Shape stored in places_query_cache.entries JSONB
interface CachedEntry {
  place:        GooglePlace;
  category:     Category;
  tags:         string[];
  querySources: string[];
}

// Shape of a Supabase activities row
interface SupabaseActivity {
  place_id:            string;
  title:               string;
  city:                string;
  category:            string;
  description:         string | null;
  image_url:           string | null;
  google_places_data:  Record<string, unknown>;
}

// ── Mapping helpers (mirrors _inventory.ts — pure functions, no imports needed) ─

const SKIP_TYPES = new Set([
  "establishment", "point_of_interest", "premise", "political",
  "locality", "country", "route", "street_address", "postal_code",
  "administrative_area_level_1", "administrative_area_level_2",
  "sublocality", "sublocality_level_1", "neighborhood", "geocode",
  "colloquial_area", "continent",
]);

const TYPE_TAGS: Record<string, string> = {
  museum: "Museum", art_gallery: "Art Gallery", park: "Park",
  tourist_attraction: "Sightseeing", shopping_mall: "Shopping",
  aquarium: "Aquarium", amusement_park: "Theme Park", church: "Historic Site",
  hindu_temple: "Temple", buddhist_temple: "Temple",
  shinto_shrine: "Shrine", place_of_worship: "Cultural Site",
  natural_feature: "Nature", historical_landmark: "Historical Site",
  night_club: "Nightclub", bar: "Bar", karaoke: "Karaoke",
  restaurant: "Restaurant", food: "Food", cafe: "Café",
  japanese_restaurant: "Japanese", ramen_restaurant: "Ramen",
  sushi_restaurant: "Sushi", tempura_restaurant: "Tempura",
  yakitori_restaurant: "Yakitori", tonkatsu_restaurant: "Tonkatsu",
  soba_noodle_shop: "Soba", udon_restaurant: "Udon",
  shabu_shabu_restaurant: "Shabu Shabu", yakiniku_restaurant: "Yakiniku",
  izakaya: "Izakaya", gyoza_restaurant: "Gyoza",
  seafood_restaurant: "Seafood", italian_restaurant: "Italian",
  french_restaurant: "French", chinese_restaurant: "Chinese",
  korean_restaurant: "Korean", thai_restaurant: "Thai",
  indian_restaurant: "Indian", american_restaurant: "American",
  mediterranean_restaurant: "Mediterranean", steak_house: "Steak",
  vegetarian_restaurant: "Vegetarian", vegan_restaurant: "Vegan",
  fast_food_restaurant: "Fast Food", pizza_restaurant: "Pizza",
  hamburger_restaurant: "Burgers", breakfast_restaurant: "Breakfast",
  coffee_shop: "Coffee", bakery: "Bakery", ice_cream_shop: "Dessert",
  dessert_shop: "Dessert", confectionery: "Sweets",
  spa: "Spa", zoo: "Zoo",
  movie_theater: "Cinema", bowling_alley: "Bowling", casino: "Casino",
};

const TYPE_EMOJI: Record<string, string> = {
  museum: "🏛️", art_gallery: "🎨", park: "🌸", night_club: "💃",
  bar: "🍸", restaurant: "🍽️", zoo: "🦁", aquarium: "🐠",
  amusement_park: "🎢", shopping_mall: "🛍️", tourist_attraction: "📸",
  food: "🍜", cafe: "☕", temple: "⛩️", church: "⛪",
};

const CATEGORY_EMOJI: Record<Category, string> = {
  food: "🍜", nightlife: "🌃", culture: "🎭",
  adventure: "⚡", nature: "🌿", luxury: "✨", hidden_gems: "💎",
};

const CATEGORY_SPECIFICITY: Record<Category, number> = {
  food: 10, nightlife: 9, luxury: 8, adventure: 7, nature: 6, culture: 5, hidden_gems: 0,
};

function buildTags(types: string[], extra: string[] = []): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of types) {
    if (SKIP_TYPES.has(t)) continue;
    const label = TYPE_TAGS[t];
    if (label && !seen.has(label)) { seen.add(label); tags.push(label); }
  }
  for (const t of extra) {
    if (!seen.has(t)) { seen.add(t); tags.push(t); }
  }
  return tags.slice(0, 8);
}

function pickEmoji(types: string[]): string {
  for (const t of types) { if (TYPE_EMOJI[t]) return TYPE_EMOJI[t]; }
  return "📍";
}

function extractNeighborhood(place: GooglePlace, fallback: string): string {
  const addr = place.shortFormattedAddress ?? place.formattedAddress;
  if (!addr) return fallback;
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || fallback;
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

function estimatePrice(priceLevel?: string): { price: string; isFree: boolean } {
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
  const types   = place.types ?? [];
  const rating  = place.rating ?? 0;
  const count   = place.userRatingCount ?? 0;
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

function deriveCategory(entry: CachedEntry): Category {
  const badges = generateBadges(entry.place);
  const cat    = entry.category;
  if (badges.includes("hidden_gem") && !["food", "nightlife", "luxury"].includes(cat)) {
    return "hidden_gems";
  }
  if (cat === "food" && entry.place.priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE") {
    return "luxury";
  }
  return cat;
}

function buildWhyVisit(place: GooglePlace, category: Category, city: string): string {
  const types  = place.types ?? [];
  const name   = place.displayName?.text ?? "";
  const isFree = place.priceLevel === "PRICE_LEVEL_FREE";

  let s1: string;
  if (types.includes("museum"))          s1 = `Explore ${name}'s collections spanning art, history, or science across multiple exhibition floors.`;
  else if (types.includes("art_gallery")) s1 = `Browse original works at ${name}, from paintings and sculpture to contemporary installation.`;
  else if (types.includes("aquarium"))   s1 = `Watch sharks, rays, and tropical fish drift through ${name}'s immersive tanks and walk-through tunnels.`;
  else if (types.includes("zoo"))        s1 = `See wildlife from dozens of species across ${name}'s enclosures, aviaries, and habitat zones.`;
  else if (types.includes("amusement_park")) s1 = `Take on roller coasters, family rides, and live shows across ${name}'s grounds.`;
  else if (types.includes("park"))       s1 = `Walk, cycle, or picnic across ${name}'s open green spaces in ${city}.`;
  else if (types.includes("night_club")) s1 = `Dance to live DJ sets and late-night music at ${name} in ${city}.`;
  else if (types.includes("bar"))        s1 = `Pull up a stool at ${name} for cocktails, local beers, or wine.`;
  else if (types.includes("restaurant")) s1 = `Sit down at ${name} for a full meal in a relaxed dining environment.`;
  else if (types.includes("cafe"))       s1 = `Stop at ${name} for coffee, pastries, or a light lunch.`;
  else if (types.includes("shopping_mall")) s1 = `Browse a wide range of shops, food halls, and restaurants across ${name}'s floors.`;
  else if (types.includes("tourist_attraction")) s1 = `Take in ${name}'s architecture, views, and street-level atmosphere at your own pace.`;
  else {
    const fallback: Record<Category, string> = {
      food:        `Grab a meal or snack at ${name}, a local favourite in ${city}.`,
      nightlife:   `Experience ${city}'s night scene at ${name} with drinks and a lively crowd.`,
      culture:     `Spend time at ${name} and explore what makes it a distinct part of ${city}.`,
      adventure:   `Get hands-on at ${name} for an active, memorable experience in ${city}.`,
      nature:      `Escape to ${name} for open space, greenery, and a break from the city.`,
      luxury:      `Treat yourself to a premium experience at ${name} in ${city}.`,
      hidden_gems: `Discover ${name}, a quieter spot that rewards those who seek it out in ${city}.`,
    };
    s1 = fallback[category];
  }

  let s2: string;
  if (types.includes("museum"))          s2 = isFree ? "Free to enter; allow at least two hours." : "Allow at least two hours to cover the main galleries.";
  else if (types.includes("art_gallery")) s2 = "Best on a weekday morning when it's quieter.";
  else if (types.includes("park"))       s2 = "Perfect for an unhurried afternoon away from the tourist trail.";
  else if (types.includes("night_club")) s2 = "Expect a queue on weekends; arrive early or book a table ahead.";
  else if (types.includes("bar"))        s2 = "Walk-in friendly most evenings; livelier after 9 pm.";
  else if (types.includes("restaurant")) s2 = "Book a table in advance for weekend dinner service.";
  else if (types.includes("tourist_attraction")) s2 = isFree ? "Free to visit — worth combining with nearby sights." : "Best visited in the morning to beat afternoon crowds.";
  else {
    const fallback: Record<Category, string> = {
      food:        isFree ? "Good value and easy to drop in without a reservation." : "Worth booking ahead for busy evenings.",
      nightlife:   "Best experienced on a Thursday, Friday, or Saturday night.",
      culture:     isFree ? "Free to visit — pair it with nearby sights for a full day out." : "Allow a couple of hours to do it justice.",
      adventure:   "Good for active travellers and families alike.",
      nature:      "Pack a bag and plan for at least an hour.",
      luxury:      "Worth splashing out on — book in advance.",
      hidden_gems: "Less well-known but consistently well-regarded by locals.",
    };
    s2 = fallback[category];
  }

  return s2 ? `${s1} ${s2}` : s1;
}

function buildDescription(place: GooglePlace, neighborhood: string): string {
  if (place.editorialSummary?.text) return place.editorialSummary.text;
  const tags = buildTags(place.types ?? []).slice(0, 2).join(" & ");
  if (tags && neighborhood) return `${tags} in ${neighborhood}.`;
  if (tags) return `${tags}.`;
  if (neighborhood) return `Located in ${neighborhood}.`;
  return "";
}

// Maps a deduplicated CachedEntry to a Supabase activities row.
// Stores all enriched fields in google_places_data so rowToActivity() can reconstruct them.
function entryToRow(entry: CachedEntry, city: string): SupabaseActivity {
  const { place } = entry;
  const types       = place.types ?? [];
  const category    = deriveCategory(entry);
  const neighborhood = extractNeighborhood(place, city);
  const { price, isFree } = estimatePrice(place.priceLevel);
  const badges      = generateBadges(place);
  const tags        = buildTags(types, entry.tags);
  const emoji       = pickEmoji(types) || CATEGORY_EMOJI[category];
  const description = buildDescription(place, neighborhood);

  // Add "free" badge for parks lacking a price level
  if (!badges.includes("free") && place.priceLevel === undefined) {
    if (types.some((t) => ["park", "natural_feature"].includes(t))) {
      badges.push("free");
    }
  }

  return {
    place_id:  place.id,
    title:     place.displayName?.text ?? "(unnamed)",
    city,
    category,
    description: description || null,
    image_url:   place.photos?.[0]?.name ?? null,
    google_places_data: {
      // Raw Google Places fields (needed for detail modal)
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
      // Enriched fields (used by rowToActivity() in ActivitySearch.tsx)
      neighborhood,
      duration:              estimateDuration(types),
      price,
      isFree,
      whyVisit:              buildWhyVisit(place, category, city),
      tags,
      badges,
      emoji,
      querySources:          entry.querySources,
    },
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const DATABASE_URL           = requireEnv("DATABASE_URL");
  const SUPABASE_URL           = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_SERVICE_KEY   = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const sb  = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const sql = postgres(DATABASE_URL, { max: 1 });

  console.log("Connecting to PostgreSQL…");

  // Fetch all non-expired query rows from the cache
  const rows = await sql<{ city_key: string; cache_key: string; entries: CachedEntry[] }[]>`
    SELECT city_key, cache_key, entries
    FROM   places_query_cache
    WHERE  expires_at > NOW()
    ORDER  BY city_key, cache_key
  `;

  if (rows.length === 0) {
    console.log("No rows found in places_query_cache. Make sure the server has built inventory for at least one city first.");
    await sql.end();
    return;
  }

  console.log(`Found ${rows.length} query rows across all cities.`);

  // ── Deduplicate by place_id within each city ──────────────────────────────
  // The same place can appear in many query rows (e.g. a sushi restaurant
  // appearing under "restaurant", "sushi restaurant", "food market", etc.).
  // Keep the most specific category using CATEGORY_SPECIFICITY.

  const byCity = new Map<string, Map<string, CachedEntry>>();

  for (const row of rows) {
    const { city_key, entries } = row;
    if (!Array.isArray(entries)) continue;

    if (!byCity.has(city_key)) byCity.set(city_key, new Map());
    const cityMap = byCity.get(city_key)!;

    for (const entry of entries) {
      if (!entry?.place?.id) continue;
      const placeId = entry.place.id;
      const existing = cityMap.get(placeId);

      if (!existing) {
        cityMap.set(placeId, { ...entry, querySources: [...(entry.querySources ?? [])] });
      } else {
        // Merge tags and querySources; keep more-specific category
        for (const tag of entry.tags ?? []) {
          if (!existing.tags.includes(tag)) existing.tags.push(tag);
        }
        for (const qs of entry.querySources ?? []) {
          if (!existing.querySources.includes(qs)) existing.querySources.push(qs);
        }
        if ((CATEGORY_SPECIFICITY[entry.category] ?? 0) > (CATEGORY_SPECIFICITY[existing.category] ?? 0)) {
          existing.category = entry.category;
        }
      }
    }
  }

  // ── Upsert into Supabase in batches ──────────────────────────────────────

  const BATCH_SIZE = 100;
  let totalUpserted = 0;
  let totalErrors   = 0;

  for (const [city, cityMap] of byCity) {
    const allEntries = [...cityMap.values()];
    const activities = allEntries.map((e) => entryToRow(e, city));

    console.log(`\n${city}: ${activities.length} unique places`);

    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const batch = activities.slice(i, i + BATCH_SIZE);
      const { error } = await sb
        .from("activities")
        .upsert(batch, { onConflict: "place_id" });

      if (error) {
        console.error(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ERROR —`, error.message);
        totalErrors += batch.length;
      } else {
        totalUpserted += batch.length;
        process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} upserted\r`);
      }
    }
    console.log(`  done — ${activities.length} rows`);
  }

  await sql.end();

  console.log("\n─────────────────────────────");
  console.log(`Cities migrated : ${byCity.size} (${[...byCity.keys()].join(", ")})`);
  console.log(`Total upserted  : ${totalUpserted}`);
  if (totalErrors > 0) console.error(`Total errors    : ${totalErrors}`);
  console.log("─────────────────────────────");
  console.log("Done. Verify in Supabase Dashboard → Table Editor → activities.");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

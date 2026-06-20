import { NextRequest, NextResponse } from "next/server";
import type { Activity, Category, Badge } from "../../../activities/data/types";
import { DESTINATION_DATA } from "../../../activities/data/tokyo";

// ── Types ─────────────────────────────────────────────────────────────────────

// Places API (New) — https://places.googleapis.com/v1/places:searchNearby / :searchText
interface GooglePlace {
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

interface Viewport {
  northeast: { lat: number; lng: number };
  southwest: { lat: number; lng: number };
}

interface GeoResult {
  lat: number;
  lng: number;
  viewport: Viewport;
  city: string;
  country: string;
}

// ── Server-side cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  activities: Activity[];
  city: string;
  country: string;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// ── Search group config ───────────────────────────────────────────────────────

interface SearchGroup {
  type?: string;          // nearby search (no pagination)
  query?: string;         // text search; {city} is substituted at runtime
  category: Category;
  limit: number;
  tags?: string[];        // searchable tags applied to all results from this group
  pages?: number;         // textSearch pages to fetch (default 1, max 3)
}

const SEARCH_GROUPS: SearchGroup[] = [
  // ── Food — specific cuisines first so tags are assigned before generic sweep ──
  { query: "sushi restaurant {city}",           category: "food",      limit: 60, pages: 3, tags: ["Sushi"] },
  { query: "ramen restaurant {city}",           category: "food",      limit: 60, pages: 3, tags: ["Ramen"] },
  { query: "tonkotsu ramen {city}",             category: "food",      limit: 40, pages: 2, tags: ["Ramen", "Tonkotsu"] },
  { query: "izakaya {city}",                    category: "food",      limit: 60, pages: 3, tags: ["Izakaya"] },
  { query: "omakase restaurant {city}",         category: "food",      limit: 40, pages: 2, tags: ["Omakase", "Fine Dining"] },
  { query: "yakitori restaurant {city}",        category: "food",      limit: 40, pages: 2, tags: ["Yakitori"] },
  { query: "tempura restaurant {city}",         category: "food",      limit: 40, pages: 2, tags: ["Tempura"] },
  { query: "soba restaurant {city}",            category: "food",      limit: 40, pages: 2, tags: ["Soba"] },
  { query: "udon restaurant {city}",            category: "food",      limit: 40, pages: 2, tags: ["Udon"] },
  { query: "seafood restaurant {city}",         category: "food",      limit: 40, pages: 2, tags: ["Seafood"] },
  { query: "street food {city}",                category: "food",      limit: 40, pages: 2, tags: ["Street Food"] },
  { query: "food market {city}",                category: "food",      limit: 40, pages: 2, tags: ["Market", "Street Food"] },
  { query: "coffee shop {city}",                category: "food",      limit: 60, pages: 3, tags: ["Coffee", "Café"] },
  { type: "cafe",                               category: "food",      limit: 20,            tags: ["Coffee", "Café"] },
  { query: "dessert cafe {city}",               category: "food",      limit: 40, pages: 2, tags: ["Dessert"] },
  { query: "bakery {city}",                     category: "food",      limit: 40, pages: 2, tags: ["Bakery", "Breakfast"] },
  { query: "breakfast restaurant {city}",       category: "food",      limit: 40, pages: 2, tags: ["Breakfast"] },
  { query: "curry restaurant {city}",           category: "food",      limit: 40, pages: 2, tags: ["Curry"] },
  { query: "restaurant {city}",                 category: "food",      limit: 60, pages: 3 },

  // ── Nightlife ────────────────────────────────────────────────────────────────
  { type: "bar",                                category: "nightlife", limit: 20 },
  { type: "night_club",                         category: "nightlife", limit: 20 },
  { query: "bar {city}",                        category: "nightlife", limit: 60, pages: 3 },
  { query: "rooftop bar {city}",                category: "nightlife", limit: 40, pages: 2, tags: ["Rooftop Bar", "Rooftop", "Views"] },
  { query: "cocktail bar {city}",               category: "nightlife", limit: 40, pages: 2, tags: ["Cocktail Bar"] },
  { query: "jazz club {city}",                  category: "nightlife", limit: 40, pages: 2, tags: ["Jazz", "Live Music"] },
  { query: "live music venue {city}",           category: "nightlife", limit: 40, pages: 2, tags: ["Live Music"] },
  { query: "karaoke {city}",                    category: "nightlife", limit: 40, pages: 2, tags: ["Karaoke"] },
  { query: "sake bar {city}",                   category: "nightlife", limit: 40, pages: 2, tags: ["Sake Bar"] },
  { query: "speakeasy bar {city}",              category: "nightlife", limit: 20, pages: 1, tags: ["Speakeasy", "Cocktail Bar"] },

  // ── Culture & Sightseeing ────────────────────────────────────────────────────
  { type: "tourist_attraction",                 category: "culture",   limit: 20 },
  { type: "museum",                             category: "culture",   limit: 20 },
  { type: "art_gallery",                        category: "culture",   limit: 20 },
  { query: "temple {city}",                     category: "culture",   limit: 40, pages: 2, tags: ["Temple"] },
  { query: "shrine {city}",                     category: "culture",   limit: 40, pages: 2, tags: ["Shrine"] },
  { query: "museum {city}",                     category: "culture",   limit: 40, pages: 2, tags: ["Museum"] },
  { query: "historical landmark {city}",        category: "culture",   limit: 40, pages: 2, tags: ["Historical Site", "Landmark"] },
  { query: "traditional market {city}",         category: "culture",   limit: 40, pages: 2, tags: ["Market", "Shopping"] },
  { type: "shopping_mall",                      category: "culture",   limit: 20,            tags: ["Shopping"] },
  { query: "anime shop {city}",                 category: "culture",   limit: 40, pages: 2, tags: ["Anime", "Shopping"] },
  { query: "garden {city}",                     category: "culture",   limit: 40, pages: 2, tags: ["Garden"] },

  // ── Luxury ──────────────────────────────────────────────────────────────────
  { query: "luxury restaurant {city}",          category: "luxury",    limit: 40, pages: 2, tags: ["Fine Dining", "Luxury"] },
  { query: "Michelin star restaurant {city}",   category: "luxury",    limit: 40, pages: 2, tags: ["Michelin", "Fine Dining"] },
  { query: "luxury spa {city}",                 category: "luxury",    limit: 40, pages: 2, tags: ["Spa", "Luxury"] },
  { query: "high end hotel bar {city}",         category: "luxury",    limit: 20, pages: 1, tags: ["Rooftop Bar", "Luxury", "Views"] },

  // ── Adventure & Experiences ──────────────────────────────────────────────────
  { type: "amusement_park",                     category: "adventure", limit: 10,            tags: ["Theme Park", "Family Friendly"] },
  { type: "zoo",                                category: "adventure", limit:  5,            tags: ["Zoo", "Family Friendly"] },
  { type: "aquarium",                           category: "adventure", limit:  5,            tags: ["Aquarium", "Family Friendly"] },
  { query: "observation deck {city}",           category: "adventure", limit: 40, pages: 2, tags: ["Observation Deck", "Views", "Rooftop"] },
  { query: "go kart {city}",                    category: "adventure", limit: 20, pages: 1, tags: ["Go Kart", "Racing"] },
  { query: "escape room {city}",                category: "adventure", limit: 20, pages: 1, tags: ["Escape Room"] },
  { query: "activity {city}",                   category: "adventure", limit: 40, pages: 2 },

  // ── Nature ──────────────────────────────────────────────────────────────────
  { type: "park",                               category: "nature",    limit: 20 },
  { query: "park {city}",                       category: "nature",    limit: 40, pages: 2 },
  { query: "botanical garden {city}",           category: "nature",    limit: 40, pages: 2, tags: ["Garden", "Botanical Garden"] },
  { query: "nature walk {city}",                category: "nature",    limit: 20, pages: 1, tags: ["Nature", "Walking"] },
];

// ── Category / type maps ──────────────────────────────────────────────────────

const CATEGORY_GRADIENTS: Record<Category, string> = {
  food:        "radial-gradient(ellipse at 30% 25%, rgba(194,65,12,0.95) 0%, rgba(120,53,15,0.85) 45%, rgba(12,8,4,1) 100%)",
  nightlife:   "radial-gradient(ellipse at 70% 20%, rgba(79,70,229,0.85) 0%, rgba(30,27,75,0.9) 50%, rgba(5,5,18,1) 100%)",
  culture:     "radial-gradient(ellipse at 35% 30%, rgba(109,40,217,0.9) 0%, rgba(76,29,149,0.85) 45%, rgba(8,4,18,1) 100%)",
  adventure:   "radial-gradient(ellipse at 25% 45%, rgba(13,148,136,0.9) 0%, rgba(6,78,59,0.85) 45%, rgba(3,10,8,1) 100%)",
  nature:      "radial-gradient(ellipse at 50% 20%, rgba(21,128,61,0.9) 0%, rgba(20,83,45,0.85) 45%, rgba(3,10,5,1) 100%)",
  luxury:      "radial-gradient(ellipse at 60% 30%, rgba(161,107,20,0.9) 0%, rgba(120,53,15,0.8) 45%, rgba(10,7,3,1) 100%)",
  hidden_gems: "radial-gradient(ellipse at 35% 40%, rgba(147,51,234,0.9) 0%, rgba(88,28,135,0.85) 45%, rgba(8,3,15,1) 100%)",
};

const CATEGORY_EMOJI: Record<Category, string> = {
  food:        "🍜",
  nightlife:   "🌃",
  culture:     "🎭",
  adventure:   "⚡",
  nature:      "🌿",
  luxury:      "✨",
  hidden_gems: "💎",
};

const TYPE_EMOJI: Record<string, string> = {
  museum:            "🏛️",
  art_gallery:       "🎨",
  park:              "🌸",
  night_club:        "💃",
  bar:               "🍸",
  restaurant:        "🍽️",
  zoo:               "🦁",
  aquarium:          "🐠",
  amusement_park:    "🎢",
  shopping_mall:     "🛍️",
  tourist_attraction:"📸",
  food:              "🍜",
  cafe:              "☕",
  temple:            "⛩️",
  church:            "⛪",
};

const TYPE_TAGS: Record<string, string> = {
  museum:             "Museum",
  art_gallery:        "Art Gallery",
  park:               "Park",
  tourist_attraction: "Sightseeing",
  night_club:         "Nightclub",
  bar:                "Bar",
  restaurant:         "Restaurant",
  shopping_mall:      "Shopping",
  zoo:                "Zoo",
  aquarium:           "Aquarium",
  amusement_park:     "Theme Park",
  church:             "Historic Site",
  hindu_temple:       "Temple",
  place_of_worship:   "Cultural Site",
  food:               "Food",
  cafe:               "Café",
  natural_feature:    "Nature",
  spa:                "Spa",
  movie_theater:      "Cinema",
  bowling_alley:      "Bowling",
  casino:             "Casino",
  stadium:            "Stadium",
};

const SKIP_TYPES = new Set([
  "establishment", "point_of_interest", "premise", "political",
  "locality", "country", "route", "street_address", "postal_code",
  "administrative_area_level_1", "administrative_area_level_2",
  "sublocality", "sublocality_level_1", "neighborhood", "geocode",
  "colloquial_area", "continent",
]);

// ── Utility ───────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractNeighborhood(place: GooglePlace, fallback: string): string {
  const addr = place.shortFormattedAddress ?? place.formattedAddress;
  if (!addr) return fallback;
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
  // For "Name, District, City, Country" prefer the second segment (district/ward)
  if (parts.length >= 3) return parts[1];
  if (parts.length >= 2) return parts[1];
  return parts[0] || fallback;
}

function pickEmoji(types: string[]): string {
  for (const t of types) {
    if (TYPE_EMOJI[t]) return TYPE_EMOJI[t];
  }
  return "📍";
}

function buildTags(types: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of types) {
    if (SKIP_TYPES.has(t)) continue;
    const label = TYPE_TAGS[t];
    if (label && !seen.has(label)) {
      seen.add(label);
      tags.push(label);
    }
  }
  return tags.slice(0, 4);
}

function estimateDuration(types: string[]): string {
  if (types.includes("museum"))          return "2–3 hours";
  if (types.includes("art_gallery"))     return "1–2 hours";
  if (types.includes("amusement_park"))  return "3–5 hours";
  if (types.includes("zoo"))             return "2–4 hours";
  if (types.includes("aquarium"))        return "1.5–2 hours";
  if (types.includes("park"))            return "1–2 hours";
  if (types.includes("night_club"))      return "3–4 hours";
  if (types.includes("bar"))             return "1.5–3 hours";
  if (types.includes("restaurant"))      return "1–1.5 hours";
  if (types.includes("shopping_mall"))   return "2–3 hours";
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
  // No editorial summary — build a neutral factual line without ratings or review counts
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
  if (types.includes("stadium"))
    return `Catch a live match or take a behind-the-scenes tour at ${name}.`;
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
  if (types.includes("art_gallery"))
    return "Best on a weekday morning when it's quieter.";
  if (types.includes("aquarium"))
    return "Great for families and anyone curious about marine life.";
  if (types.includes("zoo"))
    return "Plan for half a day; best on weekdays to avoid school groups.";
  if (types.includes("amusement_park"))
    return "Better with a group — most rides are more fun together.";
  if (types.includes("park"))
    return "Perfect for an unhurried afternoon away from the tourist trail.";
  if (types.includes("night_club"))
    return "Expect a queue on weekends; arrive early or book a table ahead.";
  if (types.includes("bar"))
    return "Walk-in friendly most evenings; livelier after 9 pm.";
  if (types.includes("restaurant"))
    return "Book a table in advance for weekend dinner service.";
  if (types.includes("cafe"))
    return "Good for a quick stop without a reservation.";
  if (types.includes("shopping_mall"))
    return "Best on a weekday to avoid weekend crowds.";
  if (types.includes("spa"))
    return "Book ahead — popular treatment slots fill up quickly.";
  if (types.includes("church") || types.includes("hindu_temple") || types.includes("place_of_worship"))
    return "Respectful dress required; usually free to visit.";
  if (types.includes("stadium"))
    return "Check the fixture schedule — tours run on non-match days.";
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
  const name   = place.displayName.text;
  const isFree = place.priceLevel === "PRICE_LEVEL_FREE";

  // description already carries editorialSummary verbatim, so whyVisit is always
  // action-first + "best for" — no repetition between the two card fields.
  const s1 = buildWhyVisitS1(name, types, category, city);
  const s2 = buildWhyVisitS2(types, category, isFree);

  return s2 ? `${s1} ${s2}` : s1;
}

// ── AI-enhanced Why Visit ─────────────────────────────────────────────────────

async function generateWhyVisitBatch(
  activities: Activity[],
  placeMap: Map<string, GooglePlace>,
  city: string,
): Promise<Map<string, string>> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return new Map();

  const items = activities.map((a) => {
    const p = placeMap.get(a.id);
    return {
      id:        a.id,
      name:      a.title,
      category:  a.category,
      city,
      editorial: p?.editorialSummary?.text ?? null,
      types:     (p?.types ?? []).filter((t) => !SKIP_TYPES.has(t)).slice(0, 6),
    };
  });

  const prompt = `You write concise "Why visit?" summaries for an activity card in a travel app. Each summary is shown when a user taps "Why visit?" on the card.

RULES — strictly enforced:
- Exactly 2 sentences. No more, no less.
- No ratings, star ratings, or review counts.
- Forbidden phrases: "must-see", "world-renowned", "vibrant", "bustling", "amazing", "popular attraction", "hidden gem", "unique experience".
- "Iconic" is allowed only when attached to a specific named feature (e.g. "the iconic Kaminarimon Gate"), never used alone.
- First sentence: what the visitor will specifically DO or SEE that is unique to this place. Name specific features, streets, rooms, items, or rituals where possible.
- Second sentence: who it is best for, OR what makes it stand out from similar attractions, OR a practical tip.
- Present tense. Visitor's perspective. Do not repeat the place name in both sentences.

Examples of the quality and specificity required:
- "Walk through the thundering Kaminarimon Gate and browse Nakamise Street's snack stalls before reaching the main hall of Tokyo's oldest temple. The blend of street food, incense, and active worship makes it unlike any other temple visit in the city."
- "Ride to the 350-metre observation floor for sweeping views across Tokyo's sprawl and, on clear days, Mount Fuji on the horizon. Sunset is the most rewarding time as the city lights begin to glow across every direction."
- "Leave the crowds behind and wander forested paths leading to a grand Shinto shrine dedicated to Emperor Meiji. Occasional wedding processions in traditional dress add a sense of living ritual that most tourist sites in Tokyo lack."
- "Classic castle-centred parades, themed lands, and the full Disney ride lineup make this the right choice for first-time visitors who want the definitive Disney experience. Arrive early to beat queues for the most popular attractions."

PLACES:
${JSON.stringify(items, null, 2)}

Return ONLY a JSON object mapping each place ID to its why_visit string.
{"ChIJ...": "Sentence one. Sentence two.", ...}`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      signal:  controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           "gpt-4o-mini",
        temperature:     0.4,
        max_tokens:      4000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(tid);

    if (!resp.ok) {
      console.error(`[activities/openai] HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
      return new Map();
    }

    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw  = (data.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const result = new Map<string, string>();
    for (const [id, text] of Object.entries(parsed)) {
      if (typeof text === "string" && text.trim()) result.set(id, text.trim());
    }

    console.log(`[activities/openai] whyVisit generated for ${result.size}/${activities.length} places`);
    return result;
  } catch (err) {
    console.error("[activities/openai] whyVisit error:", err instanceof Error ? err.message : String(err));
    return new Map();
  }
}

// ── Activity mapper ───────────────────────────────────────────────────────────

function mapToActivity(
  place: GooglePlace,
  category: Category,
  city: string,
  extraTags: string[] = [],
): Activity {
  const types       = place.types ?? [];
  const { price, isFree } = estimatePrice(place.priceLevel);
  const neighborhood = extractNeighborhood(place, city);
  const badges      = generateBadges(place);

  const finalCategory: Category =
    badges.includes("hidden_gem") && !["food", "nightlife"].includes(category)
      ? "hidden_gems"
      : category;

  return {
    id:           place.id,
    title:        place.displayName.text,
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
    photoRef:     place.photos?.[0]?.name,  // Places API (New) resource name
    placeId:      place.id,
    websiteUri:   place.websiteUri,
    googleMapsUri: place.googleMapsUri,
    openNow:      place.regularOpeningHours?.openNow,
  };
}

// ── Google API calls ──────────────────────────────────────────────────────────

async function geocodeDestination(destination: string, apiKey: string): Promise<GeoResult | null> {
  // DEBUG: log key presence without revealing the value
  console.log(`[activities/geocode] START dest="${destination}" key_set=${Boolean(apiKey)} key_len=${apiKey.length}`);

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`;
    console.log(`[activities/geocode] fetching url (key redacted): ${url.replace(apiKey, "REDACTED")}`);

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    // DEBUG: log HTTP-level response
    console.log(`[activities/geocode] http_status=${res.status} ok=${res.ok}`);

    if (!res.ok) {
      console.error(`[activities/geocode] FAIL: non-200 HTTP status ${res.status} for dest="${destination}"`);
      return null;
    }

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

    // DEBUG: log Google API status — this reveals REQUEST_DENIED, OVER_QUERY_LIMIT, etc.
    console.log(`[activities/geocode] google_status="${data.status}" error_message="${data.error_message ?? "none"}" result_count=${data.results?.length ?? 0}`);

    if (data.status !== "OK" || !data.results?.[0]) {
      console.error(
        `[activities/geocode] FAIL: google_status="${data.status}" error="${data.error_message ?? "none"}" dest="${destination}"`,
      );
      return null;
    }

    const result = data.results[0];
    const loc = result.geometry?.location;
    const vp  = result.geometry?.viewport;

    // DEBUG: log what we actually got from geometry
    console.log(`[activities/geocode] loc=${JSON.stringify(loc)} viewport_ne=${JSON.stringify(vp?.northeast)} viewport_sw=${JSON.stringify(vp?.southwest)}`);

    if (
      typeof loc?.lat !== "number" ||
      typeof loc?.lng !== "number"
    ) {
      console.error(`[activities/geocode] FAIL: location not a number pair — loc=${JSON.stringify(loc)}`);
      return null;
    }

    if (
      typeof vp?.northeast?.lat !== "number" ||
      typeof vp?.northeast?.lng !== "number" ||
      typeof vp?.southwest?.lat !== "number" ||
      typeof vp?.southwest?.lng !== "number"
    ) {
      console.error(`[activities/geocode] FAIL: viewport incomplete — vp=${JSON.stringify(vp)}`);
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

    console.log(`[activities/geocode] OK dest="${destination}" → city="${city}" country="${country}" lat=${loc.lat.toFixed(4)} lng=${loc.lng.toFixed(4)}`);

    return {
      lat:      loc.lat,
      lng:      loc.lng,
      viewport: {
        northeast: { lat: vp.northeast.lat, lng: vp.northeast.lng },
        southwest: { lat: vp.southwest.lat, lng: vp.southwest.lng },
      },
      city,
      country,
    };
  } catch (err) {
    // Catches timeout (AbortError), network failures, and JSON parse errors
    console.error(`[activities/geocode] EXCEPTION dest="${destination}" err=${String(err)}`);
    return null;
  }
}

// Field mask for Places API (New) — request only the fields we use
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.photos",
  "places.priceLevel",
  "places.businessStatus",
  "places.location",
  "places.editorialSummary",
  "places.regularOpeningHours",
  "places.websiteUri",
  "places.googleMapsUri",
].join(",");

async function nearbySearch(
  lat: number, lng: number, radius: number,
  type: string, limit: number, apiKey: string,
): Promise<GooglePlace[]> {
  const url = "https://places.googleapis.com/v1/places:searchNearby";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":     "application/json",
        "X-Goog-Api-Key":   apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes:       [type],
        maxResultCount:      Math.min(limit, 20),
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[activities/nearby] HTTP ${res.status} type=${type} body="${errText.slice(0, 200)}"`);
      return [];
    }
    const data = await res.json() as PlacesResponse;
    const count = data.places?.length ?? 0;
    console.log(`[activities/nearby] type=${type} count=${count}${data.error ? ` err="${data.error.message}"` : ""}`);
    return data.places ?? [];
  } catch (err) {
    console.warn(`[activities/nearby] fetch error type=${type}`, err);
    return [];
  }
}

async function textSearch(
  query: string, lat: number, lng: number,
  limit: number, apiKey: string,
  maxPages = 1,
): Promise<GooglePlace[]> {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const all: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages && all.length < limit; page++) {
    try {
      const body: Record<string, unknown> = {
        textQuery:      query,
        maxResultCount: 20,
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: 30000 },
        },
      };
      if (pageToken) body.pageToken = pageToken;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type":     "application/json",
          "X-Goog-Api-Key":   apiKey,
          "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[activities/text] p${page+1} HTTP ${res.status} query="${query}" body="${errText.slice(0, 200)}"`);
        break;
      }

      const data = await res.json() as PlacesResponse & { nextPageToken?: string };
      const places = data.places ?? [];
      all.push(...places);

      console.log(`[activities/text] p${page+1} query="${query}" got=${places.length} total=${all.length}${data.error ? ` err="${data.error.message}"` : ""}`);

      if (!data.nextPageToken || places.length === 0) break;
      pageToken = data.nextPageToken;

      if (page < maxPages - 1) await new Promise<void>((r) => setTimeout(r, 150));
    } catch (err) {
      console.warn(`[activities/text] fetch error p${page+1} query="${query}"`, err);
      break;
    }
  }

  return all.slice(0, limit);
}

// ── Viewport filter ───────────────────────────────────────────────────────────

function insideBounds(place: GooglePlace, viewport: Viewport): boolean {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  // Nearby Search results are already constrained to the radius — be permissive if location missing
  if (lat === undefined || lng === undefined) return true;
  const padLat = Math.abs(viewport.northeast.lat - viewport.southwest.lat) * 0.25;
  const padLng = Math.abs(viewport.northeast.lng - viewport.southwest.lng) * 0.25;
  return (
    lat >= viewport.southwest.lat - padLat &&
    lat <= viewport.northeast.lat + padLat &&
    lng >= viewport.southwest.lng - padLng &&
    lng <= viewport.northeast.lng + padLng
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const destination = (searchParams.get("destination") ?? "").trim();

  if (!destination) {
    return NextResponse.json({ error: "destination is required" }, { status: 400 });
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();

  // ── Cache hit ──
  const cacheKey = destination.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    console.log(`[activities/search] cache hit "${destination}" (${hit.activities.length})`);
    return NextResponse.json({ activities: hit.activities, city: hit.city, country: hit.country, source: "cache" });
  }

  // ── No API key → return mock fallback ──
  if (!apiKey) {
    console.warn("[activities/search] GOOGLE_PLACES_API_KEY not set — returning mock data");
    const mock = DESTINATION_DATA["Tokyo, Japan"];
    return NextResponse.json({
      activities: mock.activities,
      city:       mock.city,
      country:    mock.country,
      source:     "mock",
      warning:    "GOOGLE_PLACES_API_KEY not configured",
    });
  }

  // ── Geocode ──
  const geo = await geocodeDestination(destination, apiKey);
  if (!geo) {
    console.error(
      `[activities/search] GEOCODE FAILED — dest="${destination}" key_len=${apiKey.length} key_prefix="${apiKey.slice(0, 8)}..." — check logs above for google_status/error_message`,
    );
    return NextResponse.json({ error: "Could not locate that destination", activities: [] }, { status: 404 });
  }

  const { lat, lng, viewport, city, country } = geo;

  // Search radius: half the viewport diagonal, capped 8–50 km
  const diagKm = haversineKm(viewport.southwest.lat, viewport.southwest.lng, viewport.northeast.lat, viewport.northeast.lng);
  const radiusM = Math.round(Math.min(Math.max(diagKm * 500, 8000), 50000));

  console.log(`[activities/search] "${destination}" lat=${lat.toFixed(4)} lng=${lng.toFixed(4)} radius=${radiusM}m`);

  // ── Concurrent searches ──
  const searchResults = await Promise.all(
    SEARCH_GROUPS.map(async (g): Promise<{ places: GooglePlace[]; category: Category; tags: string[] }> => {
      const tags = g.tags ?? [];
      if (g.type) {
        const places = await nearbySearch(lat, lng, radiusM, g.type, g.limit, apiKey);
        return { places, category: g.category, tags };
      }
      if (g.query) {
        const query = g.query.replace("{city}", city);
        const places = await textSearch(query, lat, lng, g.limit, apiKey, g.pages ?? 1);
        return { places, category: g.category, tags };
      }
      return { places: [], category: g.category, tags };
    }),
  );

  // ── Log first 5 raw places to verify photo fields ──
  const allRaw = searchResults.flatMap((r) => r.places);
  const sample = allRaw.slice(0, 5);
  for (const p of sample) {
    const photoName = p.photos?.[0]?.name ?? "NONE";
    const photoUrl  = p.photos?.[0]?.name
      ? `https://places.googleapis.com/v1/${p.photos[0].name}/media?maxWidthPx=800&key=REDACTED`
      : "NO_URL";
    console.log(
      `[activities/places] name="${p.displayName?.text ?? "?"}" ` +
      `has_photos=${Boolean(p.photos?.length)} ` +
      `photo_name="${photoName.slice(0, 80)}" ` +
      `photo_url="${photoUrl.slice(0, 120)}"`,
    );
  }

  // ── Build per-place maps: raw place data + accumulated tags from all groups ──
  // A place can appear in multiple groups (e.g. both "sushi" and "omakase" queries).
  // We keep the raw place from the first occurrence and union all group tags so the
  // place is discoverable by any relevant search term.
  const placeMap    = new Map<string, GooglePlace>();
  const placeTagMap = new Map<string, string[]>();

  for (const { places, tags } of searchResults) {
    for (const p of places) {
      if (!placeMap.has(p.id))    placeMap.set(p.id, p);
      if (!placeTagMap.has(p.id)) placeTagMap.set(p.id, []);
      const acc = placeTagMap.get(p.id)!;
      for (const t of tags) {
        if (!acc.includes(t)) acc.push(t);
      }
    }
  }

  // ── Dedup + filter ──
  const seen    = new Set<string>();
  const mapped: Activity[] = [];

  let rejectedDedup     = 0;
  let rejectedClosed    = 0;
  let rejectedNoRating  = 0;
  let rejectedLowRating = 0;
  let rejectedBounds    = 0;
  const totalRaw = searchResults.reduce((s, r) => s + r.places.length, 0);

  for (const { places, category } of searchResults) {
    for (const p of places) {
      if (seen.has(p.id)) { rejectedDedup++; continue; }
      seen.add(p.id);

      if (p.businessStatus === "CLOSED_PERMANENTLY") { rejectedClosed++; continue; }

      // Keep unrated places but skip truly low-rated ones
      if (p.rating !== undefined && p.rating < 2.5) { rejectedLowRating++; continue; }
      if (p.rating === undefined && (p.userRatingCount ?? 0) === 0) { rejectedNoRating++; continue; }

      if (!insideBounds(p, viewport)) { rejectedBounds++; continue; }

      mapped.push(mapToActivity(p, category, city, placeTagMap.get(p.id) ?? []));
    }
  }

  console.log(
    `[activities/search] FILTER dest="${destination}" raw=${totalRaw} ` +
    `dedup_skip=${rejectedDedup} closed=${rejectedClosed} ` +
    `no_rating=${rejectedNoRating} low_rating=${rejectedLowRating} ` +
    `out_of_bounds=${rejectedBounds} → kept=${mapped.length}`,
  );

  if (mapped.length > 0) {
    const first3 = mapped.slice(0, 3).map((a) => `"${a.title}"`).join(", ");
    console.log(`[activities/search] first 3 places (pre-sort): ${first3}`);
  }

  // Sort: photos first, then weighted by rating × log(reviews)
  mapped.sort((a, b) => {
    const aPhoto = a.photoRef ? 1 : 0;
    const bPhoto = b.photoRef ? 1 : 0;
    if (aPhoto !== bPhoto) return bPhoto - aPhoto;
    const scoreA = a.rating * Math.log1p(a.reviewCount);
    const scoreB = b.rating * Math.log1p(b.reviewCount);
    return scoreB - scoreA;
  });

  const withPhotos    = mapped.filter((a) => a.photoRef).length;
  const withoutPhotos = mapped.length - withPhotos;
  console.log(
    `[activities/search] dest="${destination}" → ${mapped.length} activities ` +
    `(${withPhotos} with photos, ${withoutPhotos} gradient-only) source=places_api`,
  );

  if (mapped.length > 0) {
    const top3 = mapped.slice(0, 3).map((a) => `"${a.title}"`).join(", ");
    console.log(`[activities/search] top 3 after sort: ${top3}`);
  }

  // ── Fallback only if Google returned nothing at all ──
  if (mapped.length === 0) {
    console.warn(
      `[activities/search] MOCK FALLBACK dest="${destination}" — zero real results passed filters. ` +
      `raw=${totalRaw} check [activities/nearby] logs above for REQUEST_DENIED or ZERO_RESULTS`,
    );
    const mock = DESTINATION_DATA["Tokyo, Japan"];
    return NextResponse.json({
      activities: mock.activities,
      city:       mock.city,
      country:    mock.country,
      source:     "mock_fallback",
    });
  }

  // ── AI-enhanced Why Visit — overwrites template text with place-specific summaries ──
  // Templates (set in mapToActivity) serve as fallback if OpenAI is unavailable.
  // Limit AI generation to the top 60 — rest use template text from mapToActivity
  const aiWhyVisit = await generateWhyVisitBatch(mapped.slice(0, 60), placeMap, city);
  if (aiWhyVisit.size > 0) {
    for (const activity of mapped) {
      const text = aiWhyVisit.get(activity.id);
      if (text) activity.whyVisit = text;
    }
  }

  cache.set(cacheKey, { activities: mapped, city, country, ts: Date.now() });

  return NextResponse.json({ activities: mapped, city, country, source: "places_api" });
}

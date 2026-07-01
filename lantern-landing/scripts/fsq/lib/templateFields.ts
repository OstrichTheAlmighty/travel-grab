/**
 * Template-based field generation for FSQ activities.
 *
 * All fields here are derived from FSQ signals (category, subcategory labels,
 * quality score, popularity, address) at zero AI cost.  Only the Overview
 * (description) is AI-generated separately via Claude Haiku Batch API.
 */

import type { NormalizedActivity } from "../../../lib/activities/types";
import type { Category, Badge } from "../../../app/activities/data/types";

// ── Output shape ──────────────────────────────────────────────────────────────

export interface TemplateFields {
  neighborhood: string;
  duration: string;
  price: string;
  isFree: boolean;
  tags: string[];
  badges: Badge[];
  emoji: string;
  gradient: string;
  whyVisit: string;
}

// ── Category → display ────────────────────────────────────────────────────────

const CATEGORY_GRADIENT: Record<string, string> = {
  food:        "radial-gradient(ellipse at 30% 25%, rgba(194,65,12,0.95) 0%, rgba(120,53,15,0.85) 45%, rgba(12,8,4,1) 100%)",
  nightlife:   "radial-gradient(ellipse at 70% 20%, rgba(79,70,229,0.85) 0%, rgba(30,27,75,0.9) 50%, rgba(5,5,18,1) 100%)",
  culture:     "radial-gradient(ellipse at 35% 30%, rgba(109,40,217,0.9) 0%, rgba(76,29,149,0.85) 45%, rgba(8,4,18,1) 100%)",
  adventure:   "radial-gradient(ellipse at 25% 45%, rgba(13,148,136,0.9) 0%, rgba(6,78,59,0.85) 45%, rgba(3,10,8,1) 100%)",
  nature:      "radial-gradient(ellipse at 50% 20%, rgba(21,128,61,0.9) 0%, rgba(20,83,45,0.85) 45%, rgba(3,10,5,1) 100%)",
  luxury:      "radial-gradient(ellipse at 60% 30%, rgba(161,107,20,0.9) 0%, rgba(120,53,15,0.8) 45%, rgba(10,7,3,1) 100%)",
  hidden_gems: "radial-gradient(ellipse at 35% 40%, rgba(147,51,234,0.9) 0%, rgba(88,28,135,0.85) 45%, rgba(8,3,15,1) 100%)",
  free:        "radial-gradient(ellipse at 35% 40%, rgba(147,51,234,0.9) 0%, rgba(88,28,135,0.85) 45%, rgba(8,3,15,1) 100%)",
};

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍜", nightlife: "🌃", culture: "🎭",
  adventure: "⚡", nature: "🌿", luxury: "✨", hidden_gems: "💎", free: "💎",
};

// ── Label-based overrides ─────────────────────────────────────────────────────

const LABEL_EMOJI: Record<string, string> = {
  "Museum": "🏛️", "Art Museum": "🎨", "Art Gallery": "🎨",
  "Shrine": "⛩️", "Buddhist Temple": "🛕", "Temple": "🛕", "Hindu Temple": "🛕",
  "Historic Site": "🏰", "Castle": "🏰", "Palace": "🏰",
  "Park": "🌸", "Garden": "🌺", "Beach": "🏖️", "Waterfront": "🌊",
  "Amusement Park": "🎢", "Theme Park": "🎢",
  "Aquarium": "🐠", "Zoo": "🦁",
  "Observation Deck": "🔭",
  "Restaurant": "🍽️", "Cafe": "☕", "Coffee": "☕", "Bakery": "🥐",
  "Bar": "🍸", "Night Club": "💃",
  "Spa": "💆", "Onsen": "♨️",
};

function pickEmoji(category: Category | "free", labelText: string): string {
  for (const [label, emoji] of Object.entries(LABEL_EMOJI)) {
    if (labelText.includes(label)) return emoji;
  }
  return CATEGORY_EMOJI[category] ?? "📍";
}

// ── Duration ──────────────────────────────────────────────────────────────────

function estimateDuration(labelText: string, category: string): string {
  if (/amusement park|theme park/i.test(labelText)) return "3–5 hours";
  if (/museum|gallery/i.test(labelText))            return "2–3 hours";
  if (/zoo|aquarium/i.test(labelText))              return "2–4 hours";
  if (/observation deck|tower/i.test(labelText))    return "1–2 hours";
  if (/park|garden|waterfront/i.test(labelText))    return "1–2 hours";
  if (/historic site|castle|palace|shrine|temple/i.test(labelText)) return "1–2 hours";
  if (/bar|pub|night club/i.test(labelText))        return "2–4 hours";
  if (/restaurant|izakaya/i.test(labelText))        return "1–1.5 hours";
  if (/cafe|coffee|bakery/i.test(labelText))        return "30–60 min";
  if (/spa|onsen|bath/i.test(labelText))            return "1–3 hours";
  if (category === "nightlife")                     return "2–4 hours";
  if (category === "food")                          return "1–1.5 hours";
  if (category === "nature")                        return "1–2 hours";
  if (category === "adventure")                     return "2–3 hours";
  return "1–2 hours";
}

// ── Price ─────────────────────────────────────────────────────────────────────

function estimatePrice(labelText: string, category: string): { price: string; isFree: boolean } {
  if (/park|garden|plaza|waterfront|beach|free/i.test(labelText) && !/restaurant|bar|cafe/i.test(labelText)) {
    return { price: "Free", isFree: true };
  }
  if (/cafe|coffee|bakery|food truck|street food/i.test(labelText)) return { price: "$", isFree: false };
  if (/fine dining|omakase|luxury/i.test(labelText))                return { price: "$$$$", isFree: false };
  if (/restaurant|izakaya|sushi|ramen/i.test(labelText))            return { price: "$$", isFree: false };
  if (/bar|pub|night club|club/i.test(labelText))                   return { price: "$$", isFree: false };
  if (/museum|amusement|aquarium|zoo|observation/i.test(labelText)) return { price: "$$", isFree: false };
  if (/shrine|temple|church|cathedral/i.test(labelText))            return { price: "Free", isFree: true };
  if (category === "free")                                           return { price: "Free", isFree: true };
  if (category === "luxury")                                         return { price: "$$$", isFree: false };
  return { price: "Varies", isFree: false };
}

// ── Tags from FSQ labels ──────────────────────────────────────────────────────

function buildTags(categoryLabels: string[], category: string): string[] {
  const tags: string[] = [];

  const leafLabels = categoryLabels.map((label) =>
    label.includes(">") ? label.split(">").at(-1)?.trim() ?? label : label,
  );

  for (const label of leafLabels) {
    if (label.length > 0 && label.length <= 30) tags.push(label);
  }

  // Category-level fallback tag
  const catTag: Record<string, string> = {
    culture: "Culture", nature: "Outdoor", adventure: "Adventure",
    food: "Food", nightlife: "Nightlife", luxury: "Luxury", free: "Free Entry",
  };
  const ct = catTag[category];
  if (ct && !tags.some((t) => t.toLowerCase() === ct.toLowerCase())) {
    tags.push(ct);
  }

  return [...new Set(tags)].slice(0, 6);
}

// ── Badges ────────────────────────────────────────────────────────────────────

function buildBadges(
  category: string,
  labelText: string,
  isFree: boolean,
  price: string,
  qualityScore: number,
): Badge[] {
  const badges: Badge[] = [];
  if (isFree) badges.push("free");
  if (price === "$$$$" || price === "$$$") badges.push("worth_the_splurge");
  if (/zoo|aquarium|amusement park|theme park/i.test(labelText)) badges.push("family_friendly");
  if (qualityScore >= 80) badges.push("popular");
  return [...new Set(badges)].slice(0, 3) as Badge[];
}

// ── Why Visit (template-only, used before AI overview arrives) ────────────────

function buildWhyVisit(
  name: string,
  cityName: string,
  category: string,
  labelText: string,
  fsqDescription: string | undefined,
): string {
  if (fsqDescription && fsqDescription.length >= 40) return fsqDescription;

  if (/museum/i.test(labelText))
    return `Explore ${name}'s collections spanning history, art, or science across its exhibition floors.`;
  if (/art.*gallery|gallery.*art/i.test(labelText))
    return `Browse original works at ${name}, from paintings and sculpture to contemporary installation.`;
  if (/aquarium/i.test(labelText))
    return `Watch sharks, rays, and tropical fish drift through ${name}'s immersive tanks and walk-through tunnels.`;
  if (/zoo/i.test(labelText))
    return `See wildlife from dozens of species across ${name}'s enclosures, aviaries, and habitat zones.`;
  if (/amusement park|theme park/i.test(labelText))
    return `Take on rides, shows, and attractions across ${name}'s grounds — popular with families and groups.`;
  if (/observation deck/i.test(labelText))
    return `Ride to the top of ${name} for sweeping views across the ${cityName} skyline.`;
  if (/shrine|temple|cathedral|church|mosque/i.test(labelText))
    return `Step inside ${name} for striking architecture, ritual atmosphere, and a quieter moment in ${cityName}.`;
  if (/castle|palace|fort/i.test(labelText))
    return `Walk through ${name}'s historic rooms and grounds, tracing centuries of ${cityName}'s past.`;
  if (/park|garden/i.test(labelText))
    return `Walk, cycle, or simply rest in ${name}'s open green spaces — a break from the city pace.`;
  if (/beach|waterfront/i.test(labelText))
    return `Spend time at ${name}'s waterfront with views, sea air, and space to unwind.`;
  if (/bar|pub/i.test(labelText))
    return `Pull up a seat at ${name} for drinks and a local evening out in ${cityName}.`;
  if (/night club|club/i.test(labelText))
    return `Dance to music and late-night energy at ${name}, one of ${cityName}'s popular nightlife venues.`;
  if (/restaurant/i.test(labelText) && /fine|omakase|michelin/i.test(labelText))
    return `Reserve a table at ${name} for a high-end dining experience in ${cityName}.`;
  if (/restaurant/i.test(labelText))
    return `Sit down at ${name} for a full meal in a local ${cityName} dining room.`;
  if (/cafe|coffee|bakery/i.test(labelText))
    return `Stop at ${name} for coffee, pastries, or a light bite in ${cityName}.`;
  if (/spa|onsen|bath/i.test(labelText))
    return `Book a treatment or soak at ${name} for a proper rest from sightseeing.`;
  if (/market/i.test(labelText))
    return `Browse stalls at ${name} for local produce, street food, and artisan goods.`;

  const fallback: Record<string, string> = {
    culture:  `Visit ${name} for ${cityName}'s culture, history, and local character.`,
    nature:   `Spend time outdoors at ${name}, one of ${cityName}'s natural attractions.`,
    adventure:`Experience ${name} for activity and memorable moments in ${cityName}.`,
    food:     `Try the menu at ${name}, a local favourite in ${cityName}.`,
    nightlife:`Head to ${name} for an evening out in ${cityName}.`,
    luxury:   `Enjoy ${name}'s premium experience in the heart of ${cityName}.`,
    free:     `Visit ${name} — a no-entry-cost highlight in ${cityName}.`,
    hidden_gems: `Discover ${name}, a rewarding stop for those who explore beyond the main tourist trail.`,
  };
  return fallback[category] ?? `Explore ${name} in ${cityName}.`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildTemplateFields(
  activity: NormalizedActivity,
  cityName: string,
): TemplateFields {
  const meta = activity.source_metadata ?? {};
  const categoryLabels: string[] = Array.isArray(meta.fsq_category_labels)
    ? (meta.fsq_category_labels as string[])
    : [];
  const labelText = categoryLabels.join(" ");
  const category = activity.category as Category | "free";
  const qualityScore = Number(meta.travel_value_score ?? 50);

  const { price, isFree } = estimatePrice(labelText, category);
  const tags = buildTags(categoryLabels, category);
  const badges = buildBadges(category, labelText, isFree, price, qualityScore);
  const emoji = pickEmoji(category, labelText);
  const gradient = CATEGORY_GRADIENT[category] ?? CATEGORY_GRADIENT.culture;
  const neighborhood = String(meta.locality ?? "");
  const duration = estimateDuration(labelText, category);
  const whyVisit = buildWhyVisit(
    activity.title,
    cityName,
    category,
    labelText,
    activity.description,
  );

  return { neighborhood, duration, price, isFree, tags, badges, emoji, gradient, whyVisit };
}

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { NeighborhoodCompare } from "./NeighborhoodCompare";
import type { ComparableSummary } from "./NeighborhoodCompare";
import MapNeighborhoodPanel from "./MapNeighborhoodPanel";
import type { NbhdPanelData } from "./MapNeighborhoodPanel";

const HotelMapView = dynamic(() => import("./HotelMapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-xl border border-white/[0.08] bg-white/[0.02] animate-pulse" />
  ),
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface HotelOffer {
  hotel_id: string;
  source: string;
  name: string;
  address: string;
  star_rating: number;
  overall_rating: number;
  review_count: number;
  location_rating: number;
  price_per_night: number;
  total_price: number;
  nights: number;
  currency: string;
  amenities: string[];
  image_url: string;
  image_urls?: string[];
  booking_url: string;
  check_in: string;
  check_out: string;
  hotel_type: string;
  eco_certified: boolean;
  description: string;
  ai_score: number;
  recommendation_label: string;
  recommendation_why: string;
  nearby_walk: { name: string; minutes: number } | null;
  score_breakdown: {
    price: number; reviews: number; location: number; stars: number; walkability: number;
    destination_fit: number;
  };
  neighborhood_fit_score: number;
  inferred_neighborhood:  string;
  neighborhood_fit_label: string;
  location_summary: string;
  transit_note:     string;
  latitude?:  number;
  longitude?: number;
  rank_position?:      number;
  rank_bullets?:       string[];
  rank_weakness?:      string;
  skip_reason?:        string;
  rating_sanity_note?: string;
  extra_badges?:       string[];
}

interface AutocompleteSuggestion {
  text: string;
  secondary: string;
}

type SearchState = "idle" | "loading" | "results" | "error";

// ── Neighborhood preference definitions ───────────────────────────────────────

const NEIGHBORHOOD_PREFS = [
  { id: "first-time",  label: "First-time visitor"   },
  { id: "sightseeing", label: "Sightseeing"           },
  { id: "food",        label: "Food & restaurants"    },
  { id: "nightlife",   label: "Nightlife"             },
  { id: "quiet",       label: "Quiet / relaxed"       },
  { id: "luxury",      label: "Luxury"                },
  { id: "budget",      label: "Budget-friendly"       },
  { id: "family",      label: "Family-friendly"       },
  { id: "transit",     label: "Near transit"          },
  { id: "walkable",    label: "Walkable central area" },
] as const;

type PrefId = (typeof NEIGHBORHOOD_PREFS)[number]["id"];

// ── Amenity quick-filters ──────────────────────────────────────────────────────

const AMENITY_FILTERS = [
  { id: "pool",       label: "Pool",          terms: ["pool", "swimming"] },
  { id: "breakfast",  label: "Breakfast",     terms: ["breakfast"] },
  { id: "wifi",       label: "Free WiFi",     terms: ["wifi", "wi-fi", "wireless internet"] },
  { id: "spa",        label: "Spa",           terms: ["spa", "wellness"] },
  { id: "gym",        label: "Gym",           terms: ["gym", "fitness", "exercise room"] },
] as const;
type AmenityFilterId = (typeof AMENITY_FILTERS)[number]["id"];

function hotelHasAmenity(amenities: string[], terms: readonly string[]): boolean {
  return terms.some((t) => amenities.some((a) => a.toLowerCase().includes(t)));
}

// ── Preference conflict detection ─────────────────────────────────────────────

const PREF_CONFLICTS: Array<[PrefId, PrefId, string]> = [
  ["quiet",  "nightlife", "Quiet + Nightlife often conflict. Showing hotels that balance both — or deselect one to prioritize."],
  ["budget", "luxury",    "Budget + Luxury are contradictory. Showing mid-range options that score best on both."],
];

// ── City neighborhood guide data ──────────────────────────────────────────────

interface NeighborhoodCard {
  id:            string;
  name:          string;
  description:   string;
  tags:          string[];
  matchKeywords: string[];  // checked against inferred_neighborhood + address
}
interface CityGuide { displayName: string; neighborhoods: NeighborhoodCard[]; }

const CITY_GUIDES: Record<string, CityGuide> = {
  tokyo: {
    displayName: "Tokyo",
    neighborhoods: [
      {
        id: "ginza-chuo",
        name: "Ginza / Chuo",
        description: "Tokyo's luxury heartland — Michelin restaurants, designer boutiques, and upscale hotels steps from the city's finest shopping.",
        tags: ["Luxury", "Fine Dining", "Shopping", "First-time"],
        matchKeywords: ["ginza", "chuo city", "chuo-ku", "ginza / chuo"],
      },
      {
        id: "shinjuku",
        name: "Shinjuku",
        description: "The city's neon-lit transit hub with the world's busiest station, legendary nightlife, and hotels for every budget.",
        tags: ["Nightlife", "Transit", "First-time", "Shopping"],
        matchKeywords: ["shinjuku"],
      },
      {
        id: "shibuya",
        name: "Shibuya",
        description: "Youth culture, the iconic scramble crossing, world-class shopping, and a lively evening scene.",
        tags: ["Nightlife", "Shopping", "First-time", "Food"],
        matchKeywords: ["shibuya"],
      },
      {
        id: "roppongi-minato",
        name: "Roppongi / Minato",
        description: "International embassy district with luxury hotels, Michelin-starred dining, and one of Tokyo's most vibrant nightlife areas.",
        tags: ["Luxury", "Nightlife", "Dining", "International"],
        matchKeywords: ["roppongi", "minato city", "minato-ku", "roppongi / minato", "azabu", "akasaka"],
      },
      {
        id: "asakusa-taito",
        name: "Asakusa / Taito",
        description: "Traditional Tokyo — Senso-ji temple, rickshaws, craft shops, and budget-friendly accommodation near classic sights.",
        tags: ["Sightseeing", "Budget", "Traditional", "First-time"],
        matchKeywords: ["asakusa", "taito city", "taito-ku", "asakusa / taito"],
      },
      {
        id: "ueno",
        name: "Ueno",
        description: "Major museums, Ueno Park, and excellent transit links. Great for culture, families, and budget travelers.",
        tags: ["Museums", "Budget", "Transit", "Sightseeing"],
        matchKeywords: ["ueno", "ueno / bunkyo", "bunkyo"],
      },
      {
        id: "ebisu-daikanyama",
        name: "Ebisu / Daikanyama",
        description: "A quiet, upscale local neighborhood with excellent restaurants, independent boutiques, and a relaxed residential vibe.",
        tags: ["Quiet", "Dining", "Upscale Local", "Walkable"],
        matchKeywords: ["ebisu", "daikanyama", "meguro / ebisu", "meguro"],
      },
    ],
  },
  barcelona: {
    displayName: "Barcelona",
    neighborhoods: [
      {
        id: "eixample",
        name: "Eixample",
        description: "Barcelona's iconic grid district — Gaudí's Sagrada Família, luxury shopping on Passeig de Gràcia, and an exceptional dining scene.",
        tags: ["Luxury", "Dining", "Sightseeing", "First-time"],
        matchKeywords: ["eixample", "passeig de gràcia", "paseo de gracia"],
      },
      {
        id: "gothic-quarter",
        name: "Gothic Quarter",
        description: "Narrow medieval streets in the historic heart of Barcelona — walkable, tourist-friendly, and lively at night.",
        tags: ["Sightseeing", "Nightlife", "Walkable", "First-time"],
        matchKeywords: ["barri gòtic", "barri gotic", "gothic quarter", "gothic"],
      },
      {
        id: "el-born",
        name: "El Born",
        description: "Trendy mix of art, independent restaurants, and craft cocktail bars in a compact, walkable historic neighbourhood.",
        tags: ["Food", "Culture", "Walkable", "Nightlife"],
        matchKeywords: ["el born", "el born / sant pere"],
      },
      {
        id: "gracia",
        name: "Gràcia",
        description: "A village-within-the-city with quiet plazas, independent cafes, and a genuinely local atmosphere away from the crowds.",
        tags: ["Quiet", "Local", "Food", "Walkable"],
        matchKeywords: ["gràcia", "gracia"],
      },
      {
        id: "barceloneta",
        name: "Barceloneta",
        description: "Barcelona's beach neighbourhood — fresh seafood, sand, and a lively waterfront nightlife scene.",
        tags: ["Beach", "Nightlife", "Food", "Waterfront"],
        matchKeywords: ["barceloneta"],
      },
      {
        id: "sarria",
        name: "Sarrià-Sant Gervasi",
        description: "Upscale, quiet residential area away from tourist crowds — ideal for a peaceful luxury stay or family trip.",
        tags: ["Luxury", "Quiet", "Family", "Residential"],
        matchKeywords: ["sarrià", "sarria", "sant gervasi", "sarrià-sant gervasi"],
      },
    ],
  },
  london: {
    displayName: "London",
    neighborhoods: [
      {
        id: "mayfair",
        name: "Mayfair / Belgravia",
        description: "London's most exclusive postcode — Michelin-starred restaurants, luxury boutiques, and the capital's finest hotels on quiet Georgian streets.",
        tags: ["Luxury", "Fine Dining", "Shopping", "Quiet"],
        matchKeywords: ["mayfair", "belgravia", "knightsbridge", "st james"],
      },
      {
        id: "covent-garden",
        name: "Covent Garden / West End",
        description: "The tourist heart of London — world-class theatres, markets, museums, and restaurants packed into a vibrant, highly walkable neighbourhood.",
        tags: ["First-time", "Sightseeing", "Walkable", "Theatre"],
        matchKeywords: ["covent garden", "west end", "strand", "holborn", "soho", "westminster"],
      },
      {
        id: "shoreditch",
        name: "Shoreditch / East London",
        description: "London's creative powerhouse — street art, independent restaurants, rooftop bars, and a nightlife scene that runs until dawn.",
        tags: ["Nightlife", "Food", "Creative", "Budget"],
        matchKeywords: ["shoreditch", "brick lane", "hackney", "spitalfields", "bethnal green", "hoxton"],
      },
      {
        id: "south-bank",
        name: "South Bank / Southwark",
        description: "Culture along the Thames — Tate Modern, Shakespeare's Globe, Borough Market, and stunning riverside walks all within easy reach.",
        tags: ["Sightseeing", "Walkable", "Food", "Culture"],
        matchKeywords: ["south bank", "southwark", "bermondsey", "london bridge", "borough"],
      },
      {
        id: "kensington",
        name: "Kensington / Notting Hill",
        description: "Leafy, residential London at its most charming — museums, Portobello Market, peaceful streets, and excellent family-friendly hotels.",
        tags: ["Quiet", "Family", "Museums", "Walkable"],
        matchKeywords: ["kensington", "notting hill", "chelsea", "earls court", "south kensington"],
      },
      {
        id: "bloomsbury",
        name: "Bloomsbury / King's Cross",
        description: "Literary London with the British Museum at its heart. Excellent transit links and some of the best-value hotels in central London.",
        tags: ["Museums", "Budget", "Transit", "First-time"],
        matchKeywords: ["bloomsbury", "king's cross", "kings cross", "euston", "fitzrovia", "russell square"],
      },
    ],
  },
  "new york": {
    displayName: "New York City",
    neighborhoods: [
      {
        id: "midtown",
        name: "Midtown Manhattan",
        description: "The iconic New York experience — Times Square, Empire State Building, Central Park, and the world's most connected transit hub.",
        tags: ["First-time", "Sightseeing", "Transit", "Shopping"],
        matchKeywords: ["midtown", "times square", "hell's kitchen", "murray hill", "theatre district", "fifth ave", "park ave"],
      },
      {
        id: "upper-east-side",
        name: "Upper East Side",
        description: "Quiet, tree-lined streets and Central Park on the doorstep. Museum Mile, world-class dining, and elegant hotels in a refined residential neighborhood.",
        tags: ["Quiet", "Luxury", "Family", "Museums"],
        matchKeywords: ["upper east side", "yorkville", "lenox hill", "carnegie hill", "museum mile"],
      },
      {
        id: "soho-west-village",
        name: "SoHo / West Village",
        description: "NYC's most walkable neighbourhood — cobblestone streets, Michelin-starred restaurants, luxury boutiques, and a vibrant art scene.",
        tags: ["Food", "Walkable", "Luxury", "Nightlife"],
        matchKeywords: ["soho", "west village", "tribeca", "greenwich village", "nolita", "noho"],
      },
      {
        id: "brooklyn",
        name: "Brooklyn / Williamsburg",
        description: "The coolest zip codes in New York — world-class food, independent bars, stunning Manhattan skyline views, and better value for money.",
        tags: ["Nightlife", "Food", "Budget", "Trendy"],
        matchKeywords: ["williamsburg", "dumbo", "brooklyn heights", "park slope", "bushwick", "brooklyn"],
      },
      {
        id: "lower-east-side",
        name: "Lower East Side / East Village",
        description: "NYC's nightlife epicentre with the best bar-hopping streets, diverse food halls, and a young, creative energy at all hours.",
        tags: ["Nightlife", "Food", "Budget", "Culture"],
        matchKeywords: ["lower east side", "east village", "les ", "alphabet city", "orchard street"],
      },
      {
        id: "financial-district",
        name: "Financial District",
        description: "Historic downtown Manhattan with the 9/11 Memorial, Brooklyn Bridge, and ferry to the Statue of Liberty. Well-connected and often affordable.",
        tags: ["Sightseeing", "Transit", "Budget", "History"],
        matchKeywords: ["financial district", "fidi", "battery park", "wall street", "downtown manhattan", "fulton"],
      },
    ],
  },
  bangkok: {
    displayName: "Bangkok",
    neighborhoods: [
      {
        id: "riverside",
        name: "Riverside / Charoenkrung",
        description: "Bangkok's grandest luxury hotels line the Chao Phraya — stunning river views, iconic rooftop bars, and an emerging art and dining district.",
        tags: ["Luxury", "Views", "Fine Dining", "Quiet"],
        matchKeywords: ["riverside", "charoenkrung", "chao phraya", "iconsiam", "asiatique"],
      },
      {
        id: "rattanakosin",
        name: "Rattanakosin / Old City",
        description: "Bangkok's ancient heart — the Grand Palace, Wat Pho, and Wat Arun are steps away. The best base for culture and sightseeing.",
        tags: ["Sightseeing", "Culture", "First-time", "Historic"],
        matchKeywords: ["rattanakosin", "grand palace", "khao san", "khaosan", "banglamphu", "phra nakhon", "wat pho"],
      },
      {
        id: "sukhumvit",
        name: "Sukhumvit",
        description: "Bangkok's expat and tourist hub — excellent BTS access, rooftop bars, international restaurants, and hotels for every budget.",
        tags: ["Nightlife", "Transit", "Food", "International"],
        matchKeywords: ["sukhumvit", "asok", "nana", "phrom phong", "on nut", "ekkamai"],
      },
      {
        id: "silom-sathorn",
        name: "Silom / Sathorn",
        description: "Bangkok's business and financial district by day — and home to Patpong nightlife and excellent transit links by night.",
        tags: ["Business", "Transit", "Nightlife", "Upscale"],
        matchKeywords: ["silom", "sathorn", "patpong", "ploenchit", "sala daeng"],
      },
      {
        id: "siam",
        name: "Siam / Ari",
        description: "The ultimate Bangkok transit hub — Siam BTS interchange, top shopping malls, and the local neighbourhood of Ari with excellent cafes and food.",
        tags: ["Transit", "Shopping", "Food", "Local"],
        matchKeywords: ["siam", "ari", "phaya thai", "ratchathewi", "pratunam"],
      },
    ],
  },
  singapore: {
    displayName: "Singapore",
    neighborhoods: [
      {
        id: "marina-bay",
        name: "Marina Bay",
        description: "Singapore's spectacular skyline district — Marina Bay Sands, Gardens by the Bay, and the city's best views. Premium hotels with iconic infinity pools.",
        tags: ["Luxury", "Sightseeing", "First-time", "Views"],
        matchKeywords: ["marina bay", "marina sands", "raffles place", "city hall", "esplanade"],
      },
      {
        id: "orchard",
        name: "Orchard Road",
        description: "Singapore's premier shopping belt with luxury malls, flagship hotels, and the best transit connections. Ideal for luxury and transit travelers.",
        tags: ["Luxury", "Shopping", "Transit", "Upscale"],
        matchKeywords: ["orchard", "scotts road", "tanglin", "novena"],
      },
      {
        id: "chinatown",
        name: "Chinatown / Tanjong Pagar",
        description: "Singapore's most authentic food destination — hawker centres with Michelin stars, walkable heritage streets, and some of the best nightlife.",
        tags: ["Food", "Nightlife", "Walkable", "Budget"],
        matchKeywords: ["chinatown", "tanjong pagar", "telok ayer", "ann siang", "keong saik"],
      },
      {
        id: "little-india-arab",
        name: "Little India / Arab Street",
        description: "Two of Singapore's most vibrant cultural enclaves — incredible food diversity, colourful heritage architecture, and budget-friendly accommodation.",
        tags: ["Food", "Culture", "Budget", "Walkable"],
        matchKeywords: ["little india", "arab street", "kampong glam", "bugis", "serangoon", "mustafa"],
      },
      {
        id: "sentosa",
        name: "Sentosa Island",
        description: "Singapore's resort island — Universal Studios, S.E.A. Aquarium, beach clubs, and world-class family resort hotels in a stunning setting.",
        tags: ["Family", "Beach", "Resort", "Leisure"],
        matchKeywords: ["sentosa", "resorts world", "universal studios", "harbourfront"],
      },
    ],
  },
  seoul: {
    displayName: "Seoul",
    neighborhoods: [
      {
        id: "myeongdong",
        name: "Myeongdong / Jung-gu",
        description: "Seoul's most popular tourist district — excellent transit, street food every 10 metres, and easy access to Gyeongbokgung Palace and Namsan Tower.",
        tags: ["First-time", "Transit", "Food", "Shopping"],
        matchKeywords: ["myeongdong", "jung-gu", "namdaemun", "namsan", "city hall"],
      },
      {
        id: "insadong-jongno",
        name: "Insadong / Jongno",
        description: "The cultural heart of Seoul — Bukchon Hanok Village, Gyeongbokgung Palace, and a neighbourhood full of traditional tea houses and galleries.",
        tags: ["Sightseeing", "Culture", "Quiet", "History"],
        matchKeywords: ["insadong", "jongno", "bukchon", "gyeongbokgung", "anguk", "changgye"],
      },
      {
        id: "gangnam",
        name: "Gangnam",
        description: "Seoul's affluent south — luxury hotels, the Apgujeong designer strip, Michelin restaurants, and the city's best-connected express transit.",
        tags: ["Luxury", "Nightlife", "Transit", "Upscale"],
        matchKeywords: ["gangnam", "cheongdam", "apgujeong", "sinnonhyeon", "samsung"],
      },
      {
        id: "hongdae",
        name: "Hongdae / Sinchon",
        description: "Korea's university nightlife belt — indie bars, live music, street performances, and the most diverse affordable food scene in Seoul.",
        tags: ["Nightlife", "Budget", "Food", "Young"],
        matchKeywords: ["hongdae", "sinchon", "mapo", "sangsu", "hapjeong"],
      },
      {
        id: "itaewon",
        name: "Itaewon / Hannam",
        description: "Seoul's most international district — global restaurants, rooftop bars, Antique Row, and the trendiest boutiques and concept stores.",
        tags: ["Nightlife", "Food", "International", "Trendy"],
        matchKeywords: ["itaewon", "hannam", "yongsan", "haebangchon", "hbc"],
      },
    ],
  },
};

function detectCityGuide(destination: string): CityGuide | null {
  const d = destination.toLowerCase();
  if (d.includes("tokyo"))     return CITY_GUIDES.tokyo;
  if (d.includes("barcelona")) return CITY_GUIDES.barcelona;
  if (d.includes("london"))    return CITY_GUIDES.london;
  if (d.includes("new york") || d.includes("nyc")) return CITY_GUIDES["new york"];
  if (d.includes("bangkok") || d.includes("krung thep")) return CITY_GUIDES.bangkok;
  if (d.includes("singapore")) return CITY_GUIDES.singapore;
  if (d.includes("seoul")) return CITY_GUIDES.seoul;
  return null;
}

// ── Neighborhood recommendation engine ───────────────────────────────────────

interface NeighborhoodSummary {
  nbhd:               NeighborhoodCard;
  hotels:             HotelOffer[];
  count:              number;
  lowestPrice:        number;
  avgPrice:           number;
  avgRating:          number;
  avgNfScore:         number;
  bestHotel:          HotelOffer | null;   // top by TravelGrab score
  topRated:           HotelOffer | null;   // top by guest rating
  matchedPrefs:       PrefId[];
  coverageConfidence: "strong" | "good" | "limited";
}

// Maps PrefId → tags that appear in CITY_GUIDES neighborhood cards
const PREF_TAG_MAP: Partial<Record<PrefId, string[]>> = {
  luxury:       ["Luxury", "Fine Dining", "Upscale", "Upscale Local", "Views"],
  quiet:        ["Quiet", "Residential"],
  food:         ["Food", "Dining", "Fine Dining", "Street food"],
  nightlife:    ["Nightlife", "Beach"],
  sightseeing:  ["Sightseeing", "Museums", "Culture", "History", "Historic"],
  transit:      ["Transit"],
  "first-time": ["First-time"],
  walkable:     ["Walkable"],
  budget:       ["Budget"],
  family:       ["Family", "Resort", "Leisure"],
};

function computeNeighborhoodSummaries(
  guide: CityGuide,
  offers: HotelOffer[],
  activePrefs: readonly PrefId[],
): NeighborhoodSummary[] {
  const sums: NeighborhoodSummary[] = guide.neighborhoods.map((nbhd) => {
    const hotels = offers.filter((o) =>
      nbhd.matchKeywords.some(
        (k) =>
          o.inferred_neighborhood.toLowerCase().includes(k.toLowerCase()) ||
          o.address.toLowerCase().includes(k.toLowerCase())
      )
    );
    const nfValues = hotels.map((h) =>
      activePrefs.length > 0 ? h.neighborhood_fit_score : h.score_breakdown.location
    );
    const avgNfScore = nfValues.length > 0
      ? Math.round(nfValues.reduce((s, v) => s + v, 0) / nfValues.length)
      : 0;
    const avgPrice = hotels.length > 0
      ? Math.round(hotels.reduce((s, h) => s + h.price_per_night, 0) / hotels.length)
      : 0;
    const avgRating = hotels.length > 0
      ? Math.round((hotels.reduce((s, h) => s + h.overall_rating, 0) / hotels.length) * 10) / 10
      : 0;
    const lowestPrice = hotels.length > 0
      ? Math.round(Math.min(...hotels.map((h) => h.price_per_night)))
      : 0;
    const bestHotel = hotels.length > 0
      ? hotels.reduce((a, b) => b.ai_score > a.ai_score ? b : a)
      : null;
    const topRated = hotels.length > 0
      ? hotels.reduce((a, b) => b.overall_rating > a.overall_rating ? b : a)
      : null;
    const matchedPrefs = (activePrefs as PrefId[]).filter((p) => {
      const tagKws = PREF_TAG_MAP[p] ?? [p];
      return nbhd.tags.some((tag) =>
        tagKws.some((kw) => tag.toLowerCase().includes(kw.toLowerCase()))
      );
    });
    const count = hotels.length;
    const coverageConfidence: "strong" | "good" | "limited" =
      count >= 5 && avgNfScore >= 55 ? "strong" :
      count >= 3 ? "good" :
      "limited";
    return { nbhd, hotels, count, lowestPrice, avgPrice, avgRating, avgNfScore, bestHotel, topRated, matchedPrefs, coverageConfidence };
  });
  return sums.sort((a, b) =>
    b.avgNfScore !== a.avgNfScore ? b.avgNfScore - a.avgNfScore : b.count - a.count
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(n: number) {
  if (n >= 75) return "text-lantern-mint";
  if (n >= 55) return "text-lantern-blue";
  return "text-lantern-gold";
}
function scoreBg(n: number) {
  if (n >= 75) return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/25";
  if (n >= 55) return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/25";
  return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/25";
}
function labelBg(label: string) {
  if (label === "Best Overall")  return "bg-lantern-violet/20 text-lantern-violet border-lantern-violet/50";
  if (label === "Luxury Pick")   return "bg-amber-500/15 text-amber-300 border-amber-500/35";
  if (label === "Best Location") return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/30";
  if (label === "Budget Pick")   return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/30";
  if (label === "Best Value")    return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/30";
  return "bg-white/10 text-white/60 border-white/15";
}
function fitBg(label: string) {
  const l = label.toLowerCase();
  if (l.startsWith("great") || l.includes("excellent") || l.includes("best overall") || l.includes("highest") || l.includes("prime") || l.includes("outstanding"))
    return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/30";
  if (l.startsWith("good") || l.includes("strong") || l.includes("best value") || l.includes("best reviews"))
    return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/25";
  if (l.startsWith("partial") || l.includes("basic") || l.includes("budget") || l.includes("higher price"))
    return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/25";
  return "bg-white/[0.06] text-white/40 border-white/10";
}

/** Per-card neighborhood fit label that adds preference context to the generic server label. */
function computeCardFitLabel(offer: HotelOffer, activePrefs: readonly PrefId[]): string {
  const label    = offer.neighborhood_fit_label;
  if (!label) return "";
  const prefLabel = activePrefs[0]
    ? (NEIGHBORHOOD_PREFS.find((x) => x.id === activePrefs[0])?.label ?? "")
    : "";
  if (!prefLabel) return label;
  const l = label.toLowerCase();
  if (l === "great fit") {
    return offer.star_rating > 0 && offer.star_rating <= 2
      ? `${prefLabel} Area, Basic Hotel`
      : `Great ${prefLabel} Fit`;
  }
  if (l === "good fit" || l === "good area fit") {
    return offer.star_rating > 0 && offer.star_rating <= 2
      ? `${prefLabel} Area, Budget Hotel`
      : `Good ${prefLabel} Fit`;
  }
  if (l === "partial fit") return `Partial ${prefLabel} Fit`;
  if (l.includes("basic hotel")) return `${prefLabel} Area, Basic Property`;
  return label;
}

/** Filter out "Street A - Street B" bus stop names from SerpAPI nearby_places. */
function isStreetIntersectionName(name: string): boolean {
  return /^[^(]+\s+-\s+[^(]+$/.test(name);
}

function scoreLabel(n: number): string {
  if (n >= 90) return "Elite";
  if (n >= 80) return "Excellent";
  if (n >= 65) return "Good";
  if (n >= 50) return "Fair";
  return "Weak";
}

function coverageLabel(c: "strong" | "good" | "limited", count?: number): string {
  const n = count !== undefined ? `${count} ` : "";
  if (c === "strong")  return `${n}Hotels · Strong`;
  if (c === "good")    return `${n}Hotels`;
  return `${n}Hotels · Limited`;
}

function coverageBadgeStyle(c: "strong" | "good" | "limited"): string {
  if (c === "strong")  return "bg-lantern-mint/10 text-lantern-mint border-lantern-mint/25";
  if (c === "good")    return "bg-lantern-blue/10 text-lantern-blue border-lantern-blue/25";
  return "bg-amber-500/10 text-amber-400 border-amber-500/25";
}

function StarRating({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5 text-amber-400">
      {[1,2,3,4,5].map((i) => (
        <svg key={i} className={`w-2.5 h-2.5 ${i <= count ? "fill-current" : "fill-white/10"}`} viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Returns a specific description for a neighborhood+pref combo to enrich the fit note. */
function getNeighborhoodPrefDetail(nbhd: string, pref: PrefId): string {
  const n = nbhd.toLowerCase();
  if (pref === "luxury") {
    if (n.includes("ginza") || n.includes("chuo"))
      return "Ginza / Chuo area, premium dining, shopping, and upscale hotels";
    if (n.includes("roppongi") || n.includes("minato") || n.includes("azabu") || n.includes("akasaka"))
      return "upscale hotels, Michelin dining, and an international feel";
    if (n.includes("omotesando") || n.includes("aoyama"))
      return "luxury flagship boutiques, refined high-end dining";
    if (n.includes("marunouchi") || n.includes("chiyoda"))
      return "central Tokyo, premium hotels near Tokyo Station";
    if (n.includes("eixample") || n.includes("passeig") || n.includes("barcelona"))
      return "upscale shopping on Passeig de Gràcia, fine dining, and premium hotels";
    if (n.includes("sarrià") || n.includes("sant gervasi") || n.includes("pedralbes"))
      return "prestigious upscale residential address, quiet and refined";
  }
  if (pref === "quiet") {
    if (n.includes("meguro") || n.includes("daikanyama") || n.includes("ebisu"))
      return "quiet tree-lined residential streets away from tourist crowds";
    if (n.includes("aoyama") || n.includes("omotesando"))
      return "calm, leafy boulevards with minimal noise";
    if (n.includes("sarrià") || n.includes("sant gervasi"))
      return "quiet leafy residential streets, relaxed and upscale";
    if (n.includes("gràcia") || n.includes("gracia"))
      return "village-like plazas with a quiet, local atmosphere";
  }
  if (pref === "sightseeing") {
    if (n.includes("asakusa") || n.includes("taito"))
      return "historic temple district with traditional streetscapes and cultural institutions";
    if (n.includes("ueno") || n.includes("bunkyo"))
      return "major museum district with parks, galleries, and historic sites";
    if (n.includes("gothic") || n.includes("gòtic"))
      return "Barcelona's historic medieval core with preserved Roman and Gothic architecture";
    if (n.includes("born"))
      return "historic waterfront district with medieval streets and galleries";
  }
  if (pref === "transit") {
    if (n.includes("shinjuku"))
      return "world's busiest station, direct lines to all parts of Tokyo";
    if (n.includes("shibuya"))
      return "major hub with JR, subway, and bus connections";
    if (n.includes("ginza") || n.includes("chuo") || n.includes("marunouchi"))
      return "multiple metro lines with excellent city-wide connections";
  }
  if (pref === "food") {
    if (n.includes("ginza") || n.includes("chuo"))
      return "Michelin-starred restaurants and world-class dining";
    if (n.includes("ebisu") || n.includes("daikanyama"))
      return "excellent restaurants, cafes, and a vibrant local food scene";
    if (n.includes("eixample"))
      return "exceptional restaurant density with Michelin-starred chefs";
    if (n.includes("born") || n.includes("gòtic"))
      return "dense tapas bars, seafood, and lively restaurant streets";
  }
  if (pref === "nightlife") {
    if (n.includes("shinjuku"))
      return "Tokyo's most active bar and entertainment district";
    if (n.includes("roppongi"))
      return "dense late-night bar and club scene with an international crowd";
    if (n.includes("shibuya"))
      return "youth-focused bars, live music, and an active nightlife scene";
  }
  // London
  if (pref === "luxury") {
    if (n.includes("mayfair") || n.includes("belgravia") || n.includes("st james"))
      return "London's most exclusive address — Michelin restaurants, designer boutiques, and world-class hotels";
    if (n.includes("knightsbridge") || n.includes("chelsea"))
      return "upscale boutiques, Harrods, and premium hotel options";
    if (n.includes("kensington"))
      return "prestigious residential address with excellent high-end hotels and museums";
  }
  if (pref === "quiet") {
    if (n.includes("kensington") || n.includes("notting hill") || n.includes("chelsea"))
      return "leafy, residential streets with Georgian architecture and little tourist noise";
  }
  if (pref === "sightseeing") {
    if (n.includes("westminster") || n.includes("south bank") || n.includes("covent garden"))
      return "walking distance to the city's major historic sites, galleries, and landmarks";
    if (n.includes("bloomsbury"))
      return "museum district with major institutions, galleries, and historic architecture";
  }
  if (pref === "nightlife") {
    if (n.includes("shoreditch") || n.includes("soho"))
      return "London's densest bar and club district with late-night venues";
    if (n.includes("brixton"))
      return "live music venues, diverse bar scene, and a local arts community";
  }
  if (pref === "food") {
    if (n.includes("soho") || n.includes("covent garden"))
      return "some of London's best restaurants ranging from Michelin stars to street food";
    if (n.includes("shoreditch") || n.includes("brixton") || n.includes("southwark"))
      return "food markets, independent restaurants, and some of London's most exciting dining";
  }
  // New York
  if (pref === "luxury") {
    if (n.includes("upper east side") || n.includes("tribeca") || n.includes("central park"))
      return "premium Manhattan address with world-class hotels and fine dining";
    if (n.includes("soho") || n.includes("west village"))
      return "upscale boutiques, acclaimed restaurants, and elegant hotel options";
  }
  if (pref === "quiet") {
    if (n.includes("upper east side") || n.includes("upper west side"))
      return "one of Manhattan's most peaceful, tree-lined residential neighborhoods";
    if (n.includes("tribeca"))
      return "quiet cobblestone streets in a chic, low-key Manhattan neighborhood";
  }
  if (pref === "sightseeing") {
    if (n.includes("midtown") || n.includes("times square"))
      return "central Manhattan with easy access to the city's major landmarks and cultural institutions";
    if (n.includes("financial district"))
      return "lower Manhattan with historic waterfront, ferry access, and iconic architecture";
  }
  if (pref === "nightlife") {
    if (n.includes("lower east side") || n.includes("east village") || n.includes("williamsburg"))
      return "dense bar scene with late-night venues and live music";
  }
  if (pref === "food") {
    if (n.includes("west village") || n.includes("soho") || n.includes("east village"))
      return "some of New York's most acclaimed restaurants and most diverse food culture";
    if (n.includes("williamsburg"))
      return "Brooklyn's vibrant food scene with innovative restaurants and weekend markets";
  }
  return "";
}

/** Build the explicit neighborhood fit note shown on cards when prefs are active. */
function buildFitNote(offer: HotelOffer, prefs: readonly PrefId[]): string {
  if (!prefs.length || !offer.neighborhood_fit_label) return "";

  const label    = offer.neighborhood_fit_label;
  const prefPart = prefs
    .slice(0, 2)
    .map((p) => NEIGHBORHOOD_PREFS.find((x) => x.id === p)?.label ?? p)
    .join(" and ");

  // Try to get a city-specific detail for the primary preference
  for (const pref of prefs.slice(0, 2)) {
    const detail = getNeighborhoodPrefDetail(offer.inferred_neighborhood, pref);
    if (detail) return `${label} for ${prefPart}: ${detail}.`;
  }

  return `${label} for ${prefPart}.`;
}

/** Evidence string for a scoring dimension — replaces raw score numbers in breakdown panel. */
function breakdownEvidence(
  label:       string,
  offer:       HotelOffer,
  avgPrice:    number,
  prefsActive: boolean,
  activePrefs: readonly PrefId[],
): string {
  switch (label) {
    case "Guest Reviews":
      if (offer.overall_rating > 0 && offer.review_count > 0)
        return `${offer.overall_rating.toFixed(1)}★ · ${offer.review_count.toLocaleString()} reviews`;
      return offer.overall_rating > 0 ? `${offer.overall_rating.toFixed(1)}★` : "No reviews yet";

    case "Hotel Quality":
      if (offer.star_rating >= 5) return "5-star luxury hotel";
      if (offer.star_rating >= 4) return `${offer.star_rating}-star hotel`;
      if (offer.star_rating > 0)  return `${offer.star_rating}-star property`;
      return "Unclassified hotel";

    case "Price / Value": {
      if (avgPrice <= 0) return `$${Math.round(offer.price_per_night)}/night`;
      const pct = Math.round((1 - offer.price_per_night / avgPrice) * 100);
      if (pct >= 20)  return `$${Math.round(offer.price_per_night)}/night — ${pct}% below search avg`;
      if (pct <= -15) return `$${Math.round(offer.price_per_night)}/night — ${Math.abs(pct)}% above search avg`;
      return `$${Math.round(offer.price_per_night)}/night — near average`;
    }

    case "Neighborhood Fit":
      if (prefsActive && activePrefs.length > 0) {
        const detail = getNeighborhoodPrefDetail(offer.inferred_neighborhood, activePrefs[0] as PrefId);
        if (detail) return detail;
      }
      return offer.neighborhood_fit_label
        ? `${offer.neighborhood_fit_label} — ${offer.inferred_neighborhood}`
        : offer.inferred_neighborhood || "Neighborhood data";

    case "Destination Fit":
    case "Location":
      if (offer.transit_note) return offer.transit_note;
      if (offer.nearby_walk && offer.nearby_walk.minutes <= 5)
        return `Walkable area — major destinations within ${offer.nearby_walk.minutes} min`;
      if (offer.nearby_walk && offer.nearby_walk.minutes <= 8)
        return `Walkable area — destinations within ${offer.nearby_walk.minutes} min`;
      return offer.inferred_neighborhood || "Centrally located";

    case "Walkability":
      if (offer.nearby_walk && offer.nearby_walk.minutes <= 5)
        return `${offer.nearby_walk.minutes} min walk to major destinations`;
      return `Score: ${offer.score_breakdown.walkability}/100`;

    default:
      return "";
  }
}

// ── Amenity detail data (Phase 4) ─────────────────────────────────────────────

const AMENITY_DETAIL_MAP: Array<[string, string]> = [
  ["pool",        "Swimming pool on premises. Contact hotel for seasonal hours and access rules."],
  ["gym",         "Fitness center available. Contact hotel to confirm hours and equipment."],
  ["fitness",     "Fitness center available. Contact hotel to confirm hours and equipment."],
  ["spa",         "Spa services available. Advance booking is usually required."],
  ["breakfast",   "Breakfast available — may be included in rate or purchasable separately. Confirm with hotel."],
  ["restaurant",  "On-site dining. Hours and cuisine vary — check the hotel website for current menus."],
  ["bar",         "Bar or lounge on premises. Hours may be seasonal."],
  ["parking",     "Parking available. Rates and availability vary — contact hotel to reserve in advance."],
  ["airport",     "Airport shuttle available. Confirm schedule and cost directly with the hotel."],
  ["beach",       "Beach access or beachfront location. Confirm seasonal availability with hotel."],
  ["rooftop",     "Rooftop terrace or bar. Access may be restricted or seasonal."],
  ["pet",         "Pets allowed. Confirm size limits and fees with the hotel before booking."],
  ["wi-fi",       "Wi-Fi available. Connection quality varies — some hotels charge extra for premium speeds."],
  ["wifi",        "Wi-Fi available. Connection quality varies — some hotels charge extra for premium speeds."],
  ["kitchen",     "In-room kitchen or kitchenette. Confirm equipment and utensils with hotel."],
  ["laundry",     "Laundry facilities on premises (self-service or valet). Confirm availability and pricing."],
  ["ev",          "Electric vehicle charging station on premises. Confirm compatibility and cost."],
  ["accessible",  "Accessibility features available. Contact hotel to confirm specific accommodations."],
  ["wheelchair",  "Wheelchair accessible facilities. Contact hotel to confirm specific accommodations."],
  ["childcare",   "Childcare or babysitting services available. Advance booking required."],
  ["concierge",   "Concierge service available for dining reservations, transport, and local recommendations."],
  ["casino",      "Casino on premises or connected to property."],
  ["golf",        "Golf course access available. Greens fees may apply."],
  ["tennis",      "Tennis courts available. Equipment rental may be available."],
  ["air",         "Air conditioning available in rooms."],
  ["hot tub",     "Hot tub or jacuzzi available. May be in-room or shared facility."],
  ["jacuzzi",     "Jacuzzi available. May be in-room or shared facility."],
  ["sauna",       "Sauna on premises. Access may require reservation."],
];

function getAmenityDetail(amenity: string): string | null {
  const lower = amenity.toLowerCase();
  for (const [key, detail] of AMENITY_DETAIL_MAP) {
    if (lower.includes(key)) return detail;
  }
  return null;
}

// ── DestinationCombobox ───────────────────────────────────────────────────────

function DestinationCombobox({
  value,
  onChange,
  onConfirm,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
}) {
  const [open, setOpen]             = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const res  = await fetch(`/api/hotels/autocomplete?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { suggestions?: AutocompleteSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      setHighlighted(-1);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchSuggestions(v); }, 180);
    setOpen(true);
  };

  const selectSuggestion = (s: AutocompleteSuggestion) => {
    onChange(s.text);
    setSuggestions([]);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") onConfirm();
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, -1)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && suggestions[highlighted]) {
        selectSuggestion(suggestions[highlighted]);
      } else {
        setOpen(false);
        onConfirm();
      }
    }
    if (e.key === "Escape") { setOpen(false); setSuggestions([]); }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showDropdown = open && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => { if (value.length >= 2) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="City name (e.g. Paris, New York, Tokyo)"
          autoComplete="off"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel pl-9 pr-3.5 py-3 text-sm text-white placeholder-white/25 outline-none transition-colors"
        />
      </div>

      {showDropdown && (
        <ul className="absolute z-50 mt-1.5 w-full rounded-xl border border-white/10 bg-[#0e1422] shadow-card overflow-hidden">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => selectSuggestion(s)}
              className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                i === highlighted ? "bg-lantern-violet/20" : "hover:bg-white/[0.06]"
              }`}
            >
              <svg className="w-3 h-3 text-white/20 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{s.text}</div>
                {s.secondary && <div className="text-xs text-white/35 truncate">{s.secondary}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── NeighborhoodChips ─────────────────────────────────────────────────────────

function NeighborhoodChips({
  selected,
  onToggle,
  onClear,
  compact = false,
}: {
  selected: readonly string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className={`font-semibold text-white/40 uppercase tracking-wider ${compact ? "text-[9px]" : "text-[10px]"}`}>
          What matters to you?
        </div>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-white/25 hover:text-white/60 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {NEIGHBORHOOD_PREFS.map(({ id, label }) => {
          const active = selected.includes(id);
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                active
                  ? "bg-lantern-violet/30 text-lantern-violet border-lantern-violet/70 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                  : "bg-transparent text-white/30 border-white/[0.09] hover:border-white/[0.22] hover:text-white/60"
              }`}
            >
              {active && (
                <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 6l3.5 3.5L11 2" />
                </svg>
              )}
              {label}
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="mt-1.5 text-[10px] text-white/20 leading-relaxed">
          {selected.length === 0
            ? "Select any that apply — rankings adjust to match."
            : `Ranking weighted for: ${selected.map((p) => NEIGHBORHOOD_PREFS.find((x) => x.id === p)?.label ?? p).join(", ")}.`}
        </p>
      )}
    </div>
  );
}

// ── "Choose this instead if..." copy for alt neighborhood cards ───────────────

function altChooseIfCopy(
  alt:         NeighborhoodSummary,
  recommended: NeighborhoodSummary,
  activePrefs: readonly PrefId[],
): string {
  const altShort = alt.nbhd.name.split(" /")[0].split(",")[0];
  const recShort = recommended.nbhd.name.split(" /")[0].split(",")[0];

  // 1. Prefs unique to alt that recommended doesn't match
  const altUnique = (alt.matchedPrefs as PrefId[]).filter(
    (p) => !(recommended.matchedPrefs as PrefId[]).includes(p),
  );
  if (altUnique.length > 0) {
    const labels = altUnique
      .slice(0, 2)
      .map((p) => NEIGHBORHOOD_PREFS.find((x) => x.id === p)?.label?.toLowerCase() ?? p);
    return `Choose ${altShort} if ${labels.join(" or ")} matters more to you.`;
  }

  // 2. Meaningful price advantage
  const priceGap = (recommended.avgPrice > 0 && alt.avgPrice > 0)
    ? Math.round(recommended.avgPrice - alt.avgPrice)
    : 0;
  if (priceGap >= 35) {
    return `Choose ${altShort} to save ~$${priceGap}/night vs. ${recShort}.`;
  }
  if (priceGap >= 18) {
    return `Choose ${altShort} if keeping the nightly rate lower is a priority.`;
  }

  // 3. Tag-based differentiation (tags the alt has that recommended doesn't)
  const recTagLower = recommended.nbhd.tags.map((t) => t.toLowerCase());
  for (const tag of alt.nbhd.tags) {
    const tl = tag.toLowerCase();
    if (!recTagLower.includes(tl)) {
      return `Choose ${altShort} if ${tl} is what you're optimising for.`;
    }
  }

  // 4. Generic fallback using active prefs
  if (activePrefs.length > 0) {
    const label = NEIGHBORHOOD_PREFS.find((x) => x.id === activePrefs[0])?.label?.toLowerCase() ?? "your preferences";
    return `Choose ${altShort} for a different take on ${label} in this city.`;
  }
  return `Choose ${altShort} for a different neighbourhood style.`;
}

// ── NeighborhoodRecommendation ────────────────────────────────────────────────

function NeighborhoodRecommendation({
  summaries,
  selectedId,
  onSelect,
  activePrefs,
}: {
  summaries: NeighborhoodSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  activePrefs: readonly PrefId[];
}) {
  if (summaries.length === 0) return null;
  const withHotels = summaries.filter((s) => s.count > 0);
  if (withHotels.length === 0) return null;

  const recommended  = withHotels[0];
  const altGrid      = withHotels.slice(1, 4);
  const selectedSumm = selectedId ? summaries.find((s) => s.nbhd.id === selectedId) : null;
  const isNonRecSel  = !!selectedId && selectedId !== recommended.nbhd.id;
  const recIsSelected = selectedId === recommended.nbhd.id;

  // Price range string: "$75–$189/night" or "$189/night" or "avg $X/night"
  const highestPrice = recommended.hotels.length > 0
    ? Math.round(Math.max(...recommended.hotels.map((h) => h.price_per_night)))
    : 0;
  const priceRange = recommended.lowestPrice > 0 && highestPrice > 0
    ? recommended.lowestPrice === highestPrice
      ? `$${recommended.lowestPrice}/night`
      : `$${recommended.lowestPrice}–$${highestPrice}/night`
    : recommended.avgPrice > 0
      ? `avg $${recommended.avgPrice}/night`
      : "";

  // Primary pref label
  const primaryPref     = activePrefs[0] as PrefId | undefined;
  const prefLabel       = primaryPref ? (NEIGHBORHOOD_PREFS.find((x) => x.id === primaryPref)?.label ?? primaryPref) : "your preferences";
  const prefLabelLower  = prefLabel.toLowerCase();

  // "Why ranked #1" bullets — factual, comparative, max 4
  const whyBullets: string[] = [];

  if (recommended.avgNfScore > 0) {
    whyBullets.push(`Best neighborhood match for ${prefLabel} in this search`);
  }

  if (recommended.bestHotel && recommended.bestHotel.ai_score >= 65) {
    whyBullets.push(`Strongest hotel quality of any recommended neighborhood`);
  } else if (recommended.count >= 3) {
    whyBullets.push(`${recommended.count} ${prefLabelLower} hotels — widest selection in this search`);
  }

  const altMaxCount = altGrid.length > 0 ? Math.max(...altGrid.map((a) => a.count)) : 0;
  if (recommended.count > altMaxCount && recommended.count >= 2) {
    whyBullets.push(`More hotel options than any alternative area`);
  } else if (
    recommended.avgPrice > 0 &&
    altGrid.some((a) => a.avgPrice > 0 && a.avgPrice > recommended.avgPrice + 40)
  ) {
    whyBullets.push(`Lower average nightly price than nearby alternatives`);
  }

  const lowerAlts = altGrid
    .filter((a) => recommended.avgNfScore - a.avgNfScore >= 8)
    .map((a) => a.nbhd.name)
    .slice(0, 2);
  if (lowerAlts.length > 0 && whyBullets.length < 4) {
    whyBullets.push(`Stronger ${prefLabelLower} fit than ${lowerAlts.join(" and ")}`);
  }

  // Inline "Why not X?" — one compact sentence per top alternative
  function altWhyNot(alt: NeighborhoodSummary): string {
    const uniqueStrengths = (alt.matchedPrefs as PrefId[])
      .filter((p) => !recommended.matchedPrefs.includes(p))
      .slice(0, 1)
      .map((p) => NEIGHBORHOOD_PREFS.find((x) => x.id === p)?.label?.toLowerCase() ?? p);

    const strengthPart = uniqueStrengths.length > 0
      ? `Better for ${uniqueStrengths[0]}`
      : alt.nbhd.description.split(".")[0];

    const scoreDiff = recommended.avgNfScore - alt.avgNfScore;
    const weakPart  = scoreDiff >= 10
      ? `lower ${prefLabelLower} concentration`
      : `weaker ${prefLabelLower} concentration`;

    return `${strengthPart} · ${weakPart}.`;
  }

  // "You picked X over Y" copy
  function comparisonCopy(sel: NeighborhoodSummary): string {
    const scoreDiff = recommended.avgNfScore - sel.avgNfScore;
    const recShortName = recommended.nbhd.name.split(" /")[0].split(",")[0];
    const selShortName = sel.nbhd.name.split(" /")[0].split(",")[0];
    let copy = scoreDiff >= 15
      ? `${recShortName} is a stronger fit for ${prefLabel} travel overall.`
      : scoreDiff >= 5
        ? `${recShortName} is a better fit for ${prefLabel} travel.`
        : `Both areas are comparable for ${prefLabel} travel.`;
    if (sel.matchedPrefs.length > 0) {
      const selStr = (sel.matchedPrefs as PrefId[]).slice(0, 2).map((p) => NEIGHBORHOOD_PREFS.find((x) => x.id === p)?.label ?? p).join(" and ");
      copy += ` ${selShortName} is stronger for ${selStr}.`;
    }
    const priceDiff = recommended.avgPrice > 0 && sel.avgPrice > 0 ? sel.avgPrice - recommended.avgPrice : 0;
    if (Math.abs(priceDiff) > 20) copy += ` Average price is $${Math.abs(priceDiff)}/night ${priceDiff > 0 ? "lower" : "higher"} here.`;
    return copy;
  }

  // Short name for CTA button (drop " / Chuo" etc.)
  const shortName = recommended.nbhd.name.split(" /")[0].split(",")[0];

  return (
    <div className="mb-5">
      {/* ── Advisor headline — single declarative answer ─────────────────── */}
      <p className="text-[12px] text-white/50 mb-2.5 leading-snug">
        {primaryPref
          ? <>For <span className="font-semibold text-white/70">{prefLabelLower}</span>, we recommend staying in <span className="font-bold text-white/85">{shortName}</span>.</>
          : <>Our top area pick for this search: <span className="font-bold text-white/85">{shortName}</span>.</>
        }
      </p>

      {/* ── Main recommendation card ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-lantern-violet/30 bg-lantern-violet/[0.05] p-4 mb-3">

        {/* Row 1: label + coverage badge */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-lantern-violet/65">
            Recommended Area
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 leading-none flex-shrink-0 ${coverageBadgeStyle(recommended.coverageConfidence)}`}>
            {coverageLabel(recommended.coverageConfidence, recommended.count)}
          </span>
        </div>

        {/* Row 2: name + match score (inline) */}
        <div className="flex items-baseline justify-between gap-3 mb-0.5">
          <h2 className="text-lg font-black text-white leading-tight">{recommended.nbhd.name}</h2>
          {recommended.avgNfScore > 0 && (
            <div className="flex-shrink-0 flex items-baseline gap-1">
              <span className={`text-lg font-black tabular-nums ${scoreColor(recommended.avgNfScore)}`}>
                {recommended.avgNfScore}
              </span>
              <span className={`text-[10px] font-bold ${scoreColor(recommended.avgNfScore)}`}>
                {scoreLabel(recommended.avgNfScore)} Match
              </span>
            </div>
          )}
        </div>

        {/* Row 3: count + price range */}
        <div className="text-[11px] text-white/40 mb-3">
          {recommended.count} hotel{recommended.count !== 1 ? "s" : ""}
          {priceRange && <> · {priceRange}</>}
        </div>

        {/* Why we recommend this area */}
        {whyBullets.length > 0 && (
          <div className="mb-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/22 mb-1.5">
              Why this area
            </div>
            <div className="space-y-1.5">
              {whyBullets.map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <svg className="w-2.5 h-2.5 text-lantern-violet/70 flex-shrink-0 mt-[3px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 6l3.5 3.5L11 2" />
                  </svg>
                  <span className="text-[11px] text-white/65 leading-snug">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Why not alternatives — inline comparisons */}
        {altGrid.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {altGrid.slice(0, 2).map((alt) => (
              <div key={alt.nbhd.id} className="flex items-start gap-2">
                <span className="text-[10px] font-semibold text-white/28 flex-shrink-0 whitespace-nowrap mt-[1px]">
                  vs. {alt.nbhd.name}:
                </span>
                <span className="text-[10px] text-white/35 leading-snug">{altWhyNot(alt)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Area vibe — practical preview replacing duplicate hotel listing */}
        {recommended.nbhd.description && (
          <p className="text-[11px] text-white/48 leading-snug mb-3 border-t border-white/[0.06] pt-3">
            {recommended.nbhd.description.split(".")[0]}.
          </p>
        )}

        {/* Coverage note — informational, not alarming */}
        {recommended.count < 5 && withHotels.length > 1 && (
          <p className="text-[10px] text-white/28 leading-relaxed mb-3">
            <span className="font-semibold text-white/35">Coverage note:</span>
            {" "}{recommended.count} hotel{recommended.count !== 1 ? "s" : ""} found in {shortName} for these dates.
            {" "}Also explore{" "}
            {withHotels.slice(1, 3).map((s, i, arr) => (
              <span key={s.nbhd.id}>
                <button
                  onClick={() => onSelect(s.nbhd.id)}
                  className="underline underline-offset-2 hover:text-white/55 transition-colors"
                >
                  {s.nbhd.name}
                </button>
                {i < arr.length - 1 ? " and " : ""}
              </span>
            ))} for more options.
          </p>
        )}

        {/* CTA — specific, lighter */}
        <button
          onClick={() => onSelect(recIsSelected ? null : recommended.nbhd.id)}
          className={`text-[12px] font-bold px-4 py-2 rounded-lg transition-all ${
            recIsSelected
              ? "bg-lantern-violet text-white"
              : "bg-lantern-violet/12 text-lantern-violet hover:bg-lantern-violet/20 border border-lantern-violet/25"
          }`}
        >
          {recIsSelected
            ? `✓ Showing ${shortName} hotels — clear`
            : `View ${recommended.count} ${shortName} Hotel${recommended.count !== 1 ? "s" : ""} →`}
        </button>
      </div>

      {/* ── You picked X over Y ──────────────────────────────────────────── */}
      {isNonRecSel && selectedSumm && (
        <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80 mb-1.5">
            You picked {selectedSumm.nbhd.name} over {recommended.nbhd.name}
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed mb-2">
            {comparisonCopy(selectedSumm)}
          </p>
          <button
            onClick={() => onSelect(recommended.nbhd.id)}
            className="text-[11px] text-lantern-violet hover:text-lantern-violet/80 transition-colors"
          >
            ← Switch to recommended area
          </button>
        </div>
      )}

      {/* ── Also consider ────────────────────────────────────────────────── */}
      {altGrid.length > 0 && (
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2 px-0.5">
            Also consider
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {altGrid.map((s) => {
              const isSel = selectedId === s.nbhd.id;
              return (
                <button
                  key={s.nbhd.id}
                  onClick={() => onSelect(isSel ? null : s.nbhd.id)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    isSel
                      ? "border-lantern-blue/40 bg-lantern-blue/[0.05]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-bold text-sm text-white leading-tight">{s.nbhd.name}</span>
                    {s.matchedPrefs.length > 0 && (
                      <span className="text-[10px] text-white/30 flex-shrink-0 mt-0.5">
                        {s.matchedPrefs.length >= 2 ? "Strong fit" : "Good fit"}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/30 mb-1.5">
                    {s.count} hotel{s.count !== 1 ? "s" : ""}
                    {s.avgPrice > 0 && <> · avg ${s.avgPrice}/night</>}
                  </div>
                  <p className="text-[10px] text-white/38 leading-relaxed line-clamp-2 mb-1.5">
                    {s.nbhd.description.split(".")[0]}.
                  </p>
                  <p className="text-[10px] text-lantern-violet/60 leading-snug">
                    {altChooseIfCopy(s, recommended, activePrefs)}
                  </p>
                </button>
              );
            })}
          </div>
          {/* Hidden neighborhoods footer */}
          {withHotels.length > 4 && (
            <div className="mt-2 text-center">
              <span className="text-[10px] text-white/22">
                +{withHotels.length - 4} more neighborhoods
                {" "}({withHotels.slice(4).reduce((sum, s) => sum + s.count, 0)} hotels) ·{" "}
              </span>
              <button
                onClick={() => onSelect(null)}
                className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                Browse all hotels to explore them
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── NeighborhoodGuide ─────────────────────────────────────────────────────────

// Phase 3: NeighborhoodGuide now accepts summaries for enriched card data
function NeighborhoodGuide({
  guide,
  selectedId,
  onSelect,
  summaries,
}: {
  guide: CityGuide;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  summaries: NeighborhoodSummary[];
}) {
  const summaryById   = Object.fromEntries(summaries.map((s) => [s.nbhd.id, s]));
  const totalHotels   = summaries.reduce((sum, s) => sum + s.count, 0);
  const activeNbhdCount = summaries.filter((s) => s.count > 0).length;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-white/30">
            {guide.displayName} Neighborhoods
          </span>
          <p className="text-[11px] text-white/20 mt-0.5">
            {selectedId
              ? <>Filtered to one neighborhood · <button onClick={() => onSelect(null)} className="text-lantern-violet/60 hover:text-lantern-violet transition-colors font-semibold">Browse all {totalHotels} hotels</button></>
              : activeNbhdCount > 0
                ? `${totalHotels} hotels across ${activeNbhdCount} neighborhoods — select one to filter, or scroll to browse all.`
                : "Select a neighborhood to filter hotels, or browse all results below."}
          </p>
        </div>
        {selectedId && (
          <button
            onClick={() => onSelect(null)}
            className="text-[11px] text-white/35 hover:text-white/70 transition-colors whitespace-nowrap ml-4 flex-shrink-0"
          >
            × Clear filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {guide.neighborhoods.map((n) => {
          const s          = summaryById[n.id];
          const count      = s?.count ?? 0;
          const isSelected = selectedId === n.id;

          return (
            <div
              key={n.id}
              className={`rounded-xl border p-3 flex flex-col transition-all ${
                isSelected
                  ? "border-lantern-violet/50 bg-lantern-violet/[0.07] shadow-[0_0_0_1px_rgba(139,92,246,0.2)]"
                  : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
              }`}
            >
              {/* Name + match score */}
              <div className="flex items-start justify-between gap-1.5 mb-1">
                <div className="font-bold text-sm text-white leading-tight flex-1 min-w-0">{n.name}</div>
                {s && s.avgNfScore > 0 && (
                  <span className={`text-[10px] font-bold tabular-nums flex-shrink-0 ${scoreColor(s.avgNfScore)}`}>
                    {s.avgNfScore}
                  </span>
                )}
              </div>

              {/* Coverage badge */}
              {s && s.count > 0 && (
                <span className={`inline-block text-[9px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5 leading-none mb-1.5 ${coverageBadgeStyle(s.coverageConfidence)}`}>
                  {coverageLabel(s.coverageConfidence, s.count)}
                </span>
              )}

              {/* Stats row */}
              {s && s.count > 0 && (
                <div className="text-[10px] text-white/30 mb-1 space-y-0.5">
                  <div>
                    {s.count} hotel{s.count !== 1 ? "s" : ""}
                    {s.avgPrice > 0 && <> · avg ${s.avgPrice}/night</>}
                  </div>
                  {(s.bestHotel || s.avgRating > 0) && (
                    <div className="flex gap-2">
                      {s.bestHotel && <span>Top score: <span className="text-lantern-mint/70">{s.bestHotel.ai_score}</span></span>}
                      {s.avgRating > 0 && <span>Avg {s.avgRating.toFixed(1)}★</span>}
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-white/40 leading-relaxed mb-2 flex-1 line-clamp-2">
                {n.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-1.5">
                {n.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-white/30 border border-white/[0.08] bg-white/[0.03] rounded-full px-1.5 py-0.5 leading-none"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Best hotel in area */}
              {s?.bestHotel && (
                <div className="text-[10px] text-white/25 mb-2 truncate">
                  ★ {s.bestHotel.name}
                </div>
              )}

              <button
                onClick={() => onSelect(isSelected ? null : n.id)}
                className={`w-full text-[11px] font-semibold rounded-lg py-1.5 transition-all mt-auto ${
                  isSelected
                    ? "bg-lantern-violet text-white"
                    : "bg-white/[0.06] text-white/55 hover:bg-white/[0.11] hover:text-white"
                }`}
              >
                {isSelected
                  ? "Showing these hotels"
                  : count > 0
                    ? `Stay here · ${count} hotel${count === 1 ? "" : "s"}`
                    : "Stay here"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Photo URL helpers ─────────────────────────────────────────────────────────

// Google image-serving URLs (lh3/lh5/etc.) accept a size specifier at the end
// of the path: =w800-h600-k-no, =s300, etc.  We can replace that suffix to
// request a larger (or smaller) version of the same image.
function resizeGoogleImageUrl(url: string, param: string): string {
  if (!url || !/lh\d+\.googleusercontent\.com/i.test(url)) return url;
  return url.replace(/=[swh]\d+[^?#]*/i, "") + param;
}

const upscalePhoto    = (url: string) => resizeGoogleImageUrl(url, "=w1400");
const thumbnailPhoto  = (url: string) => resizeGoogleImageUrl(url, "=w200");

// ── PhotoCarousel ─────────────────────────────────────────────────────────────

function PhotoCarousel({ images, thumbnails, hotelName, hotelId }: {
  images: string[];       // full-res for main display
  thumbnails?: string[];  // small for the strip (falls back to images[])
  hotelName: string;
  hotelId: string;
}) {
  const [idx, setIdx] = useState(0);
  // Keyed by index so we remember each photo's resolution once loaded
  const [imgSizes, setImgSizes] = useState<Record<number, { w: number; h: number }>>({});

  // Reset when a different hotel is opened in the drawer
  useEffect(() => {
    setIdx(0);
    setImgSizes({});
    if (process.env.NODE_ENV !== "production" && images.length > 0) {
      console.log("[PhotoCarousel] hotel photos:", {
        hotel:    hotelName,
        count:    images.length,
        firstUrl: images[0],
      });
    }
  // images ref changes every render; hotelId is the stable identity signal
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId]);

  if (images.length === 0) return null;

  const go = (dir: "prev" | "next") => {
    track("hotel_photo_scrolled", { hotel_id: hotelId, hotel_name: hotelName, direction: dir });
    setIdx((i) => dir === "next" ? (i + 1) % images.length : (i - 1 + images.length) % images.length);
  };

  const currentSize = imgSizes[idx];
  // Only switch to contain after we've confirmed the image is low-res
  const isLowRes = currentSize != null && currentSize.w < 800;
  const thumbs = thumbnails ?? images;

  return (
    <div className="flex-shrink-0">
      {/* Main image */}
      <div className="relative bg-black/30 h-60 sm:h-72 overflow-hidden">

        {/* Blurred background fill shown behind low-res images to avoid letterboxing */}
        {isLowRes && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[idx]}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover blur-xl opacity-30 scale-110 pointer-events-none"
          />
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={idx}
          src={images[idx]}
          alt={`${hotelName} — photo ${idx + 1}${images.length > 1 ? " of " + images.length : ""}`}
          className={`relative w-full h-full transition-none ${isLowRes ? "object-contain" : "object-cover"}`}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            setImgSizes((prev) => ({ ...prev, [idx]: { w, h } }));
            if (process.env.NODE_ENV !== "production") {
              console.log("[PhotoCarousel] image loaded:", {
                hotel:        hotelName,
                url:          images[idx],
                naturalWidth: w,
                naturalHeight: h,
              });
            }
          }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />

        {images.length > 1 && (
          <>
            <button
              onClick={() => go("prev")}
              aria-label="Previous photo"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 border border-white/15 flex items-center justify-center text-white/75 hover:bg-black/80 hover:text-white transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={() => go("next")}
              aria-label="Next photo"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 border border-white/15 flex items-center justify-center text-white/75 hover:bg-black/80 hover:text-white transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <div className="absolute top-2.5 right-2.5 text-[10px] font-bold text-white/80 bg-black/55 rounded-full px-2 py-0.5 leading-none">
              {idx + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip — uses smaller URLs to avoid downloading 1400px images at 56px */}
      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 bg-black/20 scrollbar-none">
          {thumbs.map((src, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`flex-shrink-0 w-14 h-10 rounded overflow-hidden border transition-all ${
                i === idx ? "border-white/50 opacity-100" : "border-white/10 opacity-40 hover:opacity-70"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Guest Reviews ─────────────────────────────────────────────────────────────

interface PlaceReview {
  rating: number;
  text: string;
  relativePublishTimeDescription: string;
  publishTime: string;
  authorName: string;
  authorPhotoUri: string;
  googleMapsUri: string;
}

const REVIEW_CHIPS = ["Room", "Location", "Breakfast", "Noise", "Staff", "Small rooms", "Transit"] as const;
const REVIEW_HIGHLIGHT_RE = (query: string) => {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(${escaped})`, "gi");
};

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(REVIEW_HIGHLIGHT_RE(query));
  return parts.map((part, i) =>
    REVIEW_HIGHLIGHT_RE(query).test(part)
      ? <mark key={i} className="bg-lantern-gold/30 text-lantern-gold rounded-sm px-0.5">{part}</mark>
      : part
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className={`w-3 h-3 ${s <= rating ? "text-lantern-gold" : "text-white/15"}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({
  review,
  query,
}: {
  review: PlaceReview;
  query: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSE_THRESHOLD = 280;
  const isLong = review.text.length > COLLAPSE_THRESHOLD;
  const displayText = isLong && !expanded ? review.text.slice(0, COLLAPSE_THRESHOLD) + "…" : review.text;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {review.authorPhotoUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={review.authorPhotoUri}
              alt={review.authorName}
              className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-white/[0.06]"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/[0.08] flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white/40">
              {review.authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-white/70 truncate">{review.authorName}</div>
            <div className="text-[10px] text-white/30">{review.relativePublishTimeDescription}</div>
          </div>
        </div>
        <ReviewStars rating={review.rating} />
      </div>

      {review.text ? (
        <div className="text-[12px] text-white/55 leading-relaxed">
          {highlightText(displayText, query)}
          {isLong && (
            <button
              onClick={() => {
                setExpanded((e) => !e);
                if (!expanded) track("hotel_review_opened", { author: review.authorName });
              }}
              className="ml-1.5 text-[11px] text-lantern-blue hover:text-lantern-blue/80 font-semibold transition-colors"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-white/25 italic">No review text.</p>
      )}

      {review.googleMapsUri && (
        <a
          href={review.googleMapsUri}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-white/25 hover:text-white/50 transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
          View on Google
        </a>
      )}
    </div>
  );
}

function GuestReviewsSection({
  hotelName,
  city,
  hotelId,
  // SerpAPI aggregate data used as fallback while Places reviews load
  serpRating,
  serpReviewCount,
}: {
  hotelName: string;
  city: string;
  hotelId: string;
  serpRating: number;
  serpReviewCount: number;
}) {
  const [reviews,      setReviews]      = useState<PlaceReview[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [placesRating, setPlacesRating] = useState(0);
  const [placeCount,   setPlaceCount]   = useState(0);
  const [query,        setQuery]        = useState("");
  const [ratingFilter, setRatingFilter] = useState<"all" | 5 | 4 | "low">("all");

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch from Places API when hotel changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    setReviews([]);
    setQuery("");
    setRatingFilter("all");

    fetch("/api/hotels/place-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelName, city }),
    })
      .then((r) => r.json())
      .then((data: { rating?: number; userRatingCount?: number; reviews?: PlaceReview[]; error?: string }) => {
        if (data.reviews) {
          setReviews(data.reviews);
          setPlacesRating(data.rating ?? 0);
          setPlaceCount(data.userRatingCount ?? 0);
          track("hotel_reviews_loaded", {
            hotel_name:   hotelName,
            review_count: data.reviews.length,
            total_count:  data.userRatingCount ?? 0,
          });
        } else {
          setError(data.error ?? "No reviews returned");
        }
      })
      .catch((e: unknown) => {
        setError(String(e));
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId]);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.trim().length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        track("hotel_reviews_searched", { hotel_name: hotelName, query: q.trim() });
      }, 800);
    }
  };

  // The effective rating/count: prefer Places data, fall back to SerpAPI aggregate
  const displayRating = placesRating > 0 ? placesRating : serpRating;
  const displayCount  = placeCount   > 0 ? placeCount   : serpReviewCount;

  // Filter reviews
  const filtered = reviews.filter((r) => {
    if (ratingFilter === 5   && r.rating !== 5) return false;
    if (ratingFilter === 4   && r.rating !== 4) return false;
    if (ratingFilter === "low" && r.rating > 3) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.text.toLowerCase().includes(q) ||
      r.authorName.toLowerCase().includes(q) ||
      r.relativePublishTimeDescription.toLowerCase().includes(q)
    );
  });

  const barColor = (s: number) => s >= 65 ? "bg-lantern-mint" : s >= 45 ? "bg-white/25" : "bg-lantern-gold/70";
  const barText  = (s: number) => s >= 65 ? "text-lantern-mint" : s >= 45 ? "text-white/50" : "text-lantern-gold";
  const overallPct = displayRating > 0 ? Math.round((displayRating / 5) * 100) : 0;

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Guest Reviews</div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-4">

        {/* Aggregate rating — always shown from whichever source is available */}
        {displayRating > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black tabular-nums text-lantern-mint">
              {displayRating.toFixed(1)}
            </span>
            <div className="flex-1">
              <ReviewStars rating={Math.round(displayRating)} />
              {displayCount > 0 && (
                <div className="text-[10px] text-white/30 mt-0.5">
                  {displayCount.toLocaleString()} Google reviews
                </div>
              )}
            </div>
            <div className="w-28">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className={`h-full rounded-full ${barColor(overallPct)}`} style={{ width: `${overallPct}%` }} />
              </div>
              <div className={`text-[10px] font-bold tabular-nums mt-0.5 text-right ${barText(overallPct)}`}>
                {displayRating.toFixed(1)} / 5
              </div>
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] p-4 space-y-2.5 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-white/[0.08]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 w-24 rounded bg-white/[0.08]" />
                    <div className="h-2 w-16 rounded bg-white/[0.05]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 rounded bg-white/[0.06] w-full" />
                  <div className="h-2 rounded bg-white/[0.06] w-5/6" />
                  <div className="h-2 rounded bg-white/[0.06] w-4/6" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Review search and filter UI — only shown once reviews are loaded */}
        {!loading && reviews.length > 0 && (
          <>
            {/* Search input */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search reviews for noise, room, breakfast..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] text-white/70 placeholder:text-white/25 focus:outline-none focus:border-lantern-blue/40 focus:bg-white/[0.04] transition-all"
              />
              {query && (
                <button
                  onClick={() => handleQueryChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Quick-filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleQueryChange(query === chip.toLowerCase() ? "" : chip.toLowerCase())}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                    query.toLowerCase() === chip.toLowerCase()
                      ? "bg-lantern-blue/20 text-lantern-blue border-lantern-blue/40"
                      : "bg-transparent text-white/35 border-white/[0.09] hover:text-white/55 hover:border-white/20"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Rating filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/25 font-semibold mr-1">Rating:</span>
              {(["all", 5, 4, "low"] as const).map((f) => {
                const label = f === "all" ? "All" : f === "low" ? "≤3★" : `${f}★`;
                return (
                  <button
                    key={String(f)}
                    onClick={() => setRatingFilter(f)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                      ratingFilter === f
                        ? "bg-white/10 text-white/80 border-white/20"
                        : "text-white/30 border-white/[0.07] hover:text-white/50 hover:border-white/15"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Review cards */}
            {filtered.length > 0 ? (
              <div className="space-y-3">
                {filtered.map((r, i) => (
                  <ReviewCard key={`${r.authorName}-${i}`} review={r} query={query} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/30 py-2">No reviews matched this search.</p>
            )}
          </>
        )}

        {/* No reviews from Places API — show plain fallback */}
        {!loading && reviews.length === 0 && !error && (
          <p className="text-[11px] text-white/35">No written reviews available yet.</p>
        )}

        {/* API error — fall back to SerpAPI aggregate note */}
        {!loading && error && serpRating > 0 && (
          <p className="text-[10px] text-white/22 leading-relaxed">
            Review text isn&apos;t available right now. Scoring uses the {serpRating.toFixed(1)}★ aggregate from {serpReviewCount.toLocaleString()} reviews.
          </p>
        )}
      </div>
    </div>
  );
}

// ── HotelDetailDrawer ─────────────────────────────────────────────────────────

function HotelDetailDrawer({
  offer,
  onClose,
  activePrefs,
  cityGuide,
  guests,
}: {
  offer: HotelOffer | null;
  onClose: () => void;
  activePrefs: readonly PrefId[];
  cityGuide: CityGuide | null;
  guests: number;
}) {
  const [activeAmenity, setActiveAmenity] = useState<string | null>(null);

  // Fire hotel_reviews_viewed when drawer opens with a hotel that has rating data
  useEffect(() => {
    if (offer && offer.overall_rating > 0) {
      track("hotel_reviews_viewed", {
        hotel_name:   offer.name,
        hotel_id:     offer.hotel_id,
        rating:       offer.overall_rating,
        review_count: offer.review_count,
        has_snippets: false,
      });
      if (process.env.NODE_ENV !== "production") {
        console.log("[HotelDetailDrawer] review fields available:", {
          hotel:           offer.name,
          overall_rating:  offer.overall_rating,
          review_count:    offer.review_count,
          location_rating: offer.location_rating,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.hotel_id]);

  if (!offer) return null;

  const fitNote = activePrefs.length > 0 ? buildFitNote(offer, activePrefs) : "";

  const nbhdCard = cityGuide?.neighborhoods.find((n) =>
    n.matchKeywords.some(
      (k) =>
        offer.inferred_neighborhood.toLowerCase().includes(k.toLowerCase()) ||
        offer.address.toLowerCase().includes(k.toLowerCase())
    )
  );

  const breakdownRows = [
    { key: "reviews",     label: "Guest Reviews",  score: offer.score_breakdown.reviews     },
    { key: "location",    label: "Location",        score: offer.score_breakdown.location    },
    { key: "price",       label: "Price / Value",   score: offer.score_breakdown.price       },
    { key: "stars",       label: "Hotel Quality",   score: offer.score_breakdown.stars       },
    { key: "walkability", label: "Walkability",     score: offer.score_breakdown.walkability },
  ].sort((a, b) => b.score - a.score);

  const tradeoffs: string[] = [];
  if (offer.score_breakdown.price < 45)       tradeoffs.push("Priced above average for this search.");
  if (offer.score_breakdown.walkability < 45) tradeoffs.push("Limited walkability in the immediate area.");
  if (offer.score_breakdown.reviews < 45)     tradeoffs.push("Guest reviews below the search average.");

  const barColor = (s: number) => s >= 65 ? "bg-lantern-mint" : s >= 45 ? "bg-white/25" : "bg-lantern-gold/70";
  const barText  = (s: number) => s >= 65 ? "text-lantern-mint" : s >= 45 ? "text-white/50" : "text-lantern-gold";

  const sortedAmenities = [...offer.amenities].sort((a, b) => {
    const KEY = ["pool", "gym", "fitness", "spa", "breakfast", "restaurant", "bar", "beach", "parking"];
    const aKey = KEY.some((k) => a.toLowerCase().includes(k));
    const bKey = KEY.some((k) => b.toLowerCase().includes(k));
    return (bKey ? 1 : 0) - (aKey ? 1 : 0);
  });

  const isBestOverall = offer.recommendation_label === "Best Overall";

  // Photo sources: prefer image_urls array, fall back to single image_url
  const rawPhotos   = (offer.image_urls && offer.image_urls.length > 0)
    ? offer.image_urls
    : offer.image_url ? [offer.image_url] : [];
  // Upscaled URLs for the main carousel display; small URLs for the thumbnail strip
  const hdPhotos    = rawPhotos.map(upscalePhoto);
  const thumbPhotos = rawPhotos.map(thumbnailPhoto);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-full lg:max-w-[840px] bg-[#0e0e14] border-l border-white/[0.07] flex flex-col shadow-2xl overflow-hidden">

        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0e0e14]/95 backdrop-blur-sm flex-shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Research this hotel</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20 transition-all"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Photo gallery — edge-to-edge ── */}
          {rawPhotos.length > 0 && (
            <PhotoCarousel
              images={hdPhotos}
              thumbnails={thumbPhotos}
              hotelName={offer.name}
              hotelId={offer.hotel_id}
            />
          )}

          <div className="p-5 space-y-5">

            {/* ── Name + badges ── */}
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {isBestOverall && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-lantern-violet border border-lantern-violet/50 bg-lantern-violet/15 rounded-full px-2 py-0.5 leading-none">
                    AI Pick
                  </span>
                )}
                {!isBestOverall && offer.recommendation_label && (
                  <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${labelBg(offer.recommendation_label)}`}>
                    {offer.recommendation_label}
                  </span>
                )}
                {offer.eco_certified && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-1.5 py-0.5 leading-none">
                    Eco Certified
                  </span>
                )}
              </div>
              {offer.inferred_neighborhood && (
                <div className="flex items-center gap-1 mb-1">
                  <svg className="w-3 h-3 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                  <span className="text-[11px] font-semibold text-white/40">{offer.inferred_neighborhood}</span>
                </div>
              )}
              <h2 className="text-xl font-black text-white leading-tight">{offer.name}</h2>
              {offer.address && <p className="text-xs text-white/35 mt-0.5">{offer.address}</p>}
            </div>

            {/* ── Overview ── */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Overview</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {offer.star_rating > 0 && <StarRating count={offer.star_rating} />}
                  {offer.overall_rating > 0 && (
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-2xl font-black tabular-nums ${scoreColor(offer.ai_score)}`}>
                        {offer.overall_rating.toFixed(1)}
                      </span>
                      <span className="text-[11px] text-white/30">★</span>
                      {offer.review_count > 0 && (
                        <span className="text-[11px] text-white/30">
                          · {offer.review_count.toLocaleString()} reviews
                        </span>
                      )}
                    </div>
                  )}
                  <div className={`ml-auto border rounded-xl px-3 py-1.5 text-center flex-shrink-0 ${scoreBg(offer.ai_score)}`}>
                    <div className="text-xl font-black tabular-nums leading-none">{offer.ai_score}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5">TravelGrab Score</div>
                  </div>
                </div>
                {offer.hotel_type && offer.hotel_type !== "Hotel" && (
                  <div className="mt-3 border-t border-white/[0.05] pt-3">
                    <span className="text-[11px] text-white/35">{offer.hotel_type}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Why this hotel fits ── */}
            {(fitNote || offer.recommendation_why) && (
              <div className="rounded-xl border border-lantern-violet/20 bg-lantern-violet/[0.04] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-lantern-violet/60 mb-2">
                  Why this hotel fits
                </div>
                {fitNote && (
                  <p className="text-xs text-white/55 leading-relaxed mb-1.5">{fitNote}</p>
                )}
                {offer.recommendation_why && (
                  <p className="text-xs text-white/45 leading-relaxed">{offer.recommendation_why}</p>
                )}
              </div>
            )}

            {/* ── Why ranked here ── */}
            {offer.rank_bullets && offer.rank_bullets.length > 0 && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">
                  {offer.rank_position ? `Ranked #${offer.rank_position} in this search` : "Why this hotel ranked here"}
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2.5">
                  {offer.rank_bullets.map((b, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-lantern-mint/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span className="text-[12px] text-white/50 leading-snug">{b}</span>
                    </div>
                  ))}
                  {offer.rank_weakness && (
                    <div className="border-t border-white/[0.05] pt-2.5 mt-1">
                      <div className="flex items-start gap-2.5">
                        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <span className="text-[11px] text-white/40 leading-snug">{offer.rank_weakness}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── About this property ── */}
            {offer.description && offer.description.trim().length > 30 && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">About this property</div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="text-[12px] text-white/45 leading-relaxed">{offer.description.trim()}</p>
                </div>
              </div>
            )}

            {/* ── Score Breakdown ── */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Score Breakdown</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2.5">
                {breakdownRows.map(({ key, label, score }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-white/55">{label}</span>
                      <span className={`text-[11px] font-bold tabular-nums ${barText(score)}`}>{score}</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(score)}`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                ))}
                {activePrefs.length > 0 && offer.neighborhood_fit_score > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-lantern-violet/80">Neighborhood Fit</span>
                      <span className={`text-[11px] font-bold tabular-nums ${barText(offer.neighborhood_fit_score)}`}>
                        {offer.neighborhood_fit_score}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(offer.neighborhood_fit_score)}`} style={{ width: `${offer.neighborhood_fit_score}%` }} />
                    </div>
                  </div>
                )}
                {activePrefs.length === 0 && offer.score_breakdown.destination_fit > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-lantern-violet/80">Destination Fit</span>
                      <span className={`text-[11px] font-bold tabular-nums ${barText(offer.score_breakdown.destination_fit)}`}>
                        {offer.score_breakdown.destination_fit}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(offer.score_breakdown.destination_fit)}`} style={{ width: `${offer.score_breakdown.destination_fit}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Amenities ── */}
            {sortedAmenities.length > 0 && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">
                  Amenities
                  <span className="ml-1.5 text-white/15 normal-case font-normal tracking-normal">· tap for details</span>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {sortedAmenities.map((a) => {
                      const hasDetail = !!getAmenityDetail(a);
                      const isActive  = activeAmenity === a;
                      return (
                        <button
                          key={a}
                          onClick={() => setActiveAmenity(isActive ? null : a)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                            isActive
                              ? "bg-lantern-blue/20 text-lantern-blue border-lantern-blue/40"
                              : hasDetail
                                ? "bg-white/[0.04] text-white/60 border-white/[0.1] hover:border-white/20 hover:text-white/80 cursor-pointer"
                                : "bg-white/[0.02] text-white/30 border-white/[0.06] cursor-default"
                          }`}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  {activeAmenity && (
                    <div className="rounded-lg border border-lantern-blue/20 bg-lantern-blue/[0.04] px-3 py-2.5">
                      <div className="text-[11px] font-bold text-white/60 mb-0.5">{activeAmenity}</div>
                      <p className="text-[11px] text-white/45 leading-relaxed">
                        {getAmenityDetail(activeAmenity)
                          ?? "Amenity listed by this hotel. Contact them directly to confirm availability and details."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Neighborhood Context ── */}
            {nbhdCard && (
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Neighborhood Context</div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="text-[11px] font-bold text-white/55 mb-1.5">{nbhdCard.name}</div>
                  <p className="text-xs text-white/45 leading-relaxed mb-2.5">{nbhdCard.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {nbhdCard.tags.slice(0, 5).map((tag) => (
                      <span key={tag} className="text-[10px] text-white/30 border border-white/[0.08] rounded-full px-1.5 py-0.5 leading-none">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Guest Reviews — full text from Google Places API;
                    aggregate rating/count from SerpAPI used as fallback ── */}
            <GuestReviewsSection
              hotelName={offer.name}
              city={cityGuide?.displayName ?? ""}
              hotelId={offer.hotel_id}
              serpRating={offer.overall_rating}
              serpReviewCount={offer.review_count}
            />

            {/* ── Consider before booking ── */}
            {tradeoffs.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70 mb-2">
                  Consider before booking
                </div>
                <ul className="space-y-1.5">
                  {tradeoffs.map((t, i) => (
                    <li key={i} className="text-[11px] text-white/45 flex items-start gap-2">
                      <span className="text-amber-400/50 flex-shrink-0">·</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Price & Booking ── */}
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Price & Booking</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-2xl font-black tabular-nums ${scoreColor(offer.ai_score)}`}>
                    ${Math.round(offer.price_per_night).toLocaleString()}
                  </span>
                  <span className="text-sm text-white/40">/ night</span>
                  {guests > 1 && (
                    <span className="text-xs text-white/25">
                      · ${Math.round(offer.price_per_night / guests).toLocaleString()}/person
                    </span>
                  )}
                </div>
                {offer.nights > 1 && (
                  <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
                    <span className="text-[11px] text-white/35">Total ({offer.nights} nights)</span>
                    <span className="text-[13px] font-bold text-white/55">${Math.round(offer.total_price).toLocaleString()}</span>
                  </div>
                )}
                {(offer.check_in || offer.check_out) && (
                  <div className="flex items-center gap-6 border-t border-white/[0.05] pt-3">
                    {offer.check_in && (
                      <div>
                        <div className="text-[9px] text-white/25 uppercase tracking-wide mb-0.5">Check-in</div>
                        <div className="text-[12px] text-white/50 font-semibold">{offer.check_in}</div>
                      </div>
                    )}
                    {offer.check_out && (
                      <div>
                        <div className="text-[9px] text-white/25 uppercase tracking-wide mb-0.5">Check-out</div>
                        <div className="text-[12px] text-white/50 font-semibold">{offer.check_out}</div>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-white/20 leading-relaxed border-t border-white/[0.05] pt-3">
                  Prices are from the search results and may change at checkout.
                </p>
              </div>
            </div>

            <div className="h-2" />
          </div>
        </div>

        {/* Sticky CTA */}
        <div className="flex-shrink-0 p-4 border-t border-white/[0.07] bg-[#0e0e14]/95 backdrop-blur-sm">
          {offer.booking_url ? (
            <>
              <a
                href={offer.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("hotel_availability_clicked", {
                  hotel_name:   offer.name,
                  neighborhood: offer.inferred_neighborhood,
                  score:        offer.ai_score,
                })}
                className="block w-full text-center py-3 rounded-xl text-sm font-bold text-white bg-lantern-violet hover:bg-lantern-violet/80 transition-colors shadow-[0_0_20px_rgba(139,92,246,0.20)] mb-2"
              >
                Check availability →
              </a>
              <p className="text-[10px] text-white/25 text-center leading-relaxed">
                Opens Google Hotels · Prices may change · Final booking happens off TravelGrab
              </p>
            </>
          ) : (
            <p className="text-[11px] text-white/25 text-center">No booking link available for this hotel.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── HotelCard ─────────────────────────────────────────────────────────────────

function HotelCard({
  offer,
  isBestOverall,
  isCheapest,
  activePrefs,
  guests,
  avgPrice,
  isMapSelected,
  onSelectForMap,
  onHoverForMap,
  onOpenDetail,
  isInCompare,
  onToggleCompare,
  compareDisabled,
}: {
  offer: HotelOffer;
  isBestOverall: boolean;
  isCheapest: boolean;
  activePrefs: readonly PrefId[];
  guests: number;
  avgPrice: number;
  isMapSelected?: boolean;
  onSelectForMap?: (id: string | null) => void;
  onHoverForMap?: (id: string | null) => void;
  onOpenDetail?: () => void;
  isInCompare?: boolean;
  onToggleCompare?: () => void;
  compareDisabled?: boolean;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(isBestOverall);
  const prefsActive = activePrefs.length > 0;
  const showFitBadge = prefsActive && !!offer.neighborhood_fit_label;
  const fitNote = prefsActive ? buildFitNote(offer, activePrefs) : "";
  const POOR_FIT_PREFS: PrefId[] = ["luxury", "quiet", "family", "sightseeing", "food", "nightlife", "walkable"];
  const showPoorFitWarning = prefsActive
    && offer.neighborhood_fit_score > 0
    && offer.neighborhood_fit_score < 50
    && activePrefs.some((p) => POOR_FIT_PREFS.includes(p as PrefId));
  const poorFitLabel = activePrefs.includes("luxury") ? "Poor Luxury Fit"
    : activePrefs.includes("quiet") ? "Not Quiet"
    : activePrefs.includes("family") ? "Not Family-Friendly"
    : activePrefs.includes("sightseeing") ? "Not Sightseeing Central"
    : activePrefs.includes("food") ? "Limited Dining Area"
    : activePrefs.includes("nightlife") ? "Limited Nightlife"
    : activePrefs.includes("walkable") ? "Low Walkability"
    : "Poor Area Match";

  const breakdownRows = [
    { key: "reviews",     label: "Guest Reviews",   score: offer.score_breakdown.reviews     },
    { key: "location",    label: "Location",         score: offer.score_breakdown.location    },
    { key: "price",       label: "Price / Value",    score: offer.score_breakdown.price       },
    { key: "stars",       label: "Hotel Quality",    score: offer.score_breakdown.stars       },
    { key: "walkability", label: "Walkability",      score: offer.score_breakdown.walkability },
  ].sort((a, b) => b.score - a.score);

  if (prefsActive && offer.neighborhood_fit_score > 0) {
    breakdownRows.push({ key: "nbhd", label: "Neighborhood Fit", score: offer.neighborhood_fit_score });
  } else if (!prefsActive && offer.score_breakdown.destination_fit > 0) {
    breakdownRows.push({ key: "dest", label: "Destination Fit", score: offer.score_breakdown.destination_fit });
  }

  const barColor = (s: number) => s >= 65 ? "bg-lantern-mint" : s >= 45 ? "bg-white/25" : "bg-lantern-gold/70";
  const barText  = (s: number) => s >= 65 ? "text-lantern-mint" : s >= 45 ? "text-white/50" : "text-lantern-gold";

  const visibleAmenities = offer.amenities.slice(0, 5);

  return (
    <div
      data-hotel-id={offer.hotel_id}
      onClick={() => onSelectForMap?.(isMapSelected ? null : offer.hotel_id)}
      onMouseEnter={() => onHoverForMap?.(offer.hotel_id)}
      onMouseLeave={() => onHoverForMap?.(null)}
      className={`rounded-xl border transition-all ${
        isMapSelected
          ? "border-lantern-blue/50 bg-lantern-blue/[0.04] shadow-[0_0_24px_rgba(119,167,255,0.12)]"
          : isBestOverall
            ? "border-lantern-violet/40 bg-lantern-violet/[0.04] shadow-[0_0_32px_rgba(167,139,250,0.07)]"
            : "border-white/[0.07] bg-white/[0.02]"
      } ${onSelectForMap ? "cursor-pointer" : ""}`}
    >
      <div className="p-4 sm:p-5">

        {/* Header */}
        <div className="flex items-start gap-3.5 mb-3">
          {/* Hotel image */}
          {offer.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.image_url}
              alt={offer.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 bg-white/[0.04]"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0 flex-1">
                {/* Badge row */}
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  {isBestOverall && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-lantern-violet border border-lantern-violet/50 bg-lantern-violet/15 rounded-full px-2 py-0.5 leading-none">
                      AI Pick
                    </span>
                  )}
                  {!isBestOverall && offer.recommendation_label && (
                    <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${labelBg(offer.recommendation_label)}`}>
                      {offer.recommendation_label}
                    </span>
                  )}
                  {showFitBadge && !showPoorFitWarning && (
                    <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${fitBg(computeCardFitLabel(offer, activePrefs))}`}>
                      {computeCardFitLabel(offer, activePrefs)}
                    </span>
                  )}
                  {showPoorFitWarning && (
                    <span className="text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none bg-red-500/12 text-red-400 border-red-500/30">
                      {poorFitLabel}
                    </span>
                  )}
                  {isCheapest && !isBestOverall && (
                    <span className="text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none bg-emerald-500/12 text-emerald-400 border-emerald-500/25">
                      Lowest price
                    </span>
                  )}
                  {offer.extra_badges?.map((badge) => (
                    <span key={badge} className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${
                      badge === "Best Reviews"  ? "bg-amber-500/15 text-amber-300 border-amber-500/30" :
                      badge === "Most Walkable" ? "bg-teal-500/15 text-teal-300 border-teal-500/30" :
                      badge === "Business Pick" ? "bg-sky-500/15 text-sky-300 border-sky-500/30" :
                      "bg-white/10 text-white/50 border-white/15"
                    }`}>
                      {badge}
                    </span>
                  ))}
                  {offer.eco_certified && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-1.5 py-0.5 leading-none">
                      Eco
                    </span>
                  )}
                </div>

                {/* Neighborhood badge */}
                {offer.inferred_neighborhood && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <svg className="w-2.5 h-2.5 text-white/20 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                    </svg>
                    <span className="text-[10px] font-semibold text-white/35">
                      {offer.inferred_neighborhood}
                    </span>
                  </div>
                )}

                <h3 className="text-sm font-bold text-white leading-tight">{offer.name}</h3>
                {offer.address && (
                  <p className="text-[11px] text-white/30 mt-0.5 leading-tight truncate">{offer.address}</p>
                )}
              </div>

              {/* Price block */}
              <div className="text-right flex-shrink-0">
                <div className={`text-2xl font-black tabular-nums leading-none ${scoreColor(offer.ai_score)}`}>
                  ${Math.round(offer.price_per_night).toLocaleString()}
                </div>
                <div className="text-[11px] text-white/35 mt-0.5">per night</div>
                {guests > 1 && (
                  <div className="text-[11px] text-white/20 mt-0.5">
                    ${Math.round(offer.price_per_night / guests).toLocaleString()}/person
                  </div>
                )}
                {offer.nights > 1 && (
                  <div className="text-[11px] text-white/25 mt-0.5">
                    ${Math.round(offer.total_price).toLocaleString()} total
                  </div>
                )}
              </div>
            </div>

            {/* Stars + rating */}
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {offer.star_rating > 0 && <StarRating count={offer.star_rating} />}
              {offer.overall_rating > 0 && (
                <span className={`text-[11px] font-bold tabular-nums ${scoreColor(offer.ai_score)}`}>
                  {offer.overall_rating.toFixed(1)}
                </span>
              )}
              {offer.review_count > 0 && (
                <span className="text-[11px] text-white/30">({offer.review_count.toLocaleString()} reviews)</span>
              )}
              {offer.hotel_type && offer.hotel_type !== "Hotel" && (
                <span className="text-[10px] text-white/25 uppercase tracking-wider">{offer.hotel_type}</span>
              )}
            </div>
          </div>
        </div>

        {/* Neighborhood fit note — shown when preferences are active */}
        {fitNote && (
          <div className={`flex items-start gap-1.5 rounded-lg px-3 py-2 mb-3 border ${fitBg(computeCardFitLabel(offer, activePrefs))} bg-opacity-10`}>
            <svg className="w-3 h-3 flex-shrink-0 mt-0.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 6l3.5 3.5L11 2" />
            </svg>
            <p className="text-[11px] leading-relaxed">{fitNote}</p>
          </div>
        )}

        {/* Why it ranked here — hotel-specific bullets + weakness */}
        {offer.rank_bullets && offer.rank_bullets.length > 0 ? (
          <div className="mb-3">
            <div className="space-y-1">
              {offer.rank_bullets.map((bullet, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <svg className="w-2.5 h-2.5 text-lantern-mint/60 flex-shrink-0 mt-0.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 6l3.5 3.5L11 2" />
                  </svg>
                  <span className="text-[11px] text-white/55 leading-tight">{bullet}</span>
                </div>
              ))}
            </div>
            {offer.rank_weakness && !isBestOverall && (
              <div className="flex items-start gap-2 mt-2 pt-2 border-t border-white/[0.04]">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/60 flex-shrink-0 mt-[2px] whitespace-nowrap">Tradeoff</span>
                <span className="text-[11px] text-white/42 leading-snug">{offer.rank_weakness}</span>
              </div>
            )}
            {offer.skip_reason && (
              <div className="flex items-start gap-1.5 mt-1.5">
                <span className="text-[10px] text-white/22 leading-snug italic">{offer.skip_reason}</span>
              </div>
            )}
          </div>
        ) : offer.recommendation_why ? (
          <p className={`text-[11px] leading-relaxed mb-3 ${fitNote ? "text-white/40" : "text-white/50"}`}>
            {offer.recommendation_why}
          </p>
        ) : null}

        {/* Rating sanity note — explains when lower-rated hotel outranks a higher-rated one */}
        {offer.rating_sanity_note && (
          <div className="flex items-start gap-1.5 mb-2.5 rounded-lg bg-amber-500/[0.05] border border-amber-500/15 px-2.5 py-1.5">
            <svg className="w-2.5 h-2.5 text-amber-400/70 flex-shrink-0 mt-0.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1v5M6 8v1M3 11h6L6 1 3 11z" />
            </svg>
            <span className="text-[10px] text-amber-300/75 leading-tight">{offer.rating_sanity_note}</span>
          </div>
        )}

        {/* Transit note (Google Places) or nearby landmark fallback */}
        {!fitNote && (offer.transit_note ? (
          <div className="flex items-center gap-1.5 mb-2.5">
            <svg className="w-3 h-3 text-lantern-blue flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <span className="text-[11px] text-white/40">{offer.transit_note}</span>
          </div>
        ) : offer.nearby_walk && !isStreetIntersectionName(offer.nearby_walk.name) ? (
          <div className="flex items-center gap-1.5 mb-2.5">
            <svg className="w-3 h-3 text-white/20 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
            </svg>
            <span className="text-[11px] text-white/30">
              {offer.nearby_walk.minutes} min walk to {offer.nearby_walk.name}
            </span>
          </div>
        ) : null)}

        {/* Amenity chips */}
        {visibleAmenities.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {visibleAmenities.map((a) => (
              <span key={a} className="text-[10px] text-white/40 border border-white/[0.08] bg-white/[0.03] rounded-full px-2 py-0.5">
                {a}
              </span>
            ))}
            {offer.amenities.length > 5 && (
              <span className="text-[10px] text-white/25 px-1">+{offer.amenities.length - 5} more</span>
            )}
          </div>
        )}

        {/* Footer: dates + score + CTA */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-2 text-[11px] text-white/30">
            <span>{formatDate(offer.check_in)}</span>
            <span className="text-white/15">→</span>
            <span>{formatDate(offer.check_out)}</span>
            {offer.nights > 0 && <span className="text-white/20">· {offer.nights}n</span>}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-0.5">
              <button
                onClick={() => setBreakdownOpen((o) => !o)}
                className={`inline-flex items-center gap-1 border rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums transition-all hover:opacity-80 ${scoreBg(offer.ai_score)}`}
                title="View score breakdown"
              >
                {offer.ai_score} · {scoreLabel(offer.ai_score)}
              </button>
              <button
                onClick={() => setBreakdownOpen((o) => !o)}
                className="text-[9px] text-white/25 hover:text-lantern-blue/70 transition-colors leading-none"
              >
                {breakdownOpen ? "Hide" : "Why?"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onToggleCompare && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleCompare(); }}
                  disabled={!isInCompare && compareDisabled}
                  className={`text-[11px] font-semibold rounded-lg px-2.5 py-1.5 transition-all border whitespace-nowrap ${
                    isInCompare
                      ? "bg-lantern-blue/20 text-lantern-blue border-lantern-blue/30"
                      : compareDisabled
                        ? "text-white/15 border-white/[0.05] cursor-not-allowed"
                        : "text-white/40 border-white/[0.08] hover:border-white/20 hover:text-white/60"
                  }`}
                >
                  {isInCompare ? "✓ Compare" : "Compare"}
                </button>
              )}
              {onOpenDetail && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
                  className="text-[11px] font-semibold text-white/45 border border-white/[0.1] hover:border-white/25 hover:text-white/70 rounded-lg px-3 py-1.5 transition-all whitespace-nowrap"
                >
                  Research
                </button>
              )}
              {offer.booking_url && (
                <div className="flex flex-col items-end gap-0.5">
                  <a
                    href={offer.booking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); track("hotel_availability_clicked", { hotel_name: offer.name, neighborhood: offer.inferred_neighborhood, score: offer.ai_score }); }}
                    className="text-[11px] font-bold text-white bg-lantern-violet hover:bg-lantern-violet/80 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
                  >
                    Check availability
                  </a>
                  <span className="text-[9px] text-white/20">Opens Google Hotels · price may vary</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* "Why this score?" weighted contribution breakdown */}
        {breakdownOpen && (() => {
          // Compute weighted contribution rows based on active scoring mode.
          // score_breakdown.reviews uses the amplified 3.0–5.0★ scale (4.7★→85, 4.2★→60, 3.9★→45).
          const contributions: { label: string; score: number; weight: number; pts: number }[] = prefsActive
            ? [
                { label: "Neighborhood Fit", score: offer.neighborhood_fit_score,       weight: 0.35 },
                { label: "Hotel Quality",     score: offer.score_breakdown.stars,        weight: 0.25 },
                { label: "Guest Reviews",     score: offer.score_breakdown.reviews,      weight: 0.20 },
                { label: "Price / Value",     score: offer.score_breakdown.price,        weight: 0.10 },
                { label: "Walkability",       score: offer.score_breakdown.walkability,  weight: 0.10 },
              ].map((r) => ({ ...r, pts: Math.round(r.score * r.weight) }))
            : offer.score_breakdown.destination_fit > 0
              ? [
                  { label: "Guest Reviews",     score: offer.score_breakdown.reviews,        weight: 0.30 },
                  { label: "Destination Fit",   score: offer.score_breakdown.destination_fit, weight: 0.18 },
                  { label: "Hotel Quality",     score: offer.score_breakdown.stars,          weight: 0.18 },
                  { label: "Location",          score: offer.score_breakdown.location,       weight: 0.16 },
                  { label: "Price / Value",     score: offer.score_breakdown.price,          weight: 0.14 },
                  { label: "Walkability",       score: offer.score_breakdown.walkability,    weight: 0.04 },
                ].map((r) => ({ ...r, pts: Math.round(r.score * r.weight) }))
              : [
                  { label: "Guest Reviews",     score: offer.score_breakdown.reviews,      weight: 0.32 },
                  { label: "Price / Value",     score: offer.score_breakdown.price,        weight: 0.23 },
                  { label: "Location",          score: offer.score_breakdown.location,     weight: 0.20 },
                  { label: "Hotel Quality",     score: offer.score_breakdown.stars,        weight: 0.14 },
                  { label: "Walkability",       score: offer.score_breakdown.walkability,  weight: 0.11 },
                ].map((r) => ({ ...r, pts: Math.round(r.score * r.weight) }));

          const maxPts = Math.max(...contributions.map((r) => r.pts));

          return (
            <div className="mt-3 pt-3 border-t border-white/[0.05]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2.5">What drives this ranking</div>
              <div className="space-y-3">
                {contributions.sort((a, b) => b.pts - a.pts).map(({ label, score, pts }) => {
                  const evidence = breakdownEvidence(label, offer, avgPrice, prefsActive, activePrefs);
                  return (
                    <div key={label}>
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10.5px] font-semibold text-white/55 block leading-none mb-0.5">{label}</span>
                          {evidence && (
                            <span className="text-[10px] text-white/38 leading-snug">{evidence}</span>
                          )}
                        </div>
                        <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${barText(pts * 5)}`}>+{pts}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor(score)}`}
                          style={{ width: `${maxPts > 0 ? (pts / maxPts) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.05]">
                <span className="text-[10px] text-white/25">TravelGrab score</span>
                <span className={`text-[12px] font-black tabular-nums ${scoreColor(offer.ai_score)}`}>{offer.ai_score}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}


// ── Hotel Comparison helpers ──────────────────────────────────────────────────

function MetricInfo({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1 leading-none">
      <span className="text-[9px] text-white/20 hover:text-white/50 cursor-default select-none transition-colors">ⓘ</span>
      <span className="absolute bottom-full left-0 mb-2 w-44 rounded-lg bg-[#1c2333] border border-white/[0.12] px-2.5 py-2 text-[10px] text-white/60 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-normal shadow-lg">
        {text}
      </span>
    </span>
  );
}

interface VerdictParts {
  headline:    string;
  explanation: string;
  tradeoff:    string | null;
  chooseIf:    string | null;
  confidence:  "high" | "medium" | "close-call";
}

function buildVerdictParts(hotels: HotelOffer[]): VerdictParts | null {
  if (hotels.length < 2) return null;
  const sorted   = [...hotels].sort((a, b) => b.ai_score - a.ai_score);
  const winner   = sorted[0];
  const runnerUp = sorted[1];
  const margin   = winner.ai_score - runnerUp.ai_score;

  const winAdv = [
    { label: "location",         gap: winner.score_breakdown.location     - runnerUp.score_breakdown.location     },
    { label: "walkability",      gap: winner.score_breakdown.walkability  - runnerUp.score_breakdown.walkability  },
    { label: "guest reviews",    gap: winner.score_breakdown.reviews      - runnerUp.score_breakdown.reviews      },
    { label: "property quality", gap: winner.score_breakdown.stars        - runnerUp.score_breakdown.stars        },
    { label: "value",            gap: winner.score_breakdown.price        - runnerUp.score_breakdown.price        },
    { label: "neighborhood fit", gap: winner.neighborhood_fit_score       - runnerUp.neighborhood_fit_score       },
    { label: "area fit",         gap: winner.score_breakdown.destination_fit - runnerUp.score_breakdown.destination_fit },
  ].filter((d) => d.gap > 5).sort((a, b) => b.gap - a.gap);

  const ruAdv = [
    { label: "property quality", gap: runnerUp.score_breakdown.stars      - winner.score_breakdown.stars      },
    { label: "guest reviews",    gap: runnerUp.score_breakdown.reviews    - winner.score_breakdown.reviews    },
    { label: "walkability",      gap: runnerUp.score_breakdown.walkability - winner.score_breakdown.walkability },
    { label: "location",         gap: runnerUp.score_breakdown.location   - winner.score_breakdown.location   },
  ].filter((d) => d.gap > 5).sort((a, b) => b.gap - a.gap);

  const priceDiff  = winner.price_per_night - runnerUp.price_per_night;
  const ruSavings  = priceDiff > 15;
  const winSavings = priceDiff < -15;

  const winShort = winner.name.split(",")[0].split("–")[0].trim();
  const ruShort  = runnerUp.name.split(",")[0].split("–")[0].trim();

  // ── Close call ────────────────────────────────────────────────────────────
  if (margin <= 1) {
    const diffNote = winAdv[0]
      ? `${winShort} has a slight edge on ${winAdv[0].label}.`
      : ruSavings
        ? `${ruShort} saves $${Math.round(priceDiff)}/night, which may tip the decision.`
        : "";
    return {
      confidence:  "close-call",
      headline:    "Either option is a reasonable choice.",
      explanation: `The decision comes down to personal preference.${diffNote ? " " + diffNote : ""}`,
      tradeoff:    ruSavings ? `${ruShort} saves $${Math.round(priceDiff)}/night.` : null,
      chooseIf:    null,
    };
  }

  // ── Medium confidence (2–4 pts) ───────────────────────────────────────────
  if (margin < 5) {
    const advStr = winAdv.slice(0, 2).map((d) => d.label).join(" and ") || "overall balance";
    let explanation = `${winShort} combines better ${advStr}`;
    if (ruAdv[0]) explanation += `. ${ruShort} offers stronger ${ruAdv[0].label}`;
    if (ruSavings) explanation += `${ruAdv[0] ? " and" : ","} saves $${Math.round(priceDiff)}/night`;
    explanation += ".";

    const chooseIf = ruAdv[0] || ruSavings
      ? `Choose ${ruShort} if ${ruAdv[0] ? `${ruAdv[0].label} matters most to you` : "budget is the priority"}.`
      : null;

    return {
      confidence:  "medium",
      headline:    `${winShort} is the safer overall choice.`,
      explanation,
      tradeoff:    null,
      chooseIf,
    };
  }

  // ── High confidence (5+ pts) ──────────────────────────────────────────────
  const advList = winAdv.slice(0, 3).map((d) => d.label);
  let explanation: string;
  if (advList.length >= 3)
    explanation = `${winShort} combines better ${advList[0]}, ${advList[1]}, and ${advList[2]}.`;
  else if (advList.length === 2)
    explanation = `${winShort} combines better ${advList[0]} and ${advList[1]}.`;
  else if (advList.length === 1)
    explanation = `${winShort} leads on ${advList[0]}.`;
  else if (winSavings)
    explanation = `${winShort} is also $${Math.round(-priceDiff)}/night cheaper — a strong all-round choice.`;
  else
    explanation = `${winShort} leads across most categories.`;

  let tradeoff: string | null = null;
  const ru0 = ruAdv[0];
  const ru1 = ruAdv[1];
  if (ru0 && ruSavings) {
    tradeoff = `${ruShort} offers a more premium ${ru0.label} and saves $${Math.round(priceDiff)}/night — worth considering if those factors matter more than overall fit.`;
  } else if (ru0 && ru1) {
    tradeoff = `${ruShort} offers stronger ${ru0.label} and ${ru1.label} — consider it if those are your priorities.`;
  } else if (ru0) {
    tradeoff = `${ruShort} offers a more premium ${ru0.label} — worth considering if that matters most to you.`;
  } else if (ruSavings) {
    tradeoff = `${ruShort} saves $${Math.round(priceDiff)}/night for those where budget is the deciding factor.`;
  }

  return {
    confidence:  "high",
    headline:    `${winShort} is the clear recommendation here.`,
    explanation,
    tradeoff,
    chooseIf:    null,
  };
}

type CompareWinner = { id: string; type: "price" | "quality" } | null;

function priceWinner(vals: { id: string; val: number }[]): CompareWinner {
  const valid = vals.filter(v => v.val > 0);
  if (valid.length < 2) return null;
  return { id: valid.reduce((a, b) => a.val < b.val ? a : b).id, type: "price" };
}

function qualityWinner(vals: { id: string; val: number }[]): CompareWinner {
  const valid = vals.filter(v => v.val > 0);
  if (valid.length < 2) return null;
  const winner = valid.reduce((a, b) => a.val > b.val ? a : b);
  const second = valid.filter(v => v.id !== winner.id).reduce((a, b) => a.val > b.val ? a : b, { id: "", val: 0 });
  if (winner.val - second.val < 1) return null;
  return { id: winner.id, type: "quality" };
}

const SUMMARY_CARD_STYLES = {
  violet: { border: "border-lantern-violet/25", bg: "bg-lantern-violet/[0.05]", label: "text-lantern-violet/70", metric: "text-lantern-violet/55" },
  mint:   { border: "border-lantern-mint/25",   bg: "bg-lantern-mint/[0.05]",   label: "text-lantern-mint/70",   metric: "text-lantern-mint/55"   },
  blue:   { border: "border-lantern-blue/25",   bg: "bg-lantern-blue/[0.05]",   label: "text-lantern-blue/70",   metric: "text-lantern-blue/55"   },
} as const;

function CompareSummaryCards({ hotels }: { hotels: HotelOffer[] }) {
  const bestOverall  = [...hotels].sort((a, b) => b.ai_score - a.ai_score)[0];
  const bestValue    = [...hotels].sort((a, b) => b.score_breakdown.price - a.score_breakdown.price)[0];
  const mostWalkable = [...hotels].sort((a, b) => b.score_breakdown.walkability - a.score_breakdown.walkability)[0];

  const cards: { icon: string; label: string; hotel: HotelOffer; metric: string; style: keyof typeof SUMMARY_CARD_STYLES }[] = [
    { icon: "★", label: "Best Overall",    hotel: bestOverall,  metric: `Score ${bestOverall.ai_score}`,                                                            style: "violet" },
    { icon: "↓", label: "Best Value",      hotel: bestValue,    metric: `$${Math.round(bestValue.price_per_night)}/night · Value ${bestValue.score_breakdown.price}`, style: "mint"   },
    { icon: "⚡", label: "Most Walkable",   hotel: mostWalkable, metric: `Walk score ${mostWalkable.score_breakdown.walkability}`,                                    style: "blue"   },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5 mb-5">
      {cards.map(({ icon, label, hotel, metric, style }) => {
        const s = SUMMARY_CARD_STYLES[style];
        return (
          <div key={label} className={`rounded-xl border ${s.border} ${s.bg} p-3`}>
            <div className={`text-[8px] font-black uppercase tracking-widest ${s.label} mb-2 flex items-center gap-1`}>
              <span>{icon}</span><span>{label}</span>
            </div>
            <div className="flex items-center gap-2">
              {hotel.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hotel.image_url} alt={hotel.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-white/[0.05]" />
              )}
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-white leading-tight line-clamp-1">
                  {hotel.name.split(",")[0].split("–")[0].trim()}
                </div>
                <div className={`text-[9px] mt-0.5 ${s.metric}`}>{metric}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompareSectionRow({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr>
      <td colSpan={colCount + 1} className="pt-5 pb-1.5 text-[9px] font-black uppercase tracking-widest text-white/25">
        {label}
      </td>
    </tr>
  );
}

function CompareScoreRow({
  label, hotels, vals, winner, format, winnerLabel, tooltip,
}: {
  label: string;
  hotels: HotelOffer[];
  vals: { id: string; val: number }[];
  winner: CompareWinner;
  format: (v: number) => string;
  winnerLabel: string;
  tooltip?: string;
}) {
  const maxVal = Math.max(...vals.map(v => v.val), 1);
  return (
    <tr className="border-b border-white/[0.04]">
      <td className="py-3 pr-4 text-white/40 text-[11px] whitespace-nowrap align-top">
        <span className="flex items-center gap-0.5">
          {label}
          {tooltip && <MetricInfo text={tooltip} />}
        </span>
      </td>
      {hotels.map(h => {
        const v = vals.find(x => x.id === h.hotel_id)!;
        const isW = winner?.id === h.hotel_id;
        const barPct = Math.round((v.val / maxVal) * 100);
        return (
          <td key={h.hotel_id} className="py-3 px-3 align-top">
            <div className="space-y-1.5">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full ${isW ? "bg-lantern-violet" : "bg-white/[0.16]"}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className={`text-[11px] leading-none ${isW ? "text-lantern-violet font-bold" : "text-white/55"}`}>
                {format(v.val)}
                {isW && <span className="ml-1 text-[9px] text-lantern-violet/50">{winnerLabel}</span>}
              </div>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

// ── CompareFloatingTray ───────────────────────────────────────────────────────

function CompareFloatingTray({
  compareIds,
  offers,
  onOpen,
  onRemove,
}: {
  compareIds: string[];
  offers: HotelOffer[];
  onOpen: () => void;
  onRemove: (id: string) => void;
}) {
  const selected = compareIds
    .map(id => offers.find(o => o.hotel_id === id))
    .filter(Boolean) as HotelOffer[];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-2xl border border-white/[0.12] bg-[#0c1018]/97 backdrop-blur-xl shadow-[0_8px_48px_rgba(0,0,0,0.85)] px-4 py-3 flex items-center gap-3">

        {/* Label */}
        <span className="text-[9px] font-black uppercase tracking-widest text-white/20 flex-shrink-0 hidden sm:block">Compare</span>

        {/* Hotel slots */}
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          {selected.map(h => (
            <div key={h.hotel_id} className="flex items-center gap-1.5 flex-shrink-0 rounded-xl bg-white/[0.05] border border-white/[0.07] pl-1.5 pr-2 py-1.5">
              <div className="w-7 h-7 rounded-md overflow-hidden bg-white/[0.06] flex-shrink-0">
                {h.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={h.image_url} alt={h.name} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-white/20 text-sm">🏨</span>
                }
              </div>
              <span className="text-[11px] font-semibold text-white/80 truncate max-w-[80px] sm:max-w-[110px]">
                {h.name.split(",")[0].split("–")[0].trim()}
              </span>
              <button
                onClick={() => onRemove(h.hotel_id)}
                className="flex-shrink-0 text-white/25 hover:text-white/70 transition-colors ml-0.5"
                aria-label={`Remove ${h.name}`}
              >
                <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
                </svg>
              </button>
            </div>
          ))}

          {/* Empty slot hint */}
          {selected.length < 2 && (
            <div className="flex items-center gap-1.5 rounded-xl border border-dashed border-white/[0.10] px-3 py-1.5 flex-shrink-0">
              <span className="text-[11px] text-white/20">+ Add hotel</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex-shrink-0">
          {compareIds.length < 2 ? (
            <span className="text-[11px] text-white/25 whitespace-nowrap">1 more needed</span>
          ) : (
            <button
              onClick={onOpen}
              className="flex items-center gap-1.5 text-[13px] font-bold px-5 py-2.5 bg-lantern-blue text-white rounded-xl hover:bg-lantern-blue/80 active:scale-95 transition-all whitespace-nowrap shadow-[0_2px_16px_rgba(119,167,255,0.35)]"
            >
              Compare {compareIds.length}
              <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M2 6h8M6 2l4 4-4 4" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── HotelComparePanel ─────────────────────────────────────────────────────────

const COMPARE_AMENITY_ROWS = [
  { label: "Pool",       terms: ["pool", "swimming"] },
  { label: "Gym",        terms: ["gym", "fitness", "exercise"] },
  { label: "Breakfast",  terms: ["breakfast"] },
  { label: "Spa",        terms: ["spa", "wellness", "massage"] },
  { label: "Parking",    terms: ["parking"] },
  { label: "Wi-Fi",      terms: ["wifi", "wi-fi", "wireless internet"] },
] as const;

function HotelComparePanel({
  hotels,
  onClose,
  onRemove,
}: {
  hotels: HotelOffer[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  if (hotels.length < 2) return null;
  const verdictParts = buildVerdictParts(hotels);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-sm">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/[0.08] bg-[#0d1117]/98 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Compare Hotels</h2>
        <button
          onClick={onClose}
          className="text-[11px] font-semibold text-white/45 hover:text-white/80 transition-colors flex items-center gap-1.5 border border-white/[0.08] rounded-lg px-3 py-1.5"
        >
          <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
          Close
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-4xl mx-auto">

          {/* Summary award cards */}
          <CompareSummaryCards hotels={hotels} />

          {/* Verdict */}
          {verdictParts && (
            <div className={`mb-5 rounded-xl border px-4 py-4 ${
              verdictParts.confidence === "close-call"
                ? "border-white/[0.07] bg-white/[0.02]"
                : "border-lantern-violet/20 bg-lantern-violet/[0.04]"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-lantern-violet/70">
                  TravelGrab Verdict
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    verdictParts.confidence === "high"       ? "bg-lantern-mint"
                    : verdictParts.confidence === "medium"   ? "bg-amber-400"
                    : "bg-white/25"
                  }`} />
                  <span className={`text-[10px] font-bold ${
                    verdictParts.confidence === "high"       ? "text-lantern-mint"
                    : verdictParts.confidence === "medium"   ? "text-amber-400"
                    : "text-white/35"
                  }`}>
                    {verdictParts.confidence === "high"       ? "High Confidence"
                    : verdictParts.confidence === "medium"    ? "Medium Confidence"
                    : "Close Call"}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[12.5px] text-white/85 font-semibold leading-snug">{verdictParts.headline}</p>
                <p className="text-[11.5px] text-white/55 leading-relaxed">{verdictParts.explanation}</p>
                {verdictParts.tradeoff && (
                  <p className="text-[11px] text-amber-300/60 leading-relaxed pt-0.5">
                    {verdictParts.tradeoff}
                  </p>
                )}
                {verdictParts.chooseIf && (
                  <p className="text-[11px] text-white/38 leading-relaxed">
                    {verdictParts.chooseIf}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Table — horizontal scroll on narrow screens */}
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full min-w-[500px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="py-3 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-white/20 w-28">Metric</th>
                  {hotels.map(h => (
                    <th key={h.hotel_id} className="py-3 px-3 text-left min-w-[140px] align-top">
                      <div className="flex items-start gap-2">
                        {h.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.image_url} alt={h.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-white/[0.05]" />
                        )}
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-white leading-snug line-clamp-2">{h.name}</div>
                          {h.inferred_neighborhood && (
                            <div className="text-[9px] text-white/35 mt-0.5">{h.inferred_neighborhood}</div>
                          )}
                        </div>
                      </div>
                      <button onClick={() => onRemove(h.hotel_id)} className="mt-1.5 text-[9px] text-white/20 hover:text-white/50 transition-colors">
                        Remove
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>

                <CompareSectionRow label="Pricing" colCount={hotels.length} />
                {/* Price/night */}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.price_per_night }));
                  const w = priceWinner(vals);
                  return (
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-4 text-white/40 text-[11px]">Price/night</td>
                      {hotels.map(h => {
                        const isW = w?.id === h.hotel_id;
                        return (
                          <td key={h.hotel_id} className={`py-2.5 px-3 text-[11px] ${isW ? "text-lantern-mint font-bold" : "text-white/55"}`}>
                            ${Math.round(h.price_per_night).toLocaleString()}
                            {isW && <span className="ml-1 text-[9px] text-lantern-mint/55">Lowest</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })()}
                {/* Total stay */}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.total_price }));
                  const w = priceWinner(vals);
                  const nights = hotels[0]?.nights ?? 0;
                  return (
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-4 text-white/40 text-[11px]">
                        Total{nights > 0 ? ` (${nights}n)` : ""}
                      </td>
                      {hotels.map(h => {
                        const isW = w?.id === h.hotel_id;
                        return (
                          <td key={h.hotel_id} className={`py-2.5 px-3 text-[11px] ${isW ? "text-lantern-mint font-bold" : "text-white/55"}`}>
                            ${Math.round(h.total_price).toLocaleString()}
                            {isW && <span className="ml-1 text-[9px] text-lantern-mint/55">Lowest</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })()}

                <CompareSectionRow label="Quality Scores" colCount={hotels.length} />
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.ai_score }));
                  return <CompareScoreRow label="TravelGrab Score" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={String} winnerLabel="Highest" />;
                })()}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.overall_rating }));
                  return <CompareScoreRow label="Guest Rating" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={v => v > 0 ? `${v.toFixed(1)}★` : "–"} winnerLabel="Highest" />;
                })()}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.score_breakdown.reviews }));
                  return <CompareScoreRow label="Reviews" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={String} winnerLabel="Best" />;
                })()}
                {hotels.some(h => h.neighborhood_fit_score > 0) && (() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.neighborhood_fit_score }));
                  return <CompareScoreRow label="Neighborhood Fit" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={v => v > 0 ? String(v) : "–"} winnerLabel="Best" tooltip="How well the hotel's area matches your selected travel style — scored across dining, nightlife, sightseeing, and transport density." />;
                })()}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.score_breakdown.location }));
                  return <CompareScoreRow label="Location" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={String} winnerLabel="Best" />;
                })()}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.score_breakdown.walkability }));
                  return <CompareScoreRow label="Walkability" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={String} winnerLabel="Most walkable" tooltip="How easy it is to get around on foot from this hotel — based on proximity to transit, shops, and attractions." />;
                })()}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.score_breakdown.stars }));
                  return <CompareScoreRow label="Hotel Quality" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={String} winnerLabel="Highest" tooltip="Based on star class, brand tier, and property condition. Higher means a more upscale or well-maintained property." />;
                })()}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.score_breakdown.price }));
                  return <CompareScoreRow label="Price/Value" hotels={hotels} vals={vals} winner={qualityWinner(vals)} format={String} winnerLabel="Best value" tooltip="How much quality you get per dollar relative to the other results in this search. High score = strong value; low score = priced above average for what's offered." />;
                })()}

                <CompareSectionRow label="Amenities" colCount={hotels.length} />
                {COMPARE_AMENITY_ROWS.map(({ label, terms }) => (
                  <tr key={label} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-4 text-white/40 text-[11px]">{label}</td>
                    {hotels.map(h => {
                      const has = hotelHasAmenity(h.amenities, terms as unknown as string[]);
                      return (
                        <td key={h.hotel_id} className="py-2 px-3 text-[12px]">
                          <span className={has ? "text-lantern-mint" : "text-white/20"}>{has ? "✓" : "–"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <CompareSectionRow label="Location" colCount={hotels.length} />
                {/* Nearest landmark */}
                {(() => {
                  const vals = hotels.map(h => ({ id: h.hotel_id, val: h.nearby_walk?.minutes ?? 0 }));
                  const withData = vals.filter(v => v.val > 0);
                  const w: CompareWinner = withData.length >= 2
                    ? { id: withData.reduce((a, b) => a.val < b.val ? a : b).id, type: "price" }
                    : null;
                  return (
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-4 text-white/40 text-[11px]">Nearest walk</td>
                      {hotels.map(h => {
                        const isW = w?.id === h.hotel_id;
                        const nw = h.nearby_walk;
                        return (
                          <td key={h.hotel_id} className={`py-2.5 px-3 text-[11px] ${isW ? "text-lantern-mint font-bold" : "text-white/50"}`}>
                            {nw ? `${nw.minutes} min to ${nw.name}` : "–"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })()}
                <tr>
                  <td className="py-2.5 pr-4 text-white/40 text-[11px]">Transit</td>
                  {hotels.map(h => (
                    <td key={h.hotel_id} className="py-2.5 px-3 text-[11px] text-white/45">{h.transit_note || "–"}</td>
                  ))}
                </tr>

              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-5 flex items-center gap-4 text-[10px] text-white/20">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-lantern-mint/50" />
              <span>Lowest price</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-lantern-violet/60" />
              <span>Highest score</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-white/[0.16]" />
              <span>Other</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Recommended Hotels (Top 3 picks) ─────────────────────────────────────────

function topPickSentence(h: HotelOffer, rank: number, top3: HotelOffer[]): string {
  const first      = top3[0];
  const second     = top3[1];
  const priceSave  = rank > 0 ? Math.round(first.price_per_night - h.price_per_night) : 0;
  const nights     = h.nights > 0 ? h.nights : (first?.nights ?? 0);
  const tripSave   = nights >= 2 && priceSave >= 20 ? priceSave * nights : 0;

  const strengths: string[] = [];
  if (h.star_rating >= 5)                       strengths.push("5-star luxury");
  if (h.overall_rating >= 4.7)                  strengths.push(`${h.overall_rating.toFixed(1)}★ guest rating`);
  else if (h.overall_rating >= 4.4)             strengths.push("strong guest reviews");
  if (h.score_breakdown.walkability >= 72)      strengths.push("excellent walkability");
  else if (h.score_breakdown.walkability >= 55) strengths.push("good walkability");
  if (h.score_breakdown.location >= 85)         strengths.push("prime location");
  else if (h.score_breakdown.location >= 70)    strengths.push("central location");
  if (h.score_breakdown.price >= 75)            strengths.push("great value");
  if (h.score_breakdown.reviews >= 80)          strengths.push("strong reviews");

  if (rank === 0) {
    const qualifier = h.star_rating >= 5 ? "luxury" : h.overall_rating >= 4.7 ? "premium" : "overall";
    const str = strengths.slice(0, 2).join(" and ") || "balanced strengths";
    if (second) {
      const costMore  = Math.round(h.price_per_night - second.price_per_night);
      const tripExtra = nights >= 2 && costMore >= 20 ? costMore * nights : 0;
      if (costMore >= 30)
        return tripExtra > 0
          ? `Best ${qualifier} choice. $${tripExtra} more than #2 over this ${nights}-night trip — worth it if quality is the priority.`
          : `Best ${qualifier} choice. Costs $${costMore}/night more than #2 — worth it if quality is the priority.`;
      if (second.overall_rating > h.overall_rating + 0.1)
        return `Best ${qualifier} choice with ${str}. #2 edges it on guest reviews (${second.overall_rating.toFixed(1)} vs ${h.overall_rating.toFixed(1)}★).`;
    }
    return `Best ${qualifier} choice with ${str}.`;
  }

  if (rank === 1) {
    const firstShort = first.name.split(",")[0].split("–")[0].trim();
    if (priceSave >= 30) {
      const ratingCost = first.overall_rating > h.overall_rating + 0.1
        ? `, though ${firstShort} has higher guest scores (${first.overall_rating.toFixed(1)} vs ${h.overall_rating.toFixed(1)}★)`
        : "";
      return tripSave > 0
        ? `Saves $${tripSave} on this ${nights}-night trip vs. ${firstShort}${ratingCost}.`
        : `Saves $${priceSave}/night vs. ${firstShort}${ratingCost}.`;
    }
    if (priceSave >= 10) {
      const str = strengths.slice(0, 1)[0] ?? "strong performance";
      return `${str.charAt(0).toUpperCase() + str.slice(1)} at a slightly lower price than #1.`;
    }
    const str = strengths.slice(0, 2).join(" and ") || "strong performance";
    return `${str.charAt(0).toUpperCase() + str.slice(1)} — very close to #1.`;
  }

  if (priceSave >= 40) {
    return tripSave > 0
      ? `Best value in the top 3 — saves $${tripSave} on this ${nights}-night trip vs. #1.`
      : `Best value in the top 3 — saves $${priceSave}/night vs #1.`;
  }
  const str = strengths.slice(0, 2).join(" and ") || "solid overall performance";
  return `Strong option with ${str}.`;
}

function RecommendedHotels({
  top3,
  compareIds,
  onSetCompareIds,
  onOpenCompare,
}: {
  top3:            HotelOffer[];
  compareIds:      string[];
  onSetCompareIds: (ids: string[]) => void;
  onOpenCompare:   () => void;
}) {
  if (top3.length === 0) return null;

  const RANK_LABEL  = ["#1", "#2", "#3"];
  const RANK_COLOR  = ["text-amber-400", "text-white/45", "text-amber-700/70"];
  const CARD_STYLE  = [
    "border-amber-500/20 bg-amber-500/[0.04]",
    "border-white/[0.07] bg-white/[0.025]",
    "border-white/[0.05] bg-white/[0.015]",
  ];

  return (
    <div className="mb-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/28">
            Top Picks For You
          </span>
          <p className="text-[11px] text-white/18 mt-0.5">
            Highest-ranked hotels from this search
          </p>
        </div>
        {top3.length >= 2 && (
          <button
            onClick={() => {
              onSetCompareIds(top3.map((h) => h.hotel_id));
              onOpenCompare();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-lantern-violet/30 bg-lantern-violet/[0.08] text-lantern-violet text-[11px] font-semibold hover:bg-lantern-violet/[0.15] transition-all"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M2 6h8M6 2v8" />
            </svg>
            Compare These {top3.length}
          </button>
        )}
      </div>

      {/* Pick cards */}
      <div className="space-y-2">
        {top3.map((h, i) => {
          const sentence  = topPickSentence(h, i, top3);
          const shortNbhd = h.inferred_neighborhood?.split(" /")[0].split(",")[0] ?? "";

          return (
            <div key={h.hotel_id} className={`flex items-start gap-3 rounded-xl border p-3 ${CARD_STYLE[i]}`}>
              {/* Rank */}
              <div className="flex-shrink-0 w-6 pt-0.5 text-center">
                <span className={`text-[12px] font-black tabular-nums ${RANK_COLOR[i]}`}>
                  {RANK_LABEL[i]}
                </span>
              </div>

              {/* Image */}
              <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-white/[0.04]">
                {h.image_url ? (
                  <img src={h.image_url} alt={h.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white/12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <h3 className="text-[13px] font-bold text-white leading-tight line-clamp-1 flex-1 min-w-0">
                    {h.name}
                  </h3>
                  <span className={`flex-shrink-0 text-[13px] font-black tabular-nums ${scoreColor(h.ai_score)}`}>
                    {h.ai_score}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  {shortNbhd && (
                    <span className="text-[10px] text-white/28">{shortNbhd}</span>
                  )}
                  <span className="text-[10px] text-white/18">·</span>
                  <span className="text-[11px] font-semibold text-white/55">
                    ${Math.round(h.price_per_night)}
                    <span className="text-[10px] text-white/25 font-normal">/night</span>
                  </span>
                  {h.overall_rating > 0 && (
                    <>
                      <span className="text-[10px] text-white/18">·</span>
                      <span className="text-[10px] text-white/30">{h.overall_rating.toFixed(1)}★</span>
                    </>
                  )}
                </div>

                <p className="text-[11px] text-white/42 leading-snug">{sentence}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Why #1 beats #2 (inline between cards) ────────────────────────────────────

function WhyTopRanks({ h1, h2 }: { h1: HotelOffer; h2: HotelOffer }) {
  const dims = [
    { label: "neighborhood fit",  delta: h1.neighborhood_fit_score       - h2.neighborhood_fit_score       },
    { label: "destination fit",   delta: h1.score_breakdown.destination_fit - h2.score_breakdown.destination_fit },
    { label: "guest reviews",     delta: h1.score_breakdown.reviews      - h2.score_breakdown.reviews      },
    { label: "walkability",       delta: h1.score_breakdown.walkability  - h2.score_breakdown.walkability  },
    { label: "location",          delta: h1.score_breakdown.location     - h2.score_breakdown.location     },
    { label: "hotel quality",     delta: h1.score_breakdown.stars        - h2.score_breakdown.stars        },
    { label: "price / value",     delta: h1.score_breakdown.price        - h2.score_breakdown.price        },
  ]
    // Skip dimensions that are 0 for both (unused, e.g. neighborhood_fit when no prefs)
    .filter((d) => d.delta > 3 && (h1.neighborhood_fit_score > 0 || d.label !== "neighborhood fit"))
    .sort((a, b) => b.delta - a.delta);

  const tradeoffDim = [
    { label: "hotel quality",  delta: h2.score_breakdown.stars       - h1.score_breakdown.stars       },
    { label: "guest reviews",  delta: h2.score_breakdown.reviews     - h1.score_breakdown.reviews     },
    { label: "walkability",    delta: h2.score_breakdown.walkability - h1.score_breakdown.walkability },
    { label: "location",       delta: h2.score_breakdown.location   - h1.score_breakdown.location   },
  ].filter((d) => d.delta > 5).sort((a, b) => b.delta - a.delta)[0];

  const h2PriceSavings = Math.round(h1.price_per_night - h2.price_per_night);
  const h1Short = h1.name.split(",")[0].split("–")[0].trim();
  const h2Short = h2.name.split(",")[0].split("–")[0].trim();

  if (dims.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] px-4 py-3 -mt-1">
      <span className="text-[9px] font-black uppercase tracking-[0.13em] text-white/20 block mb-2">
        Why {h1Short} ranks #1
      </span>
      <div className="space-y-1.5 mb-0">
        {dims.slice(0, 3).map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="flex-shrink-0 w-1 h-1 rounded-full bg-lantern-mint/40 mt-px" />
            <span className="text-[11.5px] text-white/48">
              Better {d.label}
              <span className="text-white/20 ml-1 text-[10px]">(+{d.delta})</span>
            </span>
          </div>
        ))}
      </div>
      {(tradeoffDim || h2PriceSavings >= 20) && (
        <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-start gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/40 flex-shrink-0 mt-px">Tradeoff</span>
          <span className="text-[11px] text-white/28 leading-snug">
            {h2PriceSavings >= 20 && tradeoffDim
              ? `${h2Short} saves $${h2PriceSavings}/night and has stronger ${tradeoffDim.label}`
              : h2PriceSavings >= 20
                ? `${h2Short} saves $${h2PriceSavings}/night`
                : tradeoffDim
                  ? `${h2Short} has stronger ${tradeoffDim.label}`
                  : null}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Hidden Gem callout ────────────────────────────────────────────────────────

function HiddenGemCallout({ gem, topHotel, avgPrice }: {
  gem:      HotelOffer;
  topHotel: HotelOffer;
  avgPrice: number;
}) {
  const gemShort  = gem.name.split(",")[0].split("–")[0].trim();
  const topShort  = topHotel.name.split(",")[0].split("–")[0].trim();
  const savings   = Math.round(topHotel.price_per_night - gem.price_per_night);
  const nights    = gem.nights > 0 ? gem.nights : (topHotel.nights > 0 ? topHotel.nights : 0);
  const tripSaves = nights >= 2 && savings >= 20 ? savings * nights : 0;
  const pctBelow  = avgPrice > 0 ? Math.round((1 - gem.price_per_night / avgPrice) * 100) : 0;

  const savingsText = tripSaves > 0
    ? `saves $${tripSaves} on this ${nights}-night trip vs. ${topShort}`
    : savings >= 20
      ? `saves $${savings}/night vs. ${topShort}`
      : `is priced ${pctBelow}% below the search average`;

  const gainLine = (() => {
    if (gem.overall_rating >= 4.5 && gem.review_count >= 100)
      return `${gem.overall_rating.toFixed(1)}★ from ${gem.review_count.toLocaleString()} guests — rivals pricier hotels.`;
    if (gem.star_rating >= 4)
      return `${gem.star_rating}-star quality at well below the search average.`;
    return `Strong guest scores at $${Math.round(gem.price_per_night)}/night.`;
  })();

  const tradeoffLine = (() => {
    if (gem.rank_weakness) return gem.rank_weakness;
    if (gem.score_breakdown.location < 50) return `Lower location score than top picks.`;
    return `Not the highest overall score — but value is hard to beat.`;
  })();

  return (
    <div className="rounded-xl border border-lantern-mint/15 bg-lantern-mint/[0.03] px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.13em] text-lantern-mint/50">Hidden Gem</span>
        <span className="text-[9px] text-white/20">·</span>
        <span className="text-[9px] text-white/30">Best value in this search</span>
      </div>
      <p className="text-[11.5px] text-white/60 leading-snug mb-2">
        <span className="font-semibold text-white/75">{gemShort}</span>
        {` ${savingsText}. `}{gainLine}
      </p>
      <div className="flex items-start gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/50 flex-shrink-0 mt-px">Tradeoff</span>
        <span className="text-[10.5px] text-white/32 leading-snug">{tradeoffLine}</span>
      </div>
    </div>
  );
}

// ── Book This One ─────────────────────────────────────────────────────────────

function buildPersonalPickSentence(
  h1: HotelOffer, h2: HotelOffer,
  confidence: "high" | "medium" | "close-call",
  cityGuide: CityGuide | null,
): string {
  const h1Short = h1.name.split(",")[0].split("–")[0].trim();
  const h2Short = h2.name.split(",")[0].split("–")[0].trim();
  const nights  = h1.nights > 0 ? h1.nights : 0;
  const savings = Math.round(h2.price_per_night - h1.price_per_night);   // >0 = h1 cheaper
  const premium = -savings;                                               // >0 = h1 costs more

  const recNbhd  = cityGuide?.neighborhoods[0];
  const h1InRec  = recNbhd?.matchKeywords.some(
    (k) => h1.inferred_neighborhood?.toLowerCase().includes(k.toLowerCase()),
  );
  const outstandingReviews = h1.overall_rating >= 4.7 && h1.review_count >= 200;
  const strongReviews      = h1.overall_rating >= 4.4;
  const tripSavings        = nights >= 2 && savings >= 20 ? savings * nights : 0;

  if (confidence === "close-call") {
    if (savings >= 20)
      return `Either hotel is a genuinely good choice here. We'd lean toward ${h2Short} — the savings matter more than the small score gap.`;
    return `Both score almost identically. If forced to pick, we'd go with ${h1Short} on a slight gut-read of the reviews.`;
  }

  if (premium >= 30 && outstandingReviews) {
    const savingsNote = tripSavings > 0 ? ` worth the extra $${tripSavings} over the trip` : ` worth paying more for`;
    return `We'd book ${h1Short}. The ${h1.overall_rating.toFixed(1)}★ guest reviews make it${savingsNote}.`;
  }

  if (h1InRec && recNbhd) {
    const areaNote = recNbhd.name.split(" /")[0];
    const reviewNote = outstandingReviews
      ? ` and the ${h1.overall_rating.toFixed(1)}★ reviews seal it`
      : strongReviews
        ? ` with solid guest reviews to back it up`
        : "";
    return `We'd book ${h1Short} — it's in ${areaNote}, the best area for this search${reviewNote}.`;
  }

  if (tripSavings > 0 && outstandingReviews)
    return `We'd personally book ${h1Short}. The savings over the trip ($${tripSavings}) are real, and the guest reviews are outstanding.`;

  if (tripSavings > 0 && strongReviews)
    return `We'd book ${h1Short} — it saves $${tripSavings} on this ${nights}-night trip and the reviews are strong.`;

  if (outstandingReviews)
    return `We'd book ${h1Short}. The ${h1.overall_rating.toFixed(1)}★ guest rating with ${h1.review_count.toLocaleString()} reviews is hard to argue with.`;

  if (h1.star_rating >= 5)
    return `We'd book ${h1Short} — 5-star quality here is exceptional and it scores above everything else in this search.`;

  return `If this were our trip, we'd book ${h1Short}. It leads on the factors that matter most for this kind of stay.`;
}

function BookThisOne({
  h1,
  h2,
  cityGuide,
}: {
  h1: HotelOffer;
  h2: HotelOffer;
  cityGuide: CityGuide | null;
}) {
  const gap        = h1.ai_score - h2.ai_score;
  const confidence = gap >= 5 ? "high" : gap >= 2 ? "medium" : "close-call";
  const nights     = h1.nights > 0 ? h1.nights : (h2.nights > 0 ? h2.nights : 0);

  const pricePremium  = Math.round(h1.price_per_night - h2.price_per_night);   // >0 = h1 more expensive
  const priceSavings  = -pricePremium;                                          // >0 = h1 cheaper
  const tripSavings   = nights >= 2 ? Math.abs(pricePremium) * nights : 0;
  const h1NbhdRaw     = h1.inferred_neighborhood?.split(",")[0].split(" /")[0] ?? "";
  const h2Short       = h2.name.length > 26 ? h2.name.slice(0, 23) + "…" : h2.name;

  const personalPick = buildPersonalPickSentence(h1, h2, confidence, cityGuide);

  // ── Why (#1 strengths) ──────────────────────────────────────────────────────
  const why: string[] = [];
  why.push(`Highest TravelGrab score (${h1.ai_score})`);

  if (h1.overall_rating >= 4.7)      why.push(`Outstanding guest reviews (${h1.overall_rating.toFixed(1)}★)`);
  else if (h1.overall_rating >= 4.4) why.push(`Strong guest reviews (${h1.overall_rating.toFixed(1)}★)`);
  else if (h1.score_breakdown.reviews > h2.score_breakdown.reviews + 8)
    why.push("Higher guest satisfaction score");

  if (h1.score_breakdown.walkability >= 75)
    why.push("Excellent walkability");
  else if (h1.score_breakdown.walkability >= 58 && h1.score_breakdown.walkability > h2.score_breakdown.walkability + 5)
    why.push("Better walkability than alternatives");

  if (h1.score_breakdown.location >= 85)
    why.push("Prime central location");
  else if (h1.score_breakdown.location > h2.score_breakdown.location + 8)
    why.push("Better location score");

  if (h1NbhdRaw) {
    const recNbhd = cityGuide?.neighborhoods[0];
    const isRec   = recNbhd?.matchKeywords.some(
      (k) => h1.inferred_neighborhood.toLowerCase().includes(k.toLowerCase()),
    );
    if (isRec && recNbhd)
      why.push(`Located in recommended neighborhood (${recNbhd.name.split(" /")[0]})`);
    else if (h1NbhdRaw)
      why.push(`Located in ${h1NbhdRaw}`);
  }

  if (h1.star_rating >= 5)                                    why.push("5-star luxury hotel");
  else if (h1.star_rating > h2.star_rating && h1.star_rating >= 4) why.push(`Higher star category (${h1.star_rating}★)`);
  if (priceSavings >= 25) {
    why.push(
      tripSavings > 0
        ? `Saves $${tripSavings} on this ${nights}-night trip`
        : `$${priceSavings}/night cheaper than comparable options`,
    );
  }

  const finalWhy = why.slice(0, 4);

  // ── Tradeoffs (#1 weaknesses) ───────────────────────────────────────────────
  const tradeoffs: string[] = [];
  if (pricePremium >= 20) {
    tradeoffs.push(
      tripSavings > 0
        ? `Costs $${tripSavings} more over this ${nights}-night trip vs. ${h2Short}`
        : `Costs $${pricePremium}/night more than ${h2Short}`,
    );
  }
  if (h2.review_count > h1.review_count + 100 && h2.review_count > h1.review_count * 1.3)
    tradeoffs.push(`Fewer reviews than ${h2Short} (${h1.review_count} vs ${h2.review_count})`);
  if (h2.overall_rating > h1.overall_rating + 0.2)
    tradeoffs.push(`Slightly lower guest rating (${h1.overall_rating.toFixed(1)}★ vs ${h2.overall_rating.toFixed(1)}★)`);

  // ── Why not #2: pros ────────────────────────────────────────────────────────
  const runnerPros: string[] = [];
  if (priceSavings >= 20) {
    runnerPros.push(
      tripSavings > 0
        ? `Saves $${tripSavings} on this ${nights}-night trip`
        : `Saves $${priceSavings}/night`,
    );
  }
  if (h2.overall_rating > h1.overall_rating + 0.1)
    runnerPros.push(`Higher guest rating (${h2.overall_rating.toFixed(1)}★ vs ${h1.overall_rating.toFixed(1)}★)`);
  if (h2.review_count > h1.review_count + 75)
    runnerPros.push(`More guest reviews (${h2.review_count.toLocaleString()} vs ${h1.review_count.toLocaleString()})`);
  if (h2.score_breakdown.walkability > h1.score_breakdown.walkability + 5)
    runnerPros.push("Better walkability");
  if (h2.star_rating > h1.star_rating)
    runnerPros.push(`Higher star category (${h2.star_rating}★ vs ${h1.star_rating}★)`);

  // ── Why not #2: cons ────────────────────────────────────────────────────────
  const runnerCons: string[] = [];
  runnerCons.push(`Lower overall score (${h2.ai_score} vs ${h1.ai_score})`);
  if (h2.score_breakdown.walkability < h1.score_breakdown.walkability - 5)
    runnerCons.push("Lower walkability");
  if (h2.overall_rating < h1.overall_rating - 0.2)
    runnerCons.push(`Lower guest rating (${h2.overall_rating.toFixed(1)}★)`);
  if (h2.score_breakdown.location < h1.score_breakdown.location - 8)
    runnerCons.push("Weaker location score");

  // ── Who should pick #2 ──────────────────────────────────────────────────────
  const whoShouldPick: string[] = [];
  if (priceSavings >= 20)
    whoShouldPick.push("Value matters more than location quality");
  if (h2.score_breakdown.walkability >= h1.score_breakdown.walkability - 5)
    whoShouldPick.push("You plan to use public transit over walking");
  if (h2.review_count > h1.review_count)
    whoShouldPick.push("You prefer properties with a larger review base");
  if (h2.overall_rating >= h1.overall_rating)
    whoShouldPick.push("Raw guest satisfaction is your top priority");
  whoShouldPick.push("You want to minimize hotel spend");

  const finalRunnerPros    = runnerPros.slice(0, 3);
  const finalRunnerCons    = runnerCons.slice(0, 3);
  const finalWhoShouldPick = whoShouldPick.slice(0, 3);

  const confLabel = confidence === "high"       ? "High Confidence"
                  : confidence === "medium"     ? "Medium Confidence"
                  : "Close Call";
  const confDesc  = confidence === "high"
                  ? "Clear recommendation based on overall balance."
                  : confidence === "medium"
                  ? "Solid advantage over the alternatives."
                  : "Genuinely close — either is a reasonable choice.";
  const confColor = confidence === "high"       ? "text-lantern-mint"
                  : confidence === "medium"     ? "text-amber-400"
                  : "text-white/35";
  const confDot   = confidence === "high"       ? "bg-lantern-mint"
                  : confidence === "medium"     ? "bg-amber-400"
                  : "bg-white/25";

  return (
    <div className="mb-5 rounded-2xl border border-lantern-mint/15 bg-lantern-mint/[0.025] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-white/[0.04]">
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-lantern-mint/55">
          TravelGrab Pick
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${confDot} opacity-80`} />
          <div>
            <span className={`text-[10px] font-bold ${confColor}`}>{confLabel}</span>
            <span className="text-[9px] text-white/22 ml-1.5">{confDesc}</span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-3.5">
        {/* Hotel name */}
        <div>
          <h2 className="text-[15px] font-bold text-white leading-tight">{h1.name}</h2>
        </div>

        {/* Personal pick sentence */}
        <div className="rounded-lg border border-lantern-mint/10 bg-lantern-mint/[0.04] px-3 py-2.5">
          <p className="text-[12px] text-white/70 leading-relaxed italic">{personalPick}</p>
        </div>

        {/* Why */}
        {finalWhy.length > 0 && (
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-widest text-white/25 block mb-1.5">Why</span>
            <ul className="space-y-1.5">
              {finalWhy.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1 h-1 rounded-full bg-lantern-mint/50 mt-[5px]" />
                  <span className="text-[12px] text-white/55 leading-snug">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tradeoffs */}
        {tradeoffs.length > 0 && (
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-widest text-white/25 block mb-1.5">Tradeoffs</span>
            <ul className="space-y-1.5">
              {tradeoffs.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1 h-1 rounded-full bg-amber-400/50 mt-[5px]" />
                  <span className="text-[12px] text-white/42 leading-snug">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-white/[0.05]" />

        {/* Why not #2 */}
        <div>
          <span className="text-[9.5px] font-bold uppercase tracking-widest text-white/22 block mb-2">
            Why not {h2Short}?
          </span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {/* Pros column */}
            <div>
              {finalRunnerPros.length > 0 && (
                <>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-lantern-mint/45 block mb-1">Pros</span>
                  <ul className="space-y-1">
                    {finalRunnerPros.map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="flex-shrink-0 w-1 h-1 rounded-full bg-lantern-mint/35 mt-[5px]" />
                        <span className="text-[11px] text-white/40 leading-snug">{p}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {/* Cons column */}
            <div>
              {finalRunnerCons.length > 0 && (
                <>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-white/22 block mb-1">Cons</span>
                  <ul className="space-y-1">
                    {finalRunnerCons.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="flex-shrink-0 w-1 h-1 rounded-full bg-white/20 mt-[5px]" />
                        <span className="text-[11px] text-white/32 leading-snug">{c}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Who should pick #2 */}
        {confidence !== "close-call" && finalWhoShouldPick.length > 0 && (
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-widest text-white/22 block mb-1.5">
              Choose {h2Short} instead if:
            </span>
            <ul className="space-y-1.5">
              {finalWhoShouldPick.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1 h-1 rounded-full bg-white/18 mt-[5px]" />
                  <span className="text-[11.5px] text-white/35 leading-snug">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recommendation panel ──────────────────────────────────────────────────────

function RecommendationPanel({
  offers,
  activePrefs,
  recommendedSummary,
}: {
  offers: HotelOffer[];
  activePrefs: readonly PrefId[];
  recommendedSummary?: NeighborhoodSummary | null;
}) {
  const pick = offers.find((o) => o.recommendation_label === "Best Overall") ?? offers[0];
  if (!pick) return null;

  const sortedByScore = [...offers].sort((a, b) => b.ai_score - a.ai_score);
  const runnerUp = sortedByScore.find((o) => o.hotel_id !== pick.hotel_id) ?? null;
  const margin   = runnerUp ? Math.round((pick.ai_score - runnerUp.ai_score) * 10) / 10 : 0;
  const isCloseCall = margin < 5 && runnerUp !== null;

  const pickInRecNbhd = recommendedSummary
    ? recommendedSummary.hotels.some((h) => h.hotel_id === pick.hotel_id)
    : true;

  const prefsActive    = activePrefs.length > 0;
  const prefLabel      = (activePrefs[0]
    ? NEIGHBORHOOD_PREFS.find((x) => x.id === activePrefs[0])?.label ?? ""
    : "") as string;
  const prefLabelLower = prefLabel.toLowerCase();

  // ── "Won because" bullets (max 3, sorted by weighted impact) ────────────────
  const wonCandidates: { text: string; impact: number }[] = [];
  if (runnerUp) {
    if (prefsActive) {
      const nfGap = pick.neighborhood_fit_score - runnerUp.neighborhood_fit_score;
      if (nfGap >= 5) {
        wonCandidates.push({
          text: `Better ${prefLabelLower || "preference"} neighborhood fit (${pick.neighborhood_fit_score} vs ${runnerUp.neighborhood_fit_score})`,
          impact: nfGap * 0.35,
        });
      } else if (pick.neighborhood_fit_score >= 60 && nfGap >= 0) {
        wonCandidates.push({
          text: `Good ${prefLabelLower || "preference"} neighborhood match (score ${pick.neighborhood_fit_score})`,
          impact: pick.neighborhood_fit_score * 0.15,
        });
      }
    } else if (pick.score_breakdown.destination_fit > 0) {
      const dfGap = pick.score_breakdown.destination_fit - runnerUp.score_breakdown.destination_fit;
      if (dfGap >= 8) {
        wonCandidates.push({
          text: `Better visitor-facing location (area score ${pick.score_breakdown.destination_fit} vs ${runnerUp.score_breakdown.destination_fit})`,
          impact: dfGap * 0.22,
        });
      }
    }

    const reviewGap = pick.score_breakdown.reviews - runnerUp.score_breakdown.reviews;
    const reviewW   = prefsActive ? 0.20 : 0.25;
    if (reviewGap >= 5) {
      wonCandidates.push({ text: `Stronger guest satisfaction (${pick.score_breakdown.reviews} vs ${runnerUp.score_breakdown.reviews})`, impact: reviewGap * reviewW });
    } else if (pick.score_breakdown.reviews >= 70 && reviewGap >= 0) {
      wonCandidates.push({ text: `Strong guest reviews (${pick.score_breakdown.reviews}) — similar quality to alternatives`, impact: pick.score_breakdown.reviews * reviewW * 0.4 });
    }

    const starsGap = pick.score_breakdown.stars - runnerUp.score_breakdown.stars;
    const starsW   = prefsActive ? 0.25 : 0.18;
    if (starsGap >= 5) {
      wonCandidates.push({ text: `Higher hotel quality score (${pick.score_breakdown.stars} vs ${runnerUp.score_breakdown.stars})`, impact: starsGap * starsW });
    }

    if (!prefsActive) {
      const locGap = pick.score_breakdown.location - runnerUp.score_breakdown.location;
      if (locGap >= 8) {
        wonCandidates.push({ text: `Better central location score (${pick.score_breakdown.location} vs ${runnerUp.score_breakdown.location})`, impact: locGap * 0.17 });
      }
    }

    const priceScoreGap = pick.score_breakdown.price - runnerUp.score_breakdown.price;
    const priceW        = prefsActive ? 0.10 : 0.14;
    if (priceScoreGap >= 7) {
      wonCandidates.push({ text: `Better value for price paid (value score ${pick.score_breakdown.price} vs ${runnerUp.score_breakdown.price})`, impact: priceScoreGap * priceW });
    } else if (pick.price_per_night < runnerUp.price_per_night - 20) {
      wonCandidates.push({
        text: `Lower price ($${Math.round(pick.price_per_night)} vs $${Math.round(runnerUp.price_per_night)}/night)`,
        impact: (runnerUp.price_per_night - pick.price_per_night) * 0.04,
      });
    }

    const walkGap = pick.score_breakdown.walkability - runnerUp.score_breakdown.walkability;
    if (walkGap >= 10) {
      wonCandidates.push({ text: `More walkable area (${pick.score_breakdown.walkability} vs ${runnerUp.score_breakdown.walkability})`, impact: walkGap * (prefsActive ? 0.10 : 0.04) });
    }

    if (wonCandidates.length === 0) {
      wonCandidates.push({ text: "Best overall balance across all scoring factors", impact: margin });
    }
  }
  wonCandidates.sort((a, b) => b.impact - a.impact);
  const wonBullets = wonCandidates.slice(0, 3).map((c) => c.text);

  // ── Close-call one-liner ────────────────────────────────────────────────────
  let closeCallSentence = "";
  if (isCloseCall && runnerUp) {
    const allDims = prefsActive ? [
      { label: "neighborhood fit", pickV: pick.neighborhood_fit_score,          runnerV: runnerUp.neighborhood_fit_score,          w: 0.35 },
      { label: "hotel quality",   pickV: pick.score_breakdown.stars,            runnerV: runnerUp.score_breakdown.stars,            w: 0.25 },
      { label: "guest reviews",   pickV: pick.score_breakdown.reviews,          runnerV: runnerUp.score_breakdown.reviews,          w: 0.20 },
      { label: "price/value",     pickV: pick.score_breakdown.price,            runnerV: runnerUp.score_breakdown.price,            w: 0.10 },
      { label: "walkability",     pickV: pick.score_breakdown.walkability,      runnerV: runnerUp.score_breakdown.walkability,      w: 0.10 },
    ] : [
      { label: "guest reviews",   pickV: pick.score_breakdown.reviews,          runnerV: runnerUp.score_breakdown.reviews,          w: 0.25 },
      { label: "destination fit", pickV: pick.score_breakdown.destination_fit,  runnerV: runnerUp.score_breakdown.destination_fit,  w: 0.22 },
      { label: "hotel quality",   pickV: pick.score_breakdown.stars,            runnerV: runnerUp.score_breakdown.stars,            w: 0.18 },
      { label: "location",        pickV: pick.score_breakdown.location,         runnerV: runnerUp.score_breakdown.location,         w: 0.17 },
      { label: "price/value",     pickV: pick.score_breakdown.price,            runnerV: runnerUp.score_breakdown.price,            w: 0.14 },
      { label: "walkability",     pickV: pick.score_breakdown.walkability,      runnerV: runnerUp.score_breakdown.walkability,      w: 0.04 },
    ];
    const pickWins   = allDims.filter(d => d.pickV > d.runnerV + 2).sort((a, b) => (b.pickV - b.runnerV) * b.w - (a.pickV - a.runnerV) * a.w);
    const runnerWins = allDims.filter(d => d.runnerV > d.pickV + 2).sort((a, b) => (b.runnerV - b.pickV) * b.w - (a.runnerV - a.pickV) * a.w);
    const winFactor    = pickWins[0]?.label ?? "overall balance";
    const loseFactor   = runnerWins[0]?.label;
    const advantage    = margin === 0 ? "Tied overall but ranked ahead on" : "Slight edge on";
    closeCallSentence  = `${advantage} ${winFactor}${loseFactor ? `. ${runnerUp.name} has better ${loseFactor}.` : "."}`;
  }

  // ── Score drivers (top 3 weighted contributors) ─────────────────────────────
  const allFactors = prefsActive ? [
    { key: "nbhd",      label: "Neighborhood Fit", val: pick.neighborhood_fit_score,          w: 0.35 },
    { key: "stars",     label: "Hotel Quality",    val: pick.score_breakdown.stars,           w: 0.25 },
    { key: "reviews",   label: "Guest Reviews",    val: pick.score_breakdown.reviews,         w: 0.20 },
    { key: "price",     label: "Price/Value",      val: pick.score_breakdown.price,           w: 0.10 },
    { key: "walk",      label: "Walkability",      val: pick.score_breakdown.walkability,     w: 0.10 },
  ] : pick.score_breakdown.destination_fit > 0 ? [
    { key: "reviews",   label: "Guest Reviews",    val: pick.score_breakdown.reviews,         w: 0.30 },
    { key: "dest",      label: "Destination Fit",  val: pick.score_breakdown.destination_fit, w: 0.18 },
    { key: "stars",     label: "Hotel Quality",    val: pick.score_breakdown.stars,           w: 0.18 },
    { key: "location",  label: "Location",         val: pick.score_breakdown.location,        w: 0.16 },
    { key: "price",     label: "Price/Value",      val: pick.score_breakdown.price,           w: 0.14 },
    { key: "walk",      label: "Walkability",      val: pick.score_breakdown.walkability,     w: 0.04 },
  ] : [
    { key: "reviews",   label: "Guest Reviews",    val: pick.score_breakdown.reviews,         w: 0.32 },
    { key: "price",     label: "Price/Value",      val: pick.score_breakdown.price,           w: 0.23 },
    { key: "location",  label: "Location",         val: pick.score_breakdown.location,        w: 0.20 },
    { key: "stars",     label: "Hotel Quality",    val: pick.score_breakdown.stars,           w: 0.14 },
    { key: "walk",      label: "Walkability",      val: pick.score_breakdown.walkability,     w: 0.11 },
  ];
  const scoreDrivers = allFactors
    .filter(f => f.val > 0)
    .map(f => ({ ...f, pts: Math.round(f.val * f.w) }))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3);

  // ── Closest alternative ─────────────────────────────────────────────────────
  const altStrengths: string[] = [];
  const altWeaknesses: string[] = [];
  if (runnerUp) {
    if (runnerUp.overall_rating > pick.overall_rating + 0.1) {
      altStrengths.push(`Higher guest rating (${runnerUp.overall_rating.toFixed(1)}★ vs ${pick.overall_rating.toFixed(1)}★)`);
    }
    if (pick.review_count > 0 && runnerUp.review_count > pick.review_count * 1.3) {
      altStrengths.push(`More guest reviews (${runnerUp.review_count.toLocaleString()} vs ${pick.review_count.toLocaleString()})`);
    }
    if (runnerUp.price_per_night < pick.price_per_night - 15) {
      altStrengths.push(`Lower price ($${Math.round(runnerUp.price_per_night)} vs $${Math.round(pick.price_per_night)}/night)`);
    }
    if (runnerUp.score_breakdown.walkability > pick.score_breakdown.walkability + 7) {
      altStrengths.push(`Better walkability (${runnerUp.score_breakdown.walkability} vs ${pick.score_breakdown.walkability})`);
    }
    if (runnerUp.score_breakdown.location > pick.score_breakdown.location + 7) {
      altStrengths.push(`Higher location score (${runnerUp.score_breakdown.location} vs ${pick.score_breakdown.location})`);
    }
    if (altStrengths.length === 0) altStrengths.push("Comparable overall quality");

    if (prefsActive && pick.neighborhood_fit_score > runnerUp.neighborhood_fit_score + 5) {
      altWeaknesses.push(`Lower ${prefLabelLower} neighborhood fit (${runnerUp.neighborhood_fit_score} vs ${pick.neighborhood_fit_score})`);
    } else if (pick.score_breakdown.reviews > runnerUp.score_breakdown.reviews + 5) {
      altWeaknesses.push(`Lower guest reviews (${runnerUp.overall_rating.toFixed(1)}★ vs ${pick.overall_rating.toFixed(1)}★)`);
    }
    if (altWeaknesses.length === 0) {
      altWeaknesses.push("Lower overall ranking across all factors");
    }
  }

  return (
    <div className={`mb-4 rounded-xl border px-4 sm:px-5 py-4 shadow-[0_0_24px_rgba(139,92,246,0.10)] ${
      isCloseCall
        ? "border-lantern-gold/35 bg-lantern-gold/[0.04]"
        : "border-lantern-violet/40 bg-lantern-violet/[0.07]"
    }`}>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nav-icon.png" alt="" aria-hidden width={16} height={16} className="h-4 w-4 flex-shrink-0 rounded-sm object-cover" />
          <span className={`text-[10px] font-black uppercase tracking-widest ${isCloseCall ? "text-lantern-gold" : "text-lantern-violet"}`}>
            {isCloseCall ? "Close Call" : "AI Pick"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${scoreBg(pick.ai_score)}`}>
            {pick.ai_score}
          </span>
        </div>
      </div>

      {/* Hotel name + price */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {pick.inferred_neighborhood && (
            <div className={`text-[10px] font-semibold mb-0.5 ${isCloseCall ? "text-lantern-gold/50" : "text-lantern-violet/55"}`}>
              {pick.inferred_neighborhood}
            </div>
          )}
          <div className="text-sm font-bold text-white leading-tight">{pick.name}</div>
        </div>
        <span className="text-lg font-black text-white tabular-nums leading-none flex-shrink-0">
          ${Math.round(pick.price_per_night).toLocaleString()}
          <span className="text-sm font-medium text-white/40">/night</span>
        </span>
      </div>

      {/* Close call: one-liner explanation */}
      {isCloseCall && closeCallSentence && (
        <div className="mb-3 px-3 py-2.5 rounded-lg bg-lantern-gold/[0.08] border border-lantern-gold/20">
          <p className="text-[11px] text-lantern-gold/80 leading-snug">{closeCallSentence}</p>
        </div>
      )}

      {/* Won because bullets (clear wins only) */}
      {!isCloseCall && wonBullets.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/22 mb-1.5">Won because</div>
          <div className="space-y-1.5">
            {wonBullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <svg className="w-2.5 h-2.5 text-lantern-violet/65 flex-shrink-0 mt-[3px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 6l3.5 3.5L11 2" />
                </svg>
                <span className="text-[11px] text-white/68 leading-snug">{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score Drivers */}
      {scoreDrivers.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/22 mb-2">Score Drivers</div>
          <div className="space-y-2">
            {scoreDrivers.map((d, i) => (
              <div key={d.key} className="flex items-center gap-2">
                <span className="text-[9px] text-white/20 w-3 text-right flex-shrink-0 tabular-nums">{i + 1}.</span>
                <span className="text-[11px] text-white/50 flex-1 min-w-0 truncate">{d.label}</span>
                <div className="h-1 w-14 rounded-full bg-white/[0.06] overflow-hidden flex-shrink-0">
                  <div
                    className={`h-full rounded-full ${i === 0 ? (isCloseCall ? "bg-lantern-gold" : "bg-lantern-violet") : "bg-white/20"}`}
                    style={{ width: `${d.val}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold tabular-nums w-7 text-right flex-shrink-0 ${i === 0 ? (isCloseCall ? "text-lantern-gold" : "text-lantern-violet") : "text-white/30"}`}>
                  +{d.pts}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closest Alternative */}
      {runnerUp && (
        <div className="border-t border-white/[0.06] pt-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/22 mb-2">
            Closest Alternative
          </div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-white/75 leading-tight">{runnerUp.name}</div>
              {runnerUp.inferred_neighborhood && (
                <div className="text-[10px] text-white/28 mt-0.5">{runnerUp.inferred_neighborhood}</div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[11px] font-bold text-white/45 tabular-nums">${Math.round(runnerUp.price_per_night)}/night</div>
              <div className={`text-[10px] font-bold ${scoreColor(runnerUp.ai_score)}`}>Score {runnerUp.ai_score}</div>
            </div>
          </div>
          <div className="space-y-1 mb-1.5">
            <div className="text-[9px] text-white/22 mb-0.5">What it does better</div>
            {altStrengths.slice(0, 2).map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <svg className="w-2.5 h-2.5 text-lantern-mint/45 flex-shrink-0 mt-[3px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 6l3.5 3.5L11 2" />
                </svg>
                <span className="text-[10px] text-white/40 leading-snug">{s}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-[9px] text-white/22 mb-0.5">Why it ranked lower</div>
            {altWeaknesses.slice(0, 2).map((w, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-white/20 flex-shrink-0 leading-[18px]">•</span>
                <span className="text-[10px] text-white/35 leading-snug">{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Pick not from recommended neighborhood */}
      {prefsActive && !pickInRecNbhd && recommendedSummary && (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <p className="text-[10px] text-white/35 leading-relaxed">
            <span className="text-white/50 font-semibold">Not from the recommended area:</span>{" "}
            This hotel is in{" "}
            <span className="text-white/50">{pick.inferred_neighborhood || "a different neighborhood"}</span>,
            not {recommendedSummary.nbhd.name}. It ranked #1 because
            {pick.overall_rating >= 4.6
              ? " its outstanding guest reviews outweigh the neighborhood difference."
              : pick.neighborhood_fit_score >= 70
                ? " it still has strong preference fit despite being in a different area."
                : " its combined score (reviews, price, walkability) beat hotels in the recommended area."}
            {recommendedSummary.count > 0 && (
              <>{" "}Scroll down to see {recommendedSummary.count} hotel{recommendedSummary.count !== 1 ? "s" : ""} in {recommendedSummary.nbhd.name}.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ── FeatureCard (idle state) ──────────────────────────────────────────────────

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-lantern-violet/15 text-lantern-violet">
        {icon}
      </div>
      <div className="mb-1 text-sm font-semibold text-white">{title}</div>
      <div className="text-xs text-white/45 leading-relaxed">{body}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HotelSearch() {
  const today = new Date().toISOString().split("T")[0];

  const [destination,   setDestination]   = useState("");
  const [checkIn,       setCheckIn]       = useState("");
  const [checkOut,      setCheckOut]      = useState("");
  const [guests,        setGuests]        = useState(2);
  const [rooms,         setRooms]         = useState(1);
  const [selectedPrefs, setSelectedPrefs] = useState<PrefId[]>([]);

  const [searchState,         setSearchState]         = useState<SearchState>("idle");
  const [offers,              setOffers]              = useState<HotelOffer[]>([]);
  const [searchedDest,        setSearchedDest]        = useState("");
  const [activePrefs,         setActivePrefs]         = useState<readonly PrefId[]>([]);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [sortOrder,           setSortOrder]           = useState<"score" | "price_asc" | "price_desc" | "rating">("score");
  const [amenityFilters,      setAmenityFilters]      = useState<AmenityFilterId[]>([]);
  const [errorTitle,          setErrorTitle]          = useState("");
  const [errorBody,           setErrorBody]           = useState("");
  const [errors,              setErrors]              = useState<string[]>([]);
  const [viewMode,            setViewMode]            = useState<"list" | "map">("list");
  const [selectedHotelId,     setSelectedHotelId]     = useState<string | null>(null);
  const [hoveredHotelId,      setHoveredHotelId]      = useState<string | null>(null);
  const [detailHotelId,       setDetailHotelId]       = useState<string | null>(null);
  const [compareIds,          setCompareIds]          = useState<string[]>([]);
  const [comparePanelOpen,    setComparePanelOpen]    = useState(false);
  const [visibleCount,        setVisibleCount]        = useState(20);
  const [searchMode,          setSearchMode]          = useState<"best-area" | "best-hotels">("best-area");

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  }, []);

  const handleOpenCompare = useCallback(() => {
    track("hotel_compare_opened", { hotels_compared: compareIds.length });
    setComparePanelOpen(true);
  }, [compareIds.length]);

  const resultsRef        = useRef<HTMLDivElement>(null);
  const searchStartTimeRef = useRef<number>(0);

  // Debug: fire on mount to confirm analytics pipeline is wired up.
  // Remove this useEffect once PostHog Live Events confirms events are arriving.
  useEffect(() => {
    track("hotels_page_loaded", { source: "debug" });
  }, []);

  // Scroll the matching hotel card into view whenever a map marker is clicked.
  useEffect(() => {
    if (!selectedHotelId) return;
    const el = document.querySelector<HTMLElement>(`[data-hotel-id="${selectedHotelId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedHotelId]);

  const togglePref = (id: string) => {
    setSelectedPrefs((prev) =>
      prev.includes(id as PrefId)
        ? prev.filter((p) => p !== id)
        : [...prev, id as PrefId]
    );
  };

  const doSearch = useCallback(async (prefs: PrefId[]) => {
    const errs: string[] = [];
    if (!destination.trim()) errs.push("Please enter a destination.");
    if (!checkIn)             errs.push("Please select a check-in date.");
    if (!checkOut)            errs.push("Please select a check-out date.");
    if (checkIn && checkOut && checkOut <= checkIn) errs.push("Check-out must be after check-in.");
    setErrors(errs);
    if (errs.length > 0) return;

    const nights = (checkIn && checkOut)
      ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
      : 0;
    track("hotel_search", {
      destination:   destination.trim(),
      traveler_type: prefs.join(",") || "none",
      nights,
      budget:        null,
    });
    searchStartTimeRef.current = Date.now();

    setSearchState("loading");
    setSearchedDest(destination.trim());

    try {
      const res = await fetch("/api/hotels/search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination:        destination.trim(),
          check_in:           checkIn,
          check_out:          checkOut,
          guests,
          rooms,
          neighborhood_prefs: prefs,
        }),
      });

      const data = await res.json() as {
        status: string; message?: string; offers?: HotelOffer[];
        neighborhood_prefs?: string[];
      };

      if (data.status === "not_configured") {
        setErrorTitle("Search unavailable");
        setErrorBody(data.message ?? "Hotel search is temporarily unavailable.");
        setSearchState("error"); return;
      }
      if (data.status === "error") {
        setErrorTitle("Search failed");
        setErrorBody(data.message ?? "Couldn't complete this search. Try again.");
        setSearchState("error"); return;
      }
      if (data.status === "empty" || !data.offers?.length) {
        setErrorTitle("No hotels found");
        setErrorBody(data.message ?? `No hotels found for "${destination}". Try a different city name.`);
        setSearchState("error"); return;
      }

      track("hotel_search_completed", {
        destination:   destination.trim(),
        results_count: data.offers!.length,
        load_time_ms:  Date.now() - searchStartTimeRef.current,
      });

      setOffers(data.offers!);
      setActivePrefs((data.neighborhood_prefs ?? prefs) as PrefId[]);
      setSelectedNeighborhood(null);
      setSortOrder("score");
      setAmenityFilters([]);
      setViewMode("list");
      setSelectedHotelId(null);
      setVisibleCount(20);
      setSearchMode("best-area");
      setSearchState("results");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch {
      setErrorTitle("Network error");
      setErrorBody("Couldn't reach TravelGrab's servers. Check your connection and try again.");
      setSearchState("error");
    }
  }, [destination, checkIn, checkOut, guests, rooms]);

  const handleSearch = () => doSearch(selectedPrefs);

  // Re-run search when prefs change while results are visible
  const handleRefineToggle = (id: string) => {
    const next = selectedPrefs.includes(id as PrefId)
      ? selectedPrefs.filter((p) => p !== id)
      : [...selectedPrefs, id as PrefId];
    setSelectedPrefs(next);
    if (searchState === "results") void doSearch(next);
  };

  const handleRefineClear = () => {
    setSelectedPrefs([]);
    if (searchState === "results") void doSearch([]);
  };

  const bestOverallId = offers.find((o) => o.recommendation_label === "Best Overall")?.hotel_id;

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/nav-icon.png"
              alt="TravelGrab"
              width={36}
              height={36}
              className="h-9 w-9 flex-shrink-0 rounded-xl object-cover shadow-sm"
            />
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <Link href="/flights" className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors">
            Flights
          </Link>
          <span className="text-sm font-medium text-lantern-violet">Hotels</span>
        </div>
      </nav>

      <main className="w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* Hero */}
        <div className="mb-7 text-center">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white mb-2">
            Find your hotel
          </h1>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            Tell us the kind of area you want and we'll rank hotels by neighborhood fit, reviews, and value — not commission rates.
          </p>
        </div>

        {/* ── Search panel ─────────────────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto rounded-2xl border border-white/[0.09] bg-white/[0.03] p-5 sm:p-6 mb-4 shadow-card">
          {/* Destination */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">
              Destination
            </label>
            <DestinationCombobox
              value={destination}
              onChange={setDestination}
              onConfirm={handleSearch}
            />
          </div>

          {/* Dates */}
          <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Check-in</label>
              <input type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 px-3.5 py-3 text-sm text-white outline-none transition-colors [color-scheme:dark]" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Check-out</label>
              <input type="date" min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 px-3.5 py-3 text-sm text-white outline-none transition-colors [color-scheme:dark]" />
            </div>
          </div>

          {/* Guests + Rooms */}
          <div className="flex gap-2.5 mb-5">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Guests</label>
              <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
                <button onClick={() => setGuests((n) => Math.max(1, n - 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">−</button>
                <span className="flex-1 text-center text-sm font-semibold text-white">{guests}</span>
                <button onClick={() => setGuests((n) => Math.min(8, n + 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">+</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Rooms</label>
              <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
                <button onClick={() => setRooms((n) => Math.max(1, n - 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">−</button>
                <span className="flex-1 text-center text-sm font-semibold text-white">{rooms}</span>
                <button onClick={() => setRooms((n) => Math.min(4, n + 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">+</button>
              </div>
            </div>
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {/* Search button */}
          <button
            onClick={handleSearch}
            disabled={searchState === "loading"}
            className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide text-white bg-lantern-violet hover:bg-lantern-violet/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_24px_rgba(139,92,246,0.25)] hover:shadow-[0_0_32px_rgba(139,92,246,0.35)]"
          >
            {searchState === "loading" ? "Searching hotels…" : "Search hotels"}
          </button>
        </div>

        {/* ── Neighborhood preference chips (always visible below form) ─────── */}
        <div className="max-w-3xl mx-auto rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4 mb-4">
          <NeighborhoodChips
            selected={selectedPrefs}
            onToggle={handleRefineToggle}
            onClear={handleRefineClear}
          />
        </div>

        {/* Loading */}
        {searchState === "loading" && (
          <div className="max-w-3xl mx-auto text-center py-14 flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/nav-icon.png"
              alt=""
              aria-hidden
              width={48}
              height={48}
              className="h-12 w-12 rounded-2xl object-cover animate-pulse shadow-[0_0_24px_rgba(119,167,255,0.2)]"
            />
            <div className="text-sm text-white/50">Searching hotels in {searchedDest}…</div>
            <p className="text-xs text-white/25">
              Ranking by reviews, location{selectedPrefs.length > 0 ? ", and neighborhood fit" : ", and value"}
            </p>
          </div>
        )}

        {/* Error */}
        {searchState === "error" && (
          <div className="max-w-3xl mx-auto rounded-2xl border border-red-500/20 bg-red-500/[0.07] px-5 py-8 text-center">
            <div className="text-sm font-bold text-white mb-1">{errorTitle}</div>
            <div className="text-xs text-white/45 leading-relaxed">{errorBody}</div>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {searchState === "results" && offers.length > 0 && (() => {
          const cityGuide = detectCityGuide(searchedDest);

          // Compute neighborhood summaries (drives both recommendation panel and guide cards)
          const nbhdSummaries: NeighborhoodSummary[] = cityGuide
            ? computeNeighborhoodSummaries(cityGuide, offers, activePrefs)
            : [];
          const recommendedSummary = activePrefs.length > 0 && nbhdSummaries.length > 0 && nbhdSummaries[0].count > 0
            ? nbhdSummaries[0]
            : null;

          // Filter displayed hotels when a neighborhood is selected.
          // In "best-hotels" mode, skip the neighborhood filter so all hotels are always shown.
          const selectedCard = searchMode === "best-area"
            ? cityGuide?.neighborhoods.find((n) => n.id === selectedNeighborhood)
            : undefined;
          const filteredOffers = selectedCard
            ? offers.filter((o) =>
                selectedCard.matchKeywords.some(
                  (k) =>
                    o.inferred_neighborhood.toLowerCase().includes(k.toLowerCase()) ||
                    o.address.toLowerCase().includes(k.toLowerCase())
                )
              )
            : offers;

          // Apply amenity filter
          const amenityFilteredOffers = amenityFilters.length === 0
            ? filteredOffers
            : filteredOffers.filter((o) =>
                amenityFilters.every((fid) => {
                  const terms = AMENITY_FILTERS.find((f) => f.id === fid)?.terms ?? [];
                  return hotelHasAmenity(o.amenities, terms);
                })
              );

          // Apply sort
          const displayedOffers = [...amenityFilteredOffers].sort((a, b) => {
            if (sortOrder === "price_asc")  return a.price_per_night - b.price_per_night;
            if (sortOrder === "price_desc") return b.price_per_night - a.price_per_night;
            if (sortOrder === "rating")     return (b.overall_rating - a.overall_rating) || (b.review_count - a.review_count);
            return (b.ai_score - a.ai_score) || (a.price_per_night - b.price_per_night); // score (default)
          });

          const showAllFallback = selectedCard && filteredOffers.length === 0;
          const cheapestId  = [...offers].sort((a, b) => a.price_per_night - b.price_per_night)[0]?.hotel_id;
          const avgPrice    = offers.length > 0
            ? offers.reduce((s, o) => s + o.price_per_night, 0) / offers.length
            : 0;

          // Top 3 by score from the full unfiltered list (always global best, not per-neighborhood)
          const top3 = [...offers]
            .sort((a, b) => (b.ai_score - a.ai_score) || (a.price_per_night - b.price_per_night))
            .slice(0, 3);

          // Hidden gem: highest-scoring hotel priced at or below the search median, excluding #1
          const sortedByPrice  = [...offers].sort((a, b) => a.price_per_night - b.price_per_night);
          const medianPrice    = sortedByPrice[Math.floor(sortedByPrice.length / 2)]?.price_per_night ?? 0;
          const hiddenGem: HotelOffer | null = offers
            .filter((o) =>
              o.hotel_id !== top3[0]?.hotel_id &&
              o.price_per_night <= medianPrice &&
              o.overall_rating >= 4.0 &&
              o.review_count >= 20 &&
              Math.round(top3[0]?.price_per_night ?? 0) - Math.round(o.price_per_night) >= 20,
            )
            .sort((a, b) => b.ai_score - a.ai_score)[0] ?? null;

          // Preference conflict warnings
          const conflictWarnings = PREF_CONFLICTS
            .filter(([a, b]) => activePrefs.includes(a) && activePrefs.includes(b))
            .map(([,, msg]) => msg);

          const cardList = (showAllFallback ? offers : displayedOffers);

          // Map computations — used in both mobile overlay and desktop right panel
          const recommendedNbhdId = nbhdSummaries[0]?.nbhd.id ?? null;
          const mapSelSummary = selectedNeighborhood
            ? nbhdSummaries.find((s) => s.nbhd.id === selectedNeighborhood) ?? null
            : null;
          const mapPanelData: NbhdPanelData | null = mapSelSummary
            ? {
                id:             mapSelSummary.nbhd.id,
                name:           mapSelSummary.nbhd.name,
                description:    mapSelSummary.nbhd.description,
                tags:           mapSelSummary.nbhd.tags,
                isRecommended:  mapSelSummary.nbhd.id === recommendedNbhdId,
                chooseIfCopy:   mapSelSummary.nbhd.id !== recommendedNbhdId && nbhdSummaries[0]
                  ? altChooseIfCopy(mapSelSummary, nbhdSummaries[0], activePrefs)
                  : null,
                hotelCount:     mapSelSummary.count,
                avgPrice:       mapSelSummary.avgPrice,
                lowestPrice:    mapSelSummary.lowestPrice,
                topHotelName:   mapSelSummary.bestHotel?.name ?? null,
                topHotelPrice:  mapSelSummary.bestHotel?.price_per_night ?? null,
                topHotelRating: mapSelSummary.bestHotel?.overall_rating ?? null,
              }
            : null;

          // Track neighborhood selections; null (deselect) is not tracked.
          const handleSelectNeighborhood = (id: string | null) => {
            if (id) {
              track("neighborhood_selected", {
                neighborhood: id,
                recommended:  id === recommendedNbhdId,
              });
            }
            setSelectedNeighborhood(id);
          };

          return (
            <div className="w-full" ref={resultsRef}>

              {/* ── Search mode toggle ─────────────────────────────────────── */}
              {cityGuide && (
                <div className="flex flex-col items-center mb-5 gap-1.5">
                  <div className="inline-flex items-center rounded-xl border border-white/[0.09] bg-white/[0.02] p-0.5 gap-0.5">
                    {(
                      [
                        { mode: "best-area"   as const, label: "Best Area For Me" },
                        { mode: "best-hotels" as const, label: "Best Hotels Overall" },
                      ] as const
                    ).map(({ mode, label }) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setSearchMode(mode);
                          if (mode === "best-hotels") setSelectedNeighborhood(null);
                        }}
                        className={`px-4 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                          searchMode === mode
                            ? "bg-lantern-violet text-white shadow-sm"
                            : "text-white/35 hover:text-white/60"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/22 text-center">
                    {searchMode === "best-area"
                      ? "Recommends the best neighborhood for your trip, then shows hotels there"
                      : `All ${offers.length} hotels ranked by overall quality — neighborhoods hidden`}
                  </p>
                </div>
              )}

              {/* ── View toggle + sort bar ─────────────────────────────────── */}
              <div className="flex items-center justify-between mb-3 px-1 gap-3 flex-wrap">
                {/* List / Map toggle */}
                <div className="flex items-center rounded-lg border border-white/[0.08] overflow-hidden">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-all ${
                      viewMode === "list"
                        ? "bg-lantern-violet/20 text-lantern-violet"
                        : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                    }`}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                    </svg>
                    List
                  </button>
                  <div className="w-px h-4 bg-white/[0.08]" />
                  <button
                    onClick={() => { track("map_viewed"); setViewMode("map"); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-all ${
                      viewMode === "map"
                        ? "bg-lantern-violet/20 text-lantern-violet"
                        : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                    }`}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    Map
                  </button>
                </div>

                {/* Hotel count */}
                <div className="text-xs text-white/40 flex-1 min-w-0 flex items-center flex-wrap gap-x-1">
                  {selectedCard ? (
                    <>
                      <span className="font-semibold text-white/70">
                        {showAllFallback ? offers.length : amenityFilteredOffers.length}
                      </span>
                      {!showAllFallback && (
                        <span className="text-white/25">of {offers.length}</span>
                      )}
                      <span className="text-white/25">hotels in</span>
                      <span className="text-white/60 font-semibold">{selectedCard.name.split(" /")[0]}</span>
                      {showAllFallback
                        ? <span className="text-white/25 ml-1">· no exact matches, showing all</span>
                        : filteredOffers.length < offers.length && (
                            <button
                              onClick={() => setSelectedNeighborhood(null)}
                              className="ml-1.5 text-lantern-violet/65 hover:text-lantern-violet text-[11px] font-semibold transition-colors"
                            >
                              Browse all {offers.length} →
                            </button>
                          )
                      }
                    </>
                  ) : cityGuide && searchMode === "best-area" ? (
                    <>
                      <span className="font-semibold text-white/70">{offers.length}</span>
                      <span className="text-white/25">hotels ·</span>
                      <span className="text-white/55 font-semibold">
                        {nbhdSummaries.filter((s) => s.count > 0).length} neighborhoods
                      </span>
                      {(() => {
                        const active = nbhdSummaries.filter((s) => s.count > 0);
                        if (active.length === 0) return null;
                        const shown      = active.slice(0, 3);
                        const rest       = active.slice(3);
                        const hiddenHotels = rest.reduce((sum, s) => sum + s.count, 0);
                        return (
                          <span className="text-white/20 hidden sm:inline">
                            {" · "}
                            {shown.map((s) => s.nbhd.name.split(" /")[0]).join(" · ")}
                            {rest.length > 0 && (
                              <span>
                                {" +"}
                                {rest.length} more
                                {hiddenHotels > 0 && ` (${hiddenHotels} hotels)`}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      {amenityFilters.length > 0 && (
                        <span className="text-white/20">· {amenityFilteredOffers.length} match filters</span>
                      )}
                    </>
                  ) : searchMode === "best-hotels" ? (
                    <>
                      <span className="text-white/25">All</span>
                      <span className="font-semibold text-white/70">{amenityFilteredOffers.length}</span>
                      <span className="text-white/25">hotels in {searchedDest}, ranked by quality</span>
                      {amenityFilters.length > 0 && (
                        <span className="text-white/20">· {amenityFilteredOffers.length} match filters</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-white/70">{amenityFilteredOffers.length} hotels</span>
                      {amenityFilters.length > 0
                        ? <span className="text-white/25"> · filtered</span>
                        : <span className="text-white/25"> in {searchedDest}</span>}
                    </>
                  )}
                </div>

                {/* Sort (only in list view) */}
                {viewMode === "list" && (
                  <div className="flex items-center gap-1">
                    {(["score", "price_asc", "price_desc", "rating"] as const).map((opt) => {
                      const labels = { score: "Best match", price_asc: "Price ↑", price_desc: "Price ↓", rating: "Rating" };
                      return (
                        <button
                          key={opt}
                          onClick={() => setSortOrder(opt)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                            sortOrder === opt
                              ? "bg-lantern-violet/20 text-lantern-violet border-lantern-violet/40"
                              : "bg-transparent text-white/30 border-white/[0.08] hover:text-white/60 hover:border-white/20"
                          }`}
                        >
                          {labels[opt]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Split layout: list left, map right — map always on desktop ── */}
              <div className="lg:flex lg:items-start lg:-mx-6">

                {/* ── Left panel ──────────────────────────────────────────────── */}
                <div className="w-full lg:w-[54%] lg:flex-shrink-0 lg:pl-6 lg:pr-2">

                  {/* Mobile map: full-screen overlay when toggle = Map */}
                  {viewMode === "map" && (
                    <>
                      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30" style={{ top: 56 }}>
                        <HotelMapView
                          offers={offers}
                          selectedHotelId={hoveredHotelId ?? selectedHotelId}
                          onSelectHotel={setSelectedHotelId}
                          destination={searchedDest}
                          cityGuide={cityGuide}
                          selectedNeighborhood={selectedNeighborhood}
                          onSelectNeighborhood={handleSelectNeighborhood}
                          activePrefs={activePrefs}
                          recommendedNbhdId={recommendedNbhdId}
                        />
                        <MapNeighborhoodPanel
                          data={mapPanelData}
                          onClose={() => setSelectedNeighborhood(null)}
                          variant="sheet"
                        />
                      </div>
                      <div className="lg:hidden" style={{ height: "calc(100vh - 56px)" }} aria-hidden="true" />
                    </>
                  )}

                  {/* Desktop neighborhood panel — shown when a neighborhood is selected on map */}
                  {mapPanelData && (
                    <div className="hidden lg:block mb-4">
                      <MapNeighborhoodPanel
                        data={mapPanelData}
                        onClose={() => setSelectedNeighborhood(null)}
                        variant="sidebar"
                      />
                    </div>
                  )}

                  {/* Neighborhood guide + comparison + top picks
                      Hidden on mobile when map toggle is active; always visible on desktop */}
                  <div className={viewMode === "map" ? "hidden lg:block" : ""}>
                    {/* Neighborhood guide (Best Area mode only) */}
                    {cityGuide && searchMode === "best-area" && (
                      activePrefs.length > 0 && nbhdSummaries.length > 0 ? (
                        <NeighborhoodRecommendation
                          summaries={nbhdSummaries}
                          selectedId={selectedNeighborhood}
                          onSelect={handleSelectNeighborhood}
                          activePrefs={activePrefs}
                        />
                      ) : (
                        <NeighborhoodGuide
                          guide={cityGuide}
                          summaries={nbhdSummaries}
                          selectedId={selectedNeighborhood}
                          onSelect={handleSelectNeighborhood}
                        />
                      )
                    )}

                    {/* Neighborhood Comparison Engine */}
                    {cityGuide && searchMode === "best-area" && nbhdSummaries.filter((s) => s.count > 0).length >= 2 && (
                      <NeighborhoodCompare
                        cityName={cityGuide.displayName}
                        summaries={nbhdSummaries
                          .filter((s) => s.count > 0)
                          .map((s): ComparableSummary => ({
                            nbhd: s.nbhd,
                            count: s.count,
                            avgPrice: s.avgPrice,
                            avgRating: s.avgRating,
                            avgHotelScore:
                              s.hotels.length > 0
                                ? Math.round(
                                    s.hotels.reduce((acc, h) => acc + h.ai_score, 0) / s.hotels.length
                                  )
                                : 0,
                          }))}
                      />
                    )}

                    {/* Book This One (Best Hotels Overall only) */}
                    {searchMode === "best-hotels" && top3.length >= 2 && (
                      <BookThisOne h1={top3[0]} h2={top3[1]} cityGuide={cityGuide} />
                    )}

                    {/* Recommended Hotels Top 3 (Best Area mode only) */}
                    {searchMode === "best-area" && top3.length > 0 && (
                      <RecommendedHotels
                        top3={top3}
                        compareIds={compareIds}
                        onSetCompareIds={setCompareIds}
                        onOpenCompare={handleOpenCompare}
                      />
                    )}
                  </div>

                  {/* Preference conflict warning */}
                  {conflictWarnings.length > 0 && (
                    <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-2.5 flex items-start gap-2">
                      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L1 21h22L12 2zm0 3.5L21 19H3L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                      </svg>
                      <p className="text-[11px] text-amber-300/80 leading-relaxed">{conflictWarnings[0]}</p>
                    </div>
                  )}

                  {/* Amenity quick-filters */}
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mr-1">Must have:</span>
                  {AMENITY_FILTERS.map((f) => {
                    const active = amenityFilters.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => setAmenityFilters((prev) =>
                          prev.includes(f.id) ? prev.filter((x) => x !== f.id) : [...prev, f.id]
                        )}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                          active
                            ? "bg-lantern-blue/20 text-lantern-blue border-lantern-blue/40"
                            : "bg-transparent text-white/25 border-white/[0.07] hover:text-white/50 hover:border-white/15"
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                  {amenityFilters.length > 0 && (
                    <button
                      onClick={() => setAmenityFilters([])}
                      className="text-[10px] text-white/20 hover:text-white/50 transition-colors ml-1"
                    >
                      Clear
                    </button>
                  )}
                  </div>

                  {/* Recommendation panel — always use score-ranked order */}
                  <RecommendationPanel
                    offers={showAllFallback ? offers : filteredOffers}
                    activePrefs={activePrefs}
                    recommendedSummary={recommendedSummary}
                  />

                  {/* Hotel cards */}
                  <div className={`space-y-3 ${compareIds.length > 0 ? "pb-24" : ""}`}>
                    {cardList.slice(0, visibleCount).map((offer, idx) => {
                      const isGemPosition = hiddenGem !== null &&
                        offer.hotel_id === hiddenGem.hotel_id &&
                        sortOrder === "score" &&
                        top3[0] !== undefined;
                      return (
                        <div key={offer.hotel_id}>
                          {/* "Why #1 beats #2" separator — only between the first and second card when sorted by score */}
                          {idx === 1 && sortOrder === "score" && top3.length >= 2 && (
                            <WhyTopRanks h1={top3[0]} h2={top3[1]} />
                          )}
                          {/* Hidden gem callout — shown just above the gem hotel's card */}
                          {isGemPosition && (
                            <HiddenGemCallout gem={hiddenGem!} topHotel={top3[0]!} avgPrice={avgPrice} />
                          )}
                          <HotelCard
                            offer={offer}
                            isBestOverall={offer.hotel_id === bestOverallId}
                            isCheapest={offer.hotel_id === cheapestId}
                            activePrefs={activePrefs}
                            guests={guests}
                            avgPrice={avgPrice}
                            isMapSelected={offer.hotel_id === selectedHotelId}
                            onSelectForMap={setSelectedHotelId}
                            onHoverForMap={setHoveredHotelId}
                            onOpenDetail={() => {
                              track("hotel_selected", {
                                hotel_name:   offer.name,
                                hotel_rank:   offer.rank_position ?? (idx + 1),
                                neighborhood: offer.inferred_neighborhood,
                                score:        offer.ai_score,
                              });
                              setDetailHotelId(offer.hotel_id);
                            }}
                            isInCompare={compareIds.includes(offer.hotel_id)}
                            onToggleCompare={() => toggleCompare(offer.hotel_id)}
                            compareDisabled={compareIds.length >= 4}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Load More button */}
                  {visibleCount < cardList.length && (
                    <div className="py-6 text-center">
                      <button
                        onClick={() => setVisibleCount((v) => v + 20)}
                        className="inline-flex items-center gap-2 text-[12px] font-semibold text-white/55 border border-white/[0.1] hover:border-white/25 hover:text-white/80 rounded-xl px-5 py-2.5 transition-all"
                      >
                        Load 20 More Hotels
                        <span className="text-white/25 font-normal">({cardList.length - visibleCount} remaining)</span>
                      </button>
                    </div>
                  )}

                  <div className="mt-6 text-center text-[11px] text-white/20 leading-relaxed">
                    Prices from Google Hotels via SerpAPI · Same prices as Google Hotels, ranked by your preferences.
                  </div>

                </div>{/* ── end left panel ── */}

                {/* ── Right panel: sticky map (desktop always, mobile hidden) ── */}
                <div
                  className="hidden lg:block flex-1 sticky top-14 overflow-hidden rounded-l-xl border-l border-y border-white/[0.07]"
                  style={{ height: "85vh" }}
                >
                  <HotelMapView
                    offers={offers}
                    selectedHotelId={hoveredHotelId ?? selectedHotelId}
                    onSelectHotel={setSelectedHotelId}
                    destination={searchedDest}
                    cityGuide={cityGuide}
                    selectedNeighborhood={selectedNeighborhood}
                    onSelectNeighborhood={handleSelectNeighborhood}
                    activePrefs={activePrefs}
                    recommendedNbhdId={recommendedNbhdId}
                  />
                </div>
              </div>{/* ── end split wrapper ── */}
            </div>
          );
        })()}

        {/* ── Compare floating tray ────────────────────────────────────── */}
        {compareIds.length > 0 && (
          <CompareFloatingTray
            compareIds={compareIds}
            offers={offers}
            onOpen={handleOpenCompare}
            onRemove={(id) => setCompareIds(prev => prev.filter(x => x !== id))}
          />
        )}

        {/* ── Compare overlay panel ─────────────────────────────────────── */}
        {comparePanelOpen && (
          <HotelComparePanel
            hotels={compareIds.map(id => offers.find(o => o.hotel_id === id)).filter(Boolean) as HotelOffer[]}
            onClose={() => setComparePanelOpen(false)}
            onRemove={(id) => {
              const next = compareIds.filter(x => x !== id);
              setCompareIds(next);
              if (next.length < 2) setComparePanelOpen(false);
            }}
          />
        )}

        {/* ── Hotel detail drawer ───────────────────────────────────────── */}
        <HotelDetailDrawer
          offer={detailHotelId ? (offers.find((o) => o.hotel_id === detailHotelId) ?? null) : null}
          onClose={() => setDetailHotelId(null)}
          activePrefs={activePrefs}
          cityGuide={detectCityGuide(searchedDest)}
          guests={guests}
        />

        {/* Idle state feature cards */}
        {searchState === "idle" && (
          <div className="max-w-3xl mx-auto mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FeatureCard
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>}
              title="Neighborhood fit score"
              body="Tell us if you want Luxury, Quiet, Food, Nightlife, or Transit. We score every hotel's neighborhood against your preferences — not just the hotel itself."
            />
            <FeatureCard
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>}
              title="Review-first ranking"
              body="Guest ratings are weighted heavily in every result. A 4.8-rated hotel in a great area will always beat a cheaper option with average reviews."
            />
            <FeatureCard
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></svg>}
              title="No hidden incentives"
              body="We explain exactly why the AI Pick ranks first. You can see every score component — reviews, location, price, walkability, and neighborhood fit."
            />
          </div>
        )}
      </main>
    </div>
  );
}

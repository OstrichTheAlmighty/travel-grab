"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

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
  };
  neighborhood_fit_score: number;
  inferred_neighborhood:  string;
  neighborhood_fit_label: string;
  location_summary: string;
  transit_note:     string;
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
  if (label === "Great fit")                    return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/30";
  if (label === "Good fit" || label === "Good area fit") return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/25";
  if (label === "Partial fit" || label === "Location fit, but basic hotel") return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/25";
  return "";
}

/** Filter out "Street A - Street B" bus stop names from SerpAPI nearby_places. */
function isStreetIntersectionName(name: string): boolean {
  return /^[^(]+\s+-\s+[^(]+$/.test(name);
}

function scoreLabel(n: number): string {
  if (n >= 82) return "Excellent";
  if (n >= 70) return "Great";
  if (n >= 58) return "Good";
  if (n >= 45) return "Fair";
  return "Weak";
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
      return "traditional temples, Senso-ji, and cultural landmarks";
    if (n.includes("ueno") || n.includes("bunkyo"))
      return "major museums, Ueno Park, and cultural attractions";
    if (n.includes("gothic") || n.includes("gòtic"))
      return "Barcelona's historic medieval core with top landmarks";
    if (n.includes("born"))
      return "Picasso Museum, Basilica de Santa Maria, and walkable streets";
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
      return "Kabukicho and Golden Gai — Tokyo's most vibrant bar districts";
    if (n.includes("roppongi"))
      return "international clubs, late-night bars, and upscale lounges";
    if (n.includes("shibuya"))
      return "youth-focused bars, live music, and an energetic nightlife scene";
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
      return "walking distance to Big Ben, Tower of London, Tate Modern, and the National Gallery";
    if (n.includes("bloomsbury"))
      return "the British Museum, National Portrait Gallery, and literary London on the doorstep";
  }
  if (pref === "nightlife") {
    if (n.includes("shoreditch") || n.includes("soho"))
      return "London's most vibrant bar and club scene with venues open until dawn";
    if (n.includes("brixton"))
      return "legendary live music venues, diverse bar scene, and a bohemian energy";
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
      return "steps from Times Square, Empire State Building, MoMA, and Central Park";
    if (n.includes("financial district"))
      return "near the 9/11 Memorial, Brooklyn Bridge, and Statue of Liberty ferry";
  }
  if (pref === "nightlife") {
    if (n.includes("lower east side") || n.includes("east village") || n.includes("williamsburg"))
      return "NYC's best bar-hopping streets with late-night venues and live music";
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

  // Fall back to Places enrichment data
  if (offer.transit_note)     return `${label} for ${prefPart}: ${offer.transit_note}.`;
  if (offer.location_summary) return `${label} for ${prefPart}: ${offer.location_summary}.`;
  return `${label} for ${prefPart}.`;
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

// ── NeighborhoodGuide ─────────────────────────────────────────────────────────

function NeighborhoodGuide({
  guide,
  selectedId,
  onSelect,
  hotelCounts,
}: {
  guide: CityGuide;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  hotelCounts: Record<string, number>;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-white/30">
            {guide.displayName} Neighborhoods
          </span>
          <p className="text-[11px] text-white/20 mt-0.5">
            Choose an area to filter hotels — or browse all results below.
          </p>
        </div>
        {selectedId && (
          <button
            onClick={() => onSelect(null)}
            className="text-[11px] text-white/35 hover:text-white/70 transition-colors whitespace-nowrap"
          >
            × Show all
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {guide.neighborhoods.map((n) => {
          const count      = hotelCounts[n.id] ?? 0;
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
              <div className="font-bold text-sm text-white mb-1 leading-tight">{n.name}</div>
              <p className="text-[11px] text-white/40 leading-relaxed mb-2 flex-1 line-clamp-2">
                {n.description}
              </p>
              <div className="flex flex-wrap gap-1 mb-2.5">
                {n.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-white/30 border border-white/[0.08] bg-white/[0.03] rounded-full px-1.5 py-0.5 leading-none"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <button
                onClick={() => onSelect(isSelected ? null : n.id)}
                className={`w-full text-[11px] font-semibold rounded-lg py-1.5 transition-all ${
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

// ── HotelCard ─────────────────────────────────────────────────────────────────

function HotelCard({
  offer,
  isBestOverall,
  isCheapest,
  activePrefs,
  guests,
}: {
  offer: HotelOffer;
  isBestOverall: boolean;
  isCheapest: boolean;
  activePrefs: readonly PrefId[];
  guests: number;
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
  }

  const barColor = (s: number) => s >= 65 ? "bg-lantern-mint" : s >= 45 ? "bg-white/25" : "bg-lantern-gold/70";
  const barText  = (s: number) => s >= 65 ? "text-lantern-mint" : s >= 45 ? "text-white/50" : "text-lantern-gold";

  const visibleAmenities = offer.amenities.slice(0, 5);

  return (
    <div className={`rounded-xl border transition-all ${
      isBestOverall
        ? "border-lantern-violet/40 bg-lantern-violet/[0.04] shadow-[0_0_32px_rgba(167,139,250,0.07)]"
        : "border-white/[0.07] bg-white/[0.02]"
    }`}>
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
                    <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${fitBg(offer.neighborhood_fit_label)}`}>
                      {offer.neighborhood_fit_label}
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
          <div className={`flex items-start gap-1.5 rounded-lg px-3 py-2 mb-3 border ${fitBg(offer.neighborhood_fit_label)} bg-opacity-10`}>
            <svg className="w-3 h-3 flex-shrink-0 mt-0.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 6l3.5 3.5L11 2" />
            </svg>
            <p className="text-[11px] leading-relaxed">{fitNote}</p>
          </div>
        )}

        {/* Recommendation sentence — shown when no fit note, or always */}
        {offer.recommendation_why && !fitNote && (
          <p className="text-[11px] text-white/50 leading-relaxed mb-3">
            {offer.recommendation_why}
          </p>
        )}
        {offer.recommendation_why && fitNote && (
          <p className="text-[11px] text-white/40 leading-relaxed mb-3">
            {offer.recommendation_why}
          </p>
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
            <button
              onClick={() => setBreakdownOpen((o) => !o)}
              className={`inline-flex items-center gap-1 border rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums transition-all hover:opacity-80 ${scoreBg(offer.ai_score)}`}
              title="View score breakdown"
            >
              {offer.ai_score} · {scoreLabel(offer.ai_score)}
              <svg className={`w-2.5 h-2.5 transition-transform ${breakdownOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M2 4l4 4 4-4" />
              </svg>
            </button>

            {offer.booking_url && (
              <div className="flex flex-col items-end gap-0.5">
                <a
                  href={offer.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("hotel_booking_clicked", { hotel: offer.name, price: Math.round(offer.price_per_night), score: offer.ai_score, source: offer.source })}
                  className="text-[11px] font-bold text-white bg-lantern-violet hover:bg-lantern-violet/80 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
                >
                  Check availability
                </a>
                <span className="text-[9px] text-white/20">via Google Hotels</span>
              </div>
            )}
          </div>
        </div>

        {/* Score breakdown panel */}
        {breakdownOpen && (
          <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Score Breakdown</div>
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
            <p className="text-[10px] text-white/20 leading-relaxed pt-1">
              {prefsActive
                ? "Preference mode: Neighborhood Fit 35% · Hotel Quality 25% · Reviews 20% · Price 10% · Walkability 10%. Price scored relative to other results in this search."
                : "No preferences: Price 28% · Reviews 27% · Location 20% · Hotel Quality 14% · Walkability 11%. All scores are relative to this result set."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recommendation panel ──────────────────────────────────────────────────────

function RecommendationPanel({ offers, activePrefs }: { offers: HotelOffer[]; activePrefs: readonly PrefId[] }) {
  const pick       = offers.find((o) => o.recommendation_label === "Best Overall") ?? offers[0];
  const budgetPick = offers.find((o) => o.recommendation_label === "Budget Pick");
  const luxuryPick = offers.find((o) => o.recommendation_label === "Luxury Pick");
  if (!pick) return null;

  const priceDiff = budgetPick && budgetPick.hotel_id !== pick.hotel_id
    ? Math.round(pick.price_per_night - budgetPick.price_per_night)
    : null;
  const scoreDiff = luxuryPick && luxuryPick.hotel_id !== pick.hotel_id
    ? pick.ai_score - luxuryPick.ai_score
    : null;

  return (
    <div className="mb-4 rounded-xl border border-lantern-violet/40 bg-lantern-violet/[0.07] px-4 sm:px-5 py-4 shadow-[0_0_24px_rgba(139,92,246,0.10)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <svg className="w-3.5 h-3.5 text-lantern-violet flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span className="text-[10px] font-black uppercase tracking-widest text-lantern-violet">
          TravelGrab AI Pick
        </span>
      </div>

      {/* Pick name + neighborhood + price */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          {pick.inferred_neighborhood && (
            <div className="text-[10px] text-lantern-violet/55 font-semibold mb-0.5">{pick.inferred_neighborhood}</div>
          )}
          <div className="text-sm font-bold text-white leading-tight">{pick.name}</div>
        </div>
        <span className="text-lg font-black text-white tabular-nums leading-none flex-shrink-0">
          ${Math.round(pick.price_per_night).toLocaleString()}
          <span className="text-sm font-medium text-white/40">/night</span>
        </span>
      </div>

      {/* Why copy */}
      {pick.recommendation_why && (
        <p className="text-[11px] text-white/60 leading-relaxed mb-2.5">{pick.recommendation_why}</p>
      )}

      {/* Alternatives comparison */}
      {(priceDiff !== null || scoreDiff !== null) && (
        <div className="border-t border-white/[0.06] pt-2.5 mt-1 flex flex-col gap-1">
          {priceDiff !== null && priceDiff > 0 && budgetPick && (
            <div className="text-[10px] text-white/35 leading-relaxed">
              <span className="text-lantern-mint font-semibold">Budget Pick:</span>{" "}
              {budgetPick.name} — ${Math.round(budgetPick.price_per_night)}/night
              {" "}(saves ${priceDiff}/night, scores {budgetPick.ai_score})
            </div>
          )}
          {scoreDiff !== null && scoreDiff < 0 && luxuryPick && (
            <div className="text-[10px] text-white/35 leading-relaxed">
              <span className="text-amber-300 font-semibold">Luxury Pick:</span>{" "}
              {luxuryPick.name} — ${Math.round(luxuryPick.price_per_night)}/night
              {" "}({Math.abs(scoreDiff)} pts higher, ${Math.round(luxuryPick.price_per_night - pick.price_per_night)} more)
            </div>
          )}
        </div>
      )}

      {activePrefs.length > 0 && pick.neighborhood_fit_label && (
        <div className={`mt-2 inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[10px] font-bold ${fitBg(pick.neighborhood_fit_label)}`}>
          <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 6l3.5 3.5L11 2" />
          </svg>
          {pick.neighborhood_fit_label} for your preferences
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

  const resultsRef = useRef<HTMLDivElement>(null);

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

    track("hotel_search_submitted", {
      destination:        destination.trim(),
      check_in:           checkIn,
      check_out:          checkOut,
      guests,
      rooms,
      neighborhood_prefs: prefs.join(","),
    });

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

      setOffers(data.offers!);
      setActivePrefs((data.neighborhood_prefs ?? prefs) as PrefId[]);
      setSelectedNeighborhood(null);
      setSortOrder("score");
      setAmenityFilters([]);
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
          <Link href="/" className="flex items-center gap-2 group">
            <svg className="w-5 h-5 text-lantern-violet group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <Link href="/flights" className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors">
            Flights
          </Link>
          <span className="text-sm font-medium text-lantern-violet">Hotels</span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
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
          <div className="max-w-3xl mx-auto text-center py-14">
            <div className="inline-flex items-center gap-3 text-white/50 text-sm">
              <svg className="w-4 h-4 animate-spin text-lantern-violet" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching hotels in {searchedDest}…
            </div>
            <p className="text-xs text-white/25 mt-2">
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

          // Compute how many hotels match each neighborhood card
          const hotelCounts: Record<string, number> = {};
          if (cityGuide) {
            for (const n of cityGuide.neighborhoods) {
              hotelCounts[n.id] = offers.filter((o) =>
                n.matchKeywords.some(
                  (k) =>
                    o.inferred_neighborhood.toLowerCase().includes(k.toLowerCase()) ||
                    o.address.toLowerCase().includes(k.toLowerCase())
                )
              ).length;
            }
          }

          // Filter displayed hotels when a neighborhood is selected
          const selectedCard = cityGuide?.neighborhoods.find((n) => n.id === selectedNeighborhood);
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
          const cheapestId = [...offers].sort((a, b) => a.price_per_night - b.price_per_night)[0]?.hotel_id;

          // Preference conflict warnings
          const conflictWarnings = PREF_CONFLICTS
            .filter(([a, b]) => activePrefs.includes(a) && activePrefs.includes(b))
            .map(([,, msg]) => msg);

          return (
            <div className="max-w-3xl mx-auto" ref={resultsRef}>

              {/* Neighborhood guide */}
              {cityGuide && (
                <NeighborhoodGuide
                  guide={cityGuide}
                  selectedId={selectedNeighborhood}
                  onSelect={setSelectedNeighborhood}
                  hotelCounts={hotelCounts}
                />
              )}

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

              {/* Summary + Sort bar */}
              <div className="flex items-center justify-between mb-3 px-1 gap-3 flex-wrap">
                <div className="text-xs text-white/40">
                  {selectedCard ? (
                    <>
                      <span className="font-semibold text-white/70">
                        {showAllFallback ? offers.length : amenityFilteredOffers.length} hotels
                      </span>
                      {" "}in <span className="text-white/60">{selectedCard.name}</span>
                      {showAllFallback && <span className="text-white/25"> · no exact matches, showing all</span>}
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
              </div>

              {/* Recommendation panel — always use score-ranked order */}
              <RecommendationPanel
                offers={showAllFallback ? offers : filteredOffers}
                activePrefs={activePrefs}
              />

              {/* Hotel cards */}
              <div className="space-y-3">
                {(showAllFallback ? offers : displayedOffers).map((offer) => (
                  <HotelCard
                    key={offer.hotel_id}
                    offer={offer}
                    isBestOverall={offer.hotel_id === bestOverallId}
                    isCheapest={offer.hotel_id === cheapestId}
                    activePrefs={activePrefs}
                    guests={guests}
                  />
                ))}
              </div>

              <div className="mt-6 text-center text-[11px] text-white/20 leading-relaxed">
                Prices from Google Hotels via SerpAPI · Same prices as Google Hotels, ranked by your preferences.
              </div>
            </div>
          );
        })()}

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

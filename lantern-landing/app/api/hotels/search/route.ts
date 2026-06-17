import { NextResponse } from "next/server";
import { searchGoogleHotels } from "../providers/googleHotels";
import { enrichWithGooglePlaces } from "../providers/googlePlaces";
import type { PlacesEnrichment } from "../providers/googlePlaces";
import type { NearbyPlace, ProviderHotel } from "../providers/types";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 45;

// ── Neighborhood preference → keyword signals (SerpAPI fallback path) ─────────

const PREF_SIGNALS: Record<string, {
  nearbyTerms:  string[];
  addressTerms: string[];
  descTerms:    string[];
  amenityTerms: string[];
}> = {
  "first-time": {
    nearbyTerms:  ["eiffel", "louvre", "notre dame", "big ben", "colosseum", "sagrada familia", "acropolis", "times square", "central park", "trevi", "vatican", "buckingham", "tower of london", "sacré-cœur", "sacre-coeur", "pantheon", "duomo", "empire state", "golden gate"],
    addressTerms: ["old town", "historic", "city centre", "city center", "centro", "altstadt"],
    descTerms:    ["iconic", "heart of the city", "center of", "famous", "landmark", "must-see"],
    amenityTerms: ["tour desk", "concierge"],
  },
  "sightseeing": {
    nearbyTerms:  ["museum", "gallery", "monument", "cathedral", "basilica", "palace", "castle", "temple", "shrine", "colosseum", "forum", "ruins", "aquarium", "zoo", "national park", "historic site"],
    addressTerms: ["museum", "gallery", "palace", "historic", "heritage"],
    descTerms:    ["museum", "gallery", "historic", "cultural", "sightseeing", "landmark", "arts"],
    amenityTerms: ["tour desk", "concierge"],
  },
  "food": {
    nearbyTerms:  ["restaurant", "market", "food hall", "brasserie", "cafe", "bistro", "street food", "farmers market", "covered market", "les halles", "food market", "tavern", "trattoria"],
    addressTerms: ["market", "food street", "restaurant row"],
    descTerms:    ["culinary", "restaurant", "dining", "gastronomic", "chef", "cuisine", "food scene"],
    amenityTerms: ["restaurant", "bar", "breakfast included", "rooftop restaurant"],
  },
  "nightlife": {
    nearbyTerms:  ["bar", "nightclub", "club", "lounge", "pub", "brewery", "wine bar", "cocktail bar", "jazz club", "oberkampf", "soho"],
    addressTerms: ["oberkampf", "bastille", "pigalle", "soho", "entertainment"],
    descTerms:    ["vibrant", "lively", "nightlife", "trendy", "hip", "buzzing", "young crowd"],
    amenityTerms: ["bar", "rooftop bar", "nightclub"],
  },
  "quiet": {
    nearbyTerms:  ["park", "garden", "botanical garden", "lake", "riverside", "nature reserve"],
    addressTerms: ["residential", "quiet", "peaceful", "garden district"],
    descTerms:    ["quiet", "peaceful", "serene", "tranquil", "relaxing", "oasis", "residential"],
    amenityTerms: ["spa", "garden", "yoga", "meditation", "wellness"],
  },
  "luxury": {
    nearbyTerms:  ["champs-élysées", "champs elysees", "fifth avenue", "rodeo drive", "knightsbridge", "mayfair", "avenue montaigne", "passeig de gràcia", "paseo de gracia"],
    addressTerms: ["grand", "plaza", "royal", "palace", "luxury", "prestige"],
    descTerms:    ["luxury", "luxurious", "five-star", "5-star", "prestigious", "exclusive", "elite"],
    amenityTerms: ["spa", "butler service", "valet parking", "fine dining", "pool", "fitness center"],
  },
  "budget": {
    nearbyTerms:  [],
    addressTerms: [],
    descTerms:    ["affordable", "budget", "value", "economical", "great deal"],
    amenityTerms: ["free wifi", "free breakfast", "kitchenette", "self-catering"],
  },
  "family": {
    nearbyTerms:  ["zoo", "aquarium", "theme park", "playground", "disney", "lego", "children's museum", "science museum", "water park"],
    addressTerms: [],
    descTerms:    ["family", "children", "kids", "family-friendly", "connecting rooms"],
    amenityTerms: ["pool", "kids club", "family room", "playground", "babysitting", "children's menu"],
  },
  "transit": {
    nearbyTerms:  ["metro", "subway", "train station", "bus station", "tram stop", "rail", "tube", "gare", "bahnhof", "stazione", "station"],
    addressTerms: ["station", "metro", "transit hub", "transport hub"],
    descTerms:    ["metro station", "subway", "train station", "bus stop", "well connected", "transport links"],
    amenityTerms: ["airport shuttle", "free shuttle", "metro pass"],
  },
  "walkable": {
    nearbyTerms:  ["shopping", "mall", "market", "park", "plaza", "square", "promenade", "waterfront", "boardwalk"],
    addressTerms: ["downtown", "central", "city centre", "city center", "midtown", "old town"],
    descTerms:    ["walkable", "walking distance", "central location", "steps from", "heart of", "pedestrian"],
    amenityTerms: [],
  },
};

// ── City-specific neighborhood fit scores ─────────────────────────────────────
// Pre-calibrated 0–100 scores for known neighborhoods per preference.
// These take priority over keyword / Places bestFor scoring when the hotel's
// inferred_neighborhood matches a key in this table.

type PrefScoreMap = Record<string, number>;
type CityNeighborhoodTable = Record<string, PrefScoreMap>;  // pref → {neighborhood → score}

const NEIGHBORHOOD_FIT_TABLES: Record<string, CityNeighborhoodTable> = {
  tokyo: {
    luxury: {
      "ginza": 95, "chuo city": 95, "chuo-ku": 95, "chūō": 95,
      "marunouchi": 95, "chiyoda city": 92, "chiyoda-ku": 92,
      "roppongi": 90, "minato city": 88, "minato-ku": 88, "azabu": 90, "akasaka": 88,
      "aoyama": 90, "omotesando": 92, "harajuku": 82,
      "shibuya city": 80, "shibuya-ku": 80, "shibuya": 80, "daikanyama": 82, "ebisu": 80,
      "shinjuku": 75, "shinjuku city": 75, "shinjuku-ku": 75,
      "meguro": 70, "meguro city": 70, "meguro-ku": 70,
      "shinagawa": 68, "shinagawa city": 68, "shinagawa-ku": 68,
      "sumida city": 35, "sumida-ku": 35, "sumida": 35,
      "asakusa": 35, "taito city": 35, "taito-ku": 35, "taitō": 35,
      "ueno": 40,
      "bunkyo": 55, "bunkyo city": 55, "bunkyo-ku": 55,
      "edogawa": 20, "edogawa city": 20, "katsushika": 15,
      "adachi": 18, "nerima": 22, "itabashi": 22, "kita city": 25,
    },
    quiet: {
      "aoyama": 82, "omotesando": 80,
      "meguro": 87, "meguro city": 87, "meguro-ku": 87,
      "daikanyama": 87, "ebisu": 77,
      "ginza": 62, "chuo city": 60, "chuo-ku": 60,
      "azabu": 78, "minato city": 72, "minato-ku": 72,
      "harajuku": 65, "shibuya city": 37, "shibuya-ku": 37, "shibuya": 37,
      "shinjuku": 28, "shinjuku city": 28, "shinjuku-ku": 28,
      "roppongi": 33,
      "asakusa": 47, "taito city": 45, "taito-ku": 45,
      "ueno": 42, "bunkyo": 60, "bunkyo-ku": 60,
      "sumida": 52, "sumida city": 50,
    },
    "first-time": {
      "shinjuku": 92, "shinjuku city": 92, "shinjuku-ku": 92,
      "ginza": 87, "chuo city": 85, "chuo-ku": 85,
      "shibuya": 87, "shibuya city": 87, "shibuya-ku": 87,
      "marunouchi": 87, "chiyoda city": 85, "chiyoda-ku": 85,
      "asakusa": 77, "taito city": 75, "taito-ku": 75,
      "roppongi": 77, "minato city": 75, "minato-ku": 75,
      "ueno": 72, "harajuku": 80, "omotesando": 78, "aoyama": 75,
      "meguro": 52, "daikanyama": 55, "ebisu": 60,
      "sumida": 50, "bunkyo": 58,
    },
    food: {
      "ginza": 95, "chuo city": 92, "chuo-ku": 92,
      "shinjuku": 92, "shinjuku city": 92, "shinjuku-ku": 92,
      "shibuya": 90, "shibuya city": 90, "shibuya-ku": 90,
      "ebisu": 92, "daikanyama": 87,
      "roppongi": 87, "minato city": 82, "minato-ku": 82,
      "asakusa": 77, "taito city": 75, "taito-ku": 75,
      "ueno": 70, "harajuku": 78, "omotesando": 82, "aoyama": 80,
      "bunkyo": 65, "meguro": 78,
      "marunouchi": 82, "chiyoda city": 78, "chiyoda-ku": 78,
    },
    transit: {
      "shinjuku": 97, "shinjuku city": 97, "shinjuku-ku": 97,
      "marunouchi": 97, "chiyoda city": 95, "chiyoda-ku": 95,
      "ginza": 92, "chuo city": 90, "chuo-ku": 90,
      "shibuya": 92, "shibuya city": 92, "shibuya-ku": 92,
      "ueno": 87, "taito city": 77, "taito-ku": 77, "asakusa": 77,
      "roppongi": 75, "minato city": 78, "minato-ku": 78,
      "aoyama": 72, "omotesando": 75, "harajuku": 82,
      "bunkyo": 78, "bunkyo-ku": 78,
      "meguro": 72, "shinagawa": 80, "shinagawa-ku": 80,
      "sumida": 75, "sumida-ku": 75,
    },
    nightlife: {
      "shinjuku": 95, "shinjuku city": 95, "shinjuku-ku": 95,
      "roppongi": 95, "minato city": 88, "minato-ku": 88,
      "shibuya": 90, "shibuya city": 90, "shibuya-ku": 90,
      "ginza": 75, "chuo city": 72, "chuo-ku": 72,
      "harajuku": 72, "aoyama": 65, "ebisu": 75, "daikanyama": 72,
      "asakusa": 55, "taito city": 52, "taito-ku": 52,
      "ueno": 58, "meguro": 62,
      "sumida": 45, "bunkyo": 48,
    },
    budget: {
      "asakusa": 82, "taito city": 82, "taito-ku": 82,
      "ueno": 78, "bunkyo": 72, "bunkyo-ku": 72,
      "sumida": 77, "sumida-ku": 77,
      "katsushika": 88, "edogawa": 87, "adachi": 87, "nerima": 82, "itabashi": 80,
      "shinjuku": 60, "shinjuku-ku": 60,
      "shibuya": 42, "ginza": 28, "chuo city": 28, "chuo-ku": 28,
      "roppongi": 32, "minato city": 30, "minato-ku": 30,
    },
    family: {
      "asakusa": 80, "taito city": 78, "taito-ku": 78,
      "ueno": 82, "bunkyo": 78, "bunkyo-ku": 78,
      "shibuya": 70, "shibuya-ku": 70,
      "shinjuku": 65, "shinjuku-ku": 65,
      "meguro": 72, "ebisu": 68,
      "ginza": 62, "chuo city": 60,
      "roppongi": 45, "minato-ku": 48,
    },
    walkable: {
      "ginza": 88, "chuo city": 85, "chuo-ku": 85,
      "asakusa": 85, "taito city": 82, "taito-ku": 82,
      "marunouchi": 82, "chiyoda city": 80, "chiyoda-ku": 80,
      "shibuya": 82, "shibuya-ku": 82, "omotesando": 87, "harajuku": 85,
      "shinjuku": 78, "shinjuku-ku": 78,
      "roppongi": 72, "minato city": 68, "minato-ku": 68,
      "aoyama": 78, "ebisu": 72, "daikanyama": 75,
      "ueno": 75, "sumida": 72,
    },
    sightseeing: {
      "asakusa": 92, "taito city": 90, "taito-ku": 90,
      "ueno": 90, "bunkyo": 82, "bunkyo-ku": 82,
      "ginza": 82, "chuo city": 80, "chuo-ku": 80,
      "marunouchi": 82, "chiyoda city": 80, "chiyoda-ku": 80,
      "shinjuku": 78, "shinjuku-ku": 78,
      "shibuya": 75, "shibuya-ku": 75, "harajuku": 78,
      "aoyama": 70, "omotesando": 72,
      "roppongi": 78, "minato city": 72, "minato-ku": 72,
      "meguro": 55, "sumida": 82,
    },
    visitor: {
      // Desirability for a typical visitor (no stated preferences).
      // Ginza 95 → Ota City 45 per product spec.
      "ginza": 95, "chuo city": 95, "chuo-ku": 95, "chūō": 95,
      "shibuya": 92, "shibuya city": 92, "shibuya-ku": 92,
      "shinjuku": 90, "shinjuku city": 90, "shinjuku-ku": 90,
      "omotesando": 88, "marunouchi": 88, "chiyoda city": 86, "chiyoda-ku": 86,
      "harajuku": 86, "aoyama": 84,
      "asakusa": 85, "taito city": 84, "taito-ku": 84, "taitō": 84,
      "roppongi": 82, "minato city": 80, "minato-ku": 80, "azabu": 82, "akasaka": 80,
      "ueno": 82, "bunkyo": 78, "bunkyo city": 78, "bunkyo-ku": 78,
      "sumida": 70, "sumida city": 70, "sumida-ku": 70,
      "ebisu": 72, "daikanyama": 70, "meguro": 65, "meguro city": 65, "meguro-ku": 65,
      "shinagawa": 58, "shinagawa city": 58, "shinagawa-ku": 58,
      "koto": 60, "koto city": 60, "koto-ku": 60,
      "setagaya": 52, "setagaya-ku": 52,
      "nerima": 38, "nerima city": 38,
      "itabashi": 36, "itabashi city": 36,
      "kita city": 38, "kita-ku": 38,
      "adachi": 28, "edogawa": 28, "katsushika": 26,
      "ota city": 45, "ota-ku": 45, "ōta": 45,
    },
  },
  barcelona: {
    quiet: {
      "sarrià-sant gervasi": 95, "sant gervasi": 90, "pedralbes": 90,
      "gràcia": 80,
      "eixample": 55, "sants-montjuïc": 50, "sant martí": 45,
      "les corts": 65, "horta-guinardó": 65, "nou barris": 55, "sant andreu": 50,
      "ciutat vella": 20, "el raval": 10, "barceloneta": 15,
      "barri gòtic": 15, "gothic quarter": 15, "el born": 30,
      "l'hospitalet": 25, "hospitalet": 25, "poblenou": 42,
    },
    luxury: {
      "eixample": 90, "passeig de gràcia": 95,
      "sarrià-sant gervasi": 85, "sant gervasi": 85, "pedralbes": 92,
      "les corts": 70, "el born": 70,
      "barri gòtic": 55, "gothic quarter": 55, "ciutat vella": 55,
      "barceloneta": 65, "sants-montjuïc": 45, "gràcia": 50,
      "l'hospitalet": 20, "hospitalet": 20, "el raval": 25,
      "sant martí": 40, "poblenou": 45,
    },
    food: {
      "eixample": 90, "el born": 92, "gràcia": 85,
      "barri gòtic": 80, "gothic quarter": 80, "ciutat vella": 80,
      "sant antoni": 88, "el raval": 78, "barceloneta": 75,
      "sarrià-sant gervasi": 60, "poblenou": 75, "sant martí": 70,
      "sants-montjuïc": 65, "l'hospitalet": 45, "hospitalet": 45,
      "les corts": 55, "sant andreu": 55,
    },
    sightseeing: {
      "ciutat vella": 95, "barri gòtic": 95, "gothic quarter": 95,
      "el born": 92, "eixample": 87,
      "barceloneta": 70, "sants-montjuïc": 72,
      "sarrià-sant gervasi": 40, "gràcia": 65,
      "les corts": 50, "poblenou": 55, "sant martí": 55,
      "l'hospitalet": 30, "hospitalet": 30, "el raval": 72,
    },
    transit: {
      "eixample": 92, "sants-montjuïc": 88, "sants": 92,
      "passeig de gràcia": 92, "gràcia": 78, "sant martí": 72,
      "sarrià-sant gervasi": 65, "l'hospitalet": 67, "hospitalet": 67,
      "sant andreu": 72, "nou barris": 65, "horta-guinardó": 62,
      "les corts": 75, "barceloneta": 72, "barri gòtic": 82,
      "gothic quarter": 82, "el born": 82, "el raval": 77,
      "ciutat vella": 82, "poblenou": 68,
    },
    nightlife: {
      "barri gòtic": 90, "gothic quarter": 90, "el raval": 95,
      "el born": 92, "barceloneta": 87, "gràcia": 78,
      "eixample": 72, "poblenou": 78, "sant martí": 72,
      "sarrià-sant gervasi": 22, "les corts": 30,
      "sants-montjuïc": 55, "l'hospitalet": 50, "hospitalet": 50,
    },
    budget: {
      "l'hospitalet": 85, "hospitalet": 85, "poblenou": 72,
      "sant andreu": 78, "nou barris": 82, "horta-guinardó": 77,
      "sants-montjuïc": 68, "sant martí": 67, "el raval": 72,
      "gràcia": 62, "barceloneta": 62, "barri gòtic": 57,
      "gothic quarter": 57, "eixample": 40,
      "sarrià-sant gervasi": 18, "pedralbes": 12,
    },
    family: {
      "sarrià-sant gervasi": 82, "sant gervasi": 80, "les corts": 82,
      "gràcia": 78, "horta-guinardó": 72, "eixample": 67,
      "sant martí": 67, "sants-montjuïc": 62, "nou barris": 65,
      "barceloneta": 72, "barri gòtic": 57, "gothic quarter": 57,
      "el raval": 38, "l'hospitalet": 57, "hospitalet": 57,
    },
    "first-time": {
      "barri gòtic": 97, "gothic quarter": 97, "el born": 92,
      "eixample": 92, "barceloneta": 82, "gràcia": 72,
      "sants-montjuïc": 67, "sarrià-sant gervasi": 45,
      "les corts": 52, "el raval": 72,
      "l'hospitalet": 28, "hospitalet": 28,
    },
    walkable: {
      "barri gòtic": 97, "gothic quarter": 97, "el born": 92,
      "eixample": 88, "gràcia": 87, "barceloneta": 82,
      "el raval": 82, "sarrià-sant gervasi": 57,
      "sants-montjuïc": 62, "sant martí": 67,
      "l'hospitalet": 42, "hospitalet": 42, "les corts": 60, "poblenou": 65,
    },
    visitor: {
      "barri gòtic": 95, "gothic quarter": 95, "el born": 91, "eixample": 89,
      "barceloneta": 80, "gràcia": 76, "el raval": 72, "sant antoni": 74,
      "poblenou": 65, "sants-montjuïc": 58, "sarrià-sant gervasi": 50,
      "sant gervasi": 48, "pedralbes": 46, "les corts": 44,
      "sant andreu": 38, "nou barris": 32, "horta-guinardó": 35,
      "l'hospitalet": 30, "hospitalet": 30,
    },
  },
  london: {
    luxury: {
      "mayfair": 98, "belgravia": 95, "knightsbridge": 95,
      "kensington": 90, "chelsea": 87, "marylebone": 85,
      "st james's": 95, "st james": 95, "covent garden": 75,
      "westminster": 78, "fitzrovia": 72, "soho": 68,
      "bloomsbury": 65, "city of london": 62, "canary wharf": 72,
      "shoreditch": 42, "hackney": 35, "peckham": 28, "brixton": 30,
      "stratford": 32, "notting hill": 78, "hammersmith": 55,
      "battersea": 58, "south bank": 62, "southwark": 55,
      "shepherd's bush": 48, "king's cross": 55, "kings cross": 55,
    },
    quiet: {
      "kensington": 88, "chelsea": 85, "notting hill": 87,
      "marylebone": 82, "belgravia": 85, "mayfair": 72,
      "richmond": 95, "hampstead": 92, "bloomsbury": 72,
      "fitzrovia": 65, "covent garden": 42, "soho": 25,
      "shoreditch": 35, "city of london": 55, "canary wharf": 60,
      "south bank": 58, "southwark": 52, "hackney": 48,
      "brixton": 42, "peckham": 45, "westminster": 55,
      "st james's": 70, "st james": 70, "stratford": 50,
      "king's cross": 52, "kings cross": 52,
    },
    "first-time": {
      "westminster": 92, "covent garden": 95, "south bank": 92,
      "soho": 87, "bloomsbury": 88, "st james's": 88, "st james": 88,
      "mayfair": 82, "kensington": 82, "city of london": 78,
      "shoreditch": 72, "notting hill": 75, "chelsea": 70,
      "canary wharf": 55, "stratford": 48, "hackney": 60,
      "brixton": 55, "peckham": 48, "king's cross": 70, "kings cross": 70,
    },
    sightseeing: {
      "westminster": 97, "south bank": 95, "covent garden": 92,
      "bloomsbury": 92, "city of london": 90, "st james's": 90, "st james": 90,
      "kensington": 88, "soho": 78, "mayfair": 80, "notting hill": 72,
      "shoreditch": 68, "canary wharf": 62, "chelsea": 72,
      "marylebone": 75, "hackney": 60, "brixton": 50,
      "stratford": 55, "king's cross": 72, "kings cross": 72,
    },
    food: {
      "soho": 95, "covent garden": 92, "shoreditch": 90,
      "south bank": 85, "southwark": 88, "brixton": 87,
      "mayfair": 90, "chelsea": 85, "kensington": 80,
      "notting hill": 80, "hackney": 82, "peckham": 80,
      "bloomsbury": 72, "fitzrovia": 78, "marylebone": 80,
      "city of london": 65, "canary wharf": 68, "stratford": 55,
      "king's cross": 75, "kings cross": 75,
    },
    nightlife: {
      "shoreditch": 95, "soho": 95, "brixton": 90,
      "hackney": 88, "peckham": 85, "covent garden": 78,
      "south bank": 72, "mayfair": 72, "kensington": 55,
      "chelsea": 65, "notting hill": 68, "city of london": 52,
      "canary wharf": 58, "bloomsbury": 52, "stratford": 58,
      "king's cross": 72, "kings cross": 72,
    },
    transit: {
      "city of london": 95, "westminster": 92, "covent garden": 92,
      "king's cross": 97, "kings cross": 97, "victoria": 92,
      "paddington": 90, "canary wharf": 90, "stratford": 88,
      "shoreditch": 80, "soho": 85, "south bank": 82,
      "bloomsbury": 82, "mayfair": 78, "kensington": 78,
      "chelsea": 68, "notting hill": 72, "hackney": 72,
      "brixton": 75, "hammersmith": 82,
    },
    budget: {
      "stratford": 82, "hackney": 75, "peckham": 78,
      "brixton": 77, "shoreditch": 62, "hammersmith": 62,
      "shepherd's bush": 65, "bloomsbury": 60,
      "king's cross": 65, "kings cross": 65, "south bank": 55,
      "covent garden": 40, "mayfair": 8, "belgravia": 5,
      "knightsbridge": 8, "chelsea": 18, "kensington": 22, "soho": 35,
    },
    family: {
      "kensington": 90, "notting hill": 85, "richmond": 92,
      "hampstead": 88, "bloomsbury": 82, "south bank": 85,
      "westminster": 75, "covent garden": 72, "shoreditch": 52,
      "soho": 45, "brixton": 55, "hackney": 60, "stratford": 65,
      "canary wharf": 68, "chelsea": 72, "marylebone": 75,
      "city of london": 55,
    },
    walkable: {
      "covent garden": 95, "soho": 92, "bloomsbury": 90,
      "south bank": 90, "westminster": 88, "city of london": 82,
      "notting hill": 82, "chelsea": 80, "kensington": 78,
      "shoreditch": 82, "mayfair": 80, "marylebone": 80,
      "hackney": 72, "brixton": 72, "king's cross": 78, "kings cross": 78,
      "canary wharf": 68, "stratford": 60, "hammersmith": 68,
    },
    visitor: {
      "covent garden": 95, "soho": 92, "south bank": 91, "westminster": 90,
      "bloomsbury": 88, "mayfair": 88, "marylebone": 80, "city of london": 80,
      "shoreditch": 79, "kensington": 78, "notting hill": 76, "chelsea": 75,
      "st james's": 82, "st james": 82, "fitzrovia": 75,
      "king's cross": 72, "kings cross": 72, "belgravia": 74, "knightsbridge": 77,
      "hackney": 62, "brixton": 58, "peckham": 52, "canary wharf": 60,
      "stratford": 46, "hammersmith": 50, "shepherd's bush": 44,
    },
  },
  "new york": {
    luxury: {
      "upper east side": 95, "midtown": 88, "tribeca": 90,
      "soho": 88, "west village": 82, "flatiron": 85,
      "upper west side": 80, "central park south": 97,
      "chelsea": 78, "greenwich village": 80, "carnegie hill": 90,
      "financial district": 65, "lower east side": 55,
      "williamsburg": 55, "harlem": 42, "queens": 40,
      "park slope": 65, "brooklyn heights": 70,
    },
    quiet: {
      "upper east side": 90, "upper west side": 88,
      "tribeca": 82, "west village": 80, "brooklyn heights": 88,
      "park slope": 85, "greenwich village": 72,
      "midtown": 45, "times square": 15, "soho": 62,
      "chelsea": 60, "flatiron": 55, "lower east side": 35,
      "williamsburg": 42, "financial district": 60, "harlem": 55,
      "east village": 48,
    },
    "first-time": {
      "midtown": 97, "times square": 95, "central park south": 92,
      "upper east side": 82, "soho": 85, "greenwich village": 80,
      "financial district": 82, "chelsea": 72, "west village": 75,
      "williamsburg": 68, "upper west side": 75, "harlem": 62,
      "queens": 52, "lower east side": 65, "east village": 68,
      "tribeca": 72, "brooklyn heights": 70,
    },
    sightseeing: {
      "midtown": 97, "times square": 95, "upper east side": 92,
      "central park south": 95, "financial district": 90,
      "soho": 82, "greenwich village": 80, "west village": 75,
      "chelsea": 78, "upper west side": 80, "williamsburg": 70,
      "harlem": 75, "lower east side": 68, "east village": 70,
      "brooklyn heights": 80, "tribeca": 75,
    },
    food: {
      "soho": 95, "west village": 95, "greenwich village": 92,
      "lower east side": 90, "east village": 92,
      "williamsburg": 90, "flushing": 92, "astoria": 88,
      "midtown": 82, "chelsea": 85, "flatiron": 85,
      "upper east side": 80, "upper west side": 78,
      "harlem": 82, "financial district": 68, "times square": 62,
      "tribeca": 88, "park slope": 80,
    },
    nightlife: {
      "lower east side": 95, "east village": 95, "williamsburg": 90,
      "soho": 85, "west village": 85, "chelsea": 82,
      "midtown": 72, "times square": 68, "upper east side": 60,
      "upper west side": 55, "harlem": 70, "financial district": 55,
      "bushwick": 90, "park slope": 68,
    },
    transit: {
      "midtown": 97, "times square": 97, "financial district": 92,
      "lower east side": 85, "east village": 82, "chelsea": 82,
      "soho": 85, "west village": 78, "greenwich village": 80,
      "upper east side": 80, "upper west side": 82,
      "williamsburg": 78, "harlem": 80, "brooklyn heights": 78,
      "park slope": 75, "tribeca": 80, "flatiron": 85,
    },
    budget: {
      "queens": 87, "astoria": 82, "flushing": 80,
      "harlem": 78, "williamsburg": 72, "bushwick": 80,
      "lower east side": 70, "east village": 65,
      "financial district": 60, "chelsea": 55, "soho": 45,
      "upper east side": 35, "tribeca": 30, "midtown": 50,
      "times square": 58, "upper west side": 55, "park slope": 62,
    },
    family: {
      "upper east side": 92, "upper west side": 90,
      "central park south": 90, "brooklyn heights": 88,
      "park slope": 87, "tribeca": 82, "midtown": 72,
      "soho": 70, "west village": 68, "greenwich village": 65,
      "lower east side": 48, "williamsburg": 55,
      "times square": 62, "financial district": 62,
    },
    walkable: {
      "soho": 95, "west village": 95, "greenwich village": 92,
      "chelsea": 90, "lower east side": 88, "east village": 90,
      "midtown": 88, "upper west side": 85, "upper east side": 82,
      "tribeca": 85, "flatiron": 88, "williamsburg": 80,
      "financial district": 78, "times square": 85,
      "harlem": 72, "brooklyn heights": 78, "park slope": 82,
    },
    visitor: {
      "midtown": 95, "times square": 92, "central park south": 94,
      "soho": 88, "greenwich village": 86, "west village": 85,
      "tribeca": 82, "flatiron": 82, "financial district": 78,
      "upper east side": 80, "upper west side": 78,
      "chelsea": 75, "lower east side": 72, "east village": 73,
      "williamsburg": 68, "brooklyn heights": 70, "harlem": 64,
      "park slope": 62, "astoria": 50, "flushing": 48, "queens": 45,
      "bushwick": 50,
    },
  },
  bangkok: {
    luxury: {
      "riverside": 95, "charoenkrung": 95, "iconsiam": 90,
      "sathorn": 85, "silom": 82, "sukhumvit": 80,
      "siam": 75, "ploenchit": 88, "asok": 72,
      "nana": 65, "pratunam": 45, "rattanakosin": 50,
      "on nut": 35, "phaya thai": 58, "ari": 55,
    },
    quiet: {
      "riverside": 82, "sathorn": 78, "ari": 80,
      "phaya thai": 72, "silom": 62, "charoenkrung": 75,
      "sukhumvit": 35, "siam": 42, "khao san": 10,
      "pratunam": 28, "nana": 25, "asok": 40, "rattanakosin": 45,
    },
    "first-time": {
      "rattanakosin": 92, "khao san": 88, "siam": 85,
      "sukhumvit": 82, "silom": 75, "riverside": 78,
      "ploenchit": 72, "pratunam": 68, "phaya thai": 65,
    },
    sightseeing: {
      "rattanakosin": 97, "khao san": 80, "riverside": 85,
      "charoenkrung": 88, "silom": 72, "sukhumvit": 58,
      "siam": 70, "sathorn": 65, "ari": 45,
    },
    food: {
      "riverside": 92, "charoenkrung": 92, "sukhumvit": 88,
      "silom": 85, "siam": 80, "ari": 85,
      "phaya thai": 80, "rattanakosin": 75, "khao san": 72,
      "pratunam": 70, "on nut": 75, "nana": 72,
    },
    nightlife: {
      "sukhumvit": 95, "nana": 92, "asok": 90,
      "silom": 88, "siam": 72, "khao san": 82,
      "riverside": 55, "ari": 48, "sathorn": 58,
      "rattanakosin": 45, "pratunam": 60,
    },
    transit: {
      "siam": 97, "asok": 92, "silom": 90,
      "sukhumvit": 88, "ploenchit": 90, "phaya thai": 85,
      "sathorn": 82, "nana": 80, "pratunam": 78,
      "riverside": 58, "khao san": 60, "rattanakosin": 65,
    },
    budget: {
      "khao san": 92, "pratunam": 88, "rattanakosin": 82,
      "phaya thai": 78, "on nut": 80, "ari": 72,
      "sukhumvit": 52, "silom": 48, "riverside": 28,
      "sathorn": 32, "siam": 55,
    },
    family: {
      "riverside": 80, "siam": 78, "rattanakosin": 72,
      "sukhumvit": 65, "silom": 60, "khao san": 32,
      "sathorn": 55, "ari": 62,
    },
    walkable: {
      "siam": 88, "rattanakosin": 85, "riverside": 85,
      "charoenkrung": 83, "khao san": 88, "sukhumvit": 82,
      "silom": 80, "pratunam": 75, "ari": 72,
      "phaya thai": 70, "sathorn": 68,
    },
    visitor: {
      "rattanakosin": 90, "siam": 86, "riverside": 85, "charoenkrung": 83,
      "sukhumvit": 82, "silom": 78, "khao san": 75, "ploenchit": 76,
      "sathorn": 72, "asok": 70, "phaya thai": 62, "ari": 57,
      "pratunam": 65, "nana": 60, "on nut": 45,
    },
  },
  singapore: {
    luxury: {
      "marina bay": 97, "orchard road": 93, "orchard": 92,
      "sentosa": 82, "tanjong pagar": 72, "robertson quay": 80,
      "chinatown": 55, "little india": 35, "arab street": 42,
      "bugis": 50, "city hall": 88, "raffles place": 85,
    },
    quiet: {
      "sentosa": 90, "orchard road": 75, "orchard": 74,
      "marina bay": 65, "tanjong pagar": 68, "robertson quay": 72,
      "chinatown": 55, "little india": 38, "arab street": 48,
      "bugis": 50, "city hall": 60, "raffles place": 62,
    },
    "first-time": {
      "marina bay": 97, "orchard road": 92, "orchard": 91,
      "chinatown": 85, "little india": 80, "arab street": 80,
      "city hall": 88, "raffles place": 85, "sentosa": 78,
      "bugis": 75, "tanjong pagar": 70,
    },
    sightseeing: {
      "marina bay": 97, "chinatown": 88, "little india": 85,
      "arab street": 85, "orchard road": 75, "sentosa": 80,
      "city hall": 90, "raffles place": 88, "bugis": 78,
      "tanjong pagar": 65,
    },
    food: {
      "chinatown": 97, "little india": 92, "arab street": 92,
      "tanjong pagar": 90, "bugis": 88, "orchard road": 78,
      "marina bay": 75, "robertson quay": 85, "sentosa": 65,
    },
    nightlife: {
      "clarke quay": 95, "robertson quay": 90, "tanjong pagar": 88,
      "arab street": 82, "chinatown": 80, "marina bay": 72,
      "orchard road": 68, "sentosa": 75, "bugis": 70,
      "little india": 55,
    },
    transit: {
      "marina bay": 95, "orchard road": 95, "orchard": 94,
      "raffles place": 92, "city hall": 92, "bugis": 88,
      "chinatown": 88, "tanjong pagar": 85, "little india": 85,
      "arab street": 82, "sentosa": 52,
    },
    budget: {
      "little india": 88, "chinatown": 85, "arab street": 80,
      "bugis": 78, "tanjong pagar": 65, "orchard road": 30,
      "marina bay": 22, "sentosa": 28, "raffles place": 38,
    },
    family: {
      "sentosa": 95, "marina bay": 85, "orchard road": 75,
      "chinatown": 68, "little india": 60, "arab street": 62,
      "tanjong pagar": 60, "city hall": 72,
    },
    walkable: {
      "chinatown": 92, "arab street": 90, "little india": 88,
      "marina bay": 85, "orchard road": 85, "tanjong pagar": 82,
      "bugis": 85, "city hall": 88, "raffles place": 85,
      "sentosa": 62, "robertson quay": 80,
    },
    visitor: {
      "marina bay": 97, "orchard road": 91, "orchard": 90,
      "chinatown": 88, "arab street": 84, "little india": 82,
      "city hall": 90, "raffles place": 88, "bugis": 83,
      "sentosa": 80, "tanjong pagar": 78, "robertson quay": 75,
      "clarke quay": 78,
    },
  },
  seoul: {
    luxury: {
      "gangnam": 92, "cheongdam": 97, "apgujeong": 95,
      "itaewon": 80, "myeongdong": 78, "jongno": 65,
      "insadong": 58, "hongdae": 38, "dongdaemun": 35,
      "mapo": 42, "sinchon": 40, "yongsan": 72, "hannam": 85,
    },
    quiet: {
      "insadong": 82, "jongno": 78, "gangnam": 72,
      "apgujeong": 75, "cheongdam": 78, "hannam": 80,
      "itaewon": 60, "myeongdong": 38, "hongdae": 30,
      "dongdaemun": 35, "sinchon": 42, "mapo": 52,
    },
    "first-time": {
      "myeongdong": 97, "insadong": 90, "jongno": 88,
      "gangnam": 85, "itaewon": 80, "hongdae": 75,
      "dongdaemun": 72, "sinchon": 68, "cheongdam": 72,
    },
    sightseeing: {
      "insadong": 95, "jongno": 95, "myeongdong": 88,
      "bukchon": 90, "gangnam": 62, "itaewon": 72,
      "hongdae": 58, "dongdaemun": 70,
    },
    food: {
      "itaewon": 92, "hongdae": 90, "myeongdong": 88,
      "insadong": 85, "gangnam": 82, "dongdaemun": 78,
      "jongno": 82, "sinchon": 80, "mapo": 78,
    },
    nightlife: {
      "hongdae": 97, "itaewon": 95, "gangnam": 90,
      "sinchon": 85, "myeongdong": 72, "insadong": 50,
      "dongdaemun": 62, "jongno": 58, "mapo": 72,
    },
    transit: {
      "myeongdong": 95, "gangnam": 92, "dongdaemun": 90,
      "itaewon": 85, "hongdae": 85, "insadong": 80,
      "jongno": 82, "sinchon": 82, "cheongdam": 75,
      "apgujeong": 78,
    },
    budget: {
      "hongdae": 85, "dongdaemun": 88, "myeongdong": 75,
      "insadong": 72, "sinchon": 82, "mapo": 80,
      "itaewon": 58, "jongno": 68, "gangnam": 30,
      "cheongdam": 22,
    },
    family: {
      "insadong": 80, "jongno": 78, "myeongdong": 82,
      "gangnam": 72, "itaewon": 68, "hongdae": 55,
      "dongdaemun": 62,
    },
    walkable: {
      "myeongdong": 92, "insadong": 90, "jongno": 88,
      "hongdae": 85, "itaewon": 82, "gangnam": 80,
      "dongdaemun": 85, "sinchon": 78, "cheongdam": 75,
    },
    visitor: {
      "myeongdong": 95, "insadong": 88, "bukchon": 84, "jongno": 84,
      "gangnam": 82, "itaewon": 80, "hongdae": 78,
      "dongdaemun": 75, "cheongdam": 72, "apgujeong": 68,
      "sinchon": 65, "hannam": 70, "mapo": 54,
    },
  },
};

// Best neighborhood per preference per city (used in "less X than Y" comparisons)
const CITY_BEST_NEIGHBORHOOD: Record<string, Record<string, string>> = {
  tokyo: {
    quiet:        "Daikanyama / Meguro",
    luxury:       "Ginza",
    food:         "Ginza / Shinjuku",
    sightseeing:  "Asakusa",
    transit:      "Shinjuku",
    nightlife:    "Roppongi / Shinjuku",
    "first-time": "Shinjuku",
    walkable:     "Ginza",
    budget:       "Asakusa / Ueno",
    family:       "Ueno",
  },
  barcelona: {
    quiet:        "Sarrià-Sant Gervasi",
    luxury:       "Eixample",
    food:         "Eixample",
    sightseeing:  "Gothic Quarter",
    transit:      "Eixample",
    nightlife:    "El Raval",
    "first-time": "Gothic Quarter",
    walkable:     "Gothic Quarter",
    budget:       "L'Hospitalet",
    family:       "Sarrià-Sant Gervasi",
  },
  london: {
    quiet:        "Kensington / Notting Hill",
    luxury:       "Mayfair",
    food:         "Soho / Shoreditch",
    sightseeing:  "South Bank / Westminster",
    transit:      "King's Cross",
    nightlife:    "Shoreditch / Soho",
    "first-time": "Covent Garden",
    walkable:     "Covent Garden",
    budget:       "Shoreditch / Hackney",
    family:       "Kensington",
  },
  "new york": {
    quiet:        "Upper East Side",
    luxury:       "Tribeca / Midtown",
    food:         "West Village / SoHo",
    sightseeing:  "Midtown",
    transit:      "Midtown",
    nightlife:    "Lower East Side",
    "first-time": "Midtown",
    walkable:     "SoHo / West Village",
    budget:       "Queens / Harlem",
    family:       "Upper East Side",
  },
  bangkok: {
    quiet:        "Riverside / Sathorn",
    luxury:       "Riverside / Charoenkrung",
    food:         "Riverside / Sukhumvit",
    sightseeing:  "Rattanakosin",
    transit:      "Siam / Silom",
    nightlife:    "Sukhumvit / Nana",
    "first-time": "Rattanakosin",
    walkable:     "Rattanakosin / Siam",
    budget:       "Khao San Road",
    family:       "Riverside",
  },
  singapore: {
    quiet:        "Sentosa Island",
    luxury:       "Marina Bay",
    food:         "Chinatown / Arab Street",
    sightseeing:  "Marina Bay",
    transit:      "Marina Bay / Orchard",
    nightlife:    "Clarke Quay",
    "first-time": "Marina Bay",
    walkable:     "Chinatown / Arab Street",
    budget:       "Little India",
    family:       "Sentosa Island",
  },
  seoul: {
    quiet:        "Insadong / Jongno",
    luxury:       "Gangnam / Cheongdam",
    food:         "Itaewon / Hongdae",
    sightseeing:  "Insadong / Jongno",
    transit:      "Myeongdong",
    nightlife:    "Hongdae",
    "first-time": "Myeongdong",
    walkable:     "Myeongdong / Insadong",
    budget:       "Hongdae / Dongdaemun",
    family:       "Insadong",
  },
};

// ── Neighborhood display-name normalization ───────────────────────────────────
// Maps raw administrative district names from Google Places to friendlier
// display names. Applied after scoring so lookup tables still use raw names.

const NEIGHBORHOOD_DISPLAY: Record<string, Record<string, string>> = {
  tokyo: {
    "chuo city":    "Ginza / Chuo",
    "chuo-ku":      "Ginza / Chuo",
    "chūō":         "Ginza / Chuo",
    "chuo":         "Ginza / Chuo",
    "taito city":   "Asakusa / Taito",
    "taito-ku":     "Asakusa / Taito",
    "taitō":        "Asakusa / Taito",
    "taito":        "Asakusa / Taito",
    "minato city":  "Roppongi / Minato",
    "minato-ku":    "Roppongi / Minato",
    "shibuya city": "Shibuya",
    "shibuya-ku":   "Shibuya",
    "shinjuku city":"Shinjuku",
    "shinjuku-ku":  "Shinjuku",
    "chiyoda city": "Marunouchi / Chiyoda",
    "chiyoda-ku":   "Marunouchi / Chiyoda",
    "meguro city":  "Meguro / Ebisu",
    "meguro-ku":    "Meguro / Ebisu",
    "bunkyo city":  "Ueno / Bunkyo",
    "bunkyo-ku":    "Ueno / Bunkyo",
    "bunkyo":       "Ueno / Bunkyo",
    "sumida city":  "Sumida",
    "sumida-ku":    "Sumida",
    "koto city":    "Koto",
    "koto-ku":      "Koto",
    "shinagawa city":"Shinagawa",
    "shinagawa-ku": "Shinagawa",
    "setagaya city":"Setagaya",
    "setagaya-ku":  "Setagaya",
    "ota city":     "Ota City",
    "ota-ku":       "Ota City",
    "ōta":          "Ota City",
    "nerima city":  "Nerima",
    "nerima-ku":    "Nerima",
    "itabashi city":"Itabashi",
    "itabashi-ku":  "Itabashi",
    "kita city":    "Kita",
    "kita-ku":      "Kita",
    "adachi city":  "Adachi",
    "adachi-ku":    "Adachi",
    "edogawa city": "Edogawa",
    "edogawa-ku":   "Edogawa",
  },
  london: {
    "london borough of camden":                   "Bloomsbury / Camden",
    "london borough of hackney":                  "Shoreditch / Hackney",
    "royal borough of kensington and chelsea":    "Kensington / Chelsea",
    "city of westminster":                        "Westminster",
    "london borough of tower hamlets":            "Shoreditch / East London",
    "london borough of southwark":                "South Bank / Southwark",
    "london borough of lambeth":                  "Brixton / Lambeth",
    "london borough of islington":                "Islington",
    "london borough of wandsworth":               "Battersea / Wandsworth",
  },
};

function normalizeNeighborhoodDisplay(neighborhood: string, destination: string): string {
  const destL  = destination.toLowerCase();
  const nbhdL  = neighborhood.toLowerCase().trim();
  let cityKey: string | null = null;
  if (destL.includes("tokyo")) cityKey = "tokyo";
  if (destL.includes("london")) cityKey = "london";
  if (!cityKey) return neighborhood;
  return NEIGHBORHOOD_DISPLAY[cityKey]?.[nbhdL] ?? neighborhood;
}

// ── HotelOffer — shape sent to the client ─────────────────────────────────────

export interface HotelOffer {
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
    price:           number;
    reviews:         number;
    location:        number;
    stars:           number;
    walkability:     number;
    destination_fit: number;
  };
  neighborhood_fit_score:  number;
  inferred_neighborhood:   string;
  neighborhood_fit_label:  string;
  location_summary: string;
  transit_note:     string;
  latitude?:  number;
  longitude?: number;
  rank_position:       number;
  rank_bullets:        string[];
  rank_weakness:       string;
  rating_sanity_note:  string;
  extra_badges:        string[];
}

// ── Base helpers ──────────────────────────────────────────────────────────────

function parseDurationMinutes(duration: string): number {
  const m = duration.match(/(\d+)\s*min/i);
  if (m) return parseInt(m[1]);
  const h = duration.match(/(\d+)\s*hr?/i);
  if (h) return parseInt(h[1]) * 60;
  return 999;
}

function nearestWalk(places: NearbyPlace[]): { name: string; minutes: number } | null {
  let best: { name: string; minutes: number } | null = null;
  for (const p of places) {
    for (const t of p.transportations) {
      if (t.type.toLowerCase().includes("walk")) {
        const mins = parseDurationMinutes(t.duration);
        if (!best || mins < best.minutes) best = { name: p.name, minutes: mins };
      }
    }
  }
  return best;
}

function walkabilityScore(places: NearbyPlace[]): number {
  const walkable = places.flatMap((p) =>
    p.transportations
      .filter((t) => t.type.toLowerCase().includes("walk"))
      .map((t) => parseDurationMinutes(t.duration))
  );
  if (walkable.length === 0) return 40;
  const under5  = walkable.filter((m) => m <=  5).length;
  const under10 = walkable.filter((m) => m <= 10).length;
  const under20 = walkable.filter((m) => m <= 20).length;
  // Floor at 20 when we have walkable data — prevents a hotel with far-away
  // walkable places scoring lower (10) than a hotel with no data (40).
  return Math.min(100, Math.max(20, under5 * 22 + (under10 - under5) * 14 + (under20 - under10) * 5 + 15));
}

// ── Neighborhood helpers ──────────────────────────────────────────────────────

function inferNeighborhoodFallback(hotel: ProviderHotel): string {
  const allText = [
    hotel.name, hotel.address, hotel.description,
    ...hotel.nearbyPlaces.map((p) => p.name),
  ].join(" ").toLowerCase();

  const patterns = [
    // Barcelona
    ["passeig de gràcia", "Eixample"],
    ["paseo de gracia",   "Eixample"],
    ["eixample",          "Eixample"],
    ["barri gòtic",       "Gothic Quarter"],
    ["barri gotic",       "Gothic Quarter"],
    ["gothic quarter",    "Gothic Quarter"],
    ["el born",           "El Born"],
    ["barceloneta",       "Barceloneta"],
    ["sarrià",            "Sarrià-Sant Gervasi"],
    ["sant gervasi",      "Sarrià-Sant Gervasi"],
    ["pedralbes",         "Sarrià-Sant Gervasi"],
    ["el raval",          "El Raval"],
    ["raval",             "El Raval"],
    ["poblenou",          "Poblenou"],
    ["sants",             "Sants-Montjuïc"],
    // Paris
    ["le marais",           "Le Marais"],
    ["saint-germain",       "Saint-Germain"],
    ["latin quarter",       "Latin Quarter"],
    ["quartier latin",      "Latin Quarter"],
    ["montmartre",          "Montmartre"],
    ["bastille",            "Bastille / 11th"],
    ["canal saint-martin",  "Canal Saint-Martin"],
    ["champs-élysées",      "Champs-Élysées / 8th"],
    ["champs elysees",      "Champs-Élysées / 8th"],
    ["louvre",              "Louvre / 1st"],
    ["eiffel",              "Eiffel Tower / 7th"],
    // London
    ["mayfair",         "Mayfair"],
    ["belgravia",       "Belgravia"],
    ["knightsbridge",   "Knightsbridge"],
    ["covent garden",   "Covent Garden"],
    ["notting hill",    "Notting Hill"],
    ["portobello",      "Notting Hill"],
    ["shoreditch",      "Shoreditch"],
    ["brick lane",      "Shoreditch"],
    ["south bank",      "South Bank"],
    ["borough market",  "South Bank"],
    ["southwark",       "South Bank"],
    ["tate modern",     "South Bank"],
    ["bloomsbury",      "Bloomsbury"],
    ["british museum",  "Bloomsbury"],
    ["kensington",      "Kensington"],
    ["chelsea",         "Chelsea"],
    ["soho",            "Soho"],
    ["westminster",     "Westminster"],
    ["buckingham",      "Westminster"],
    ["big ben",         "Westminster"],
    ["parliament",      "Westminster"],
    ["canary wharf",    "Canary Wharf"],
    ["hackney",         "Hackney"],
    ["brixton",         "Brixton"],
    ["stratford",       "Stratford"],
    ["king's cross",    "King's Cross"],
    ["kings cross",     "King's Cross"],
    // New York
    ["upper east side", "Upper East Side"],
    ["upper west side", "Upper West Side"],
    ["lower east side", "Lower East Side"],
    ["east village",    "East Village"],
    ["west village",    "West Village"],
    ["greenwich village","Greenwich Village"],
    ["washington square","Greenwich Village"],
    ["tribeca",         "TriBeCa"],
    ["soho",            "SoHo"],
    ["williamsburg",    "Williamsburg"],
    ["dumbo",           "DUMBO / Brooklyn"],
    ["financial district","Financial District"],
    ["wall street",     "Financial District"],
    ["battery park",    "Financial District"],
    ["times square",    "Midtown"],
    ["42nd street",     "Midtown"],
    ["midtown",         "Midtown"],
    ["fifth avenue",    "Midtown"],
    ["park avenue",     "Upper East Side"],
    ["central park",    "Midtown"],
    ["harlem",          "Harlem"],
    ["chelsea",         "Chelsea"],
    ["flatiron",        "Flatiron"],
    ["gramercy",        "Gramercy / Flatiron"],
    // Bangkok
    ["riverside",         "Riverside / Charoenkrung"],
    ["charoenkrung",      "Riverside / Charoenkrung"],
    ["chao phraya",       "Riverside / Charoenkrung"],
    ["rattanakosin",      "Rattanakosin"],
    ["grand palace",      "Rattanakosin"],
    ["wat pho",           "Rattanakosin"],
    ["khao san",          "Khao San Road"],
    ["khaosan",           "Khao San Road"],
    ["banglamphu",        "Khao San Road"],
    ["sukhumvit",         "Sukhumvit"],
    ["silom",             "Silom"],
    ["sathorn",           "Sathorn"],
    ["siam paragon",      "Siam"],
    ["patpong",           "Silom"],
    ["ploenchit",         "Ploenchit"],
    ["asok",              "Asok / Sukhumvit"],
    ["pratunam",          "Pratunam"],
    ["phaya thai",        "Phaya Thai"],
    // Singapore
    ["marina bay sands",  "Marina Bay"],
    ["marina bay",        "Marina Bay"],
    ["raffles place",     "Marina Bay / Raffles Place"],
    ["orchard road",      "Orchard Road"],
    ["sentosa",           "Sentosa Island"],
    ["chinatown",         "Chinatown"],
    ["tanjong pagar",     "Tanjong Pagar"],
    ["little india",      "Little India"],
    ["arab street",       "Arab Street / Kampong Glam"],
    ["kampong glam",      "Arab Street / Kampong Glam"],
    ["bugis",             "Bugis"],
    ["clarke quay",       "Clarke Quay"],
    ["robertson quay",    "Robertson Quay"],
    // Seoul
    ["gangnam",           "Gangnam"],
    ["cheongdam",         "Cheongdam / Gangnam"],
    ["apgujeong",         "Apgujeong / Gangnam"],
    ["myeongdong",        "Myeongdong"],
    ["namdaemun",         "Myeongdong / Jung-gu"],
    ["insadong",          "Insadong"],
    ["bukchon",           "Bukchon Hanok Village"],
    ["gyeongbokgung",     "Jongno / Insadong"],
    ["jongno",            "Jongno"],
    ["hongdae",           "Hongdae"],
    ["itaewon",           "Itaewon"],
    ["hannam",            "Hannam / Itaewon"],
    ["dongdaemun",        "Dongdaemun"],
    ["sinchon",           "Sinchon"],
    // Generic
    ["old town",        "Old Town"],
    ["historic center", "Historic Center"],
    ["city center",     "City Center"],
    ["city centre",     "City Centre"],
    ["downtown",        "Downtown"],
    ["waterfront",      "Waterfront"],
  ] as const;

  for (const [keyword, name] of patterns) {
    if (allText.includes(keyword)) return name;
  }
  return "";
}

/**
 * Look up a pre-calibrated neighborhood fit score for a specific city/pref combo.
 * Returns null when this city isn't in the table (falls back to dynamic scoring).
 */
function lookupCityNeighborhoodScore(
  destination: string,
  neighborhood: string,
  hotelAddress: string,
  pref: string,
): number | null {
  const destL  = destination.toLowerCase();
  const addrL  = hotelAddress.toLowerCase();
  const nbhdL  = neighborhood.toLowerCase();

  let cityKey: string | null = null;
  if (destL.includes("barcelona")) cityKey = "barcelona";
  if (destL.includes("tokyo") || destL.includes("tōkyō")) cityKey = "tokyo";
  if (destL.includes("london")) cityKey = "london";
  if (destL.includes("new york") || destL.includes("nyc")) cityKey = "new york";
  if (destL.includes("bangkok") || destL.includes("krung thep")) cityKey = "bangkok";
  if (destL.includes("singapore")) cityKey = "singapore";
  if (destL.includes("seoul") || destL.includes("서울")) cityKey = "seoul";
  if (!cityKey) return null;

  const prefTable = NEIGHBORHOOD_FIT_TABLES[cityKey]?.[pref];
  if (!prefTable) return null;

  // Sub-district detection: check address for more-specific areas
  if (cityKey === "tokyo") {
    if (addrL.includes("ginza"))         return prefTable["ginza"]        ?? prefTable["chuo city"]    ?? null;
    if (addrL.includes("asakusa"))       return prefTable["asakusa"]      ?? prefTable["taito city"]   ?? null;
    if (addrL.includes("roppongi"))      return prefTable["roppongi"]     ?? prefTable["minato city"]  ?? null;
    if (addrL.includes("azabu"))         return prefTable["azabu"]        ?? prefTable["minato city"]  ?? null;
    if (addrL.includes("akasaka"))       return prefTable["akasaka"]      ?? prefTable["minato city"]  ?? null;
    if (addrL.includes("omotesando"))    return prefTable["omotesando"]   ?? prefTable["shibuya city"] ?? null;
    if (addrL.includes("aoyama"))        return prefTable["aoyama"]       ?? prefTable["shibuya city"] ?? null;
    if (addrL.includes("harajuku"))      return prefTable["harajuku"]     ?? prefTable["shibuya city"] ?? null;
    if (addrL.includes("daikanyama"))    return prefTable["daikanyama"]   ?? prefTable["shibuya city"] ?? null;
    if (addrL.includes("ebisu"))         return prefTable["ebisu"]        ?? prefTable["shibuya city"] ?? null;
    if (addrL.includes("marunouchi"))    return prefTable["marunouchi"]   ?? prefTable["chiyoda city"] ?? null;
    if (addrL.includes("ueno"))          return prefTable["ueno"]         ?? prefTable["taito city"]   ?? null;
    if (addrL.includes("meguro"))        return prefTable["meguro"]       ?? prefTable["meguro city"]  ?? null;
    if (addrL.includes("shibuya"))       return prefTable["shibuya"]      ?? null;
    if (addrL.includes("shinjuku"))      return prefTable["shinjuku"]     ?? null;
    if (addrL.includes("shimokitazawa")) return prefTable["setagaya"]     ?? prefTable["shibuya city"] ?? null;
    // Outer wards — important for visitor/destination-fit scoring
    if (addrL.includes("ota city") || addrL.includes("ota-ku") || addrL.includes("ōta") || addrL.includes("haneda") || addrL.includes("kamata") || addrL.includes("omori") || (addrL.includes("sanno") && addrL.includes("ota"))) return prefTable["ota city"] ?? prefTable["ota-ku"] ?? null;
    if (addrL.includes("setagaya"))   return prefTable["setagaya"]    ?? prefTable["setagaya-ku"]  ?? null;
    if (addrL.includes("koto-ku") || addrL.includes("koto city"))  return prefTable["koto"]        ?? null;
    if (addrL.includes("sumida"))     return prefTable["sumida"]      ?? prefTable["sumida city"]  ?? null;
    if (addrL.includes("nerima"))     return prefTable["nerima"]      ?? null;
    if (addrL.includes("itabashi"))   return prefTable["itabashi"]    ?? null;
    if (addrL.includes("adachi"))     return prefTable["adachi"]      ?? null;
    if (addrL.includes("edogawa"))    return prefTable["edogawa"]     ?? null;
    if (addrL.includes("katsushika")) return prefTable["katsushika"]  ?? null;
    if (addrL.includes("kita city") || addrL.includes("kita-ku")) return prefTable["kita city"] ?? null;
    if (addrL.includes("shinagawa"))  return prefTable["shinagawa"]   ?? prefTable["shinagawa city"] ?? null;
  }

  if (cityKey === "barcelona") {
    if (addrL.includes("passeig de gràcia") || addrL.includes("paseo de gracia"))
      return prefTable["passeig de gràcia"] ?? prefTable["eixample"] ?? null;
    if (addrL.includes("barceloneta"))
      return prefTable["barceloneta"] ?? null;
    if (addrL.includes("el born") || addrL.includes("barri del born"))
      return prefTable["el born"] ?? null;
    if (addrL.includes("el raval") || (addrL.includes("raval") && !addrL.includes("naval")))
      return prefTable["el raval"] ?? null;
    if (addrL.includes("barri gòtic") || addrL.includes("barri gotic") || addrL.includes("gothic quarter"))
      return prefTable["gothic quarter"] ?? prefTable["barri gòtic"] ?? null;
    if (addrL.includes("poblenou"))   return prefTable["poblenou"]          ?? null;
    if (addrL.includes("pedralbes"))  return prefTable["pedralbes"]         ?? null;
    if (addrL.includes("sant gervasi"))  return prefTable["sant gervasi"]   ?? prefTable["sarrià-sant gervasi"] ?? null;
    if (addrL.includes("sarrià") || addrL.includes("sarria"))
      return prefTable["sarrià-sant gervasi"] ?? null;
    if (addrL.includes("sants") && !addrL.includes("sant andreu") && !addrL.includes("sant gervasi"))
      return prefTable["sants-montjuïc"] ?? null;
    if (addrL.includes("gràcia") || addrL.includes("gracia"))
      return prefTable["gràcia"] ?? null;
  }

  if (cityKey === "london") {
    if (addrL.includes("mayfair"))                                     return prefTable["mayfair"]       ?? null;
    if (addrL.includes("belgravia"))                                   return prefTable["belgravia"]     ?? null;
    if (addrL.includes("knightsbridge"))                               return prefTable["knightsbridge"] ?? null;
    if (addrL.includes("covent garden"))                               return prefTable["covent garden"] ?? null;
    if (addrL.includes("notting hill"))                                return prefTable["notting hill"]  ?? null;
    if (addrL.includes("shoreditch") || addrL.includes("brick lane")) return prefTable["shoreditch"]    ?? null;
    if (addrL.includes("south bank") || addrL.includes("southwark"))  return prefTable["south bank"]    ?? null;
    if (addrL.includes("bloomsbury"))                                  return prefTable["bloomsbury"]    ?? null;
    if (addrL.includes("kensington") && !addrL.includes("south kensington road")) return prefTable["kensington"] ?? null;
    if (addrL.includes("chelsea"))                                     return prefTable["chelsea"]       ?? null;
    if (addrL.includes("soho"))                                        return prefTable["soho"]          ?? null;
    if (addrL.includes("westminster"))                                 return prefTable["westminster"]   ?? null;
    if (addrL.includes("marylebone"))                                  return prefTable["marylebone"]    ?? null;
    if (addrL.includes("canary wharf"))                                return prefTable["canary wharf"]  ?? null;
    if (addrL.includes("hackney"))                                     return prefTable["hackney"]       ?? null;
    if (addrL.includes("brixton"))                                     return prefTable["brixton"]       ?? null;
    if (addrL.includes("peckham"))                                     return prefTable["peckham"]       ?? null;
    if (addrL.includes("stratford"))                                   return prefTable["stratford"]     ?? null;
    if (addrL.includes("king's cross") || addrL.includes("kings cross")) return prefTable["king's cross"] ?? prefTable["kings cross"] ?? null;
  }

  if (cityKey === "new york") {
    if (addrL.includes("upper east side"))   return prefTable["upper east side"]  ?? null;
    if (addrL.includes("upper west side"))   return prefTable["upper west side"]  ?? null;
    if (addrL.includes("lower east side"))   return prefTable["lower east side"]  ?? null;
    if (addrL.includes("east village"))      return prefTable["east village"]     ?? null;
    if (addrL.includes("west village"))      return prefTable["west village"]     ?? null;
    if (addrL.includes("greenwich village")) return prefTable["greenwich village"]?? null;
    if (addrL.includes("times square"))      return prefTable["times square"]     ?? prefTable["midtown"] ?? null;
    if (addrL.includes("tribeca") || addrL.includes("tri beca")) return prefTable["tribeca"] ?? null;
    if (addrL.includes("williamsburg"))      return prefTable["williamsburg"]     ?? null;
    if (addrL.includes("brooklyn"))          return prefTable["brooklyn heights"] ?? prefTable["williamsburg"] ?? null;
    if (addrL.includes("financial district") || addrL.includes("wall street") || addrL.includes("battery park")) return prefTable["financial district"] ?? null;
    if (addrL.includes("chelsea") && addrL.includes("new york")) return prefTable["chelsea"] ?? null;
    if (addrL.includes("soho") && (addrL.includes("new york") || addrL.includes("manhattan"))) return prefTable["soho"] ?? null;
    if (addrL.includes("harlem"))            return prefTable["harlem"]           ?? null;
    if (addrL.includes("midtown") || addrL.includes("5th ave") || addrL.includes("fifth ave") || addrL.includes("park ave")) return prefTable["midtown"] ?? null;
    if (addrL.includes("flatiron") || addrL.includes("gramercy") || addrL.includes("union square")) return prefTable["flatiron"] ?? null;
  }

  if (cityKey === "bangkok") {
    if (addrL.includes("riverside") || addrL.includes("charoenkrung") || addrL.includes("chao phraya")) return prefTable["riverside"] ?? prefTable["charoenkrung"] ?? null;
    if (addrL.includes("sathorn"))                                              return prefTable["sathorn"]     ?? null;
    if (addrL.includes("silom"))                                                return prefTable["silom"]       ?? null;
    if (addrL.includes("sukhumvit"))                                            return prefTable["sukhumvit"]   ?? null;
    if (addrL.includes("siam"))                                                 return prefTable["siam"]        ?? null;
    if (addrL.includes("rattanakosin") || addrL.includes("grand palace") || addrL.includes("phra nakhon")) return prefTable["rattanakosin"] ?? null;
    if (addrL.includes("khao san") || addrL.includes("khaosan") || addrL.includes("banglamphu")) return prefTable["khao san"] ?? null;
    if (addrL.includes("ploenchit"))                                            return prefTable["ploenchit"]   ?? null;
    if (addrL.includes("asok") || addrL.includes("asoke"))                     return prefTable["asok"]        ?? null;
    if (addrL.includes("nana"))                                                 return prefTable["nana"]        ?? null;
    if (addrL.includes("pratunam"))                                             return prefTable["pratunam"]    ?? null;
    if (addrL.includes("ari"))                                                  return prefTable["ari"]         ?? null;
    if (addrL.includes("phaya thai"))                                           return prefTable["phaya thai"]  ?? null;
    if (addrL.includes("on nut") || addrL.includes("onnut"))                   return prefTable["on nut"]      ?? null;
  }

  if (cityKey === "singapore") {
    if (addrL.includes("marina bay") || addrL.includes("raffles place") || addrL.includes("city hall")) return prefTable["marina bay"] ?? prefTable["city hall"] ?? null;
    if (addrL.includes("orchard"))                                              return prefTable["orchard road"] ?? null;
    if (addrL.includes("sentosa"))                                              return prefTable["sentosa"]     ?? null;
    if (addrL.includes("chinatown") || addrL.includes("tanjong pagar") || addrL.includes("telok ayer")) return prefTable["chinatown"] ?? prefTable["tanjong pagar"] ?? null;
    if (addrL.includes("little india") || addrL.includes("serangoon") || addrL.includes("mustafa")) return prefTable["little india"] ?? null;
    if (addrL.includes("arab street") || addrL.includes("kampong glam") || addrL.includes("bugis")) return prefTable["arab street"] ?? prefTable["bugis"] ?? null;
    if (addrL.includes("clarke quay") || addrL.includes("robertson quay"))     return prefTable["clarke quay"] ?? prefTable["robertson quay"] ?? null;
  }

  if (cityKey === "seoul") {
    if (addrL.includes("gangnam") || addrL.includes("apgujeong") || addrL.includes("cheongdam")) return prefTable["gangnam"] ?? prefTable["cheongdam"] ?? null;
    if (addrL.includes("myeongdong") || addrL.includes("namdaemun") || addrL.includes("jung-gu")) return prefTable["myeongdong"] ?? null;
    if (addrL.includes("insadong") || addrL.includes("bukchon") || addrL.includes("gyeongbokgung")) return prefTable["insadong"] ?? prefTable["jongno"] ?? null;
    if (addrL.includes("jongno"))                                               return prefTable["jongno"]      ?? null;
    if (addrL.includes("hongdae") || addrL.includes("mapo-gu"))                return prefTable["hongdae"]     ?? prefTable["mapo"] ?? null;
    if (addrL.includes("itaewon") || addrL.includes("yongsan") || addrL.includes("hannam")) return prefTable["itaewon"] ?? prefTable["hannam"] ?? null;
    if (addrL.includes("dongdaemun"))                                           return prefTable["dongdaemun"]  ?? null;
    if (addrL.includes("sinchon") || addrL.includes("ewha"))                   return prefTable["sinchon"]     ?? null;
  }

  // Exact match on neighborhood name
  if (prefTable[nbhdL] !== undefined) return prefTable[nbhdL];

  // Partial match: table key inside neighborhood name, or vice versa
  for (const [key, score] of Object.entries(prefTable)) {
    if (nbhdL.includes(key) || key.includes(nbhdL)) return score;
  }

  return null;
}

function computeNeighborhoodFit(
  hotel: ProviderHotel,
  prefs: string[],
  enrichment: PlacesEnrichment | undefined,
  inferredNeighborhood: string,
  destination: string,
): number {
  if (prefs.length === 0) return 0;

  let total = 0;

  for (const pref of prefs) {
    let score = 0;

    // ── City table lookup (highest priority) ──────────────────────────────────
    const tableScore = lookupCityNeighborhoodScore(
      destination,
      inferredNeighborhood,
      hotel.address + " " + hotel.name,
      pref,
    );

    if (tableScore !== null) {
      score = tableScore;
    } else if (enrichment) {
      // ── Places-based scoring ───────────────────────────────────────────────
      if (enrichment.bestFor.includes(pref)) score += 65;
      else                                   score += 12;

      if (pref === "transit" && enrichment.transitNote) {
        const m = enrichment.transitNote.match(/(\d+)\s*min/);
        const mins = m ? parseInt(m[1]) : 10;
        if (mins <= 3)       score += 28;
        else if (mins <= 7)  score += 18;
        else if (mins <= 12) score += 8;
      }

      const summLower = (enrichment.locationSummary + " " + enrichment.transitNote).toLowerCase();
      if (pref === "food"        && summLower.includes("dining"))    score += 15;
      if (pref === "walkable"    && summLower.includes("walkable"))  score += 15;
      if (pref === "sightseeing" && summLower.includes("sights"))    score += 15;
      if (pref === "quiet"       && summLower.includes("quiet"))     score += 15;
      if (pref === "nightlife"   && summLower.includes("nightlife")) score += 15;
    } else {
      // ── Keyword fallback (SerpAPI data only) ──────────────────────────────
      const signals = PREF_SIGNALS[pref];
      if (!signals) { total += 50; continue; }

      const walkMinutes = new Map<string, number>();
      for (const p of hotel.nearbyPlaces) {
        const mins = p.transportations
          .filter((t) => t.type.toLowerCase().includes("walk"))
          .map((t) => parseDurationMinutes(t.duration));
        if (mins.length > 0) walkMinutes.set(p.name.toLowerCase(), Math.min(...mins));
      }

      const nearbyNames = hotel.nearbyPlaces.map((p) => p.name.toLowerCase());
      const addrLower   = (hotel.address + " " + hotel.name).toLowerCase();
      const descLower   = hotel.description.toLowerCase();
      const amenLower   = hotel.amenities.map((a) => a.toLowerCase());

      outer:
      for (const term of signals.nearbyTerms) {
        const tl = term.toLowerCase();
        for (const nn of nearbyNames) {
          if (nn.includes(tl)) {
            const walk = walkMinutes.get(nn) ?? 999;
            if (walk <= 5)       score += 40;
            else if (walk <= 10) score += 28;
            else if (walk <= 20) score += 15;
            else                 score += 6;
            break outer;
          }
        }
      }
      let addrHits = 0;
      for (const t of signals.addressTerms) { if (addrLower.includes(t)) addrHits++; }
      score += Math.min(25, addrHits * 13);

      let descHits = 0;
      for (const t of signals.descTerms) { if (descLower.includes(t)) descHits++; }
      score += Math.min(20, descHits * 7);

      let amenHits = 0;
      for (const t of signals.amenityTerms) { if (amenLower.some((a) => a.includes(t))) amenHits++; }
      score += Math.min(25, amenHits * 12);

      if (pref === "luxury") {
        if (hotel.starRating >= 5)      score += 20;
        else if (hotel.starRating >= 4) score += 10;
      }
      if (pref === "budget") score += 12;
    }

    total += Math.min(100, score);
  }

  return Math.round(total / prefs.length);
}

function neighborhoodFitLabel(score: number, prefs: string[]): string {
  if (prefs.length === 0 || score === 0) return "";
  if (score >= 68) return "Great fit";
  if (score >= 42) return "Good fit";
  if (score >= 22) return "Partial fit";
  return "";
}

// ── Destination Fit ───────────────────────────────────────────────────────────
// Desirability score for a typical visitor to this city when no preferences are
// selected. Uses the "visitor" table in NEIGHBORHOOD_FIT_TABLES via the same
// lookup infrastructure as preference-based scoring. Returns 0 when the city
// or neighborhood is not in the table (formula gracefully falls back to original
// weights in that case).

function computeDestinationFit(
  destination: string,
  inferredNeighborhood: string,
  hotelAddressAndName: string,
): number {
  return lookupCityNeighborhoodScore(destination, inferredNeighborhood, hotelAddressAndName, "visitor") ?? 0;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreHotels(
  hotels: ProviderHotel[],
  prefs: string[],
  destination: string,
  enrichments: Map<string, PlacesEnrichment>,
): HotelOffer[] {
  const prices     = hotels.map((h) => h.pricePerNight);
  const minP       = Math.min(...prices);
  const maxP       = Math.max(...prices);
  const priceRange = Math.max(1, maxP - minP);

  return hotels.map((h) => {
    const enrichment = enrichments.get(h.sourceHotelId);

    const priceScore    = ((maxP - h.pricePerNight) / priceRange) * 100;
    const rawReviewScore = Math.min(100, (h.overallRating / 5) * 100);
    // Bayesian regression toward neutral (70) when review count is low.
    // Hotels with <200 reviews have their score partially shrunk toward 70.
    // This prevents a 5.0 from 3 reviews outscoring a 4.7 from 2,000 reviews.
    const reviewConfidence = h.reviewCount > 0 ? Math.min(1.0, h.reviewCount / 200) : 0;
    const reviewScore = h.reviewCount > 0
      ? Math.round(rawReviewScore * reviewConfidence + 70 * (1 - reviewConfidence))
      : 70;

    // Amplified review score: maps the realistic 3.0–5.0★ range to 0–100 so that
    // the gap between 3.9★ (→45) and 4.5★ (→75) is 30 pts instead of the raw 12 pts.
    // Stored in score_breakdown.reviews so "Why this score?" reflects actual ranking math.
    const reviewRankScore = Math.max(0, Math.min(100, Math.round((reviewScore - 60) / 40 * 100)));

    const locationScore = h.locationRating > 0 ? Math.min(100, (h.locationRating / 10) * 100) : 50;
    const starsScore    = h.starRating > 0 ? Math.min(100, (h.starRating / 5) * 100) : 40;
    const walkScore     = walkabilityScore(h.nearbyPlaces);

    // Quality floor: hotels with guest rating < 4.0 receive a pre-normalization
    // penalty that makes it harder to outrank well-reviewed competitors.
    // Dramatically cheaper hotels (top-25% price score) receive half the penalty.
    let qualityPenalty = 0;
    if (h.overallRating > 0 && h.overallRating < 4.0) {
      const basePenalty  = Math.round((4.0 - h.overallRating) * 15);
      const cheapDiscount = priceScore >= 75 && h.overallRating >= 3.6 ? 0.5 : 1.0;
      qualityPenalty = Math.round(basePenalty * cheapDiscount);
    }

    const baseScore = Math.round(
      priceScore        * 0.23 +
      reviewRankScore   * 0.32 +
      locationScore     * 0.20 +
      starsScore        * 0.14 +
      walkScore         * 0.11
    ) - qualityPenalty;

    // Compute inferred neighborhood before fit scoring (raw name needed for lookup)
    const raw_neighborhood =
      enrichment?.neighborhood || inferNeighborhoodFallback(h);
    // Normalize to user-friendly display name (e.g. "Chuo City" → "Ginza / Chuo")
    const inferred_neighborhood = normalizeNeighborhoodDisplay(raw_neighborhood, destination);

    const neighborhood_fit_score = computeNeighborhoodFit(
      h, prefs, enrichment, inferred_neighborhood, destination,
    );

    // Destination fit: how desirable is this neighborhood for a typical visitor?
    // Only used in no-prefs mode; 0 when city is not in the visitor table.
    const destinationFit = computeDestinationFit(
      destination,
      inferred_neighborhood,
      h.address + " " + h.name,
    );

    let ai_score: number;
    if (prefs.length === 0) {
      if (destinationFit > 0) {
        // Destination-fit-aware formula (supported cities).
        // Weights: Reviews 30% · Stars 18% · DestFit 18% · Location 16% · Price 14% · Walk 4%
        // reviewRankScore amplifies the 3.0–5.0★ band so a 0.5★ difference matters ~2.5× more.
        ai_score = Math.round(
          reviewRankScore * 0.30 +
          destinationFit  * 0.18 +
          starsScore      * 0.18 +
          locationScore   * 0.16 +
          priceScore      * 0.14 +
          walkScore       * 0.04
        ) - qualityPenalty;
      } else {
        // Original formula for cities without a visitor table (qualityPenalty already in baseScore).
        ai_score = baseScore;
      }
    } else if (prefs.length === 1 && prefs[0] === "budget") {
      // Budget mode: price dominates; use raw reviewScore so 3.9★ isn't crushed.
      ai_score = Math.round(
        priceScore        * 0.50 +
        reviewRankScore   * 0.25 +
        locationScore     * 0.10 +
        starsScore        * 0.08 +
        walkScore         * 0.07
      ) - Math.round(qualityPenalty * 0.4); // softer quality floor in budget mode
    } else {
      // Preference-aware mode:
      // NF 35% | Hotel Quality (stars) 25% | Reviews 20% | Price 10% | Walk 10%
      // This ensures a $60 budget hostel cannot beat a well-located luxury hotel
      // even if it has perfect price score.
      ai_score = Math.round(
        neighborhood_fit_score * 0.35 +
        starsScore             * 0.25 +
        reviewRankScore        * 0.20 +
        priceScore             * 0.10 +
        walkScore              * 0.10
      ) - qualityPenalty;
    }

    return {
      hotel_id:            h.sourceHotelId,
      source:              h.source,
      name:                h.name,
      address:             h.address,
      star_rating:         h.starRating,
      overall_rating:      h.overallRating,
      review_count:        h.reviewCount,
      location_rating:     h.locationRating,
      price_per_night:     h.pricePerNight,
      total_price:         h.totalPrice,
      nights:              0,
      currency:            h.currency,
      amenities:           h.amenities,
      image_url:           h.imageUrl,
      booking_url:         h.bookingUrl,
      check_in:            h.checkIn,
      check_out:           h.checkOut,
      hotel_type:          h.hotelType,
      eco_certified:       h.ecoCertified,
      description:         h.description,
      ai_score,
      recommendation_label: "",
      recommendation_why:   "",
      nearby_walk:         nearestWalk(h.nearbyPlaces),
      score_breakdown: {
        price:           Math.round(priceScore),
        reviews:         reviewRankScore, // amplified 3.0–5.0★ scale; drives "Why this score?" accuracy
        location:        Math.round(locationScore),
        stars:           Math.round(starsScore),
        walkability:     Math.round(walkScore),
        destination_fit: Math.round(destinationFit),
      },
      neighborhood_fit_score,
      inferred_neighborhood,
      latitude:  h.latitude,
      longitude: h.longitude,
      neighborhood_fit_label: (() => {
        let label = neighborhoodFitLabel(neighborhood_fit_score, prefs);
        // For Luxury: "Great fit" requires the hotel itself to be upscale.
        // A budget hostel in a great luxury area should not claim "Great fit".
        if (prefs.includes("luxury") && label === "Great fit") {
          const hotelQualityMet = starsScore >= 75 && reviewScore >= 80 && neighborhood_fit_score >= 80;
          if (!hotelQualityMet) {
            label = starsScore < 75 ? "Location fit, but basic hotel" : "Good area fit";
          }
        }
        return label;
      })(),
      location_summary: enrichment?.locationSummary ?? "",
      transit_note:     enrichment?.transitNote     ?? "",
      rank_position:      0,
      rank_bullets:       [],
      rank_weakness:      "",
      rating_sanity_note: "",
      extra_badges:       [],
    };
  });
}

// ── Label assignment ──────────────────────────────────────────────────────────

function assignLabels(scored: HotelOffer[], prefs: string[]): void {
  if (scored.length === 0) return;
  const claim = (h: HotelOffer, label: string) => { if (!h.recommendation_label) h.recommendation_label = label; };

  // Best Overall: when prefs are active, apply fit gates so the pick reflects
  // what the user actually asked for.
  let prefAwarePool = scored;
  if (prefs.length > 0) {
    const luxurySelected = prefs.includes("luxury");
    prefAwarePool = scored.filter((h) => {
      if (h.neighborhood_fit_score < 50) return false;
      // For luxury: also require meaningful hotel quality (≥ 3.5 stars → score ≥ 70)
      if (luxurySelected && h.score_breakdown.stars < 70) return false;
      return true;
    });
    // Relax to NF >= 40 if no hotels pass the strict gate
    if (prefAwarePool.length === 0) {
      prefAwarePool = scored.filter((h) => h.neighborhood_fit_score >= 40);
    }
    // Final fallback: use all hotels
    if (prefAwarePool.length === 0) prefAwarePool = scored;
  }
  const bestOverall = prefAwarePool.reduce((a, b) => b.ai_score > a.ai_score ? b : a);
  claim(bestOverall, "Best Overall");

  const lux = scored
    .filter((h) => h.star_rating >= 4 && !h.recommendation_label)
    .sort((a, b) => b.star_rating !== a.star_rating ? b.star_rating - a.star_rating : b.overall_rating - a.overall_rating)[0];
  if (lux) claim(lux, "Luxury Pick");

  const loc = scored
    .filter((h) => !h.recommendation_label)
    .sort((a, b) => (b.score_breakdown.location + b.score_breakdown.walkability) - (a.score_breakdown.location + a.score_breakdown.walkability))[0];
  if (loc) claim(loc, "Best Location");

  const budget = scored
    .filter((h) => h.overall_rating >= 3.5 && !h.recommendation_label)
    .sort((a, b) => a.price_per_night - b.price_per_night)[0];
  if (budget) claim(budget, "Budget Pick");

  const val = scored
    .filter((h) => !h.recommendation_label)
    .sort((a, b) =>
      (b.score_breakdown.reviews + b.score_breakdown.location - b.score_breakdown.price * 0.3) -
      (a.score_breakdown.reviews + a.score_breakdown.location - a.score_breakdown.price * 0.3)
    )[0];
  if (val) claim(val, "Best Value");

  // ── Extra category badges (coexist with primary label) ────────────────────
  const bestReviews = scored
    .filter((h) => h.overall_rating >= 4.5 && h.review_count >= 100)
    .sort((a, b) => b.overall_rating !== a.overall_rating ? b.overall_rating - a.overall_rating : b.review_count - a.review_count)[0];
  if (bestReviews) bestReviews.extra_badges.push("Best Reviews");

  const mostWalkable = scored
    .filter((h) => h.score_breakdown.walkability >= 65)
    .sort((a, b) => b.score_breakdown.walkability - a.score_breakdown.walkability)[0];
  if (mostWalkable) mostWalkable.extra_badges.push("Most Walkable");

  const bizPick = scored
    .filter((h) => h.star_rating >= 4 && h.overall_rating >= 4.0)
    .sort((a, b) =>
      (b.score_breakdown.location + b.score_breakdown.reviews - b.score_breakdown.price * 0.15) -
      (a.score_breakdown.location + a.score_breakdown.reviews - a.score_breakdown.price * 0.15)
    )[0];
  if (bizPick) bizPick.extra_badges.push("Business Pick");
}

// ── Recommendation text ───────────────────────────────────────────────────────

const PREF_DISPLAY: Record<string, string> = {
  "first-time":  "first-time visitors",
  "sightseeing": "sightseeing",
  "food":        "food lovers",
  "nightlife":   "nightlife",
  "quiet":       "a quiet stay",
  "luxury":      "luxury",
  "budget":      "budget travelers",
  "family":      "families",
  "transit":     "transit access",
  "walkable":    "walkability",
};

/** Returns a short positive description for a pref+score combo. */
function prefStrengthCopy(pref: string, score: number, neighborhood: string, cityKey: string | null): string {
  const high = score >= 75;
  const nbhdL = neighborhood.toLowerCase();

  if (high && cityKey === "tokyo") {
    if (pref === "luxury") {
      if (nbhdL.includes("ginza") || nbhdL.includes("chuo"))
        return "premium shopping, Michelin-starred restaurants, and upscale hotels";
      if (nbhdL.includes("roppongi") || nbhdL.includes("azabu") || nbhdL.includes("akasaka"))
        return "embassy district, high-end dining, and luxury hotels";
      if (nbhdL.includes("omotesando") || nbhdL.includes("aoyama"))
        return "luxury flagship boutiques and refined dining";
      if (nbhdL.includes("shibuya") || nbhdL.includes("daikanyama"))
        return "upscale shopping district with quality dining options";
    }
    if (pref === "quiet") {
      if (nbhdL.includes("meguro") || nbhdL.includes("daikanyama"))
        return "quiet, residential streets with a relaxed atmosphere";
      if (nbhdL.includes("aoyama") || nbhdL.includes("omotesando"))
        return "calm, leafy boulevards away from tourist crowds";
    }
    if (pref === "sightseeing" && (nbhdL.includes("asakusa") || nbhdL.includes("taito") || nbhdL.includes("ueno")))
      return "traditional temples, Senso-ji, and cultural landmarks";
    if (pref === "transit" && (nbhdL.includes("shinjuku") || nbhdL.includes("shibuya")))
      return "one of Tokyo's busiest transport hubs with direct lines everywhere";
  }
  if (high && cityKey === "barcelona") {
    if (pref === "luxury") {
      if (nbhdL.includes("passeig") || nbhdL.includes("eixample"))
        return "upscale shopping on Passeig de Gràcia, excellent fine dining";
      if (nbhdL.includes("sarrià") || nbhdL.includes("sant gervasi") || nbhdL.includes("pedralbes"))
        return "prestigious upscale residential area";
    }
    if (pref === "quiet") {
      if (nbhdL.includes("sarrià") || nbhdL.includes("sant gervasi") || nbhdL.includes("pedralbes"))
        return "quiet leafy residential streets";
      if (nbhdL.includes("gràcia") || nbhdL.includes("gracia"))
        return "relaxed village feel with quiet plazas";
    }
    if (pref === "food" && (nbhdL.includes("eixample") || nbhdL.includes("born")))
      return "exceptional restaurant density, Michelin-starred chefs";
    if (pref === "sightseeing" && (nbhdL.includes("gòtic") || nbhdL.includes("gothic") || nbhdL.includes("born")))
      return "surrounded by Barcelona's historic landmarks";
    if (pref === "nightlife" && (nbhdL.includes("raval") || nbhdL.includes("born") || nbhdL.includes("gòtic")))
      return "heart of Barcelona's nightlife and bar scene";
  }

  if (high && cityKey === "london") {
    if (pref === "luxury") {
      if (nbhdL.includes("mayfair") || nbhdL.includes("belgravia") || nbhdL.includes("st james"))
        return "London's most exclusive address — designer boutiques, Michelin dining, and world-class hotels";
      if (nbhdL.includes("knightsbridge") || nbhdL.includes("chelsea"))
        return "upscale boutiques, Harrods, and premium hotel options";
      if (nbhdL.includes("kensington"))
        return "prestigious residential address with excellent high-end hotels";
    }
    if (pref === "quiet") {
      if (nbhdL.includes("kensington") || nbhdL.includes("notting hill") || nbhdL.includes("chelsea"))
        return "leafy, residential streets away from tourist crowds";
    }
    if (pref === "sightseeing") {
      if (nbhdL.includes("westminster") || nbhdL.includes("south bank") || nbhdL.includes("covent garden"))
        return "walking distance to Big Ben, Tower of London, Tate Modern, and top museums";
      if (nbhdL.includes("bloomsbury"))
        return "British Museum, National Gallery, and literary London on the doorstep";
    }
    if (pref === "nightlife" && (nbhdL.includes("shoreditch") || nbhdL.includes("soho")))
      return "London's most vibrant bar and club scene";
    if (pref === "food") {
      if (nbhdL.includes("soho") || nbhdL.includes("covent garden"))
        return "some of London's best restaurants and street food";
      if (nbhdL.includes("shoreditch") || nbhdL.includes("brixton"))
        return "trendy street food markets, independent restaurants, and food halls";
    }
  }
  if (high && cityKey === "new york") {
    if (pref === "luxury") {
      if (nbhdL.includes("upper east side") || nbhdL.includes("tribeca") || nbhdL.includes("central park"))
        return "premium Manhattan address with world-class hotels and fine dining";
      if (nbhdL.includes("soho") || nbhdL.includes("west village"))
        return "upscale boutiques, Michelin-starred dining, and elegant hotels";
    }
    if (pref === "quiet") {
      if (nbhdL.includes("upper east side") || nbhdL.includes("upper west side"))
        return "one of Manhattan's most peaceful, residential neighborhoods";
    }
    if (pref === "sightseeing") {
      if (nbhdL.includes("midtown") || nbhdL.includes("times square"))
        return "steps from Times Square, Empire State Building, and Central Park";
      if (nbhdL.includes("financial district"))
        return "near 9/11 Memorial, Statue of Liberty ferry, and Brooklyn Bridge";
    }
    if (pref === "nightlife" && (nbhdL.includes("lower east side") || nbhdL.includes("east village") || nbhdL.includes("williamsburg")))
      return "NYC's best bar-hopping streets with late-night venues and live music";
    if (pref === "food" && (nbhdL.includes("west village") || nbhdL.includes("soho") || nbhdL.includes("east village")))
      return "some of New York's most acclaimed restaurants and food culture";
  }

  if (high && cityKey === "bangkok") {
    if (pref === "luxury") {
      if (nbhdL.includes("riverside") || nbhdL.includes("charoenkrung"))
        return "Bangkok's finest riverside luxury hotels with iconic Chao Phraya views";
      if (nbhdL.includes("sathorn") || nbhdL.includes("silom"))
        return "upscale business district hotels with rooftop bars and fine dining";
    }
    if (pref === "sightseeing" && (nbhdL.includes("rattanakosin") || nbhdL.includes("khao san")))
      return "steps from the Grand Palace, Wat Pho, and the heart of historic Bangkok";
    if (pref === "nightlife" && (nbhdL.includes("sukhumvit") || nbhdL.includes("nana") || nbhdL.includes("asok")))
      return "Bangkok's most vibrant entertainment and nightlife strip";
    if (pref === "food" && (nbhdL.includes("riverside") || nbhdL.includes("sukhumvit") || nbhdL.includes("ari")))
      return "excellent street food, rooftop dining, and Bangkok's most celebrated restaurants";
  }
  if (high && cityKey === "singapore") {
    if (pref === "luxury" && (nbhdL.includes("marina bay") || nbhdL.includes("raffles")))
      return "Singapore's iconic Marina Bay with world-class hotels, infinity pools, and Gardens by the Bay";
    if (pref === "food" && (nbhdL.includes("chinatown") || nbhdL.includes("arab street") || nbhdL.includes("little india") || nbhdL.includes("tanjong pagar")))
      return "Singapore's hawker culture heartland — Michelin-rated stalls, diverse cuisines, and legendary food courts";
    if (pref === "sightseeing" && nbhdL.includes("marina bay"))
      return "Gardens by the Bay, Marina Bay Sands, and Singapore's most photographed skyline";
    if (pref === "family" && nbhdL.includes("sentosa"))
      return "Universal Studios Singapore, S.E.A. Aquarium, and family resorts on Sentosa Island";
    if (pref === "nightlife" && (nbhdL.includes("clarke quay") || nbhdL.includes("robertson quay") || nbhdL.includes("tanjong pagar")))
      return "Singapore's most vibrant nightlife strip with bars, clubs, and waterfront dining";
  }
  if (high && cityKey === "seoul") {
    if (pref === "luxury" && (nbhdL.includes("gangnam") || nbhdL.includes("cheongdam") || nbhdL.includes("apgujeong")))
      return "Seoul's most prestigious district — luxury hotels, designer boutiques, and Michelin-starred dining";
    if (pref === "nightlife" && (nbhdL.includes("hongdae") || nbhdL.includes("itaewon")))
      return "Seoul's legendary club and bar district, alive until dawn with world-class DJs and venues";
    if (pref === "sightseeing" && (nbhdL.includes("insadong") || nbhdL.includes("jongno") || nbhdL.includes("bukchon")))
      return "Gyeongbokgung Palace, Bukchon Hanok Village, and Seoul's historic heart";
    if (pref === "food" && (nbhdL.includes("itaewon") || nbhdL.includes("hongdae") || nbhdL.includes("myeongdong")))
      return "Seoul's most diverse food scene — Korean BBQ, global cuisine, and street food culture";
    if (pref === "first-time" && nbhdL.includes("myeongdong"))
      return "the beating heart of Seoul tourism — shopping, street food, and easy access to every major sight";
  }

  switch (pref) {
    case "luxury":      return high ? "excellent luxury options"          : "moderate luxury offering";
    case "quiet":       return high ? "quiet, residential atmosphere"     : "reasonably quiet";
    case "food":        return high ? "outstanding local dining scene"    : "solid restaurant selection";
    case "sightseeing": return high ? "prime sightseeing location"        : "good access to attractions";
    case "transit":     return high ? "excellent transit links"           : "decent transit access";
    case "nightlife":   return high ? "vibrant nightlife scene"           : "some evening options";
    case "first-time":  return high ? "ideal first-visit location"        : "accessible for newcomers";
    case "walkable":    return high ? "highly walkable streets"           : "walkable area";
    case "budget":      return high ? "budget-friendly neighborhood"      : "moderate local prices";
    case "family":      return high ? "family-friendly neighborhood"      : "suitable for families";
    default:            return high ? "excellent match"                   : "decent match";
  }
}

/** Returns an adjective for the "less X than Y" comparison. */
function prefAdjective(pref: string): string {
  const map: Record<string, string> = {
    luxury: "upscale", quiet: "quiet", food: "dining-focused",
    sightseeing: "tourist-centric", transit: "transit-connected",
    nightlife: "lively", "first-time": "tourist-central",
    walkable: "walkable", budget: "budget-friendly", family: "family-oriented",
  };
  return map[pref] ?? pref;
}

function buildWhy(
  h: HotelOffer,
  all: HotelOffer[],
  prefs: string[],
  _enrichment: PlacesEnrichment | undefined,
  _destination: string,
): string {
  // Hotel-specific, non-neighborhood explanation.
  // Neighbourhood is already shown in the card badge; this focuses on what makes
  // THIS property stand out — amenities, reviews, value, proximity.
  const parts: string[] = [];
  const cheapest  = all.reduce((a, b) => a.price_per_night <= b.price_per_night ? a : b);
  const avgPrice  = all.reduce((s, x) => s + x.price_per_night, 0) / all.length;
  const avgRating = all.reduce((s, x) => s + x.overall_rating,  0) / all.length;

  if (h.overall_rating >= 4.8 && h.review_count >= 50) {
    parts.push(`exceptional guest reviews — ${h.overall_rating.toFixed(1)}★ from ${h.review_count.toLocaleString()} guests`);
  } else if (h.overall_rating >= 4.5 && h.overall_rating > avgRating + 0.15 && h.review_count >= 50) {
    parts.push(`one of the highest-rated options in this search (${h.overall_rating.toFixed(1)}★)`);
  } else if (h.overall_rating >= 4.3 && h.review_count >= 500) {
    parts.push(`${h.review_count.toLocaleString()} guest reviews at ${h.overall_rating.toFixed(1)}★`);
  }

  const premiumOrder = ["Rooftop pool", "Infinity pool", "Pool", "Spa", "Free breakfast", "Airport shuttle", "Restaurant"];
  const topAmenity = h.amenities.find((a) =>
    premiumOrder.some((pa) => a.toLowerCase().includes(pa.toLowerCase()))
  );
  if (topAmenity && parts.length < 2) parts.push(`includes ${topAmenity.toLowerCase()}`);

  if (h.nearby_walk && h.nearby_walk.minutes <= 3 && parts.length < 2) {
    parts.push(`${h.nearby_walk.name} is ${h.nearby_walk.minutes} min walk`);
  }

  const priceDiff = Math.round(h.price_per_night - cheapest.price_per_night);
  if (priceDiff <= 0) {
    parts.push("lowest-priced option in this search");
  } else if (h.price_per_night < avgPrice * 0.82 && parts.length < 3) {
    parts.push("competitive pricing for this search");
  }

  if (parts.length === 0) {
    const starStr = h.star_rating > 0 ? `${h.star_rating}-star ` : "";
    return `${starStr}${h.hotel_type.toLowerCase()} in this search.`;
  }
  if (parts.length === 1) {
    const [a] = parts;
    return `${a.charAt(0).toUpperCase()}${a.slice(1)}.`;
  }
  const [first, ...rest] = parts;
  const joined = rest.length === 1
    ? `and ${rest[0]}`
    : `${rest.slice(0, -1).join(", ")}, and ${rest[rest.length - 1]}`;
  return `${first.charAt(0).toUpperCase()}${first.slice(1)}, ${joined}.`;
}

// ── Score normalization ───────────────────────────────────────────────────────
// Stretches ai_score to a 45–97 range so results span ~50 points rather than
// clustering in 80–86 (typical for a set of 4-star city hotels).
function normalizeAiScores(hotels: HotelOffer[]): void {
  if (hotels.length < 3) return;
  const scores = hotels.map((h) => h.ai_score);
  const minS   = Math.min(...scores);
  const maxS   = Math.max(...scores);
  const spread = maxS - minS;
  if (spread < 1) return;
  for (const h of hotels) {
    h.ai_score = Math.round(45 + ((h.ai_score - minS) / spread) * 52);
  }
}

// ── Per-hotel rank explanations ───────────────────────────────────────────────
// Called after sorting. Sets rank_position, rank_bullets (hotel-specific reasons
// why it sits at this rank), and rank_weakness (what the hotel above does better).
function buildRankExplanations(sorted: HotelOffer[], prefs: string[]): void {
  if (sorted.length === 0) return;
  const prefsActive = prefs.length > 0;
  const avgRating   = sorted.reduce((s, h) => s + h.overall_rating,  0) / sorted.length;
  const avgPrice    = sorted.reduce((s, h) => s + h.price_per_night, 0) / sorted.length;

  for (let i = 0; i < sorted.length; i++) {
    const h     = sorted[i];
    const above = i > 0 ? sorted[i - 1] : null;
    h.rank_position = i + 1;

    const bullets: string[] = [];

    // Guest reviews
    if (h.overall_rating >= 4.7 && h.review_count >= 100) {
      bullets.push(`Outstanding guest reviews — ${h.overall_rating.toFixed(1)}★ from ${h.review_count.toLocaleString()} guests`);
    } else if (h.overall_rating >= 4.4 && h.overall_rating >= avgRating + 0.1 && h.review_count >= 50) {
      bullets.push(`Above-average guest reviews — ${h.overall_rating.toFixed(1)}★ from ${h.review_count.toLocaleString()} guests`);
    } else if (above && h.score_breakdown.reviews > above.score_breakdown.reviews + 5) {
      bullets.push(`Stronger guest reviews than the hotel ranked above (${h.overall_rating.toFixed(1)} vs ${above.overall_rating.toFixed(1)}★)`);
    }

    // Price / value
    if (above && h.price_per_night < above.price_per_night - 20) {
      bullets.push(`$${Math.round(above.price_per_night - h.price_per_night)}/night less than the hotel ranked above`);
    } else if (h.price_per_night < avgPrice * 0.78) {
      const pctBelow = Math.round((1 - h.price_per_night / avgPrice) * 100);
      bullets.push(`Strong value — ${pctBelow}% below the search average`);
    } else if (h.score_breakdown.price >= 80) {
      bullets.push("Competitive pricing for this search");
    }

    // Hotel quality / stars
    if (h.star_rating >= 5 && bullets.length < 3) {
      bullets.push("5-star hotel");
    } else if (h.star_rating >= 4 && h.score_breakdown.stars >= 85 && h.overall_rating >= 4.3 && bullets.length < 3) {
      bullets.push("Highly-rated 4-star property");
    }

    // Neighborhood / destination fit
    if (prefsActive && h.neighborhood_fit_score >= 78 && bullets.length < 3) {
      const pl = PREF_DISPLAY[prefs[0]] ?? prefs[0];
      bullets.push(`Great match for ${pl} travelers`);
    } else if (!prefsActive && h.score_breakdown.destination_fit >= 85 && bullets.length < 3) {
      bullets.push("Well-positioned for exploring the area");
    } else if (!prefsActive && h.score_breakdown.destination_fit >= 70 && bullets.length < 3) {
      bullets.push("Good location for sightseeing");
    }

    // Walkability
    if (h.score_breakdown.walkability >= 82 && bullets.length < 3) {
      if (h.nearby_walk && h.nearby_walk.minutes <= 5) {
        bullets.push(`Excellent walkability — ${h.nearby_walk.name} is ${h.nearby_walk.minutes} min away`);
      } else {
        bullets.push("Excellent walkability — easy to get around on foot");
      }
    }

    // Premium amenities
    if (bullets.length < 3) {
      const prem = h.amenities.filter((a) => {
        const al = a.toLowerCase();
        return al.includes("pool") || al.includes("spa") || al.includes("breakfast") || al.includes("rooftop");
      });
      if (prem.length >= 2) {
        bullets.push(`Includes ${prem[0].toLowerCase()} and ${prem[1].toLowerCase()}`);
      } else if (prem.length === 1) {
        bullets.push(`Includes ${prem[0].toLowerCase()}`);
      }
    }

    // Fallback
    if (bullets.length === 0) {
      const starStr = h.star_rating > 0 ? `${h.star_rating}-star ` : "";
      bullets.push(`${starStr}hotel in this search`);
    }

    // Weakness vs hotel ranked above
    let weakness = "";
    if (above) {
      const dimGaps = [
        { label: "guest satisfaction", delta: above.score_breakdown.reviews         - h.score_breakdown.reviews         },
        { label: "hotel quality",      delta: above.score_breakdown.stars           - h.score_breakdown.stars           },
        { label: "destination fit",    delta: above.score_breakdown.destination_fit - h.score_breakdown.destination_fit },
        { label: "location",           delta: above.score_breakdown.location        - h.score_breakdown.location        },
        { label: "walkability",        delta: above.score_breakdown.walkability     - h.score_breakdown.walkability     },
      ].filter((g) => g.delta > 8).sort((a, b) => b.delta - a.delta);

      const aboveShort = above.name.split(/\s+/).slice(0, 3).join(" ");
      const priceDiff  = h.price_per_night - above.price_per_night;

      if (dimGaps.length > 0) {
        weakness = `Lower ${dimGaps[0].label} than ${aboveShort}`;
      } else if (priceDiff > 20) {
        weakness = `$${Math.round(priceDiff)}/night more than ${aboveShort}`;
      } else if (above.ai_score - h.ai_score < 5) {
        weakness = "Nearly tied — very close to the hotel above";
      } else {
        weakness = `Overall score behind ${aboveShort}`;
      }
    }

    h.rank_bullets  = bullets.slice(0, 3);
    h.rank_weakness = weakness;

    // Rating sanity note: if this hotel is ranked above one with >0.5★ higher rating,
    // show an explicit explanation so users never see an unexplained surprise.
    const below = i < sorted.length - 1 ? sorted[i + 1] : null;
    let ratingNote = "";
    if (below && below.overall_rating > h.overall_rating + 0.5 && below.overall_rating >= 4.0) {
      const reasons: string[] = [];
      if (h.score_breakdown.price         > below.score_breakdown.price         + 12) reasons.push("better value");
      if (h.score_breakdown.destination_fit > below.score_breakdown.destination_fit + 8) reasons.push("stronger location fit");
      if (h.score_breakdown.location      > below.score_breakdown.location      + 8)  reasons.push("better location score");
      if (h.neighborhood_fit_score        > below.neighborhood_fit_score        + 8)  reasons.push("stronger neighborhood fit");
      if (h.score_breakdown.stars         > below.score_breakdown.stars         + 8)  reasons.push("higher hotel quality");
      if (h.score_breakdown.walkability   > below.score_breakdown.walkability   + 15) reasons.push("better walkability");
      const ratingStr = `${h.overall_rating.toFixed(1)}★ vs ${below.overall_rating.toFixed(1)}★`;
      if (reasons.length >= 2) {
        ratingNote = `Lower guest rating (${ratingStr}) offset by ${reasons.slice(0, 2).join(" and ")}.`;
      } else if (reasons.length === 1) {
        ratingNote = `Lower guest rating (${ratingStr}), but ${reasons[0]} compensates.`;
      } else {
        ratingNote = `Lower guest rating (${ratingStr}) — higher overall score from location and value factors.`;
      }
    }
    h.rating_sanity_note = ratingNote;
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function deduplicateHotels(hotels: ProviderHotel[]): ProviderHotel[] {
  const seen = new Map<string, ProviderHotel>();
  for (const h of hotels) {
    const key = h.name.toLowerCase().replace(/\W+/g, " ").trim();
    const existing = seen.get(key);
    if (!existing || h.pricePerNight < existing.pricePerNight) seen.set(key, h);
  }
  return [...seen.values()];
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const n = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000);
  return n > 0 ? n : 1;
}

// ── POST /api/hotels/search ───────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ status: "error", message: "Invalid JSON." }, { status: 400 }); }

  const destination        = (body.destination as string | undefined)?.trim() ?? "";
  const check_in           = (body.check_in    as string | undefined)?.trim() ?? "";
  const check_out          = (body.check_out   as string | undefined)?.trim() ?? "";
  const guests             = Math.max(1, Math.min(8, Number(body.guests ?? 2)));
  const rooms              = Math.max(1, Math.min(4, Number(body.rooms  ?? 1)));
  const neighborhood_prefs = Array.isArray(body.neighborhood_prefs)
    ? (body.neighborhood_prefs as unknown[]).filter((p): p is string => typeof p === "string" && p in PREF_SIGNALS)
    : [];

  if (!destination || !check_in || !check_out) {
    return NextResponse.json({ status: "error", message: "destination, check_in, and check_out are required." }, { status: 400 });
  }

  const serpApiKey   = (process.env.SERPAPI_API_KEY      ?? "").trim();
  const placesApiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();

  if (!serpApiKey) {
    return NextResponse.json({ status: "not_configured", message: "Hotel search is temporarily unavailable." }, { status: 200 });
  }

  const nights = nightsBetween(check_in, check_out);

  const serpResult = await searchGoogleHotels({ destination, check_in, check_out, guests, rooms }, serpApiKey);

  if (serpResult.hotels.length === 0) {
    return NextResponse.json({ status: "empty", message: `No hotels found for "${destination}". Try a different city name.`, offers: [] });
  }

  const deduped = deduplicateHotels(serpResult.hotels);
  console.log(`[hotels] pages=${serpResult.pagesFetched}  raw=${serpResult.rawCount}  deduped=${deduped.length}  prefs=[${neighborhood_prefs.join(",")}]  places=${!!placesApiKey}  (serp=${serpResult.latencyMs}ms)`);

  let enrichments = new Map<string, PlacesEnrichment>();
  if (placesApiKey) {
    enrichments = await enrichWithGooglePlaces(deduped, destination, placesApiKey);
  }

  const scored = scoreHotels(deduped, neighborhood_prefs, destination, enrichments).map((h) => ({ ...h, nights }));

  // Stretch scores to 45–97 before sorting so results always span ~50 points.
  normalizeAiScores(scored);

  scored.sort((a, b) =>
    b.ai_score !== a.ai_score ? b.ai_score - a.ai_score : a.price_per_night - b.price_per_night
  );

  assignLabels(scored, neighborhood_prefs);
  buildRankExplanations(scored, neighborhood_prefs);

  for (const h of scored) {
    h.recommendation_why = buildWhy(h, scored, neighborhood_prefs, enrichments.get(h.hotel_id), destination);
  }

  const nbhdCount = new Set(scored.map((h) => h.inferred_neighborhood).filter(Boolean)).size;
  console.log(
    `[pipeline] raw_hotels_retrieved=${serpResult.rawCount}  deduped_hotels=${deduped.length}  neighborhood_count=${nbhdCount}  offers=${scored.length}  (reranked=${neighborhood_prefs.length > 0 ? scored.length : 0})`
  );
  console.log(`Raw hotels: ${serpResult.rawCount}\nDeduped hotels: ${deduped.length}\nNeighborhoods: ${nbhdCount}`);

  return NextResponse.json({
    status: "ok",
    destination,
    check_in,
    check_out,
    nights,
    guests,
    rooms,
    neighborhood_prefs,
    places_enriched: enrichments.size > 0,
    offer_count: scored.length,
    offers: scored,
  });
}

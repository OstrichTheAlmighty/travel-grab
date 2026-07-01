import type { BoundingBox } from "../../activities/lib/types";

export interface CityConfig {
  name: string;
  country: string;
  countryCode: string;
  bbox: BoundingBox;
}

// ── 100-city catalog ─────────────────────────────────────────────────────────

export const CITY_CONFIGS: Record<string, CityConfig> = {
  // ── North America ──────────────────────────────────────────────────────────
  "new-york": {
    name: "New York", country: "United States", countryCode: "US",
    bbox: { minLng: -74.26, minLat: 40.49, maxLng: -73.69, maxLat: 40.92 },
  },
  "los-angeles": {
    name: "Los Angeles", country: "United States", countryCode: "US",
    bbox: { minLng: -118.67, minLat: 33.70, maxLng: -117.91, maxLat: 34.35 },
  },
  "chicago": {
    name: "Chicago", country: "United States", countryCode: "US",
    bbox: { minLng: -87.94, minLat: 41.64, maxLng: -87.52, maxLat: 42.07 },
  },
  "san-francisco": {
    name: "San Francisco", country: "United States", countryCode: "US",
    bbox: { minLng: -122.54, minLat: 37.70, maxLng: -122.35, maxLat: 37.83 },
  },
  "miami": {
    name: "Miami", country: "United States", countryCode: "US",
    bbox: { minLng: -80.32, minLat: 25.62, maxLng: -80.12, maxLat: 25.89 },
  },
  "boston": {
    name: "Boston", country: "United States", countryCode: "US",
    bbox: { minLng: -71.19, minLat: 42.23, maxLng: -70.99, maxLat: 42.40 },
  },
  "toronto": {
    name: "Toronto", country: "Canada", countryCode: "CA",
    bbox: { minLng: -79.64, minLat: 43.58, maxLng: -79.23, maxLat: 43.86 },
  },
  "vancouver": {
    name: "Vancouver", country: "Canada", countryCode: "CA",
    bbox: { minLng: -123.27, minLat: 49.19, maxLng: -123.02, maxLat: 49.32 },
  },
  "honolulu": {
    name: "Honolulu", country: "United States", countryCode: "US",
    bbox: { minLng: -158.08, minLat: 21.24, maxLng: -157.65, maxLat: 21.41 },
  },

  // ── Latin America ──────────────────────────────────────────────────────────
  "mexico-city": {
    name: "Mexico City", country: "Mexico", countryCode: "MX",
    bbox: { minLng: -99.36, minLat: 19.27, maxLng: -99.00, maxLat: 19.60 },
  },
  "rio-de-janeiro": {
    name: "Rio de Janeiro", country: "Brazil", countryCode: "BR",
    bbox: { minLng: -43.79, minLat: -23.08, maxLng: -43.10, maxLat: -22.74 },
  },
  "buenos-aires": {
    name: "Buenos Aires", country: "Argentina", countryCode: "AR",
    bbox: { minLng: -58.53, minLat: -34.73, maxLng: -58.33, maxLat: -34.53 },
  },

  // ── Western Europe ─────────────────────────────────────────────────────────
  "london": {
    name: "London", country: "United Kingdom", countryCode: "GB",
    bbox: { minLng: -0.51, minLat: 51.38, maxLng: 0.34, maxLat: 51.67 },
  },
  "paris": {
    name: "Paris", country: "France", countryCode: "FR",
    bbox: { minLng: 2.22, minLat: 48.81, maxLng: 2.47, maxLat: 48.91 },
  },
  "amsterdam": {
    name: "Amsterdam", country: "Netherlands", countryCode: "NL",
    bbox: { minLng: 4.73, minLat: 52.28, maxLng: 5.07, maxLat: 52.43 },
  },
  "berlin": {
    name: "Berlin", country: "Germany", countryCode: "DE",
    bbox: { minLng: 13.09, minLat: 52.34, maxLng: 13.76, maxLat: 52.68 },
  },
  "munich": {
    name: "Munich", country: "Germany", countryCode: "DE",
    bbox: { minLng: 11.43, minLat: 48.05, maxLng: 11.72, maxLat: 48.24 },
  },
  "frankfurt": {
    name: "Frankfurt", country: "Germany", countryCode: "DE",
    bbox: { minLng: 8.57, minLat: 50.01, maxLng: 8.80, maxLat: 50.18 },
  },
  "zurich": {
    name: "Zurich", country: "Switzerland", countryCode: "CH",
    bbox: { minLng: 8.47, minLat: 47.31, maxLng: 8.62, maxLat: 47.44 },
  },
  "geneva": {
    name: "Geneva", country: "Switzerland", countryCode: "CH",
    bbox: { minLng: 6.06, minLat: 46.17, maxLng: 6.25, maxLat: 46.27 },
  },
  "stockholm": {
    name: "Stockholm", country: "Sweden", countryCode: "SE",
    bbox: { minLng: 17.75, minLat: 59.25, maxLng: 18.20, maxLat: 59.42 },
  },
  "copenhagen": {
    name: "Copenhagen", country: "Denmark", countryCode: "DK",
    bbox: { minLng: 12.46, minLat: 55.60, maxLng: 12.69, maxLat: 55.74 },
  },
  "oslo": {
    name: "Oslo", country: "Norway", countryCode: "NO",
    bbox: { minLng: 10.61, minLat: 59.86, maxLng: 10.84, maxLat: 59.97 },
  },
  "helsinki": {
    name: "Helsinki", country: "Finland", countryCode: "FI",
    bbox: { minLng: 24.84, minLat: 60.12, maxLng: 25.12, maxLat: 60.30 },
  },
  "reykjavik": {
    name: "Reykjavik", country: "Iceland", countryCode: "IS",
    bbox: { minLng: -22.07, minLat: 64.08, maxLng: -21.78, maxLat: 64.17 },
  },
  "dublin": {
    name: "Dublin", country: "Ireland", countryCode: "IE",
    bbox: { minLng: -6.40, minLat: 53.28, maxLng: -6.11, maxLat: 53.41 },
  },
  "edinburgh": {
    name: "Edinburgh", country: "United Kingdom", countryCode: "GB",
    bbox: { minLng: -3.34, minLat: 55.88, maxLng: -3.10, maxLat: 55.99 },
  },
  "lisbon": {
    name: "Lisbon", country: "Portugal", countryCode: "PT",
    bbox: { minLng: -9.23, minLat: 38.69, maxLng: -9.07, maxLat: 38.80 },
  },
  "madrid": {
    name: "Madrid", country: "Spain", countryCode: "ES",
    bbox: { minLng: -3.84, minLat: 40.30, maxLng: -3.52, maxLat: 40.54 },
  },
  "porto": {
    name: "Porto", country: "Portugal", countryCode: "PT",
    bbox: { minLng: -8.69, minLat: 41.12, maxLng: -8.57, maxLat: 41.18 },
  },

  // ── Southern Europe ────────────────────────────────────────────────────────
  "rome": {
    name: "Rome", country: "Italy", countryCode: "IT",
    bbox: { minLng: 12.36, minLat: 41.79, maxLng: 12.61, maxLat: 41.98 },
  },
  "milan": {
    name: "Milan", country: "Italy", countryCode: "IT",
    bbox: { minLng: 9.04, minLat: 45.39, maxLng: 9.28, maxLat: 45.54 },
  },
  "florence": {
    name: "Florence", country: "Italy", countryCode: "IT",
    bbox: { minLng: 11.21, minLat: 43.73, maxLng: 11.33, maxLat: 43.81 },
  },
  "venice": {
    name: "Venice", country: "Italy", countryCode: "IT",
    bbox: { minLng: 12.27, minLat: 45.38, maxLng: 12.38, maxLat: 45.46 },
  },
  "naples": {
    name: "Naples", country: "Italy", countryCode: "IT",
    bbox: { minLng: 14.15, minLat: 40.81, maxLng: 14.30, maxLat: 40.88 },
  },
  "barcelona": {
    name: "Barcelona", country: "Spain", countryCode: "ES",
    bbox: { minLng: 2.05, minLat: 41.32, maxLng: 2.23, maxLat: 41.47 },
  },
  "athens": {
    name: "Athens", country: "Greece", countryCode: "GR",
    bbox: { minLng: 23.63, minLat: 37.94, maxLng: 23.80, maxLat: 38.02 },
  },
  "santorini": {
    name: "Santorini", country: "Greece", countryCode: "GR",
    bbox: { minLng: 25.35, minLat: 36.37, maxLng: 25.48, maxLat: 36.48 },
  },
  "mykonos": {
    name: "Mykonos", country: "Greece", countryCode: "GR",
    bbox: { minLng: 25.31, minLat: 37.40, maxLng: 25.41, maxLat: 37.47 },
  },
  "dubrovnik": {
    name: "Dubrovnik", country: "Croatia", countryCode: "HR",
    bbox: { minLng: 18.05, minLat: 42.63, maxLng: 18.13, maxLat: 42.66 },
  },
  "split": {
    name: "Split", country: "Croatia", countryCode: "HR",
    bbox: { minLng: 16.40, minLat: 43.49, maxLng: 16.49, maxLat: 43.55 },
  },
  "valletta": {
    name: "Valletta", country: "Malta", countryCode: "MT",
    bbox: { minLng: 14.49, minLat: 35.88, maxLng: 14.53, maxLat: 35.91 },
  },
  "monaco": {
    name: "Monaco", country: "Monaco", countryCode: "MC",
    bbox: { minLng: 7.39, minLat: 43.72, maxLng: 7.44, maxLat: 43.75 },
  },

  // ── Central & Eastern Europe ───────────────────────────────────────────────
  "prague": {
    name: "Prague", country: "Czech Republic", countryCode: "CZ",
    bbox: { minLng: 14.28, minLat: 49.94, maxLng: 14.67, maxLat: 50.18 },
  },
  "vienna": {
    name: "Vienna", country: "Austria", countryCode: "AT",
    bbox: { minLng: 16.18, minLat: 48.12, maxLng: 16.58, maxLat: 48.32 },
  },
  "budapest": {
    name: "Budapest", country: "Hungary", countryCode: "HU",
    bbox: { minLng: 18.91, minLat: 47.43, maxLng: 19.12, maxLat: 47.59 },
  },
  "warsaw": {
    name: "Warsaw", country: "Poland", countryCode: "PL",
    bbox: { minLng: 20.85, minLat: 52.10, maxLng: 21.27, maxLat: 52.37 },
  },
  "krakow": {
    name: "Krakow", country: "Poland", countryCode: "PL",
    bbox: { minLng: 19.88, minLat: 49.97, maxLng: 20.10, maxLat: 50.08 },
  },
  "bucharest": {
    name: "Bucharest", country: "Romania", countryCode: "RO",
    bbox: { minLng: 25.97, minLat: 44.37, maxLng: 26.21, maxLat: 44.49 },
  },
  "belgrade": {
    name: "Belgrade", country: "Serbia", countryCode: "RS",
    bbox: { minLng: 20.35, minLat: 44.73, maxLng: 20.56, maxLat: 44.86 },
  },
  "zagreb": {
    name: "Zagreb", country: "Croatia", countryCode: "HR",
    bbox: { minLng: 15.87, minLat: 45.75, maxLng: 16.06, maxLat: 45.86 },
  },
  "ljubljana": {
    name: "Ljubljana", country: "Slovenia", countryCode: "SI",
    bbox: { minLng: 14.47, minLat: 46.02, maxLng: 14.57, maxLat: 46.09 },
  },

  // ── Middle East & Africa ───────────────────────────────────────────────────
  "istanbul": {
    name: "Istanbul", country: "Turkey", countryCode: "TR",
    bbox: { minLng: 28.63, minLat: 40.91, maxLng: 29.19, maxLat: 41.18 },
  },
  "dubai": {
    name: "Dubai", country: "United Arab Emirates", countryCode: "AE",
    bbox: { minLng: 55.03, minLat: 25.00, maxLng: 55.58, maxLat: 25.32 },
  },
  "abu-dhabi": {
    name: "Abu Dhabi", country: "United Arab Emirates", countryCode: "AE",
    bbox: { minLng: 54.27, minLat: 24.35, maxLng: 54.68, maxLat: 24.57 },
  },
  "doha": {
    name: "Doha", country: "Qatar", countryCode: "QA",
    bbox: { minLng: 51.44, minLat: 25.22, maxLng: 51.57, maxLat: 25.35 },
  },
  "muscat": {
    name: "Muscat", country: "Oman", countryCode: "OM",
    bbox: { minLng: 58.47, minLat: 23.55, maxLng: 58.62, maxLat: 23.64 },
  },
  "tel-aviv": {
    name: "Tel Aviv", country: "Israel", countryCode: "IL",
    bbox: { minLng: 34.73, minLat: 31.99, maxLng: 34.84, maxLat: 32.10 },
  },
  "amman": {
    name: "Amman", country: "Jordan", countryCode: "JO",
    bbox: { minLng: 35.84, minLat: 31.94, maxLng: 35.97, maxLat: 32.02 },
  },
  "cairo": {
    name: "Cairo", country: "Egypt", countryCode: "EG",
    bbox: { minLng: 31.17, minLat: 29.98, maxLng: 31.36, maxLat: 30.12 },
  },
  "cape-town": {
    name: "Cape Town", country: "South Africa", countryCode: "ZA",
    bbox: { minLng: 18.35, minLat: -34.10, maxLng: 18.55, maxLat: -33.85 },
  },
  "marrakech": {
    name: "Marrakech", country: "Morocco", countryCode: "MA",
    bbox: { minLng: -8.07, minLat: 31.58, maxLng: -7.97, maxLat: 31.67 },
  },
  "fez": {
    name: "Fez", country: "Morocco", countryCode: "MA",
    bbox: { minLng: -5.01, minLat: 34.02, maxLng: -4.95, maxLat: 34.08 },
  },

  // ── South Asia ─────────────────────────────────────────────────────────────
  "mumbai": {
    name: "Mumbai", country: "India", countryCode: "IN",
    bbox: { minLng: 72.77, minLat: 18.87, maxLng: 72.99, maxLat: 19.28 },
  },
  "delhi": {
    name: "Delhi", country: "India", countryCode: "IN",
    bbox: { minLng: 76.85, minLat: 28.43, maxLng: 77.35, maxLat: 28.77 },
  },
  "colombo": {
    name: "Colombo", country: "Sri Lanka", countryCode: "LK",
    bbox: { minLng: 79.83, minLat: 6.84, maxLng: 79.91, maxLat: 6.96 },
  },
  "kathmandu": {
    name: "Kathmandu", country: "Nepal", countryCode: "NP",
    bbox: { minLng: 85.28, minLat: 27.66, maxLng: 85.39, maxLat: 27.74 },
  },

  // ── Southeast Asia ─────────────────────────────────────────────────────────
  "bangkok": {
    name: "Bangkok", country: "Thailand", countryCode: "TH",
    bbox: { minLng: 100.33, minLat: 13.61, maxLng: 100.93, maxLat: 13.97 },
  },
  "singapore": {
    name: "Singapore", country: "Singapore", countryCode: "SG",
    bbox: { minLng: 103.60, minLat: 1.21, maxLng: 104.05, maxLat: 1.47 },
  },
  "kuala-lumpur": {
    name: "Kuala Lumpur", country: "Malaysia", countryCode: "MY",
    bbox: { minLng: 101.55, minLat: 3.02, maxLng: 101.77, maxLat: 3.24 },
  },
  "manila": {
    name: "Manila", country: "Philippines", countryCode: "PH",
    bbox: { minLng: 120.96, minLat: 14.54, maxLng: 121.13, maxLat: 14.70 },
  },
  "ho-chi-minh-city": {
    name: "Ho Chi Minh City", country: "Vietnam", countryCode: "VN",
    bbox: { minLng: 106.59, minLat: 10.74, maxLng: 106.82, maxLat: 10.88 },
  },
  "hanoi": {
    name: "Hanoi", country: "Vietnam", countryCode: "VN",
    bbox: { minLng: 105.78, minLat: 20.98, maxLng: 105.90, maxLat: 21.07 },
  },
  "siem-reap": {
    name: "Siem Reap", country: "Cambodia", countryCode: "KH",
    bbox: { minLng: 103.82, minLat: 13.35, maxLng: 103.88, maxLat: 13.41 },
  },
  "luang-prabang": {
    name: "Luang Prabang", country: "Laos", countryCode: "LA",
    bbox: { minLng: 102.11, minLat: 19.85, maxLng: 102.16, maxLat: 19.91 },
  },
  "chiang-mai": {
    name: "Chiang Mai", country: "Thailand", countryCode: "TH",
    bbox: { minLng: 98.91, minLat: 18.75, maxLng: 99.02, maxLat: 18.84 },
  },
  "phuket": {
    name: "Phuket", country: "Thailand", countryCode: "TH",
    bbox: { minLng: 98.28, minLat: 7.83, maxLng: 98.45, maxLat: 7.97 },
  },

  // ── East Asia ──────────────────────────────────────────────────────────────
  "tokyo": {
    name: "Tokyo", country: "Japan", countryCode: "JP",
    bbox: { minLng: 139.55, minLat: 35.50, maxLng: 139.95, maxLat: 35.80 },
  },
  "kyoto": {
    name: "Kyoto", country: "Japan", countryCode: "JP",
    bbox: { minLng: 135.68, minLat: 34.96, maxLng: 135.82, maxLat: 35.07 },
  },
  "osaka": {
    name: "Osaka", country: "Japan", countryCode: "JP",
    bbox: { minLng: 135.42, minLat: 34.62, maxLng: 135.66, maxLat: 34.74 },
  },
  "nara": {
    name: "Nara", country: "Japan", countryCode: "JP",
    bbox: { minLng: 135.80, minLat: 34.67, maxLng: 135.86, maxLat: 34.72 },
  },
  "sapporo": {
    name: "Sapporo", country: "Japan", countryCode: "JP",
    bbox: { minLng: 141.30, minLat: 43.03, maxLng: 141.45, maxLat: 43.12 },
  },
  "seoul": {
    name: "Seoul", country: "South Korea", countryCode: "KR",
    bbox: { minLng: 126.73, minLat: 37.43, maxLng: 127.18, maxLat: 37.70 },
  },
  "busan": {
    name: "Busan", country: "South Korea", countryCode: "KR",
    bbox: { minLng: 129.02, minLat: 35.06, maxLng: 129.16, maxLat: 35.21 },
  },
  "jeju": {
    name: "Jeju", country: "South Korea", countryCode: "KR",
    bbox: { minLng: 126.50, minLat: 33.35, maxLng: 126.75, maxLat: 33.55 },
  },
  "taipei": {
    name: "Taipei", country: "Taiwan", countryCode: "TW",
    bbox: { minLng: 121.44, minLat: 25.00, maxLng: 121.65, maxLat: 25.18 },
  },
  "hong-kong": {
    name: "Hong Kong", country: "China", countryCode: "HK",
    bbox: { minLng: 113.83, minLat: 22.15, maxLng: 114.41, maxLat: 22.56 },
  },
  "macau": {
    name: "Macau", country: "China", countryCode: "MO",
    bbox: { minLng: 113.53, minLat: 22.19, maxLng: 113.60, maxLat: 22.23 },
  },
  "shanghai": {
    name: "Shanghai", country: "China", countryCode: "CN",
    bbox: { minLng: 121.36, minLat: 31.14, maxLng: 121.66, maxLat: 31.34 },
  },
  "beijing": {
    name: "Beijing", country: "China", countryCode: "CN",
    bbox: { minLng: 116.21, minLat: 39.76, maxLng: 116.61, maxLat: 40.09 },
  },

  // ── Pacific & Oceania ──────────────────────────────────────────────────────
  "ubud": {
    name: "Ubud", country: "Indonesia", countryCode: "ID",
    bbox: { minLng: 115.24, minLat: -8.56, maxLng: 115.30, maxLat: -8.49 },
  },
  "bali": {
    name: "Bali", country: "Indonesia", countryCode: "ID",
    bbox: { minLng: 115.14, minLat: -8.74, maxLng: 115.21, maxLat: -8.65 },
  },
  "sydney": {
    name: "Sydney", country: "Australia", countryCode: "AU",
    bbox: { minLng: 150.93, minLat: -33.94, maxLng: 151.33, maxLat: -33.73 },
  },
  "melbourne": {
    name: "Melbourne", country: "Australia", countryCode: "AU",
    bbox: { minLng: 144.86, minLat: -37.88, maxLng: 145.05, maxLat: -37.77 },
  },
  "brisbane": {
    name: "Brisbane", country: "Australia", countryCode: "AU",
    bbox: { minLng: 152.90, minLat: -27.55, maxLng: 153.07, maxLat: -27.43 },
  },
  "perth": {
    name: "Perth", country: "Australia", countryCode: "AU",
    bbox: { minLng: 115.77, minLat: -31.99, maxLng: 115.92, maxLat: -31.92 },
  },
  "auckland": {
    name: "Auckland", country: "New Zealand", countryCode: "NZ",
    bbox: { minLng: 174.70, minLat: -36.94, maxLng: 174.80, maxLat: -36.83 },
  },
  "queenstown": {
    name: "Queenstown", country: "New Zealand", countryCode: "NZ",
    bbox: { minLng: 168.64, minLat: -45.04, maxLng: 168.70, maxLat: -45.02 },
  },
  "nadi": {
    name: "Nadi", country: "Fiji", countryCode: "FJ",
    bbox: { minLng: 177.41, minLat: -17.82, maxLng: 177.48, maxLat: -17.74 },
  },
  "papeete": {
    name: "Papeete", country: "French Polynesia", countryCode: "PF",
    bbox: { minLng: -149.60, minLat: -17.55, maxLng: -149.54, maxLat: -17.52 },
  },
};

export const ALL_CITY_KEYS = Object.keys(CITY_CONFIGS);

export const PILOT_CITY_KEYS: string[] = [
  "paris",
  "london",
  "new-york",
  "barcelona",
  "bangkok",
];

export function cityKeyFromName(name: string): string | undefined {
  const lower = name.toLowerCase().replace(/\s+/g, "-");
  if (lower in CITY_CONFIGS) return lower;
  return ALL_CITY_KEYS.find(
    (key) => CITY_CONFIGS[key].name.toLowerCase() === name.toLowerCase(),
  );
}

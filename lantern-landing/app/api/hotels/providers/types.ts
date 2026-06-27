export type HotelSource = "google_hotels" | "liteapi";

// Kept here so the scoring pipeline compiles after Google Places enrichment was removed.
// Enrichments are always an empty Map now; the fields default gracefully in scoreHotels().
export interface PlacesEnrichment {
  neighborhood:    string;
  locationSummary: string;
  transitNote:     string;
  bestFor:         string[];
  lat:             number;
  lng:             number;
  source:          "places";
}

export interface NearbyTransportation {
  type: string;       // "Walking", "Subway", "Bus", etc.
  duration: string;   // "5 min", "10 min"
}

export interface NearbyPlace {
  name: string;
  transportations: NearbyTransportation[];
}

export interface ProviderHotel {
  source: HotelSource;
  sourceHotelId: string;
  name: string;
  address: string;
  starRating: number;       // 1–5 parsed from "4-star hotel"
  overallRating: number;    // 0–5 (e.g. 4.6)
  reviewCount: number;
  locationRating: number;   // 0–10 (Google location score)
  pricePerNight: number;
  totalPrice: number;       // across all nights
  currency: string;
  amenities: string[];
  nearbyPlaces: NearbyPlace[];
  imageUrl: string;
  imageUrls: string[];
  bookingUrl: string;
  checkIn: string;          // ISO date
  checkOut: string;
  hotelType: string;        // "Hotel", "Hostel", "Motel", etc.
  ecoCertified: boolean;
  description: string;
  latitude?: number;
  longitude?: number;
}

export interface HotelSearchParams {
  destination: string;
  check_in: string;    // YYYY-MM-DD
  check_out: string;
  guests: number;
  rooms: number;
}

export interface HotelProviderResult {
  hotels: ProviderHotel[];
  rawCount: number;
  pagesFetched: number;
  requestUrl: string;
  latencyMs: number;
}

// Shared trip store (v2) — single source of truth across Flights, Hotels, Activities, Itinerary pages
// All reads/writes use localStorage; safe to call from client components only.

import type { PlannerOutput } from "@/lib/itinerary/types";

export type TravelStyle =
  | "first_time_highlights"
  | "food_focused"
  | "culture_history"
  | "hidden_gems"
  | "luxury"
  | "budget"
  | "family"
  | "nightlife"
  | "relaxed"
  | "packed";

export const TRAVEL_STYLE_LABELS: Record<TravelStyle, string> = {
  first_time_highlights: "First-time highlights",
  food_focused:          "Food & culinary",
  culture_history:       "Culture & history",
  hidden_gems:           "Hidden gems",
  luxury:                "Luxury",
  budget:                "Budget savvy",
  family:                "Family-friendly",
  nightlife:             "Nightlife",
  relaxed:               "Slow & relaxed",
  packed:                "Packed schedule",
};

export interface TripCityStop {
  city: string;
  days: number;
}

export interface TripSelectedFlight {
  flightKey:          string;
  airline:            string;
  airlineCode:        string;
  flightNumber:       string;
  origin:             string;
  destination:        string;
  departTime:         string;
  arriveTime:         string;
  duration:           string;
  stops:              number;
  stopLabel:          string;
  price:              number;
  currency:           string;
  returnOrigin?:      string;
  returnDestination?: string;
  returnDepartTime?:  string;
  returnArriveTime?:  string;
  returnDuration?:    string;
  returnStopLabel?:   string;
}

export interface TripSelectedHotel {
  hotelId:       string;
  name:          string;
  neighborhood:  string;
  address:       string;
  lat?:          number;
  lng?:          number;
  pricePerNight: number;
  currency:      string;
  rating:        number;
  imageUrl:      string;
  aiScore:       number;
}

export interface TripStoreV2 {
  version:             2;
  destinationRegion:   string;
  cityStops:           TripCityStop[];
  startDate:           string;
  travelers:           number;
  travelStyle:         TravelStyle | null;
  firstTime:           boolean | null;
  wakeTime:            string;
  bedTime:             string;
  pace:                "relaxed" | "balanced" | "packed";
  transit:             "walking" | "public transit" | "taxi" | "mixed";
  selectedFlight:      TripSelectedFlight | null;
  selectedHotel:       TripSelectedHotel | null;
  manualArrivalTime:   string;
  manualDepartureTime: string;
  manualHotelName:     string;
  excludedActivityIds: string[];
  itinerary:           PlannerOutput | null;
  itineraryGeneratedAt: string | null;
}

export const TRIP_STORE_KEY = "travelgrab_trip_v2";

export const TRIP_STORE_DEFAULT: TripStoreV2 = {
  version:              2,
  destinationRegion:    "",
  cityStops:            [],
  startDate:            "",
  travelers:            1,
  travelStyle:          null,
  firstTime:            null,
  wakeTime:             "08:00",
  bedTime:              "22:00",
  pace:                 "balanced",
  transit:              "public transit",
  selectedFlight:       null,
  selectedHotel:        null,
  manualArrivalTime:    "",
  manualDepartureTime:  "",
  manualHotelName:      "",
  excludedActivityIds:  [],
  itinerary:            null,
  itineraryGeneratedAt: null,
};

export function readTripStore(): TripStoreV2 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TRIP_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TripStoreV2;
    if (parsed.version === 2) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeTripStore(store: TripStoreV2): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(TRIP_STORE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

export function updateTripStore(patch: Partial<Omit<TripStoreV2, "version">>): TripStoreV2 {
  const base = readTripStore() ?? { ...TRIP_STORE_DEFAULT };
  const updated: TripStoreV2 = { ...base, ...patch };
  writeTripStore(updated);
  return updated;
}

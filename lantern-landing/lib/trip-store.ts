// Central trip store — single localStorage key shared by Flights, Hotels, Activities, Itinerary.
// Key: "travelgrab_trip"  Version: 3
// Client-only (never call from server components).

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

export interface TripStore {
  version:             3;
  destinationRegion:   string;
  cityStops:           TripCityStop[];
  startDate:           string;
  tripLength:          number;
  travelers:           number;
  travelStyles:        TravelStyle[];
  firstTime:           boolean | null;
  // Preferences used by itinerary generation
  wakeTime:            string;
  bedTime:             string;
  pace:                "relaxed" | "balanced" | "packed";
  transit:             "walking" | "public transit" | "taxi" | "mixed";
  // Cross-page selections
  selectedFlight:      TripSelectedFlight | null;
  selectedHotels:      Record<string, TripSelectedHotel>;   // keyed by city name
  savedActivities:     string[];                            // activity IDs
  // Legacy itinerary fields
  manualArrivalTime:   string;
  manualDepartureTime: string;
  manualHotelName:     string;
  excludedActivityIds: string[];
  itinerary:           PlannerOutput | null;
  itineraryGeneratedAt: string | null;
}

export const TRIP_STORE_KEY = "travelgrab_trip";

export const TRIP_STORE_DEFAULT: TripStore = {
  version:              3,
  destinationRegion:    "",
  cityStops:            [],
  startDate:            "",
  tripLength:           7,
  travelers:            1,
  travelStyles:         [],
  firstTime:            null,
  wakeTime:             "08:00",
  bedTime:              "22:00",
  pace:                 "balanced",
  transit:              "public transit",
  selectedFlight:       null,
  selectedHotels:       {},
  savedActivities:      [],
  manualArrivalTime:    "",
  manualDepartureTime:  "",
  manualHotelName:      "",
  excludedActivityIds:  [],
  itinerary:            null,
  itineraryGeneratedAt: null,
};

export function readTripStore(): TripStore | null {
  if (typeof window === "undefined") return null;
  try {
    // Try canonical v3 key
    const raw = localStorage.getItem(TRIP_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TripStore;
      if (parsed.version === 3) return parsed;
    }
    // Migrate from v2 key (previous implementation)
    const v2raw = localStorage.getItem("travelgrab_trip_v2");
    if (v2raw) {
      const v2 = JSON.parse(v2raw) as Record<string, unknown>;
      if (v2.version === 2 && Array.isArray(v2.cityStops) && (v2.cityStops as unknown[]).length > 0) {
        const migrated: TripStore = {
          ...TRIP_STORE_DEFAULT,
          destinationRegion:    (v2.destinationRegion as string) ?? "",
          cityStops:            v2.cityStops as TripCityStop[],
          startDate:            (v2.startDate as string) ?? "",
          tripLength:           (v2.cityStops as TripCityStop[]).reduce((s, c) => s + (c.days || 0), 0),
          travelStyles:         v2.travelStyle ? [v2.travelStyle as TravelStyle] : [],
          firstTime:            (v2.firstTime as boolean | null) ?? null,
          wakeTime:             (v2.wakeTime as string) ?? "08:00",
          bedTime:              (v2.bedTime as string) ?? "22:00",
          pace:                 (v2.pace as TripStore["pace"]) ?? "balanced",
          transit:              (v2.transit as TripStore["transit"]) ?? "public transit",
          selectedFlight:       (v2.selectedFlight as TripSelectedFlight | null) ?? null,
          selectedHotels:       v2.selectedHotel
            ? { [(v2.cityStops as TripCityStop[])[0]?.city ?? "hotel"]: v2.selectedHotel as TripSelectedHotel }
            : {},
          excludedActivityIds:  (v2.excludedActivityIds as string[]) ?? [],
          itinerary:            (v2.itinerary as PlannerOutput | null) ?? null,
          itineraryGeneratedAt: (v2.itineraryGeneratedAt as string | null) ?? null,
        };
        writeTripStore(migrated);
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeTripStore(store: TripStore): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(TRIP_STORE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

export function updateTripStore(patch: Partial<Omit<TripStore, "version">>): TripStore {
  const base = readTripStore() ?? { ...TRIP_STORE_DEFAULT };
  const updated: TripStore = { ...base, ...patch };
  writeTripStore(updated);
  return updated;
}

export function clearTripStore(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TRIP_STORE_KEY);
    localStorage.removeItem("travelgrab_trip_v2");
    localStorage.removeItem("travelgrab_itinerary_trip_v1");
    localStorage.removeItem("travelgrab_selected_hotel_v1");
    localStorage.removeItem("travelgrab_selected_flight_v1");
  } catch { /* ignore */ }
}

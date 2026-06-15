// ── Provider abstraction types ────────────────────────────────────────────────
// Add new provider sources here as they are integrated.
export type ProviderSource = "duffel" | "amadeus" | "google_flights";

// Normalized offer shape every provider must produce.
// Provider-specific raw data is preserved in rawProviderData for debugging.
export interface ProviderOffer {
  source: ProviderSource;
  sourceOfferId: string;
  airline: string;
  airlineCode: string;
  flightNumbers: string[];        // e.g. ["UA 232"] or ["UA 232", "UA 101"] for connections
  origin: string;                 // IATA
  destination: string;            // IATA
  departureTime: string;          // ISO 8601 with offset, e.g. "2026-06-16T08:00:00-07:00"
  arrivalTime: string;            // ISO 8601 with offset
  durationMinutes: number;        // total outbound trip time including layovers
  stops: number;
  connectionAirports: string;     // comma-separated IATA codes of layover airports (empty if nonstop)
  cabin: string;                  // "Economy", "Premium Economy", "Business", "First"
  baggage: string;                // human-readable, e.g. "1 checked bag" or ""
  price: number;                  // total price as float
  currency: string;               // ISO 4217, e.g. "USD"
  isBookableInTravelGrab: boolean; // true → user can complete booking in-app; false → search-only
  bookingUrl?: string;            // deep-link for non-bookable offers
  fareBrand?: string;             // e.g. "Basic Economy", "Main Cabin", "Business Flex"
  rawProviderData?: unknown;      // full raw response object for debugging
}

// Parameters every provider receives.
export interface SearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  adults: number;
  cabin_class: string;
  trip_type: string;
}

// Per-offer row for the debug panel.
export interface PerOfferDebugRow {
  airline: string;
  airlineCode: string;
  owner: string;
  price: string;
  stops: number;
  offerId: string;
  source: ProviderSource;
}

// Debug data a provider returns alongside its offers.
export interface ProviderDebugInfo {
  httpStatus?: number;
  latencyMs: number;
  rawOfferCount: number;
  requestPayloadJson: string;
  perOfferRows: PerOfferDebugRow[];
}

// What every provider.search() call returns.
export interface ProviderResult {
  offers: ProviderOffer[];
  debug: ProviderDebugInfo;
}

// Contract every provider must satisfy.
export interface FlightSearchProvider {
  readonly name: string;
  readonly source: ProviderSource;
  search(params: SearchParams): Promise<ProviderResult>;
}

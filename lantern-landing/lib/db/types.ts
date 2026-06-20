import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  trips,
  tripPreferences,
  tripFlights,
  tripHotels,
  savedActivities,
  tripActivities,
  itineraryDrafts,
  itineraryDays,
  itinerarySlots,
  transitMatrix,
  itineraryEdits,
} from "./schema";

// ── Select types (full rows returned from DB) ─────────────────────────────────

export type Trip             = InferSelectModel<typeof trips>;
export type TripPreferences  = InferSelectModel<typeof tripPreferences>;
export type TripFlight       = InferSelectModel<typeof tripFlights>;
export type TripHotel        = InferSelectModel<typeof tripHotels>;
export type SavedActivity    = InferSelectModel<typeof savedActivities>;
export type TripActivity     = InferSelectModel<typeof tripActivities>;
export type ItineraryDraft   = InferSelectModel<typeof itineraryDrafts>;
export type ItineraryDay     = InferSelectModel<typeof itineraryDays>;
export type ItinerarySlot    = InferSelectModel<typeof itinerarySlots>;
export type TransitMatrix    = InferSelectModel<typeof transitMatrix>;
export type ItineraryEdit    = InferSelectModel<typeof itineraryEdits>;

// ── Insert types (used for INSERT queries) ────────────────────────────────────

export type NewTrip             = InferInsertModel<typeof trips>;
export type NewTripPreferences  = InferInsertModel<typeof tripPreferences>;
export type NewTripFlight       = InferInsertModel<typeof tripFlights>;
export type NewTripHotel        = InferInsertModel<typeof tripHotels>;
export type NewSavedActivity    = InferInsertModel<typeof savedActivities>;
export type NewTripActivity     = InferInsertModel<typeof tripActivities>;
export type NewItineraryDraft   = InferInsertModel<typeof itineraryDrafts>;
export type NewItineraryDay     = InferInsertModel<typeof itineraryDays>;
export type NewItinerarySlot    = InferInsertModel<typeof itinerarySlots>;
export type NewTransitMatrix    = InferInsertModel<typeof transitMatrix>;
export type NewItineraryEdit    = InferInsertModel<typeof itineraryEdits>;

// ── Composite response shapes used by API routes ──────────────────────────────

export interface TripWithRelations extends Trip {
  preferences: TripPreferences | null;
  flights:     TripFlight[];
  hotels:      TripHotel[];
  activities:  TripActivity[];
}

export interface ItineraryWithDays extends ItineraryDraft {
  days: Array<ItineraryDay & { slots: ItinerarySlot[] }>;
}

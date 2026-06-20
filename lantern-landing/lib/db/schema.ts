import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  date,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Shared column helpers ─────────────────────────────────────────────────────

const pk   = () => uuid("id").defaultRandom().primaryKey();
const now  = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow();

// ── trips ─────────────────────────────────────────────────────────────────────

export const trips = pgTable("trips", {
  id:           pk(),
  deviceId:     text("device_id").notNull(),
  destination:  text("destination").notNull(),
  city:         text("city").notNull(),
  country:      text("country").notNull(),
  startDate:    date("start_date").notNull(),
  endDate:      date("end_date").notNull(),
  numTravelers: integer("num_travelers").notNull().default(1),
  status:       text("status").notNull().default("draft"),
  createdAt:    now(),
  updatedAt:    updatedAt(),
}, (t) => [
  index("trips_device_id_idx").on(t.deviceId),
  index("trips_status_idx").on(t.status),
]);

// ── trip_preferences ──────────────────────────────────────────────────────────

export const tripPreferences = pgTable("trip_preferences", {
  id:                   pk(),
  tripId:               uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),

  wakeTimeMinutes:      integer("wake_time_minutes").notNull().default(480),
  sleepTimeMinutes:     integer("sleep_time_minutes").notNull().default(1320),
  pace:                 text("pace").notNull().default("moderate"),

  originTimezone:       text("origin_timezone"),
  flightArrivalAt:      timestamp("flight_arrival_at", { withTimezone: true }),
  jetLagDays:           integer("jet_lag_days").notNull().default(0),

  categoryWeights:      jsonb("category_weights").$type<Record<string, number>>().notNull().default({}),
  avoidCrowds:          boolean("avoid_crowds").notNull().default(false),
  prioritizeFree:       boolean("prioritize_free").notNull().default(false),
  kidsAges:             integer("kids_ages").array().notNull().default([]),

  mealsPerDay:          integer("meals_per_day").notNull().default(3),
  breakfastDurationMin: integer("breakfast_duration_min").notNull().default(30),
  lunchDurationMin:     integer("lunch_duration_min").notNull().default(60),
  dinnerDurationMin:    integer("dinner_duration_min").notNull().default(75),
  dietaryRestrictions:  text("dietary_restrictions").array().notNull().default([]),

  preferredTransitMode: text("preferred_transit_mode").notNull().default("transit"),
  maxWalkMinutes:       integer("max_walk_minutes").notNull().default(20),

  rawPreferencesText:   text("raw_preferences_text"),

  updatedAt:            updatedAt(),
}, (t) => [
  uniqueIndex("trip_preferences_trip_id_key").on(t.tripId),
]);

// ── trip_flights ──────────────────────────────────────────────────────────────

export const tripFlights = pgTable("trip_flights", {
  id:              pk(),
  tripId:          uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),

  direction:       text("direction").notNull().default("outbound"),
  originIata:      text("origin_iata").notNull(),
  destinationIata: text("destination_iata").notNull(),
  departsAt:       timestamp("departs_at", { withTimezone: true }).notNull(),
  arrivesAt:       timestamp("arrives_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  airline:         text("airline"),
  flightNumber:    text("flight_number"),
  cabinClass:      text("cabin_class"),

  priceAmount:     numeric("price_amount", { precision: 10, scale: 2 }),
  priceCurrency:   text("price_currency").default("USD"),

  bookingRef:      text("booking_ref"),
  bookingStatus:   text("booking_status").notNull().default("interested"),

  rawData:         jsonb("raw_data"),

  createdAt:       now(),
}, (t) => [
  index("trip_flights_trip_id_idx").on(t.tripId),
]);

// ── trip_hotels ───────────────────────────────────────────────────────────────

export const tripHotels = pgTable("trip_hotels", {
  id:                    pk(),
  tripId:                uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),

  provider:              text("provider").notNull().default("google"),
  externalId:            text("external_id").notNull(),
  name:                  text("name").notNull(),
  address:               text("address"),
  lat:                   numeric("lat", { precision: 9, scale: 6 }),
  lng:                   numeric("lng", { precision: 9, scale: 6 }),
  timezone:              text("timezone"),

  checkInDate:           date("check_in_date").notNull(),
  checkOutDate:          date("check_out_date").notNull(),
  roomType:              text("room_type"),

  pricePerNightAmount:   numeric("price_per_night_amount", { precision: 10, scale: 2 }),
  priceCurrency:         text("price_currency").default("USD"),
  totalPriceAmount:      numeric("total_price_amount",     { precision: 10, scale: 2 }),

  bookingRef:            text("booking_ref"),
  bookingStatus:         text("booking_status").notNull().default("interested"),

  rawData:               jsonb("raw_data"),

  createdAt:             now(),
}, (t) => [
  index("trip_hotels_trip_id_idx").on(t.tripId),
]);

// ── saved_activities ──────────────────────────────────────────────────────────

export const savedActivities = pgTable("saved_activities", {
  id:          pk(),
  deviceId:    text("device_id").notNull(),
  sourceId:    text("source_id").notNull(),       // Google Place ID
  destination: text("destination").notNull(),
  city:        text("city").notNull(),
  country:     text("country").notNull(),
  snapshot:    jsonb("snapshot").$type<ActivitySnapshot>().notNull(),
  savedAt:     timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("saved_activities_device_source_key").on(t.deviceId, t.sourceId),
  index("saved_activities_device_idx").on(t.deviceId),
]);

// ── trip_activities ───────────────────────────────────────────────────────────

export const tripActivities = pgTable("trip_activities", {
  id:           pk(),
  tripId:       uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  sourceId:     text("source_id").notNull(),      // Google Place ID
  snapshot:     jsonb("snapshot").$type<ActivitySnapshot>().notNull(),
  userPriority: integer("user_priority").notNull().default(3),
  userNotes:    text("user_notes"),
  dayHint:      integer("day_hint"),              // nullable — rough day preference
  addedAt:      timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("trip_activities_trip_source_key").on(t.tripId, t.sourceId),
  index("trip_activities_trip_id_idx").on(t.tripId),
]);

// ── itinerary_drafts ──────────────────────────────────────────────────────────

export const itineraryDrafts = pgTable("itinerary_drafts", {
  id:                   pk(),
  tripId:               uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),

  version:              integer("version").notNull().default(1),
  isActive:             boolean("is_active").notNull().default(true),
  status:               text("status").notNull().default("draft"),

  preferencesSnapshot:  jsonb("preferences_snapshot").$type<TripPreferencesSnapshot>().notNull().default({} as TripPreferencesSnapshot),
  planningMeta:         jsonb("planning_meta").$type<PlanningMeta>(),
  aiTripSummary:        text("ai_trip_summary"),

  generatedAt:          timestamp("generated_at",  { withTimezone: true }),
  createdAt:            now(),
}, (t) => [
  index("itinerary_drafts_trip_id_idx").on(t.tripId),
]);

// ── itinerary_days ────────────────────────────────────────────────────────────

export const itineraryDays = pgTable("itinerary_days", {
  id:              pk(),
  draftId:         uuid("draft_id").notNull().references(() => itineraryDrafts.id, { onDelete: "cascade" }),
  dayIndex:        integer("day_index").notNull(),
  date:            date("date").notNull(),
  theme:           text("theme"),
  summary:         text("summary"),
  geographicArea:  text("geographic_area"),
}, (t) => [
  uniqueIndex("itinerary_days_draft_day_key").on(t.draftId, t.dayIndex),
  index("itinerary_days_draft_id_idx").on(t.draftId),
]);

// ── itinerary_slots ───────────────────────────────────────────────────────────

export const itinerarySlots = pgTable("itinerary_slots", {
  id:                    pk(),
  dayId:                 uuid("day_id").notNull().references(() => itineraryDays.id, { onDelete: "cascade" }),
  position:              integer("position").notNull(),
  kind:                  text("kind").notNull(),

  tripActivityId:        uuid("trip_activity_id").references(() => tripActivities.id, { onDelete: "set null" }),

  scheduledStartMinutes: integer("scheduled_start_minutes").notNull(),
  scheduledEndMinutes:   integer("scheduled_end_minutes").notNull(),
  flexStartMinutes:      integer("flex_start_minutes"),
  flexEndMinutes:        integer("flex_end_minutes"),
  durationMinutes:       integer("duration_minutes").notNull(),

  transitToNext:         jsonb("transit_to_next").$type<TransitSegment>(),
  aiNotes:               text("ai_notes"),

  locked:                boolean("locked").notNull().default(false),
  skipped:               boolean("skipped").notNull().default(false),
  userNotes:             text("user_notes"),

  bookingRef:            text("booking_ref"),
  bookingProvider:       text("booking_provider"),
  bookingStatus:         text("booking_status"),
  bookingData:           jsonb("booking_data").$type<BookingData>(),
}, (t) => [
  uniqueIndex("itinerary_slots_day_position_key").on(t.dayId, t.position),
  index("itinerary_slots_day_id_idx").on(t.dayId),
  index("itinerary_slots_trip_activity_idx").on(t.tripActivityId),
]);

// ── transit_matrix ────────────────────────────────────────────────────────────

export const transitMatrix = pgTable("transit_matrix", {
  id:              pk(),
  tripId:          uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  fromId:          text("from_id").notNull(),
  toId:            text("to_id").notNull(),
  mode:            text("mode").notNull().default("transit"),
  durationMinutes: integer("duration_minutes").notNull(),
  distanceKm:      numeric("distance_km", { precision: 7, scale: 2 }),
  routeSummary:    text("route_summary"),
  computedAt:      timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("transit_matrix_key").on(t.tripId, t.fromId, t.toId, t.mode),
  index("transit_matrix_trip_id_idx").on(t.tripId),
]);

// ── itinerary_edits ───────────────────────────────────────────────────────────

export const itineraryEdits = pgTable("itinerary_edits", {
  id:          pk(),
  draftId:     uuid("draft_id").notNull().references(() => itineraryDrafts.id, { onDelete: "cascade" }),
  editType:    text("edit_type").notNull(),
  payload:     jsonb("payload").$type<EditPayload>().notNull(),
  appliedAt:   timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  appliedBy:   text("applied_by").notNull().default("user"),
}, (t) => [
  index("itinerary_edits_draft_id_idx").on(t.draftId),
]);

// ── JSONB shape types (for .$type<T>() annotations) ──────────────────────────
// These are not enforced by Postgres — they live purely in TypeScript.

export interface ActivitySnapshot {
  sourceId:    string;
  title:       string;
  category:    string;
  location: {
    lat:       number;
    lng:       number;
    neighborhood: string;
    timezone:  string;
  };
  duration: {
    typical:   number;    // minutes
    fast:      number;
    leisurely: number;
  };
  timeWindows: Array<{
    dayOfWeek:  number[];
    opensAt:    number;   // minutes from midnight
    closesAt:   number;
    lastEntry?: number;
    note?:      string;
  }>;
  crowdProfile: {
    byHour:     Record<string, "low" | "moderate" | "high" | "very_high">;
    peakDays:   number[];
    bestTimeNote?: string;
  };
  requirements: {
    advanceBooking:  "none" | "recommended" | "required";
    ticketRequired:  boolean;
    ticketUrl?:      string;
    averageWaitMin?: number;
    notes:           string[];
  };
  reviewInsights?: {
    guestsLove: string[];
    watchOut:   string[];
    bestFor:    string[];
    tips:       string[];
  };
  rating:       number;
  reviewCount:  number;
  photoRef?:    string;
  websiteUri?:  string;
  googleMapsUri?: string;
  snapshotAt:   string;   // ISO timestamp
}

export interface TripPreferencesSnapshot {
  wakeTimeMinutes:      number;
  sleepTimeMinutes:     number;
  pace:                 "relaxed" | "moderate" | "packed";
  categoryWeights:      Record<string, number>;
  avoidCrowds:          boolean;
  mealsPerDay:          number;
  preferredTransitMode: string;
  maxWalkMinutes:       number;
}

export interface PlanningMeta {
  solverDurationMs:  number;
  clusterLabels:     string[];
  conflicts:         PlanningConflict[];
}

export interface PlanningConflict {
  type:        string;
  slotId?:     string;
  description: string;
  suggestions: Array<{
    action:      string;
    description: string;
    autoApply:   boolean;
  }>;
}

export interface TransitSegment {
  mode:           string;
  durationMinutes: number;
  distanceKm?:    number;
  routeSummary?:  string;
  computedAt:     string;
}

export interface BookingData {
  provider:         string;
  externalId:       string;
  confirmationCode: string;
  bookedFor:        string;
  numTickets:       number;
  totalPaid?:       { amount: number; currency: string };
  cancellationDeadline?: string;
  cancellationPolicy: string;
  ticketUrl?:       string;
}

export type EditPayload = Record<string, unknown>;

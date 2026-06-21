// ── Primitives ────────────────────────────────────────────────────────────────

export interface DayWarning {
  type: 'packed' | 'food_heavy' | 'transit_heavy' | 'late_night' | 'flight_recovery' | 'ai_note';
  message: string;
}

export interface LatLng { lat: number; lng: number }

export type TransitMode = "walking" | "transit" | "driving";
export type Pace        = "relaxed" | "moderate" | "packed";

export type SlotKind =
  | "activity"
  | "meal"
  | "hotel_checkin"
  | "hotel_checkout"
  | "airport_transfer"
  | "intercity_transfer"
  | "free_time";

// ── Activity representation inside the planner ────────────────────────────────

export interface TimeWindow {
  dayOfWeek: number[];   // 0 = Sunday … 6 = Saturday
  opensAt:   number;     // minutes from midnight
  closesAt:  number;     // minutes from midnight
  lastEntry?: number;    // latest arrival allowed (minutes from midnight)
}

export interface PlannerActivity {
  id:              string;   // trip_activity.id (DB UUID)
  sourceId:        string;   // Google Place ID
  title:           string;
  category:        string;
  location:        LatLng;
  durationMinutes: number;   // typical visit time
  timeWindows:     TimeWindow[];
  userPriority:    number;   // 1 = must-do, 2 = want, 3 = nice-to-have
  rating:          number;
  reviewCount:     number;
  hasRealCoords?:  boolean;  // false = city-centre fallback; suppresses fake distance display
}

// ── Slot / day output ─────────────────────────────────────────────────────────

export interface TransitInfo {
  mode:            TransitMode;
  durationMinutes: number;
  distanceKm:      number;
  coordsSource?:   "real" | "estimated";  // "estimated" = hide km in UI
}

export interface PlannedSlot {
  kind:            SlotKind;
  startMinutes:    number;   // minutes from midnight, destination local tz
  endMinutes:      number;
  durationMinutes: number;
  tripActivityId?: string;   // FK into trip_activities
  sourceId?:       string;   // Google Place ID
  title:           string;
  location?:       LatLng;
  transit?:        TransitInfo;   // travel TO this slot from the previous one
  explanation:     string;
  note?:           string;
  category?:       string;        // activity category — set when kind === "activity"
}

export interface PlannedDay {
  dayIndex:               number;
  date:                   string;   // ISO "YYYY-MM-DD"
  theme:                  string;
  geographicArea:         string;
  cityLabel?:             string;   // explicit city name for multi-city trips
  warnings?:              DayWarning[];
  daySummary?:            string;   // AI-generated or rules-based "why this day works"
  slots:                  PlannedSlot[];
  scheduledActivityCount: number;
  totalActivityMinutes:   number;
}

// ── Planner metadata ──────────────────────────────────────────────────────────

export interface DroppedActivity {
  sourceId: string;
  title:    string;
  reason:   string;
}

export interface PlanningConflict {
  type:        string;
  description: string;
  suggestion:  string;
}

export interface PlannerMeta {
  solverDurationMs:         number;
  totalActivitiesScheduled: number;
  totalActivitiesDropped:   number;
  droppedActivities:        DroppedActivity[];
  conflicts:                PlanningConflict[];
}

export interface PlannerOutput {
  days: PlannedDay[];
  meta: PlannerMeta;
}

// ── Top-level planner input ───────────────────────────────────────────────────

export interface PlannerPreferences {
  wakeTimeMinutes:      number;
  sleepTimeMinutes:     number;
  pace:                 Pace;
  jetLagDays:           number;
  preferredTransitMode: string;
  maxWalkMinutes:       number;
  mealsPerDay:          number;
  breakfastDurationMin: number;
  lunchDurationMin:     number;
  dinnerDurationMin:    number;
  isFoodFocused?:       boolean;  // true when user selected Food & Culinary
}

export interface ItineraryInput {
  trip: {
    id:           string;
    startDate:    string;  // ISO "YYYY-MM-DD"
    endDate:      string;  // ISO "YYYY-MM-DD"
    numTravelers: number;
    city:         string;
    destination:  string;
    cityStops?:   { city: string; days: number }[];  // multi-city route
  };
  preferences: PlannerPreferences;
  hotel: {
    lat:          number | null;
    lng:          number | null;
    checkInDate:  string;
    checkOutDate: string;
    name:         string;
    timezone?:    string | null;
  } | null;
  outboundFlight: { arrivesAt: Date } | null;
  returnFlight:   { departsAt: Date } | null;
  activities:     PlannerActivity[];
}

// ── Per-day boundary (precomputed before scheduling) ─────────────────────────

export interface DayBoundary {
  dayIndex:              number;
  date:                  string;
  effectiveStartMinutes: number;
  effectiveEndMinutes:   number;
  isArrivalDay:          boolean;
  isDepartureDay:        boolean;
}

// ── Scheduler-level input ─────────────────────────────────────────────────────

export interface SchedulerInput {
  activities:            PlannerActivity[];
  boundary:              DayBoundary;
  hotelLocation:         LatLng | null;
  transitMode:           TransitMode;
  pace:                  Pace;
  mealsPerDay:           number;
  mealDurations:         { breakfast: number; lunch: number; dinner: number };
  intercityTransfer?:    {
    durationMinutes: number;
    description:     string;
    fromCity:        string;
    toCity:          string;
  };
  isFoodFocused?:        boolean;  // true when user selected Food & Culinary interest
}

export interface SchedulerOutput {
  slots:   PlannedSlot[];
  dropped: DroppedActivity[];
}

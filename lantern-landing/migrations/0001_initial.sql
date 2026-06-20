-- TravelGrab itinerary data model
-- Run against a PostgreSQL 15+ database.
-- gen_random_uuid() is built-in; no extension required.

-- ── Trips ──────────────────────────────────────────────────────────────────────
-- Top-level planning object.  No auth yet — access by trip ID + device_id cookie.

CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       TEXT        NOT NULL,               -- UUID from client localStorage
  destination     TEXT        NOT NULL,               -- e.g. "Tokyo, Japan"
  city            TEXT        NOT NULL,
  country         TEXT        NOT NULL,
  start_date      DATE        NOT NULL,
  end_date        DATE        NOT NULL,
  num_travelers   INTEGER     NOT NULL DEFAULT 1,
  status          TEXT        NOT NULL DEFAULT 'draft',
    -- 'draft' | 'planning' | 'confirmed' | 'active' | 'completed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trips_device_id_idx ON trips (device_id);
CREATE INDEX trips_status_idx    ON trips (status);

-- ── Trip Preferences ───────────────────────────────────────────────────────────
-- One row per trip.  Drives the constraint solver and AI preference parser.

CREATE TABLE trip_preferences (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                 UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  -- Schedule shape
  wake_time_minutes       INTEGER     NOT NULL DEFAULT 480,   -- minutes from midnight; 480 = 8am
  sleep_time_minutes      INTEGER     NOT NULL DEFAULT 1320,  -- 1320 = 10pm
  pace                    TEXT        NOT NULL DEFAULT 'moderate',
    -- 'relaxed' | 'moderate' | 'packed'

  -- Jet lag model
  origin_timezone         TEXT,                               -- IANA, e.g. 'America/New_York'
  flight_arrival_at       TIMESTAMPTZ,                        -- actual arrival in destination tz
  jet_lag_days            INTEGER     NOT NULL DEFAULT 0,

  -- Activity weighting
  category_weights        JSONB       NOT NULL DEFAULT '{}',
    -- { food: 0.8, culture: 0.5, adventure: 0.3, ... }
  avoid_crowds            BOOLEAN     NOT NULL DEFAULT false,
  prioritize_free         BOOLEAN     NOT NULL DEFAULT false,
  kids_ages               INTEGER[]   NOT NULL DEFAULT '{}',

  -- Meal preferences
  meals_per_day           INTEGER     NOT NULL DEFAULT 3,
  breakfast_duration_min  INTEGER     NOT NULL DEFAULT 30,
  lunch_duration_min      INTEGER     NOT NULL DEFAULT 60,
  dinner_duration_min     INTEGER     NOT NULL DEFAULT 75,
  dietary_restrictions    TEXT[]      NOT NULL DEFAULT '{}',

  -- Transport
  preferred_transit_mode  TEXT        NOT NULL DEFAULT 'transit',
    -- 'walking' | 'transit' | 'driving'
  max_walk_minutes        INTEGER     NOT NULL DEFAULT 20,

  -- Raw natural-language input stored so the AI can re-parse on change
  raw_preferences_text    TEXT,

  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (trip_id)
);

-- ── Trip Flights ───────────────────────────────────────────────────────────────
-- Flights the user has selected or booked for this trip.

CREATE TABLE trip_flights (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  direction       TEXT        NOT NULL DEFAULT 'outbound',
    -- 'outbound' | 'return'
  origin_iata     TEXT        NOT NULL,
  destination_iata TEXT       NOT NULL,
  departs_at      TIMESTAMPTZ NOT NULL,
  arrives_at      TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER    NOT NULL,
  airline         TEXT,
  flight_number   TEXT,
  cabin_class     TEXT,
    -- 'economy' | 'premium_economy' | 'business' | 'first'

  -- Pricing snapshot at time of saving
  price_amount    NUMERIC(10,2),
  price_currency  TEXT        DEFAULT 'USD',

  -- Booking state
  booking_ref     TEXT,
  booking_status  TEXT        NOT NULL DEFAULT 'interested',
    -- 'interested' | 'booked' | 'cancelled'

  -- Original provider payload (Duffel, Amadeus, etc.)
  raw_data        JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trip_flights_trip_id_idx ON trip_flights (trip_id);

-- ── Trip Hotels ────────────────────────────────────────────────────────────────
-- Hotels the user has selected or booked.

CREATE TABLE trip_hotels (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                 UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  provider                TEXT        NOT NULL DEFAULT 'google',
    -- 'google' | 'serpapi' | 'booking_com' | ...
  external_id             TEXT        NOT NULL,           -- provider's hotel ID
  name                    TEXT        NOT NULL,
  address                 TEXT,
  lat                     NUMERIC(9,6),
  lng                     NUMERIC(9,6),
  timezone                TEXT,                           -- IANA timezone for this hotel

  check_in_date           DATE        NOT NULL,
  check_out_date          DATE        NOT NULL,
  room_type               TEXT,

  price_per_night_amount  NUMERIC(10,2),
  price_currency          TEXT        DEFAULT 'USD',
  total_price_amount      NUMERIC(10,2),

  booking_ref             TEXT,
  booking_status          TEXT        NOT NULL DEFAULT 'interested',
    -- 'interested' | 'booked' | 'cancelled'

  -- Original provider payload (SerpAPI, Google Hotels, etc.)
  raw_data                JSONB,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trip_hotels_trip_id_idx ON trip_hotels (trip_id);

-- ── Saved Activities (device-level) ───────────────────────────────────────────
-- Replaces localStorage. Activities a user has hearted, not yet part of a trip.
-- Synced by device_id; survives page refreshes and browser sessions.

CREATE TABLE saved_activities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       TEXT        NOT NULL,
  source_id       TEXT        NOT NULL,                   -- Google Place ID
  destination     TEXT        NOT NULL,
  city            TEXT        NOT NULL,
  country         TEXT        NOT NULL,

  -- Full activity record at save time, frozen so it survives inventory changes
  snapshot        JSONB       NOT NULL,

  saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (device_id, source_id)
);

CREATE INDEX saved_activities_device_idx ON saved_activities (device_id);

-- ── Trip Activities ────────────────────────────────────────────────────────────
-- Activities added to a specific trip plan (promoted from saved or added directly).
-- The snapshot is re-frozen at the time of addition to capture current hours/status.

CREATE TABLE trip_activities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  source_id       TEXT        NOT NULL,                   -- Google Place ID

  -- Activity data frozen at addition time
  snapshot        JSONB       NOT NULL,

  user_priority   INTEGER     NOT NULL DEFAULT 3,
    -- 1 = must-do, 2 = want-to, 3 = nice-to-have
  user_notes      TEXT,                                   -- personal note
  day_hint        INTEGER,                                -- rough day preference (0-based), nullable

  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (trip_id, source_id)
);

CREATE INDEX trip_activities_trip_id_idx ON trip_activities (trip_id);

-- ── Itinerary Drafts ──────────────────────────────────────────────────────────
-- A generated itinerary plan.  A trip may have multiple versions (e.g. after
-- the user changes preferences and regenerates).  Only one is active at a time.

CREATE TABLE itinerary_drafts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id             UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  version             INTEGER     NOT NULL DEFAULT 1,
  is_active           BOOLEAN     NOT NULL DEFAULT true,

  status              TEXT        NOT NULL DEFAULT 'draft',
    -- 'draft' | 'generating' | 'ready' | 'failed'

  -- Preferences snapshotted at generation time (so regeneration is reproducible)
  preferences_snapshot JSONB      NOT NULL DEFAULT '{}',

  -- Solver output and conflict report
  planning_meta       JSONB,
    -- { solver_duration_ms, conflicts: PlanningConflict[], cluster_labels }

  -- Top-level AI narrative
  ai_trip_summary     TEXT,       -- "A 5-day mix of temples, street food, and modern Tokyo"

  generated_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX itinerary_drafts_trip_id_idx ON itinerary_drafts (trip_id);

-- ── Itinerary Days ────────────────────────────────────────────────────────────
-- One row per calendar day in the draft.

CREATE TABLE itinerary_days (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id            UUID        NOT NULL REFERENCES itinerary_drafts(id) ON DELETE CASCADE,

  day_index           INTEGER     NOT NULL,               -- 0-based
  date                DATE        NOT NULL,

  -- AI-generated
  theme               TEXT,       -- "Temples and street food in Asakusa"
  summary             TEXT,       -- 2–3 sentence day overview
  geographic_area     TEXT,       -- "Asakusa / Ueno" (cluster label)

  UNIQUE (draft_id, day_index)
);

CREATE INDEX itinerary_days_draft_id_idx ON itinerary_days (draft_id);

-- ── Itinerary Slots ───────────────────────────────────────────────────────────
-- Ordered time blocks within a day.  Covers activities, meals, transit,
-- check-in/out, and free time.

CREATE TABLE itinerary_slots (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id                  UUID        NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,

  position                INTEGER     NOT NULL,           -- ordering within the day

  kind                    TEXT        NOT NULL,
    -- 'activity' | 'meal' | 'transit' | 'hotel_checkin' | 'hotel_checkout'
    -- | 'airport_transfer' | 'free_time' | 'rest'

  -- Nullable; only set when kind = 'activity'
  trip_activity_id        UUID        REFERENCES trip_activities(id) ON DELETE SET NULL,

  -- Scheduled times in minutes from midnight (local tz)
  scheduled_start_minutes INTEGER     NOT NULL,
  scheduled_end_minutes   INTEGER     NOT NULL,

  -- Flex bounds used by the solver; null = no flexibility
  flex_start_minutes      INTEGER,
  flex_end_minutes        INTEGER,

  -- Solved duration (may differ from activity.snapshot.duration.typical due to pace)
  duration_minutes        INTEGER     NOT NULL,

  -- TransitSegment to the following slot (JSON, null for last slot of day)
  transit_to_next         JSONB,
    -- { mode, duration_min, distance_km, route_summary, computed_at }

  -- AI-generated inline tip for this slot
  ai_notes                TEXT,
    -- "Arrive before the tour groups — Nakamise market opens at 9am"

  -- User overrides
  locked                  BOOLEAN     NOT NULL DEFAULT false,
  skipped                 BOOLEAN     NOT NULL DEFAULT false,
  user_notes              TEXT,

  -- Booking state (populated when reservation system is live)
  booking_ref             TEXT,
  booking_provider        TEXT,
  booking_status          TEXT,
    -- 'not_required' | 'recommended' | 'required_unbooked' | 'pending' | 'confirmed' | 'cancelled'
  booking_data            JSONB,      -- full BookingReference once confirmed

  UNIQUE (day_id, position)
);

CREATE INDEX itinerary_slots_day_id_idx         ON itinerary_slots (day_id);
CREATE INDEX itinerary_slots_trip_activity_idx  ON itinerary_slots (trip_activity_id);

-- ── Transit Matrix ────────────────────────────────────────────────────────────
-- Cached Google Maps transit times between all activity pairs for a trip.
-- Keyed by (trip_id, from_id, to_id, mode) — from_id / to_id are Google Place IDs
-- or special tokens like 'hotel:{trip_hotel_id}' or 'airport'.

CREATE TABLE transit_matrix (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  from_id         TEXT        NOT NULL,
  to_id           TEXT        NOT NULL,
  mode            TEXT        NOT NULL DEFAULT 'transit',
    -- 'walking' | 'transit' | 'driving'

  duration_minutes INTEGER    NOT NULL,
  distance_km     NUMERIC(7,2),
  route_summary   TEXT,                   -- "3 stops on Ginza line, then 5 min walk"

  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (trip_id, from_id, to_id, mode)
);

CREATE INDEX transit_matrix_trip_id_idx ON transit_matrix (trip_id);

-- ── Itinerary Edits ───────────────────────────────────────────────────────────
-- Append-only audit log.  Powers undo/redo and incremental regeneration.

CREATE TABLE itinerary_edits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        UUID        NOT NULL REFERENCES itinerary_drafts(id) ON DELETE CASCADE,

  edit_type       TEXT        NOT NULL,
    -- 'move_slot' | 'remove_slot' | 'add_slot' | 'lock_slot' | 'unlock_slot'
    -- | 'change_preference' | 'replace_activity' | 'change_transit_mode'
  payload         JSONB       NOT NULL,   -- edit-type-specific data
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by      TEXT        NOT NULL DEFAULT 'user'
    -- 'user' | 'system' | 'ai'
);

CREATE INDEX itinerary_edits_draft_id_idx ON itinerary_edits (draft_id);

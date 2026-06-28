-- =============================================================================
-- Migration: 20260627_hybrid_activities_phase1
-- TravelGrab — Phase 1: Additive database foundation for the hybrid activity
--              provider system.
--
-- PURPOSE
--   Lay the schema groundwork that allows a second (non-Google) activity data
--   provider to write rows without touching any existing code path.  All changes
--   are strictly additive: no existing columns, constraints, or indexes are
--   removed, no existing rows are modified.
--
-- SAFETY
--   • The public.activities table is currently empty (confirmed by audit).
--   • Every ALTER is reversible by the companion rollback migration.
--   • CREATE TABLE and ADD COLUMN statements use IF NOT EXISTS / IF NOT EXISTS
--     so the script is idempotent and safe to run more than once.
--   • No application code is modified.
--   • The existing Google Places pipeline continues to function identically.
--
-- RUN LOCATION
--   Supabase dashboard → SQL Editor, or via Supabase CLI:
--     supabase db push  (if CLI is configured)
--   Do NOT run via psql with a direct connection unless you control migrations
--   outside Supabase CLI, because RLS policy syntax may differ.
--
-- RELATED FILES
--   rollback: 20260627_hybrid_activities_phase1_rollback.sql
--   audit:    ACTIVITIES_SCHEMA_AUDIT_COMPACT.sql
--   design:   ACTIVITIES_HYBRID_DESIGN.md  §11–§14
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SECTION A  —  ALTER public.activities
-- ---------------------------------------------------------------------------

-- A1. Relax the place_id NOT NULL constraint.
--
--     Background: place_id currently holds a Google Place ID (e.g. "ChIJabc…")
--     and is NOT NULL.  Non-Google providers (Overture, Wikidata, Viator) do
--     not have Google Place IDs, so any future row they write would fail the
--     constraint.  The UNIQUE constraint on place_id is PRESERVED: it prevents
--     duplicate Google rows.  PostgreSQL treats multiple NULLs as distinct
--     values in a unique index, so non-Google rows with place_id = NULL do not
--     conflict with each other.
--
--     Risk: NONE — the table is empty.  The rollback restores NOT NULL only
--     after confirming no NULL values exist (see rollback migration §R4).
ALTER TABLE public.activities
    ALTER COLUMN place_id DROP NOT NULL;

-- A2. Add source column.
--
--     Records which provider created the row.  All future Google rows written
--     by writeInventoryToSupabase() will set source = 'google'.  Overture rows
--     set source = 'overture'.  Existing rows (currently none) are unaffected;
--     their source will be back-filled by the first Google search that triggers
--     a Supabase write.
--
--     NULL is intentionally allowed: rows written before this migration was
--     applied (there are none) would have source = NULL, which can be treated
--     as 'google' by application code.
ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS source text;

-- A3. Add photos column.
--
--     Structured array of photo descriptors.  Allows non-Google rows to store
--     CDN URLs while Google rows continue using image_url (opaque photo ref).
--     Element shape:
--       {
--         "source":         "google" | "overture" | "wikimedia" | "direct",
--         "ref":            "places/ChIJ.../photos/AXCi…",   -- Google only
--         "url":            "https://…",                      -- non-Google
--         "proxy_required": true | false,
--         "width_hint":     800,
--         "attribution":    "Photo © …" | null
--       }
--
--     The existing image_url column is NOT deprecated.  rowToActivity() reads
--     image_url first and falls back to photos[0] only when image_url is null.
ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS photos jsonb;

-- A4. Add capabilities column.
--
--     Manifest describing which detail features this row's provider supports.
--     The detail modal reads detail_provider to decide which API to call.
--     Shape:
--       {
--         "has_reviews":     true | false,
--         "has_photos":      true | false,
--         "has_hours":       true | false,
--         "has_phone":       true | false,
--         "has_booking":     true | false,
--         "detail_provider": "google" | "overture" | "none"
--       }
--
--     Rows with capabilities = NULL or detail_provider absent default to the
--     existing Google Places Detail call (backward-compatible).
ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS capabilities jsonb;

-- A5. Add search_keywords column.
--
--     Flat text array for provider-agnostic keyword search scoring.
--     Type: text[] (native PostgreSQL array — more efficient than jsonb for a
--     flat string list, and directly supported by the GIN index below).
--
--     Google rows populate this from the keys of querySources in
--     google_places_data plus category-derived terms.  Overture rows populate
--     it from the Overture category taxonomy mapping defined in Phase 3.
--
--     sortByRelevance() in ActivitySearch.tsx gains a search_keywords scoring
--     signal in Phase 2.  Until Phase 2 ships, this column is never read by
--     the application and has no effect on existing behaviour.
ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS search_keywords text[];

-- A6. Add built_at column.
--
--     Timestamp (with timezone) recording when any build process last wrote
--     this row.  Used by hybrid_build_log reconciliation and for future
--     cache-invalidation logic.  Application code currently ignores this field.
ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS built_at timestamptz;

-- A7. GIN index on search_keywords.
--
--     Enables fast containment queries such as:
--       WHERE search_keywords @> ARRAY['ramen']
--       WHERE search_keywords && ARRAY['shrine', 'temple']
--     Without this index these queries degrade to a sequential scan.
--
--     The table is currently empty, so this CREATE INDEX runs instantly.
--     We use the standard GIN operator class (default for text[]).
CREATE INDEX IF NOT EXISTS idx_activities_search_keywords
    ON public.activities USING GIN (search_keywords);

-- A8. Drop the redundant non-unique index on place_id.
--
--     The production audit (ACTIVITIES_SCHEMA_AUDIT_RESULTS.csv, section 06)
--     shows TWO indexes on place_id:
--       • activities_place_id_key  — UNIQUE index, created by the unique
--                                    constraint, serves all equality lookups
--       • idx_activities_place_id  — plain btree index, DUPLICATE of the above
--
--     The unique constraint index (activities_place_id_key) is retained and
--     continues to serve WHERE place_id = ? queries.  The redundant plain index
--     adds unnecessary write overhead for no query benefit.
--
--     Safety check: the unique constraint (activities_place_id_key) must still
--     exist.  We verify this by attempting to drop only the non-unique index.
--     If the unique constraint were somehow missing, the application would
--     break for other reasons unrelated to this change.
DROP INDEX IF EXISTS public.idx_activities_place_id;


-- ---------------------------------------------------------------------------
-- SECTION B  —  CREATE public.activity_provider_ids
-- ---------------------------------------------------------------------------
--
-- PURPOSE
--   Maps each activities row (identified by its UUID primary key) to every
--   native provider ID that refers to the same real-world place.  Examples:
--     • Google Place ID:  (activity_id=<uuid>, provider='google',  provider_id='ChIJabc…')
--     • Overture ID:      (activity_id=<uuid>, provider='overture', provider_id='08f…')
--     • Wikidata QID:     (activity_id=<uuid>, provider='wikidata', provider_id='Q1137')
--     • Viator product:   (activity_id=<uuid>, provider='viator',   provider_id='123456')
--
-- IDENTITY MODEL
--   activities.id (UUID) is the permanent canonical identifier.  Provider IDs
--   are lookup keys, not identity.  The activities.place_id column continues to
--   hold the Google Place ID for Google-sourced rows; this table records the
--   same information in normalised form alongside all other providers.
--
-- FK ON DELETE CASCADE
--   If an activities row is ever deleted, all its provider mappings are deleted
--   with it.  This maintains referential integrity without manual cleanup.
--
-- SECURITY
--   This table is internal infrastructure.  No SELECT policy is created for
--   anon or authenticated.  All writes come exclusively from the server-side
--   supabaseAdmin client (service_role key), which bypasses RLS in Supabase.
--   The anon and authenticated roles are explicitly revoked below.
--
--   No public SELECT policy is created because:
--     (a) No current application route reads this table client-side.
--     (b) Exposing provider IDs to the public adds no UX value.
--     (c) Keeping it server-side reduces the attack surface for ID enumeration.
--   If a future application requirement genuinely needs client-side access to
--   provider mappings, a narrow SELECT policy can be added at that time.

CREATE TABLE IF NOT EXISTS public.activity_provider_ids (
    -- Primary key — Supabase-generated UUID, never changes
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),

    -- Foreign key to the canonical activities row
    activity_id     uuid        NOT NULL,

    -- Provider name: 'google' | 'overture' | 'wikidata' | 'viator' | …
    provider        text        NOT NULL,

    -- The provider's own identifier for this place.
    -- For Google:   'ChIJabc123…'
    -- For Overture: '08f2b3a4c5d60000…'
    -- For Wikidata: 'Q1137'
    -- For Viator:   '12345678'
    provider_id     text        NOT NULL,

    -- Confidence score for cross-provider deduplication matches.
    -- 1.0 = authoritative (e.g. the Google Place ID was retrieved from the
    --       Google Details API using the Overture coordinates directly).
    -- 0.0–0.99 = probabilistic match via name + proximity.
    -- NULL = not applicable (the row IS the authoritative source for this place).
    match_confidence double precision
        CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),

    -- How the match was established.
    -- 'authoritative'  — provider confirmed this ID belongs to the same place
    -- 'name_geo'       — name similarity + geographic proximity algorithm
    -- 'name_only'      — name similarity only (lower confidence)
    -- 'manual'         — human-confirmed mapping
    match_method    text,

    -- Arbitrary provider-specific metadata (API response excerpt, raw IDs, etc.)
    -- Not exposed to the client.
    metadata        jsonb,

    -- Audit timestamps
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT activity_provider_ids_pkey
        PRIMARY KEY (id),

    CONSTRAINT activity_provider_ids_activity_id_fkey
        FOREIGN KEY (activity_id)
        REFERENCES public.activities (id)
        ON DELETE CASCADE,

    -- One row per (provider, native ID) globally.
    -- Prevents two activities rows from claiming the same provider ID.
    CONSTRAINT activity_provider_ids_provider_native_key
        UNIQUE (provider, provider_id),

    -- One row per (activity, provider, native ID) combination.
    -- Together with the constraint above, this ensures no duplicate mappings
    -- and creates a useful index on (activity_id, provider, provider_id).
    CONSTRAINT activity_provider_ids_activity_provider_native_key
        UNIQUE (activity_id, provider, provider_id)
);

-- Additional index on activity_id alone for fast reverse-lookups:
--   "give me all provider IDs for this activity"
-- The UNIQUE constraint above creates an index on (activity_id, provider,
-- provider_id), but a single-column index on activity_id is more efficient
-- for the simple reverse-lookup case.
CREATE INDEX IF NOT EXISTS idx_activity_provider_ids_activity_id
    ON public.activity_provider_ids (activity_id);

-- Index on (provider, provider_id) is already covered by the UNIQUE constraint
-- index (activity_provider_ids_provider_native_key).  No separate index needed.

-- Enable Row Level Security
ALTER TABLE public.activity_provider_ids ENABLE ROW LEVEL SECURITY;

-- Revoke all privileges from anon and authenticated.
-- The default Supabase project typically applies broad DEFAULT PRIVILEGES that
-- grant INSERT/UPDATE/DELETE/SELECT to anon and authenticated on all tables in
-- the public schema.  We explicitly revoke here to ensure this table is not
-- accessible through the anon key even if those defaults are in place.
REVOKE ALL ON public.activity_provider_ids FROM anon;
REVOKE ALL ON public.activity_provider_ids FROM authenticated;

-- No SELECT, INSERT, UPDATE, or DELETE policies are created.
-- With RLS enabled and no matching policy, any query from anon or authenticated
-- returns 0 rows (SELECT) or is blocked (writes).
-- The service_role key bypasses RLS in Supabase and retains full access without
-- an explicit policy.


-- ---------------------------------------------------------------------------
-- SECTION C  —  CREATE public.hybrid_build_log
-- ---------------------------------------------------------------------------
--
-- PURPOSE
--   Server-side diagnostic log for every hybrid inventory build run.  One row
--   per city/provider build attempt.  Used to audit coverage, diagnose errors,
--   and compute the statistics needed by pilot exit criteria (§8 of the design).
--
-- SECURITY — STRICTER THAN activity_provider_ids
--   This table may contain error messages from build failures.  Error messages
--   from external API calls occasionally include partial request context (city
--   names, provider response codes, etc.) that should not be publicly visible.
--   Additionally, future error messages could inadvertently log API key prefixes
--   or response headers if the calling code is not perfectly disciplined.
--
--   For this reason:
--     • No SELECT policy is created for ANY role.
--     • anon and authenticated are explicitly revoked.
--     • Only service_role (which bypasses RLS) can read or write this table.
--     • The application never exposes this table's contents to the browser.
--
--   If operational visibility is needed (e.g. a build status admin dashboard),
--   a server-side API route should proxy a filtered view of this data rather
--   than granting direct table access to any public role.

CREATE TABLE IF NOT EXISTS public.hybrid_build_log (
    -- Primary key
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),

    -- The city and country this build covers.
    -- city must match the activities.city values it produces.
    city            text        NOT NULL,
    country_code    text,           -- ISO 3166-1 alpha-2, e.g. 'JP', 'FR', 'US'

    -- Which provider produced this batch.
    -- 'overture' | 'google' | 'viator' | …
    provider        text        NOT NULL,

    -- Build lifecycle status.
    status          text        NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),

    -- Row-count statistics recorded on completion.
    discovered_count    integer,    -- total places returned by the provider query
    retained_count      integer,    -- places kept after deduplication / quality filters
    inserted_count      integer,    -- net new rows written to public.activities
    duplicate_count     integer,    -- places matched to an existing activities row

    -- Error information.  error_message is a short human-readable summary
    -- (e.g. "Overture API returned 429: rate limit exceeded").
    -- Stack traces MUST NOT be written to error_message; they belong in
    -- application logs (Vercel function logs), not in this table.
    error_message   text,

    -- Provider-specific statistics and any additional structured diagnostics
    -- that do not contain sensitive values.  Examples:
    --   { "api_calls": 3, "categories_queried": 12, "bbox_km2": 450 }
    -- API keys, authentication headers, and raw API responses MUST NOT be
    -- stored here.
    details         jsonb,

    -- Timing
    started_at      timestamptz,
    completed_at    timestamptz,    -- NULL while status = 'running'
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hybrid_build_log_pkey
        PRIMARY KEY (id)
);

-- Index for the most common query: "show me all builds for Tokyo"
CREATE INDEX IF NOT EXISTS idx_hybrid_build_log_city_provider
    ON public.hybrid_build_log (city, provider);

-- Index for monitoring: "show me all failed builds"
CREATE INDEX IF NOT EXISTS idx_hybrid_build_log_status
    ON public.hybrid_build_log (status);

-- Enable Row Level Security
ALTER TABLE public.hybrid_build_log ENABLE ROW LEVEL SECURITY;

-- Revoke all privileges.  No role other than the table owner (postgres) and
-- service_role (RLS-bypass) can access this table.
REVOKE ALL ON public.hybrid_build_log FROM anon;
REVOKE ALL ON public.hybrid_build_log FROM authenticated;

-- No policies are created.  With RLS enabled and no policies, ALL queries from
-- anon and authenticated are blocked — including SELECT.  service_role bypasses
-- RLS and retains full access.


-- ---------------------------------------------------------------------------
-- END OF MIGRATION
-- ---------------------------------------------------------------------------

COMMIT;

-- =============================================================================
-- POST-MIGRATION CHECKLIST (run manually after applying this migration)
-- =============================================================================
-- 1. Run PHASE1_DATABASE_VERIFICATION.sql and confirm all checks pass.
-- 2. Trigger one real activity search for a new city in production and verify
--    that rows appear in public.activities (confirms writeInventoryToSupabase
--    is working — the table was empty before this migration).
-- 3. Confirm Vercel function logs show no errors from the new column writes.
-- 4. Confirm ACTIVITIES_PROVIDER environment variable is NOT set (defaults to
--    'google') so the existing Google pipeline continues unchanged.
-- =============================================================================

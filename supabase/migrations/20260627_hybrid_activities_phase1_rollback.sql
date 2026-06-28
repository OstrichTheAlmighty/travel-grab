-- =============================================================================
-- Rollback: 20260627_hybrid_activities_phase1_rollback
-- TravelGrab — Undoes every change made by 20260627_hybrid_activities_phase1.sql
--
-- PURPOSE
--   Restore the database to its state before Phase 1 was applied.
--
-- SAFETY GUARANTEES
--   • No existing activities rows are deleted or modified.
--   • No existing columns (id, place_id, title, city, category, description,
--     image_url, google_places_data, created_at) are touched.
--   • The UNIQUE constraint on place_id (activities_place_id_key) is preserved.
--   • place_id NOT NULL is restored ONLY after confirming zero NULL values exist
--     in that column.  If NULL values are found, the statement is skipped and
--     a warning is raised — the operator must resolve them manually first.
--   • The two new tables (activity_provider_ids, hybrid_build_log) are dropped
--     only because they were created by the forward migration and contain no
--     production data at rollback time.  If data has been written to them since
--     the migration ran, back up the table contents before running this rollback.
--
-- PREREQUISITES
--   • Confirm no hybrid (non-Google) rows have been written to public.activities.
--     If source = 'overture' rows exist, those rows will retain place_id = NULL.
--     Restoring NOT NULL while NULL values exist will fail (the validation below
--     will catch this and abort gracefully rather than letting PostgreSQL error).
--   • Confirm no critical data exists in activity_provider_ids or hybrid_build_log
--     that has not been backed up.
--
-- RELATED FILES
--   forward: 20260627_hybrid_activities_phase1.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- R1. Drop the new tables.
--
--     Both tables were created by the forward migration and contain no
--     production data at this stage.  CASCADE is used to drop any dependent
--     objects (policies, indexes) in one step.
--
--     IF EXISTS makes this idempotent: safe to run even if the tables were
--     never created.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.hybrid_build_log CASCADE;
DROP TABLE IF EXISTS public.activity_provider_ids CASCADE;


-- ---------------------------------------------------------------------------
-- R2. Drop the GIN index on search_keywords.
--
--     Created by A7 in the forward migration.  Must be dropped before the
--     column is removed (R3 handles this, but explicit ordering is safer).
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_activities_search_keywords;


-- ---------------------------------------------------------------------------
-- R3. Remove the five new columns from public.activities.
--
--     ADD COLUMN IF NOT EXISTS was used in the forward migration; DROP COLUMN
--     IF EXISTS mirrors that idiom and makes this rollback idempotent.
--
--     Order: reverse of forward migration to avoid any hidden dependencies.
--
--     These DROP COLUMNs are safe because:
--       • The columns were all added as nullable.
--       • No application code currently reads them (Phase 2 is not yet deployed).
--       • The table is expected to be empty or contain only Google rows written
--         after the forward migration ran; those rows have NULL in all five
--         new columns by default.
-- ---------------------------------------------------------------------------
ALTER TABLE public.activities DROP COLUMN IF EXISTS built_at;
ALTER TABLE public.activities DROP COLUMN IF EXISTS search_keywords;
ALTER TABLE public.activities DROP COLUMN IF EXISTS capabilities;
ALTER TABLE public.activities DROP COLUMN IF EXISTS photos;
ALTER TABLE public.activities DROP COLUMN IF EXISTS source;


-- ---------------------------------------------------------------------------
-- R4. Restore place_id NOT NULL — with safe validation first.
--
--     The forward migration relaxed place_id to nullable.  Restoring NOT NULL
--     is only valid if every row in the table has a non-NULL place_id.
--
--     The DO block below checks for NULL values before issuing the ALTER.
--     If any are found it raises a WARNING (not an EXCEPTION) so the rest of
--     the rollback succeeds.  The operator must then either:
--       (a) delete the offending rows (if they are test data with no place_id),
--       (b) assign placeholder place_ids, or
--       (c) leave place_id as nullable and accept the partial rollback.
--
--     A partial rollback (new tables dropped, new columns removed, but
--     place_id still nullable) is safe: the application does not rely on
--     place_id being NOT NULL — it is a uniqueness / deduplication key, not
--     a required input for reads.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    null_count bigint;
BEGIN
    SELECT COUNT(*) INTO null_count
    FROM public.activities
    WHERE place_id IS NULL;

    IF null_count > 0 THEN
        RAISE WARNING
            'PARTIAL ROLLBACK: % row(s) in public.activities have place_id = NULL. '
            'Cannot restore NOT NULL constraint without first resolving those rows. '
            'All other rollback steps have completed successfully. '
            'To finish: delete or update the offending rows, then run: '
            'ALTER TABLE public.activities ALTER COLUMN place_id SET NOT NULL;',
            null_count;
    ELSE
        ALTER TABLE public.activities ALTER COLUMN place_id SET NOT NULL;
        RAISE NOTICE 'place_id NOT NULL constraint restored successfully (0 NULL values found).';
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- R5. Recreate the redundant idx_activities_place_id index.
--
--     The forward migration dropped this index as redundant.  The rollback
--     recreates it to restore the database to its pre-migration state exactly.
--
--     Note: this index is still redundant after recreation (the unique
--     constraint index activities_place_id_key continues to serve the same
--     queries), but restoring it matches the original schema precisely.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activities_place_id
    ON public.activities (place_id);


-- ---------------------------------------------------------------------------
-- END OF ROLLBACK
-- ---------------------------------------------------------------------------

COMMIT;

-- =============================================================================
-- POST-ROLLBACK CHECKLIST
-- =============================================================================
-- 1. Run PHASE1_DATABASE_VERIFICATION.sql with the "rollback verification"
--    queries and confirm:
--    a. source, photos, capabilities, search_keywords, built_at columns are gone.
--    b. activity_provider_ids and hybrid_build_log tables are gone.
--    c. place_id is NOT NULL (unless the partial-rollback warning was raised).
--    d. idx_activities_place_id exists again.
--    e. The unique constraint activities_place_id_key is intact.
--    f. All original columns (id, title, city, category, description,
--       image_url, google_places_data, created_at) are unchanged.
-- 2. Confirm the Google activities pipeline still builds and writes rows
--    correctly (run a live activity search for a new city).
-- 3. If the partial-rollback warning was raised, resolve the NULL place_id
--    rows and then run the final ALTER manually.
-- =============================================================================

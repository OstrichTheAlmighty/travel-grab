-- =============================================================================
-- PHASE1_DATABASE_VERIFICATION.sql
-- TravelGrab — Read-only verification that Phase 1 migration applied correctly.
--
-- PURPOSE
--   Confirm every schema object created or modified by Phase 1 is present and
--   correctly configured.  Run this after applying the migration; run it again
--   after a rollback to confirm the rollback completed cleanly.
--
-- SAFETY
--   Every statement is a SELECT or catalog read.  Nothing is created, altered,
--   inserted, updated, or deleted.
--
-- HOW TO USE
--   Supabase Dashboard → SQL Editor → paste and run.
--   Review each section.  "EXPECTED" comments describe the correct result.
--   Any section that returns 0 rows where rows are expected (or vice versa)
--   indicates the migration did not apply correctly.
--
-- OUTPUT FORMAT
--   Single result set with columns (check_name, status, detail).
--   "PASS" = expected result; "INVESTIGATE" = unexpected result.
-- =============================================================================

SELECT check_name, status, detail
FROM (

    -- =========================================================================
    -- A. EXISTING ACTIVITIES COLUMNS ARE INTACT
    --    Confirms the original 9 columns survive the migration.
    -- =========================================================================

    SELECT
        'A01_col_id_exists'                     AS check_name,
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END AS status,
        'Expected: id uuid NOT NULL'            AS detail
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'id' AND udt_name = 'uuid' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'A02_col_place_id_nullable',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: place_id text NULL (Phase 1 relaxed NOT NULL)'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'place_id' AND udt_name = 'text' AND is_nullable = 'YES'

    UNION ALL

    SELECT
        'A03_col_title_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: title text NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'title' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'A04_col_city_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: city text NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'city' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'A05_col_google_places_data_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: google_places_data jsonb nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'google_places_data' AND udt_name = 'jsonb'

    UNION ALL

    SELECT
        'A06_col_image_url_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: image_url text nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'image_url' AND udt_name = 'text'

    UNION ALL

    SELECT
        'A07_col_category_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: category text nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'category' AND udt_name = 'text'

    UNION ALL

    SELECT
        'A08_col_description_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: description text nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'description' AND udt_name = 'text'

    UNION ALL

    SELECT
        'A09_col_created_at_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: created_at timestamp (type unchanged from original)'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'created_at'


    -- =========================================================================
    -- B. NEW COLUMNS ON ACTIVITIES EXIST WITH CORRECT TYPES
    -- =========================================================================

    UNION ALL

    SELECT
        'B01_col_source_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: source text nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'source' AND udt_name = 'text' AND is_nullable = 'YES'

    UNION ALL

    SELECT
        'B02_col_photos_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: photos jsonb nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'photos' AND udt_name = 'jsonb' AND is_nullable = 'YES'

    UNION ALL

    SELECT
        'B03_col_capabilities_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: capabilities jsonb nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'capabilities' AND udt_name = 'jsonb' AND is_nullable = 'YES'

    UNION ALL

    SELECT
        'B04_col_search_keywords_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: search_keywords text[] nullable (udt_name = _text for arrays)'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'search_keywords'
      AND data_type = 'ARRAY'
      AND udt_name = '_text'
      AND is_nullable = 'YES'

    UNION ALL

    SELECT
        'B05_col_built_at_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: built_at timestamptz nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'built_at'
      AND udt_name = 'timestamptz'
      AND is_nullable = 'YES'

    UNION ALL

    -- Confirm total column count is exactly 14 (9 original + 5 new)
    SELECT
        'B06_activities_total_column_count',
        CASE WHEN count(*) = 14 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: 14 columns total (9 original + 5 new). Got: ' || count(*)::text
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'


    -- =========================================================================
    -- C. ACTIVITIES INDEXES
    -- =========================================================================

    UNION ALL

    SELECT
        'C01_pkey_index_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: activities_pkey UNIQUE INDEX on id'
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'activities'
      AND indexname = 'activities_pkey'
      AND indexdef ILIKE '%UNIQUE%'

    UNION ALL

    SELECT
        'C02_place_id_unique_index_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: activities_place_id_key UNIQUE INDEX on place_id'
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'activities'
      AND indexname = 'activities_place_id_key'
      AND indexdef ILIKE '%UNIQUE%'

    UNION ALL

    SELECT
        'C03_city_index_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: idx_activities_city btree index on city'
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'activities'
      AND indexname = 'idx_activities_city'

    UNION ALL

    SELECT
        'C04_redundant_place_id_index_dropped',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: idx_activities_place_id is GONE (was redundant duplicate of unique index)'
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'activities'
      AND indexname = 'idx_activities_place_id'

    UNION ALL

    SELECT
        'C05_search_keywords_gin_index_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: idx_activities_search_keywords GIN index on search_keywords'
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'activities'
      AND indexname = 'idx_activities_search_keywords'
      AND indexdef ILIKE '%GIN%'


    -- =========================================================================
    -- D. ACTIVITIES UNIQUE CONSTRAINT ON place_id INTACT
    -- =========================================================================

    UNION ALL

    SELECT
        'D01_place_id_unique_constraint_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: UNIQUE constraint activities_place_id_key still present'
    FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND constraint_name = 'activities_place_id_key'
      AND constraint_type = 'UNIQUE'

    UNION ALL

    SELECT
        'D02_primary_key_constraint_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: PRIMARY KEY activities_pkey still present on id'
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = 'activities'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = 'id'


    -- =========================================================================
    -- E. NEW TABLE: activity_provider_ids EXISTS AND IS STRUCTURED CORRECTLY
    -- =========================================================================

    UNION ALL

    SELECT
        'E01_activity_provider_ids_table_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: public.activity_provider_ids is a BASE TABLE'
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_provider_ids'
      AND table_type = 'BASE TABLE'

    UNION ALL

    SELECT
        'E02_api_col_id',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: id uuid NOT NULL default gen_random_uuid()'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_provider_ids'
      AND column_name = 'id' AND udt_name = 'uuid' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'E03_api_col_activity_id',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: activity_id uuid NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_provider_ids'
      AND column_name = 'activity_id' AND udt_name = 'uuid' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'E04_api_col_provider',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: provider text NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_provider_ids'
      AND column_name = 'provider' AND udt_name = 'text' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'E05_api_col_provider_id',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: provider_id text NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_provider_ids'
      AND column_name = 'provider_id' AND udt_name = 'text' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'E06_api_fk_to_activities',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: FK activity_id -> activities.id with ON DELETE CASCADE'
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
         ON rc.constraint_name = tc.constraint_name
         AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
         ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name   = 'activity_provider_ids'
      AND ccu.table_name  = 'activities'
      AND ccu.column_name = 'id'
      AND rc.delete_rule  = 'CASCADE'

    UNION ALL

    SELECT
        'E07_api_unique_provider_native',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: UNIQUE constraint on (provider, provider_id)'
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema   = kcu.table_schema
    WHERE tc.table_schema    = 'public'
      AND tc.table_name      = 'activity_provider_ids'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name IN ('provider', 'provider_id')
    HAVING count(DISTINCT kcu.column_name) = 2

    UNION ALL

    SELECT
        'E08_api_rls_enabled',
        CASE WHEN cl.relrowsecurity THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: RLS ENABLED on activity_provider_ids'
    FROM pg_catalog.pg_class cl
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE cl.relname = 'activity_provider_ids' AND n.nspname = 'public'


    -- =========================================================================
    -- F. NEW TABLE: hybrid_build_log EXISTS AND IS STRUCTURED CORRECTLY
    -- =========================================================================

    UNION ALL

    SELECT
        'F01_hybrid_build_log_table_exists',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: public.hybrid_build_log is a BASE TABLE'
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hybrid_build_log'
      AND table_type = 'BASE TABLE'

    UNION ALL

    SELECT
        'F02_hbl_col_city',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: city text NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hybrid_build_log'
      AND column_name = 'city' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'F03_hbl_col_provider',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: provider text NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hybrid_build_log'
      AND column_name = 'provider' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'F04_hbl_col_status',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: status text NOT NULL'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hybrid_build_log'
      AND column_name = 'status' AND is_nullable = 'NO'

    UNION ALL

    SELECT
        'F05_hbl_col_details_jsonb',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: details jsonb nullable'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hybrid_build_log'
      AND column_name = 'details' AND udt_name = 'jsonb'

    UNION ALL

    SELECT
        'F06_hbl_rls_enabled',
        CASE WHEN cl.relrowsecurity THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: RLS ENABLED on hybrid_build_log'
    FROM pg_catalog.pg_class cl
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE cl.relname = 'hybrid_build_log' AND n.nspname = 'public'


    -- =========================================================================
    -- G. SECURITY: anon AND authenticated CANNOT WRITE TO NEW TABLES
    --    Expected: 0 rows.  Any row here means a write privilege was granted
    --    to a public role and must be revoked immediately.
    -- =========================================================================

    UNION ALL

    SELECT
        'G01_no_write_grants_anon_activity_provider_ids',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE — REVOKE NEEDED' END,
        'Expected: anon has NO INSERT/UPDATE/DELETE on activity_provider_ids. '
        'Rows returned = ' || count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name   = 'activity_provider_ids'
      AND grantee      = 'anon'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')

    UNION ALL

    SELECT
        'G02_no_write_grants_authenticated_activity_provider_ids',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE — REVOKE NEEDED' END,
        'Expected: authenticated has NO INSERT/UPDATE/DELETE on activity_provider_ids. '
        'Rows returned = ' || count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name   = 'activity_provider_ids'
      AND grantee      = 'authenticated'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')

    UNION ALL

    SELECT
        'G03_no_write_grants_anon_hybrid_build_log',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE — REVOKE NEEDED' END,
        'Expected: anon has NO INSERT/UPDATE/DELETE on hybrid_build_log. '
        'Rows returned = ' || count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name   = 'hybrid_build_log'
      AND grantee      = 'anon'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')

    UNION ALL

    SELECT
        'G04_no_write_grants_authenticated_hybrid_build_log',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE — REVOKE NEEDED' END,
        'Expected: authenticated has NO INSERT/UPDATE/DELETE on hybrid_build_log. '
        'Rows returned = ' || count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name   = 'hybrid_build_log'
      AND grantee      = 'authenticated'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')


    -- =========================================================================
    -- H. SECURITY: hybrid_build_log IS NOT PUBLICLY READABLE
    --    Neither anon nor authenticated should have SELECT on this table,
    --    and no SELECT policy should exist for them.
    -- =========================================================================

    UNION ALL

    SELECT
        'H01_no_select_grant_anon_hybrid_build_log',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE — REVOKE NEEDED' END,
        'Expected: anon has NO SELECT grant on hybrid_build_log. '
        'Rows returned = ' || count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema  = 'public'
      AND table_name    = 'hybrid_build_log'
      AND grantee       = 'anon'
      AND privilege_type = 'SELECT'

    UNION ALL

    SELECT
        'H02_no_select_grant_authenticated_hybrid_build_log',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE — REVOKE NEEDED' END,
        'Expected: authenticated has NO SELECT grant on hybrid_build_log. '
        'Rows returned = ' || count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema  = 'public'
      AND table_name    = 'hybrid_build_log'
      AND grantee       = 'authenticated'
      AND privilege_type = 'SELECT'

    UNION ALL

    SELECT
        'H03_no_rls_policies_hybrid_build_log',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: hybrid_build_log has ZERO RLS policies (service-role-only access). '
        'Policies found = ' || count(*)::text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hybrid_build_log'


    -- =========================================================================
    -- I. SECURITY: activity_provider_ids HAS NO PUBLIC RLS POLICIES
    --    (No SELECT policy either — server-side only access.)
    -- =========================================================================

    UNION ALL

    SELECT
        'I01_no_rls_policies_activity_provider_ids',
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: activity_provider_ids has ZERO RLS policies. '
        'Policies found = ' || count(*)::text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_provider_ids'


    -- =========================================================================
    -- J. ACTIVITIES TABLE RLS IS STILL ENABLED WITH ORIGINAL SELECT POLICY
    -- =========================================================================

    UNION ALL

    SELECT
        'J01_activities_rls_still_enabled',
        CASE WHEN cl.relrowsecurity THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: RLS still ENABLED on public.activities'
    FROM pg_catalog.pg_class cl
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE cl.relname = 'activities' AND n.nspname = 'public'

    UNION ALL

    SELECT
        'J02_activities_public_read_policy_intact',
        CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'INVESTIGATE' END,
        'Expected: "public read" SELECT policy USING (true) still exists on activities'
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'public read'
      AND cmd        = 'SELECT'


    -- =========================================================================
    -- K. DIAGNOSTIC: SHOW CURRENT activities COLUMN COUNT
    --    Informational only — useful for side-by-side comparison.
    -- =========================================================================

    UNION ALL

    SELECT
        'K01_activities_column_list',
        'INFO',
        string_agg(column_name || ' (' || data_type || ', ' || is_nullable || ')',
                   ', ' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'

    UNION ALL

    -- =========================================================================
    -- L. DIAGNOSTIC: SHOW ALL indexes on activities
    -- =========================================================================

    SELECT
        'L01_activities_all_indexes',
        'INFO',
        string_agg(indexname || ': ' || indexdef, ' || ' ORDER BY indexname)
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'activities'

    UNION ALL

    -- =========================================================================
    -- M. ROLLBACK VERIFICATION — run this after the rollback to confirm cleanup
    --    These checks confirm what should NOT exist after a rollback.
    --    After the forward migration, these return INVESTIGATE.
    --    After the rollback, these return PASS.
    -- =========================================================================

    SELECT
        'M01_rollback_check_source_column_gone',
        CASE WHEN count(*) = 0 THEN 'PASS (rollback complete)'
                                ELSE 'INFO (migration applied — source column exists)' END,
        'Returns PASS after rollback; INFO after forward migration'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'source'

    UNION ALL

    SELECT
        'M02_rollback_check_new_tables_gone',
        CASE WHEN count(*) = 0 THEN 'PASS (rollback complete)'
                                ELSE 'INFO (migration applied — new tables exist)' END,
        'Returns PASS after rollback; INFO after forward migration. '
        'Tables still present = ' || count(*)::text
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('activity_provider_ids', 'hybrid_build_log')

    UNION ALL

    SELECT
        'M03_rollback_check_place_id_not_null',
        CASE
            WHEN is_nullable = 'NO'  THEN 'PASS (rollback complete — NOT NULL restored)'
            WHEN is_nullable = 'YES' THEN 'INFO (migration applied OR partial rollback — place_id nullable)'
            ELSE 'INVESTIGATE'
        END,
        'is_nullable = ' || is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities'
      AND column_name = 'place_id'

) AS all_checks
ORDER BY check_name;

-- =============================================================================
-- END OF VERIFICATION FILE
-- All statements above are read-only.
-- =============================================================================

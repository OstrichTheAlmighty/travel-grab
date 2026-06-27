-- Persistent cache for Google Places hotel enrichment results.
-- Each hotel is enriched once (Text Search + Nearby Search) and the result
-- is stored here, keyed by google_place_id.  Subsequent searches for the
-- same hotel skip the Places API entirely (~$0.034 saved per hotel hit).
--
-- Run this in the Supabase Dashboard → SQL Editor before deploying the cache code.

CREATE TABLE IF NOT EXISTS hotel_enrichment_cache (
  google_place_id      TEXT        PRIMARY KEY,
  hotel_name           TEXT        NOT NULL,
  destination          TEXT        NOT NULL,          -- lowercased, e.g. "tokyo, japan"
  enrichment_data      JSONB       NOT NULL,          -- PlacesEnrichment object
  text_search_result   JSONB,                         -- raw GPlace from Text Search (debug)
  nearby_search_result JSONB,                         -- raw places[] from Nearby Search (debug)
  cached_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count            INTEGER     NOT NULL DEFAULT 1
);

-- Composite index for the primary lookup path: hotel_name + destination
CREATE INDEX IF NOT EXISTS idx_hotel_cache_name_dest
  ON hotel_enrichment_cache (hotel_name, destination);

-- Secondary index for destination-only queries (e.g. cache stats per city)
CREATE INDEX IF NOT EXISTS idx_hotel_cache_destination
  ON hotel_enrichment_cache (destination);

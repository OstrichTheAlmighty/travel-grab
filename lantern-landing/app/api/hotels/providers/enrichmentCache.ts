/**
 * Persistent L2 cache for Google Places hotel enrichment results.
 *
 * Flow: enrichOne() checks this cache before calling the Places API.
 * On a miss it calls the API, builds the enrichment, and writes here.
 * On a hit it skips both Places API calls (~$0.034 saved per hotel).
 *
 * Table: hotel_enrichment_cache  (see migrations/hotel_enrichment_cache.sql)
 * Key:   hotel_name (case-insensitive) + destination (lowercase)
 */

import { supabaseAdmin } from "@/lib/db";
import type { PlacesEnrichment } from "./googlePlaces";

const TABLE = "hotel_enrichment_cache";

interface CacheRow {
  google_place_id:  string;
  enrichment_data:  PlacesEnrichment;
  hit_count:        number;
}

export async function readHotelEnrichmentCache(
  hotelName: string,
  destination: string,
): Promise<{ enrichment: PlacesEnrichment; placeId: string } | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("google_place_id, enrichment_data, hit_count")
      .ilike("hotel_name", hotelName)
      .eq("destination", destination.toLowerCase().trim())
      .maybeSingle();

    if (error || !data) return null;

    const row = data as CacheRow;

    // Fire-and-forget usage tracking — doesn't block the response
    void Promise.resolve(
      supabaseAdmin
        .from(TABLE)
        .update({ last_used_at: new Date().toISOString(), hit_count: row.hit_count + 1 })
        .eq("google_place_id", row.google_place_id),
    ).catch(() => {});

    return { enrichment: row.enrichment_data, placeId: row.google_place_id };
  } catch {
    return null;
  }
}

export async function writeHotelEnrichmentCache(
  googlePlaceId: string,
  hotelName: string,
  destination: string,
  enrichment: PlacesEnrichment,
  textSearchResult?: unknown,
  nearbySearchResult?: unknown,
): Promise<void> {
  if (!supabaseAdmin || !googlePlaceId) return;
  try {
    await supabaseAdmin
      .from(TABLE)
      .upsert(
        {
          google_place_id:      googlePlaceId,
          hotel_name:           hotelName,
          destination:          destination.toLowerCase().trim(),
          enrichment_data:      enrichment,
          text_search_result:   textSearchResult ?? null,
          nearby_search_result: nearbySearchResult ?? null,
          cached_at:            new Date().toISOString(),
          last_used_at:         new Date().toISOString(),
          hit_count:            1,
        },
        { onConflict: "google_place_id", ignoreDuplicates: true },
      );
  } catch {
    // Cache write is non-fatal — enrichment already returned to caller
  }
}

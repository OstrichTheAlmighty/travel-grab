/**
 * Persistent L2 cache for Google Places hotel enrichment results.
 *
 * Table: hotel_enrichment_cache  (see migrations/hotel_enrichment_cache.sql)
 * Key:   hotel_name (case-insensitive) + destination (lowercase)
 */

import { supabaseAdmin } from "@/lib/db";
import type { PlacesEnrichment } from "./googlePlaces";

// Log at module load so we can confirm env vars are present in Vercel
console.log("[cache-init] service role key set:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log("[cache-init] supabase url set:     ", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("[cache-init] supabaseAdmin ready:  ", supabaseAdmin !== null);

const TABLE = "hotel_enrichment_cache";

interface CacheRow {
  google_place_id: string;
  enrichment_data: PlacesEnrichment;
  hit_count:       number;
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

    if (error) {
      console.error(`[cache-read] ERROR for "${hotelName}":`, error.message, error.code);
      return null;
    }
    if (!data) return null;

    const row = data as CacheRow;

    void Promise.resolve(
      supabaseAdmin
        .from(TABLE)
        .update({ last_used_at: new Date().toISOString(), hit_count: row.hit_count + 1 })
        .eq("google_place_id", row.google_place_id),
    ).catch(() => {});

    return { enrichment: row.enrichment_data, placeId: row.google_place_id };
  } catch (e) {
    console.error(`[cache-read] EXCEPTION for "${hotelName}":`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function writeHotelEnrichmentCache(
  placeId: string,
  hotelName: string,
  destination: string,
  enrichment: PlacesEnrichment,
  textSearch?: unknown,
  nearbySearch?: unknown,
): Promise<void> {
  console.log(`[cache-write] ATTEMPTING: "${hotelName}" / "${destination}" placeId=${placeId || "(empty)"}`);

  if (!supabaseAdmin) {
    console.error(`[cache-write] SKIPPED: supabaseAdmin is null (env vars missing?)`);
    return;
  }
  if (!placeId) {
    console.error(`[cache-write] SKIPPED: no placeId for "${hotelName}"`);
    return;
  }

  try {
    const { error, status } = await supabaseAdmin
      .from(TABLE)
      .upsert(
        {
          google_place_id:      placeId,
          hotel_name:           hotelName,
          destination:          destination.toLowerCase().trim(),
          enrichment_data:      enrichment,
          text_search_result:   textSearch ?? null,
          nearby_search_result: nearbySearch ?? null,
          cached_at:            new Date().toISOString(),
          last_used_at:         new Date().toISOString(),
          hit_count:            1,
        },
        { onConflict: "google_place_id" },
      );

    if (error) {
      console.error(`[cache-write] FAILED "${hotelName}":`, JSON.stringify({
        message: error.message,
        details: error.details,
        hint:    error.hint,
        code:    error.code,
        status,
      }));
    } else {
      console.log(`[cache-write] SUCCESS "${hotelName}" status=${status}`);
    }
  } catch (e) {
    console.error(`[cache-write] EXCEPTION "${hotelName}":`, e instanceof Error ? e.message : e);
  }
}

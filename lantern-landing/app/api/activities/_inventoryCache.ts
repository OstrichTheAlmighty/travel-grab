/**
 * Persistent cache for Places API inventory results.
 *
 * Tables required in Supabase (create via Dashboard SQL Editor):
 *   geocode_cache        — city geocode results, 90-day TTL
 *   places_query_cache   — per-query place results, 14-day TTL
 *
 * All DB operations degrade gracefully if Supabase is not configured or DB is down.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GeoResult, GooglePlace } from "./_inventory";
import type { Category } from "../../activities/data/types";

export interface CachedEntry {
  place:        GooglePlace;
  category:     Category;
  tags:         string[];
  querySources: string[];
}

// ── Dev logging ────────────────────────────────────────────────────────────────

export interface PlacesApiCall {
  ts:           number;
  endpoint:     "geocode" | "nearby" | "text" | "autocomplete" | "place_detail";
  city:         string;
  query:        string;
  cacheHit:     boolean;
  resultCount?: number;
}

const LOG_MAX = 300;
export const PLACES_API_LOG: PlacesApiCall[] = [];

export function logPlacesCall(entry: PlacesApiCall): void {
  if (PLACES_API_LOG.length >= LOG_MAX) PLACES_API_LOG.shift();
  PLACES_API_LOG.push(entry);
}

// ── Supabase client singleton ──────────────────────────────────────────────────

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// ── Table bootstrap (runs at most once per process) ────────────────────────────
// DDL cannot run through Supabase's REST API — tables must exist in advance.
// This function probes each table to verify connectivity and logs the result.

let tablesReady: Promise<boolean> | null = null;

async function _ensureTables(): Promise<boolean> {
  console.log("[inventoryCache] _ensureTables() starting...");
  console.log("[inventoryCache] NEXT_PUBLIC_SUPABASE_URL present:", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("[inventoryCache] SUPABASE_SERVICE_ROLE_KEY present:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  const client = getClient();
  if (!client) {
    console.error("[inventoryCache] FATAL: Supabase env vars not set — cache writes will be skipped.");
    return false;
  }

  console.log("[inventoryCache] checking geocode_cache table...");
  try {
    const { error } = await client.from("geocode_cache").select("city_input").limit(1);
    if (error) {
      console.warn("[inventoryCache] CREATE TABLE warning (geocode_cache):", error.message);
    } else {
      console.log("[inventoryCache] geocode_cache table OK");
    }
  } catch (err) {
    console.warn("[inventoryCache] CREATE TABLE warning (geocode_cache):", String(err));
  }

  console.log("[inventoryCache] checking places_query_cache table...");
  try {
    const { error } = await client.from("places_query_cache").select("cache_key").limit(1);
    if (error) {
      console.warn("[inventoryCache] CREATE TABLE warning (places_query_cache):", error.message);
    } else {
      console.log("[inventoryCache] places_query_cache table OK");
    }
  } catch (err) {
    console.warn("[inventoryCache] CREATE TABLE warning (places_query_cache):", String(err));
  }

  console.log("[inventoryCache] _ensureTables() done — proceeding with Supabase ✓");
  return true;
}

function ensureTables(): Promise<boolean> {
  if (!tablesReady) tablesReady = _ensureTables();
  return tablesReady;
}

// ── Geocode cache — 90-day TTL ────────────────────────────────────────────────

const GEO_TTL_DAYS = 90;

export async function readGeoCache(normalizedInput: string): Promise<GeoResult | null> {
  if (!await ensureTables()) return null;
  try {
    const { data, error } = await getClient()!
      .from("geocode_cache")
      .select("city, country, lat, lng, viewport")
      .eq("city_input", normalizedInput)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) {
      console.warn("[inventoryCache/geo] read error:", error.message);
      return null;
    }
    if (!data) return null;
    console.log(`[inventoryCache/geo] cache HIT for "${normalizedInput}" → ${data.city}`);
    return {
      city:     data.city as string,
      country:  data.country as string,
      lat:      Number(data.lat),
      lng:      Number(data.lng),
      viewport: data.viewport as GeoResult["viewport"],
    };
  } catch (err) {
    console.warn("[inventoryCache/geo] read error:", String(err));
    return null;
  }
}

export async function writeGeoCache(normalizedInput: string, geo: GeoResult): Promise<void> {
  if (!await ensureTables()) return;
  const expiresAt = new Date(Date.now() + GEO_TTL_DAYS * 864e5).toISOString();
  try {
    const { error } = await getClient()!
      .from("geocode_cache")
      .upsert({
        city_input: normalizedInput,
        city:       geo.city,
        country:    geo.country,
        lat:        geo.lat,
        lng:        geo.lng,
        viewport:   geo.viewport,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      }, { onConflict: "city_input" });
    if (error) console.warn("[inventoryCache/geo] write error:", error.message);
  } catch (err) {
    console.warn("[inventoryCache/geo] write error:", String(err));
  }
}

// ── Places query cache — 14-day TTL ──────────────────────────────────────────

const QUERY_TTL_DAYS = 14;

export function makeCacheKey(cityKey: string, g: { type?: string; query?: string }): string {
  const suffix = g.type
    ? `nearby:${g.type}`
    : `text:${(g.query ?? "").replace(/\s*\{city\}/gi, "").trim().toLowerCase().replace(/\s+/g, "_")}`;
  return `${cityKey}||${suffix}`;
}

/** Returns Map<cacheKey, entries[]> for all non-expired rows of cityKey that have entry data, or null if unavailable. */
export async function readCityCache(cityKey: string): Promise<Map<string, CachedEntry[]> | null> {
  if (!await ensureTables()) return null;
  try {
    const { data: rows, error } = await getClient()!
      .from("places_query_cache")
      .select("cache_key, entries, entry_count")
      .eq("city_key", cityKey)
      .gt("expires_at", new Date().toISOString());
    if (error) {
      console.warn("[inventoryCache/city] read error:", error.message);
      return null;
    }
    if (!rows || rows.length === 0) return null;
    const map = new Map<string, CachedEntry[]>();
    for (const row of rows) {
      // Only include rows that actually have entry data stored
      if (row.entries != null) {
        map.set(row.cache_key as string, row.entries as CachedEntry[]);
      }
    }
    if (map.size === 0) {
      // All rows are metadata-only (no entries stored) — treat as cache miss so
      // the caller rebuilds from Google Places rather than serving empty results
      console.log(`[inventoryCache/city] ${rows.length} metadata-only rows for "${cityKey}" — treating as cache miss`);
      return null;
    }
    console.log(`[inventoryCache/city] cache HIT for "${cityKey}" — ${map.size}/${rows.length} query rows with data`);
    return map;
  } catch (err) {
    console.warn("[inventoryCache/city] read error:", String(err));
    return null;
  }
}

/** Persist query metadata to Supabase (entries are kept in-memory only). Fire-and-forget — caller should .catch(() => {}). */
export async function writeQueryCache(
  cityKey: string,
  cacheKey: string,
  entries: CachedEntry[],
): Promise<void> {
  console.log(`[inventoryCache/query] writeQueryCache called: key=${cacheKey} count=${entries.length}`);

  const tablesOk = await ensureTables();
  if (!tablesOk) {
    console.error(`[inventoryCache/query] skipping write — ensureTables() returned false`);
    return;
  }

  const expiresAt = new Date(Date.now() + QUERY_TTL_DAYS * 864e5).toISOString();
  try {
    const { error } = await getClient()!
      .from("places_query_cache")
      .upsert({
        cache_key:   cacheKey,
        city_key:    cityKey,
        entry_count: entries.length,
        expires_at:  expiresAt,
        created_at:  new Date().toISOString(),
      }, { onConflict: "cache_key" });
    if (error) {
      console.error(`[inventoryCache/query] write FAILED: key=${cacheKey}`, {
        message: error.message,
      });
    } else {
      console.log(`[inventoryCache/query] writeQueryCache SUCCESS: key=${cacheKey} count=${entries.length}`);
    }
  } catch (err) {
    console.error(`[inventoryCache/query] write FAILED: key=${cacheKey}`, {
      message: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}

/** Delete expired rows from both tables. Call from a maintenance route or cron. */
export async function purgeExpiredCache(): Promise<{ geo: number; queries: number }> {
  if (!await ensureTables()) return { geo: 0, queries: 0 };
  const now = new Date().toISOString();
  try {
    await Promise.all([
      getClient()!.from("geocode_cache").delete().lt("expires_at", now),
      getClient()!.from("places_query_cache").delete().lt("expires_at", now),
    ]);
    return { geo: 0, queries: 0 };
  } catch {
    return { geo: 0, queries: 0 };
  }
}

/**
 * Persistent cache for Places API inventory results.
 *
 * Tables created lazily on first use:
 *   geocode_cache        — city geocode results, 90-day TTL
 *   places_query_cache   — per-query place results, 14-day TTL
 *
 * All DB operations degrade gracefully if DATABASE_URL is absent or DB is down.
 */

import { sql } from "drizzle-orm";
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

// ── Table bootstrap (runs at most once per process) ────────────────────────────

let tablesReady: Promise<boolean> | null = null;

async function _ensureTables(): Promise<boolean> {
  console.log("[inventoryCache] _ensureTables() starting...");
  console.log("[inventoryCache] DATABASE_URL present:", !!process.env.DATABASE_URL);
  
  if (!process.env.DATABASE_URL) {
    console.error("[inventoryCache] FATAL: DATABASE_URL not set in env. Cache writes will fail.");
    return false;
  }

  try {
    console.log("[inventoryCache] importing @/lib/db...");
    const { db } = await import("@/lib/db");
    console.log("[inventoryCache] db imported successfully:", !!db);

    console.log("[inventoryCache] creating geocode_cache table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS geocode_cache (
        city_input  TEXT PRIMARY KEY,
        city        TEXT NOT NULL,
        country     TEXT NOT NULL,
        lat         DOUBLE PRECISION NOT NULL,
        lng         DOUBLE PRECISION NOT NULL,
        viewport    JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL
      )
    `);
    console.log("[inventoryCache] geocode_cache table OK");

    console.log("[inventoryCache] creating places_query_cache table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS places_query_cache (
        cache_key   TEXT PRIMARY KEY,
        city_key    TEXT NOT NULL,
        entries     JSONB NOT NULL,
        entry_count INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL
      )
    `);
    console.log("[inventoryCache] places_query_cache table OK");

    console.log("[inventoryCache] creating city index...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS places_query_cache_city_idx
      ON places_query_cache (city_key)
    `);
    console.log("[inventoryCache] city_idx OK");

    console.log("[inventoryCache] creating expires index...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS places_query_cache_expires_idx
      ON places_query_cache (expires_at)
    `);
    console.log("[inventoryCache] expires_idx OK");

    console.log("[inventoryCache] tables ready ✓");
    return true;
  } catch (err) {
    console.error("[inventoryCache] FATAL table setup error:", {
      message: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return false;
  }
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
    const { db } = await import("@/lib/db");
    const rows = await db.execute<{
      city: string; country: string; lat: string; lng: string; viewport: unknown;
    }>(sql`
      SELECT city, country, lat, lng, viewport
      FROM geocode_cache
      WHERE city_input = ${normalizedInput} AND expires_at > NOW()
    `);
    if (!rows[0]) return null;
    const r = rows[0];
    console.log(`[inventoryCache/geo] cache HIT for "${normalizedInput}" → ${r.city}`);
    return {
      city: r.city, country: r.country,
      lat:  Number(r.lat), lng: Number(r.lng),
      viewport: r.viewport as GeoResult["viewport"],
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
    const { db } = await import("@/lib/db");
    await db.execute(sql`
      INSERT INTO geocode_cache (city_input, city, country, lat, lng, viewport, expires_at)
      VALUES (
        ${normalizedInput}, ${geo.city}, ${geo.country},
        ${geo.lat}, ${geo.lng}, ${JSON.stringify(geo.viewport)},
        ${expiresAt}::timestamptz
      )
      ON CONFLICT (city_input) DO UPDATE SET
        city       = EXCLUDED.city,
        country    = EXCLUDED.country,
        lat        = EXCLUDED.lat,
        lng        = EXCLUDED.lng,
        viewport   = EXCLUDED.viewport,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()
    `);
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

/** Returns Map<cacheKey, entries[]> for all non-expired rows of cityKey, or null if unavailable. */
export async function readCityCache(cityKey: string): Promise<Map<string, CachedEntry[]> | null> {
  if (!await ensureTables()) return null;
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.execute<{ cache_key: string; entries: unknown }>(sql`
      SELECT cache_key, entries
      FROM places_query_cache
      WHERE city_key = ${cityKey} AND expires_at > NOW()
    `);
    if (rows.length === 0) return null;
    const map = new Map<string, CachedEntry[]>();
    for (const row of rows) {
      map.set(row.cache_key, row.entries as CachedEntry[]);
    }
    console.log(`[inventoryCache/city] cache HIT for "${cityKey}" — ${rows.length} query rows`);
    return map;
  } catch (err) {
    console.warn("[inventoryCache/city] read error:", String(err));
    return null;
  }
}

/** Persist one query's results to DB. Fire-and-forget — caller should .catch(() => {}). */
export async function writeQueryCache(
  cityKey: string,
  cacheKey: string,
  entries: CachedEntry[],
): Promise<void> {
  console.log(`[inventoryCache/query] writeQueryCache STARTING: cacheKey=${cacheKey}, entries=${entries.length}`);
  
  const tablesOk = await ensureTables();
  if (!tablesOk) {
    console.error(`[inventoryCache/query] writeQueryCache FAILED: ensureTables() returned false`);
    return;
  }

  const expiresAt = new Date(Date.now() + QUERY_TTL_DAYS * 864e5).toISOString();
  
  try {
    console.log(`[inventoryCache/query] importing @/lib/db...`);
    const { db } = await import("@/lib/db");
    console.log(`[inventoryCache/query] db imported, executing INSERT...`);

    await db.execute(sql`
      INSERT INTO places_query_cache (cache_key, city_key, entries, entry_count, expires_at)
      VALUES (
        ${cacheKey}, ${cityKey}, ${JSON.stringify(entries)},
        ${entries.length}, ${expiresAt}::timestamptz
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        entries     = EXCLUDED.entries,
        entry_count = EXCLUDED.entry_count,
        expires_at  = EXCLUDED.expires_at,
        created_at  = NOW()
    `);
    
    console.log(`[inventoryCache/query] writeQueryCache SUCCESS: cacheKey=${cacheKey}, entries=${entries.length} ✓`);
  } catch (err) {
    console.error(`[inventoryCache/query] writeQueryCache FAILED:`, {
      cacheKey,
      entryCount: entries.length,
      errorMessage: String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    });
  }
}

/** Delete expired rows from both tables. Call from a maintenance route or cron. */
export async function purgeExpiredCache(): Promise<{ geo: number; queries: number }> {
  if (!await ensureTables()) return { geo: 0, queries: 0 };
  try {
    const { db } = await import("@/lib/db");
    const [gRows, qRows] = await Promise.all([
      db.execute(sql`DELETE FROM geocode_cache WHERE expires_at < NOW()`),
      db.execute(sql`DELETE FROM places_query_cache WHERE expires_at < NOW()`),
    ]);
    return { geo: (gRows as unknown[]).length, queries: (qRows as unknown[]).length };
  } catch {
    return { geo: 0, queries: 0 };
  }
}
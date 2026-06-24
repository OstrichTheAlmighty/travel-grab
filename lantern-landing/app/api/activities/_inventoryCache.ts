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
    console.error("[inventoryCache] FATAL: DATABASE_URL not set — cache writes will be skipped.");
    return false;
  }

  console.log("[inventoryCache] importing db client...");
  const { db } = await import("@/lib/db");
  console.log("[inventoryCache] db client imported successfully");

  try {
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
  } catch (err) {
    console.warn("[inventoryCache] CREATE TABLE warning (geocode_cache):", String(err));
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS places_query_cache (
        cache_key   TEXT PRIMARY KEY,
        city_key    TEXT NOT NULL,
        entries     JSONB,
        entry_count INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL
      )
    `);
    console.log("[inventoryCache] places_query_cache table OK");
  } catch (err) {
    console.warn("[inventoryCache] CREATE TABLE warning (places_query_cache):", String(err));
  }

  try {
    // Drop NOT NULL on entries for existing tables that were created with the old schema
    await db.execute(sql`ALTER TABLE places_query_cache ALTER COLUMN entries DROP NOT NULL`);
    console.log("[inventoryCache] places_query_cache.entries column is now nullable");
  } catch {
    // Column already nullable or table doesn't exist yet — both fine
  }

  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS places_query_cache_city_idx
      ON places_query_cache (city_key)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS places_query_cache_expires_idx
      ON places_query_cache (expires_at)
    `);
    console.log("[inventoryCache] indexes OK");
  } catch (err) {
    console.warn("[inventoryCache] CREATE TABLE warning (indexes):", String(err));
  }

  console.log("[inventoryCache] _ensureTables() done — proceeding with DATABASE_URL ✓");
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

/** Returns Map<cacheKey, entries[]> for all non-expired rows of cityKey that have entry data, or null if unavailable. */
export async function readCityCache(cityKey: string): Promise<Map<string, CachedEntry[]> | null> {
  if (!await ensureTables()) return null;
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.execute<{ cache_key: string; entries: unknown; entry_count: number }>(sql`
      SELECT cache_key, entries, entry_count
      FROM places_query_cache
      WHERE city_key = ${cityKey} AND expires_at > NOW()
    `);
    if (rows.length === 0) return null;
    const map = new Map<string, CachedEntry[]>();
    for (const row of rows) {
      // Only include rows that actually have entry data stored
      if (row.entries != null) {
        map.set(row.cache_key, row.entries as CachedEntry[]);
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

/** Persist query metadata to DB (entries are kept in-memory only). Fire-and-forget — caller should .catch(() => {}). */
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
    const { db } = await import("@/lib/db");
    await db.execute(sql`
      INSERT INTO places_query_cache (cache_key, city_key, entry_count, expires_at)
      VALUES (
        ${cacheKey}, ${cityKey},
        ${entries.length}, ${expiresAt}::timestamptz
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        entry_count = EXCLUDED.entry_count,
        expires_at  = EXCLUDED.expires_at,
        created_at  = NOW()
    `);
    console.log(`[inventoryCache/query] writeQueryCache SUCCESS: key=${cacheKey} count=${entries.length}`);
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

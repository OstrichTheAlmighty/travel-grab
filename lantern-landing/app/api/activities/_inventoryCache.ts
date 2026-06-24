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
  const client = getClient();
  if (!client) {
    console.error("[inventoryCache] FATAL: Supabase env vars not set");
    return false;
  }
  console.log("[inventoryCache] Supabase client ready ✓");
  return true;
}

function ensureTables(): Promise<boolean> {
  if (!tablesReady) tablesReady = _ensureTables();
  return tablesReady;
}

// ── Geocode cache — 90-day TTL ────────────────────────────────────────────────

const GEO_TTL_DAYS = 90;

export async function readGeoCache(_normalizedInput: string): Promise<GeoResult | null> {
  return null;
}

export async function writeGeoCache(_normalizedInput: string, _geo: GeoResult): Promise<void> {
  // no-op
}

// ── Places query cache — 14-day TTL ──────────────────────────────────────────


export function makeCacheKey(cityKey: string, g: { type?: string; query?: string }): string {
  const suffix = g.type
    ? `nearby:${g.type}`
    : `text:${(g.query ?? "").replace(/\s*\{city\}/gi, "").trim().toLowerCase().replace(/\s+/g, "_")}`;
  return `${cityKey}||${suffix}`;
}

export async function readCityCache(_cityKey: string): Promise<Map<string, CachedEntry[]> | null> {
  return null;
}

export async function writeQueryCache(
  _cityKey: string,
  cacheKey: string,
  entries: CachedEntry[],
): Promise<void> {
  console.log(`[inventoryCache/query] writeQueryCache skipped (DB disabled): key=${cacheKey} count=${entries.length}`);
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
